// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Pack Validator: proves a curriculum pack is completely solvable and bug-free.
//
// Design rule: a check that cannot fail is worse than no check, because it
// certifies broken content as valid. Every check below must be able to fail,
// and each is exercised by tests/validator-catches.test.js.

import { runPipeline } from '../shell/exec.js';
import { evaluatePredicate } from './predicates.js';
import { generateUserFlag } from '../crypto-utils.js';
import { registry } from '../commands/registry.js';
import { ERROR_MARKERS } from '../constants.js';
import { findVfsKey, resolvePath } from '../vfs/path.js';
import { hasPermission } from '../vfs/ops.js';
import { validatePackFileStructure, PACK_FORMAT_VERSION } from './packFile.js';
import { REAL_LINUX, REAL_WINDOWS } from '../unknown-command.js';
import { validatePresentation, removedFieldsIn } from './presentation.js';
import { auditChallenge, splitPredicate } from './solutionSpace.js';
import { undefinedTerms } from '../glossary.js';
import { compileSafe, probePattern, PROBE_BUDGET_MS } from './safe-regex.js';

const TEST_SECRET = 'pack-validator-secret';
const TEST_HANDLE = 'validator_bot';

/**
 * Predicates that inspect what actually happened — the terminal's output, the
 * filesystem afterwards, where the student ended up, or the exit status. A
 * success condition built only from things NOT in this set is grading the
 * keystrokes.
 */
const EVIDENCE_PREDICATES = new Set([
  'fileExists', 'dirExists', 'fileMatches', 'fileEquals', 'lineCountAtLeast',
  'fileHashEquals', 'cwdIs', 'outputMatches', 'outputContains', 'outputEquals',
  'outputLineCountIs', 'exitStatusIs', 'fileHasMode', 'fileHasOwner', 'js', 'flag'
]);

/** Every predicate name used anywhere in a success condition, allOf/anyOf included. */
function predicateKinds(cfg, out = new Set()) {
  if (!cfg || typeof cfg !== 'object') return out;
  const type = cfg.predicate || cfg.kind;
  if (type === 'allOf' || type === 'anyOf') {
    for (const p of cfg.predicates || []) predicateKinds(p, out);
  } else if (type) {
    out.add(type);
  }
  return out;
}

/**
 * Challenge ids must be unique across EVERY pack on the deployment, because
 * the server resolves which pack a submission belongs to from the challenge id
 * alone (docs/PLAN-TECHNICAL.md §1). A collision scores a challenge against
 * the wrong pack's filesystem.
 *
 * `packs/index.js` throws on a duplicate at import time, which is a hard stop
 * for the whole site. This runs first, on packs that are not registered yet,
 * and says which two packs collided and on what.
 */
export function checkGlobalChallengeIds(packs) {
  const owner = new Map();
  const collisions = [];
  const perPack = {};
  for (const pack of packs) {
    const id = pack.id || pack.manifest?.id || '(unnamed pack)';
    perPack[id] = (pack.challenges || []).length;
    const withinPack = new Set();
    for (const c of pack.challenges || []) {
      if (!c?.id) {
        collisions.push(`Pack '${id}' has a challenge with no id (title: ${JSON.stringify(c?.title ?? '?')}).`);
        continue;
      }
      if (withinPack.has(c.id)) {
        collisions.push(`Pack '${id}' uses the challenge id '${c.id}' twice.`);
        continue;
      }
      withinPack.add(c.id);
      const prior = owner.get(c.id);
      if (prior && prior !== id) {
        collisions.push(
          `Challenge id '${c.id}' is used by both '${prior}' and '${id}'. Ids must be unique across ` +
          'all packs, because the server works out which pack a submission belongs to from the id ' +
          `alone. Give one of them a pack-specific prefix (for example '${id.split('-')[0]}-${c.id}').`
        );
        continue;
      }
      owner.set(c.id, id);
    }
  }
  return {
    pass: collisions.length === 0,
    totalIds: owner.size,
    packsChecked: Object.keys(perPack).length,
    perPack,
    collisions
  };
}

const isPathLike = (s, isWindows) =>
  typeof s === 'string' && (isWindows ? /^[A-Za-z]:[\\/]/.test(s) : s.startsWith('/'));

// Mirrors netlify/functions/submit-flag.js isActUnlocked — a student may skip
// one challenge per act. If these ever diverge the pack ships a deadlock.
function requiredToUnlock(priorCount, threshold = 0.8) {
  const byThreshold = Math.ceil(priorCount * threshold);
  return Math.min(Math.max(1, byThreshold), Math.max(1, priorCount - 1));
}

/** Every place a flag placeholder could legitimately reach a student. */
function buildReachableCorpus(filesystems, help, commands) {
  const parts = [];
  for (const fs of Object.values(filesystems)) {
    for (const node of Object.values(fs)) {
      if (node?.type === 'file' && typeof node.content === 'string') parts.push(node.content);
    }
  }
  try { parts.push(JSON.stringify(help || {})); } catch { /* non-serializable help */ }
  for (const def of Object.values(commands || {})) {
    if (!def) continue;
    try {
      parts.push(JSON.stringify(def, (k, v) => (typeof v === 'function' ? v.toString() : v)));
    } catch {
      for (const v of Object.values(def)) if (typeof v === 'function') parts.push(v.toString());
    }
  }
  return parts.join('\n');
}

// ── First contact: what order a course meets its own ideas in ───────────────
//
// Every challenge declares `teaches`, a list of free-text tags. Until now the
// validator counted them and threw the rest away, which meant the one question
// the tags can answer went unasked: WHEN does a student first meet each idea,
// and is that a moment built to teach it?
//
// A specialist read all 104 shipped challenges to find these by hand. The three
// shapes below are what they found, and they are mechanical, so nobody should
// ever have to read a whole course to find them again.
//
// These are FINDINGS. A pack with all three still ships; the run stays green.
// Pedagogy is a judgement, and a validator that failed a run over one would be
// a validator authors learn to route around.

/** A challenge teaching this many tags or fewer is a lesson ABOUT them. */
const DEDICATED_MAX_TAGS = 2;

/** More new ideas than this in one challenge and the student is drinking from a hose. */
const FIRST_CONTACT_LIMIT = 2;

/** This many tags at once is a synthesis: several known things used together. */
const SYNTHESIS_MIN_TAGS = 3;

/** Course order: act first, then the order the author wrote them in. */
function inCourseOrder(challenges) {
  return challenges
    .map((c, i) => ({ c, i }))
    .sort((a, b) => ((a.c.act ?? 0) - (b.c.act ?? 0)) || (a.i - b.i))
    .map((x) => x.c);
}

/**
 * Walks the course in the order a student takes it and reports where an idea
 * arrives at a bad moment.
 *
 * Tuning, measured against all three shipped packs (104 challenges):
 *   tooMuchAtOnce   12  — at the "about a dozen" ceiling, so the limit stays 2.
 *   coldInSynthesis  8  — after excluding what tooMuchAtOnce already named.
 *   taughtLate       3  — one line per tag, naming the first challenge that
 *                         needed it.
 * A rule that fires on much more of a reviewed course is describing the course
 * rather than a defect in it.
 */
export function analyseConceptFlow(challenges) {
  const order = inCourseOrder(challenges);
  const tagsOf = (c) => (Array.isArray(c.teaches) ? c.teaches.filter((t) => typeof t === 'string') : []);

  // A tag is either a SKILL, something a student types, or a CONCEPT naming
  // what the skill is for. `stat`, `metadata` and `inodes` is one lesson
  // wearing three tags, and counting that as three new ideas made this check
  // report every challenge that bothered to describe itself. Only skills count
  // toward the load; concepts still show in the reported list, because a reader
  // wants to see everything the challenge claims to cover.
  const knownCommand = new Set([
    ...registry.getAll('linux').map((c) => c.name),
    ...registry.getAll('windows').map((c) => c.name)
  ]);
  const isSkillTag = (tag) => {
    const t = String(tag).trim();
    if (knownCommand.has(t.split(/\s+/)[0].toLowerCase())) return true;
    // A flag or shell operator is a skill even when its command is not
    // simulated: `-la`, `/a`, `&&`, `>`, `%VAR%`.
    return /^[-/]/.test(t) || /[|&><$%]/.test(t);
  };
  const skillsOf = (c) => tagsOf(c).filter(isSkillTag);

  const firstAt = new Map();      // tag -> index where a student first meets it
  const dedicatedAt = new Map();  // tag -> index of the challenge that is ABOUT it
  order.forEach((c, idx) => {
    const tags = tagsOf(c);
    for (const tag of tags) {
        // Dedication is judged on SKILLS too. A lesson that is plainly about one
        // command looked like a three-idea challenge purely because it also named
        // the concept and a synonym, so the course appeared to teach `cd` after
        // it had used it.
      if (!firstAt.has(tag)) firstAt.set(tag, idx);
      if (skillsOf(c).length <= DEDICATED_MAX_TAGS && !dedicatedAt.has(tag)) dedicatedAt.set(tag, idx);
    }
  });

  const tooMuchAtOnce = [];
  const coldInSynthesis = [];
  order.forEach((c, idx) => {
    const tags = tagsOf(c);
    const fresh = tags.filter((t) => firstAt.get(t) === idx);
      const freshSkills = fresh.filter(isSkillTag);
    if (freshSkills.length > FIRST_CONTACT_LIMIT) {
      tooMuchAtOnce.push({ id: c.id, act: c.act, title: c.title, tags: fresh });
      // Deliberately not also reported below. Every challenge with three new
      // tags is by definition a challenge with three tags and one of them new,
      // so reporting both would print the same challenge under two headings
      // and double the apparent size of the problem.
      return;
    }
      if (skillsOf(c).length >= SYNTHESIS_MIN_TAGS && freshSkills.length > 0) {
      coldInSynthesis.push({ id: c.id, act: c.act, title: c.title, tags: fresh, total: tags.length });
    }
  });

  // A tag used inside a synthesis before the course ever stopped to teach it.
  // One line per tag, naming the earliest place it was needed: the fix is to
  // move that one lesson, not to edit every challenge that leans on it.
  const taughtLate = [];
  const reported = new Set();
  order.forEach((c, idx) => {
    if (skillsOf(c).length < SYNTHESIS_MIN_TAGS) return;
    for (const tag of skillsOf(c)) {
      const d = dedicatedAt.get(tag);
      if (d === undefined || d <= idx || reported.has(tag)) continue;
      reported.add(tag);
      taughtLate.push({
        tag,
        neededIn: c.id,
        neededAct: c.act,
        dedicatedIn: order[d].id,
        dedicatedAct: order[d].act
      });
    }
  });

  return { tagCount: firstAt.size, tooMuchAtOnce, coldInSynthesis, taughtLate };
}

// ── The scene that never needed the tool ────────────────────────────────────
//
// A brief is a scene. If the challenge is graded on a command that takes an
// object — a file, a directory, a path — then the scene has to contain that
// object, or the story is decoration over a drill. `w2-set` asked a student to
// set a variable in a house with no rooms in it: nothing in the brief named
// anything that exists on the machine they were sitting at.
//
// The check only fires when the challenge's OWN answer names an object. A
// command that takes no operand (`pwd`, `cls`, `tasklist`) has no thing in the
// room to name, and demanding a filename from it would be nonsense.

/** Tokens that are grammar rather than an object: flags, self-references, variables. */
function operandsOf(line, isWindows) {
  const out = [];
  for (const segment of String(line).split(/\|\||&&|[|;&]/)) {
    const words = segment.trim().split(/\s+/).slice(1);
    for (const raw of words) {
      const w = raw.replace(/^["']|["']$/g, '');
      if (!w) continue;
      if (w.startsWith('-')) continue;                    // a flag
      if (isWindows && w.startsWith('/')) continue;       // a flag, on cmd.exe
      if (/^[$%]/.test(w)) continue;                      // a variable, not a file
      if (['.', '..', './', '.\\', '*', '~'].includes(w)) continue;  // "here", not a thing
      if (/^>+$/.test(w)) continue;
      out.push(w);
    }
  }
  return out;
}

/** Does this word name something that is actually on the machine? */
function namesSomethingReal(token, fs, cwd, home, isWindows) {
  const t = token.replace(/^[`"'(]+/, '').replace(/[`"'.,;:!?)]+$/, '');
  if (t.length < 2) return false;
  // A bare extension names a class of object the same way a glob does: "every
  // file ending in `.sh`" is the thing in the room when a .sh file is in it.
  if (/^\.[A-Za-z0-9]{1,6}$/.test(t)) {
    return Object.keys(fs).some((k) => k.toLowerCase().endsWith(t.toLowerCase()));
  }
  if (/[*?]/.test(t)) {
    // A glob names a class of object. It counts if the class has a member.
    const rx = new RegExp(
      '^' + t.split(/[*?]/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
      isWindows ? 'i' : ''
    );
    return Object.keys(fs).some((k) => rx.test(k.split(/[\\/]/).pop()));
  }
  try {
    return !!findVfsKey(fs, resolvePath(cwd, t, isWindows, home), isWindows);
  } catch {
    return false;
  }
}

/** A token that looks like a file or a path, whether or not it exists yet. */
const looksLikeAPath = (t, isWindows) =>
  (isWindows ? /[\\]/.test(t) : /\//.test(t)) || /^[\w~-][\w.~-]*\.[A-Za-z0-9]{1,6}$/.test(t);

// ── The tool a course says is not here, and then asks for ───────────────────
//
// Two ways a pack can require something it has already told the student does
// not exist, and they have different homes.
//
//   The pack's own contradiction: a name in `manifest.courseTools` — the map
//   that prints "a real tool, not simulated here" — used as the answer to one
//   of its own challenges. That is checked per pack and it fails the run.
//
//   The engine's staleness: a command the registry now implements while
//   `unknown-command.js` still lists it as real-but-not-simulated. That list
//   is dead data the moment the command lands, and dead data is how a newly
//   implemented command stays invisible to the person who implemented it.

/** The command name at the head of each segment of a command line. */
export function headWords(line) {
  const out = [];
  for (const segment of String(line).split(/\|\||&&|[|;&]/)) {
    const first = segment.trim().split(/\s+/)[0];
    if (!first) continue;
    // `/usr/bin/dd` and `dd` are the same tool to a student reading a course.
    const name = first.split(/[\\/]/).pop().replace(/^["']|["']$/g, '');
    if (name) out.push(name);
  }
  return out;
}

/** Every commandMatches pattern in a success condition, allOf/anyOf included. */
export function commandMatchPatterns(cfg, out = []) {
  if (!cfg || typeof cfg !== 'object') return out;
  const type = cfg.predicate || cfg.kind;
  if (type === 'allOf' || type === 'anyOf') {
    for (const p of cfg.predicates || []) commandMatchPatterns(p, out);
  } else if (type === 'commandMatches' && typeof cfg.pattern === 'string') {
    out.push(cfg.pattern);
  }
  return out;
}

/**
 * The literal command name a pattern starts with, or null when it starts with
 * something that is not a name. Only the leading literal is read — inside a
 * group, only its first branch — because the point is to name the tool an
 * answer begins with, not to work out everything the pattern would accept.
 */
export function patternHead(pattern) {
  const stripped = String(pattern).replace(/^(\^|\(\?:|\(|\\b|\\s\*)+/, '');
  const m = /^[A-Za-z][A-Za-z0-9_.-]*/.exec(stripped);
  return m ? m[0] : null;
}

/**
 * Commands the engine implements and `unknown-command.js` still calls real but
 * unsimulated. Engine-wide rather than pack-specific, so the CLI runs it once
 * beside the challenge-id check rather than repeating it per pack.
 */
export function checkCommandHonesty() {
  const stale = [];
  let checked = 0;
  for (const [platform, real] of [['linux', REAL_LINUX], ['windows', REAL_WINDOWS]]) {
    for (const cmd of registry.getAll(platform)) {
      checked++;
      if (real.has(cmd.name)) stale.push({ name: cmd.name, platform });
    }
  }
  return { pass: stale.length === 0, checked, stale };
}

export async function validatePack(packObj, options = {}) {
  const { verbose = false, packFile = null } = options;
  const { id, manifest, challenges, help = {}, commands = {}, createFs } = packObj;
  // A pack loaded from a .pack.json is untrusted: the `js` predicate must not
  // run for it even here, or the validator would certify content the browser
  // will then refuse.
  const trusted = packObj.trusted !== false;

  const results = {
    packId: id,
    packName: manifest.name,
    valid: true,
    errors: [],
    warnings: [],
    // Two lists that are NOT errors and do not turn the run red. They are
    // findings a later content pass has to clear, and burying them in the
    // warning stream is how 60 keystroke-graded challenges went unnoticed.
    variantFailures: [],
    outputBlind: [],
    unfairRejections: [],
    uncheckablePatterns: [],
    undefinedTerms: [],
    unframedTasks: [],
    // Phase 3 findings. Same rule as the two above: named, counted, and NOT
    // failures. A course whose ideas arrive in an awkward order still teaches.
    tooMuchAtOnce: [],
    coldInSynthesis: [],
    taughtLate: [],
    sceneWithoutObject: [],
    builtOnGap: null,
    removedFields: [],
    checks: {
      packFormat: { pass: true, checked: false, formatVersion: packObj.formatVersion ?? null },
      vfsPaths: { pass: true, tested: 0 },
      solvability: { pass: true, total: challenges.length, solved: 0, variantsTested: 0, flagsVerified: 0 },
      acceptedVariants: { pass: true, tested: 0, failed: 0 },
      outputAssertions: { pass: true, checked: 0, blind: 0 },
      flagPlaceholders: { pass: true, placeholders: 0, mapped: 0 },
      actProgression: { pass: true, actsCount: manifest.acts.length, gatedActsChecked: 0 },
      briefCommands: { pass: true, commandsTested: 0 },
      conceptFlow: { pass: true, tags: 0, tooMuchAtOnce: 0, coldInSynthesis: 0, taughtLate: 0 },
      builtOn: { pass: true, links: 0, acts: 0, perAct: {} },
      sceneObjects: { pass: true, checked: 0, missing: 0 },
      toolHonesty: { pass: true, toolsDeclared: 0, answersChecked: 0 },
      manPageFlags: { pass: true, flagsChecked: 0 },
      presentation: { pass: true, checked: false, hasDescription: false, hasIcon: false, hasCover: false, hasBriefing: false },
      coverageReport: {}
    }
  };
  const fail = (check, msg) => {
    results.valid = false;
    results.checks[check].pass = false;
    results.errors.push(msg);
  };

  // ── Every pattern in the pack, timed ─────────────────────────────────────
  // The static safety check is a heuristic and has been wrong before, so each
  // pattern is also run against input built to make a backtracking engine work
  // hardest. A pattern that is slow here would be slow on a student's
  // submission, where it pins the server instead of failing a validation run.
  {
    const seen = new Set();
    const walkPredicates = (cfg, where) => {
      if (!cfg || typeof cfg !== 'object') return;
      for (const sub of cfg.predicates || []) walkPredicates(sub, where);
      const pattern = cfg.pattern;
      if (typeof pattern !== 'string' || seen.has(pattern)) return;
      seen.add(pattern);

      const regex = compileSafe(pattern, cfg.flags || 'i');
      if (!regex) {
        fail('solvability', `${where}: pattern /${pattern}/ was refused as unsafe or invalid.`);
        return;
      }
      const probe = probePattern(regex);
      if (!probe.ok) {
        fail('solvability',
          `${where}: pattern /${pattern}/ took ${probe.worstMs}ms on a ${probe.input?.length}-character `
          + `input (budget ${PROBE_BUDGET_MS}ms). That is catastrophic backtracking; it would hang the `
          + 'server on a student submission. Rewrite it without a quantifier inside a quantified group.');
      }
    };
    for (const c of challenges) walkPredicates(c.success, `Challenge '${c.id}'`);
  }

  // How the pack introduces itself. Checked for every pack, not only for one
  // loaded from a file, because a directory pack a teacher wrote by hand is
  // exactly the one likely to be missing its description.
  {
    const p = validatePresentation(manifest);
    results.checks.presentation.checked = true;
    results.checks.presentation.hasDescription = typeof manifest.description === 'string' && manifest.description.trim().length > 0;
    results.checks.presentation.hasIcon = typeof manifest.icon === 'string' && manifest.icon.trim().length > 0;
    results.checks.presentation.hasCover = typeof manifest.cover === 'string' && manifest.cover.length > 0;
    results.checks.presentation.hasBriefing = !!manifest.briefing?.body;
    for (const e of p.errors) fail('presentation', e);
    results.warnings.push(...p.warnings);
    // Fields the format dropped and packs still carry. A finding with a
    // heading, not a warning: the last three dead fields sat in every pack for
    // months precisely because the only thing that mentioned them was a
    // warning in a stream of warnings.
    results.removedFields = removedFieldsIn(manifest);
  }

  // ── CHECK 0: single-file pack format ───────────────────────────────────────
  // Runs only for a pack that came from a .pack.json. A directory pack has no
  // formatVersion to check, and inventing one for it would be a check that
  // cannot fail.
  if (packFile) {
    results.checks.packFormat.checked = true;
    results.checks.packFormat.formatVersion = packFile.formatVersion ?? null;
    results.checks.packFormat.readerVersion = PACK_FORMAT_VERSION;
    const { errors: fErrors, warnings: fWarnings } = validatePackFileStructure(packFile);
    for (const e of fErrors) fail('packFormat', `Pack file: ${e}`);
    for (const w of fWarnings) results.warnings.push(`Pack file: ${w}`);
  }

  const platforms = manifest.platforms || ['linux'];
  const filesystems = {};
  for (const plat of platforms) filesystems[plat] = createFs(plat);

  const userFor = (isWin) =>
    (isWin ? manifest.windows?.user : manifest.linux?.user) || (isWin ? 'Student' : 'student');
  const homeFor = (isWin) =>
    (isWin ? manifest.windows?.home : manifest.linux?.home) || (isWin ? 'C:\\Users\\Student' : '/home/student');

  const testFlags = {};
  for (const c of challenges) {
    if (c.success?.kind === 'flag' && !c.success.staticFlag) {
      testFlags[c.id] = generateUserFlag(TEST_SECRET, TEST_HANDLE, c.id, id);
    }
  }

  function getPreparedFs(plat) {
    const baseFs = { ...filesystems[plat] };
    for (const [key, node] of Object.entries(baseFs)) {
      if (node.type === 'file' && typeof node.content === 'string') {
        let text = node.content;
        for (const [cId, flagVal] of Object.entries(testFlags)) {
          text = text.replaceAll(`[[FLAG:${cId}]]`, flagVal);
        }
        text = text.replaceAll('[[FLAG:USER_HANDLE]]', TEST_HANDLE);
        baseFs[key] = { ...node, content: text };
      }
    }
    return baseFs;
  }

  const corpus = buildReachableCorpus(filesystems, help, commands);

  // ── CHECK 1: every path a challenge references must exist ───────────────────
  for (const c of challenges) {
    const isWin = (c.platform || platforms[0]) === 'windows';
    const fsv = filesystems[isWin ? 'windows' : 'linux'] || filesystems[platforms[0]];
    if (!fsv) continue;
    // Only paths that must EXIST BEFORE the student starts. success.path is the
    // expected outcome of the challenge (often a file they create), so it must
    // not be required to pre-exist.
    const refs = [];
    if (c.setup?.cwd) refs.push(['setup.cwd', c.setup.cwd]);
    if (isPathLike(c.success?.flagFile, isWin)) refs.push(['success.flagFile', c.success.flagFile]);
    for (const [field, ref] of refs) {
      results.checks.vfsPaths.tested++;
      if (!findVfsKey(fsv, ref, isWin)) {
        fail('vfsPaths', `Challenge '${c.id}' ${field} points at '${ref}', which does not exist in the ${isWin ? 'windows' : 'linux'} filesystem.`);
      }
    }
  }

  // ── CHECK 2: solvability ────────────────────────────────────────────────────
  const teachesConcepts = new Set();
  const actPoints = {};

  for (const challenge of challenges) {
    const plat = challenge.platform || manifest.platforms?.[0] || 'linux';
    const isWin = plat === 'windows';
    const user = userFor(isWin);
    const cwd = challenge.setup?.cwd || homeFor(isWin);

    actPoints[challenge.act] = (actPoints[challenge.act] || 0) + (challenge.points || 0);
    if (Array.isArray(challenge.teaches)) challenge.teaches.forEach(t => teachesConcepts.add(t));

    // ── CHECK 2b: does this challenge look at anything but the keystrokes? ───
    // `commandMatches` alone grades the typed line. It marks a student wrong
    // for a smarter equivalent command, and marks them right when the
    // simulation printed something false. Counted, named, and reported — not
    // failed, because fixing 60 of them is a separate content pass.
    results.checks.outputAssertions.checked++;
    const kinds = predicateKinds(challenge.success);
    if (kinds.has('commandMatches') && ![...kinds].some(k => EVIDENCE_PREDICATES.has(k))) {
      results.checks.outputAssertions.blind++;
      results.checks.outputAssertions.pass = false;
      results.outputBlind.push({
        id: challenge.id,
        act: challenge.act,
        title: challenge.title,
        pattern: challenge.success?.pattern ?? null
      });
    }

    if (challenge.success?.kind === 'flag') {
      // A flag challenge is solvable only if its flag actually reaches the student.
      if (challenge.success.staticFlag) {
        results.checks.solvability.solved++;
        results.checks.solvability.flagsVerified++;
        continue;
      }
      const placeholder = `[[FLAG:${challenge.id}]]`;
      let ok = true;

      if (!corpus.includes(placeholder)) {
        fail('solvability', `Challenge '${challenge.id}' is a flag challenge but '${placeholder}' appears nowhere reachable (no VFS file, help page, or pack command emits it). The flag can never be found.`);
        ok = false;
      }

      const ff = challenge.success.flagFile;
      if (ok && isPathLike(ff, isWin)) {
        const fsv = filesystems[plat];
        const key = findVfsKey(fsv, ff, isWin);
        const node = key ? fsv[key] : null;
        if (!node) {
          fail('solvability', `Challenge '${challenge.id}' flagFile '${ff}' does not exist.`);
          ok = false;
        } else if (!String(node.content || '').includes(placeholder)) {
          fail('solvability', `Challenge '${challenge.id}' flagFile '${ff}' exists but does not contain '${placeholder}'.`);
          ok = false;
        } else if (!hasPermission(node, 'r', user, isWin)) {
          fail('solvability', `Challenge '${challenge.id}' flagFile '${ff}' is not readable by user '${user}'.`);
          ok = false;
        }
      }

      if (ok) {
        results.checks.solvability.solved++;
        results.checks.solvability.flagsVerified++;
      }
      continue;
    }

    // Non-flag challenges must declare how they are solved, and it must work.
    const testSolutions = [];
    if (Array.isArray(challenge.acceptedVariants) && challenge.acceptedVariants.length) {
      testSolutions.push(...challenge.acceptedVariants);
    } else {
      const match = challenge.brief?.match(/`([^`]+)`/);
      if (match) testSolutions.push(match[1]);
    }

    if (testSolutions.length === 0) {
      fail('solvability', `Challenge '${challenge.id}' declares no acceptedVariants and no command in its brief, so solvability cannot be proven.`);
      continue;
    }

    // Only entries the author actually WROTE in acceptedVariants are held to
    // the "every variant works" bar. A command scraped out of the brief is a
    // fallback for proving solvability, not a promise to the student.
    const declaredVariants = new Set(
      Array.isArray(challenge.acceptedVariants) ? challenge.acceptedVariants : []
    );

    const failures = [];
    let passedAtLeastOne = false;
    for (const sol of testSolutions) {
      results.checks.solvability.variantsTested++;
      const res = runPipeline(sol, cwd, getPreparedFs(plat), plat, {
        packCommands: commands, packHelp: help, user
      });
      const predicateOk = evaluatePredicate(challenge.success, {
        fs: res.fs, cwd: res.newCwd || cwd, commandText: sol,
        stdout: res.stdout, stderr: res.stderr, output: res.output,
        status: res.status, isWindows: isWin, trusted
      });
      // A solution that errors is not a solution — unless it deliberately
      // demonstrates failure handling (`||`, or an explicit expected status).
      const intentionalFailure = sol.includes('||') || challenge.success?.predicate === 'exitStatusIs';
      const clean = intentionalFailure || (!res.hasError && !ERROR_MARKERS.test(res.output || ''));
      const ok = predicateOk && clean;
      if (ok) passedAtLeastOne = true;
      else failures.push(`'${sol}' (predicate=${predicateOk}, clean=${clean})`);

      // ── CHECK 2c: every accepted variant must actually pass ───────────────
      // An accepted variant that fails is the course sanctioning an answer
      // that does not work: the student types a line the pack lists as
      // correct, is marked wrong, and has no way to tell which of them is
      // broken. Reported as its own category with a count, kept out of
      // `errors` so the run stays green while the content is repaired.
      if (declaredVariants.has(sol)) {
        results.checks.acceptedVariants.tested++;
        if (!ok) {
          results.checks.acceptedVariants.failed++;
          results.checks.acceptedVariants.pass = false;
          const firstLine = String(res.output || '').split('\n').find(l => l.trim()) || '';
          results.variantFailures.push({
            id: challenge.id,
            act: challenge.act,
            title: challenge.title,
            variant: sol,
            predicateOk,
            clean,
            reason: !clean
              ? `the command itself failed: ${firstLine.slice(0, 100)}`
              : "the command ran, but the challenge's success condition did not accept it"
          });
        }
      }
    }

    if (passedAtLeastOne) {
      results.checks.solvability.solved++;
    } else {
      fail('solvability', `Challenge '${challenge.id}' (${challenge.title}) is not solvable by any declared solution: ${failures.join('; ')}`);
    }
  }

  // ── CHECK 3: placeholder mapping, both directions ───────────────────────────
  const flagKindChallenges = challenges.filter(c => c.success?.kind === 'flag');
  const seenPlaceholders = new Set();
  for (const m of corpus.matchAll(/\[\[FLAG:([a-zA-Z0-9_\-]+)\]\]/g)) {
    const flagId = m[1];
    if (flagId === 'USER_HANDLE') continue;
    seenPlaceholders.add(flagId);
    results.checks.flagPlaceholders.placeholders++;
    if (!challenges.find(c => c.id === flagId)) {
      fail('flagPlaceholders', `Placeholder '[[FLAG:${flagId}]]' exists in pack content but no challenge has id '${flagId}'. Students will see the raw placeholder.`);
    }
  }
  for (const c of flagKindChallenges) {
    if (c.success.staticFlag) continue;
    if (!seenPlaceholders.has(c.id)) {
      fail('flagPlaceholders', `Flag challenge '${c.id}' has no '[[FLAG:${c.id}]]' placeholder anywhere in the pack.`);
    }
  }
  results.checks.flagPlaceholders.mapped = flagKindChallenges.length;

  // ── CHECK 4: act progression math (the production deadlock class) ───────────
  const acts = manifest.acts || [];
  for (const act of acts) {
    const actChallenges = challenges.filter(c => c.act === act.id);
    if (actChallenges.length === 0) {
      results.warnings.push(`Act ${act.id} (${act.name}) contains 0 challenges.`);
      continue;
    }
    const gated = act.unlockThreshold || (act.unlockPolicy && act.unlockPolicy !== 'open');
    if (!gated) continue;
    const prior = challenges.filter(c => c.act === act.id - 1);
    if (prior.length === 0) continue;
    results.checks.actProgression.gatedActsChecked++;
    const rawRequired = Math.ceil(prior.length * (act.unlockThreshold ?? 0.8));
    if (rawRequired > Math.max(1, prior.length - 1)) {
      results.warnings.push(`Act ${act.id}: unlockThreshold ${act.unlockThreshold} would require all ${prior.length} prior challenges; clamped so a student may still skip one.`);
    }
    // Simulate a student who skipped exactly one challenge in the prior act.
    const solved = new Set(prior.slice(0, prior.length - 1).map(c => c.id));
    if (solved.size < requiredToUnlock(prior.length, act.unlockThreshold ?? 0.8)) {
      fail('actProgression', `Act ${act.id} ('${act.name}') cannot be unlocked after skipping one challenge in act ${act.id - 1} (${prior.length} challenges, ${requiredToUnlock(prior.length)} required). A stuck student is locked out.`);
    }
  }

  // ── CHECK 5: commands quoted in briefs and hints must actually run ──────────
  // getAll() defaults to linux. Asking for one platform silently skipped every
  // Windows command quoted in a brief, so those snippets were never executed.
  const knownCommands = new Set([
    ...registry.getAll('linux').map(c => c.name),
    ...registry.getAll('windows').map(c => c.name),
    ...Object.keys(commands || {})
  ]);
  for (const c of challenges) {
    if (c.commandCheckExempt) continue;
    const plat = c.platform || platforms[0] || 'linux';
    const isWin = plat === 'windows';
    const user = userFor(isWin);
    const cwd = c.setup?.cwd || homeFor(isWin);
    const exempt = new Set(c.commandCheckExemptSnippets || []);
    const texts = [c.brief || '', ...(c.hints || []).map(h => h.text || '')].join('\n');
    // Execute cumulatively, threading cwd and filesystem, because briefs
    // legitimately give a sequence ("cd into it" then "cat the file there").
    let seqCwd = cwd;
    let seqFs = getPreparedFs(plat);
    for (const m of texts.matchAll(/`([^`]+)`/g)) {
      const snippet = m[1].trim();
      if (exempt.has(snippet)) continue;
      const words = snippet.split(/\s+/);
      const first = words[0];
      if (!knownCommands.has(first)) continue;                 // prose, not a command
      if (/FLAG\{|\.\.\.|<[a-z]/i.test(snippet)) continue;     // templates & placeholders
      // `||` demonstrates failure handling on purpose.
      const intentionalFailure = snippet.includes('||');
      results.checks.briefCommands.commandsTested++;
      const ctx = {
        packCommands: commands, packHelp: help, user,
        installedPackages: new Set(Object.keys(commands || {}))
      };
      // Briefs mix SEQUENCES ("cd in, then cat the file") with ALTERNATIVES
      // ("or use the absolute path"). A snippet is fine if it works either in
      // the running sequence or standalone from the challenge's start state.
      const res = runPipeline(snippet, seqCwd, seqFs, plat, ctx);
      const seqOk = !res.hasError && !ERROR_MARKERS.test(res.output || '');
      let standaloneOk = false;
      if (!seqOk) {
        const alt = runPipeline(snippet, cwd, getPreparedFs(plat), plat, ctx);
        standaloneOk = !alt.hasError && !ERROR_MARKERS.test(alt.output || '');
      }
      const broke = !intentionalFailure && !seqOk && !standaloneOk;
      // A bare command name with no arguments is prose ("use `grep` to search"),
      // not an instruction; only flag it when it carries arguments.
      if (broke && words.length > 1) {
        fail('briefCommands', `Challenge '${c.id}': the command \`${snippet}\` quoted in its brief/hints fails from ${seqCwd}: ${String(res.output || '').split('\n')[0].slice(0, 90)}`);
      }
      if (!res.hasError) {
        seqCwd = res.newCwd || seqCwd;
        if (res.fs) seqFs = res.fs;
      }
    }
  }

  // ── CHECK 6: man-page flag status ───────────────────────────────────────────
  for (const cmd of registry.getAll()) {
    for (const [fName, fDef] of Object.entries(cmd.flags || {})) {
      results.checks.manPageFlags.flagsChecked++;
      if (fDef.status !== 'implemented' && fDef.status !== 'notSimulated') {
        fail('manPageFlags', `Command '${cmd.name}' flag '-${fName}' has invalid status '${fDef.status}'. Must be 'implemented' or 'notSimulated'.`);
      }
    }
  }

  // ── CHECK 7: coverage report ────────────────────────────────────────────────
  results.checks.coverageReport = {
    totalChallenges: challenges.length,
    totalPoints: Object.values(actPoints).reduce((a, b) => a + b, 0),
    pointsPerAct: actPoints,
    conceptsCount: teachesConcepts.size,
    concepts: Array.from(teachesConcepts).sort(),
    outputBlindChallenges: results.checks.outputAssertions.blind,
    brokenAcceptedVariants: results.checks.acceptedVariants.failed
  };

  // ── CHECK 8: first contact with each idea ───────────────────────────────────
  // Reads the `teaches` tags the coverage report used to count and throw away.
  {
    const flow = analyseConceptFlow(challenges);
    results.tooMuchAtOnce = flow.tooMuchAtOnce;
    results.coldInSynthesis = flow.coldInSynthesis;
    results.taughtLate = flow.taughtLate;
    results.checks.conceptFlow = {
      pass: flow.tooMuchAtOnce.length === 0 && flow.coldInSynthesis.length === 0 && flow.taughtLate.length === 0,
      tags: flow.tagCount,
      tooMuchAtOnce: flow.tooMuchAtOnce.length,
      coldInSynthesis: flow.coldInSynthesis.length,
      taughtLate: flow.taughtLate.length
    };
  }

  // ── CHECK 9: builtOn, the dependency an author states out loud ──────────────
  //
  // `teaches` says what a challenge covers. `builtOn` says what a student must
  // already have done to stand a chance here, and it is the only field that
  // makes the shape of a course machine-readable rather than a reading
  // exercise. A dangling or forward-pointing id is a hard error: it would draw
  // a student a line to a challenge they cannot have reached.
  //
  // The average is reported, not failed. A pack may legitimately be a flat
  // drill book; it should just have to see that it is one.
  {
    const order = inCourseOrder(challenges);
    const positionOf = new Map(order.map((c, i) => [c.id, i]));
    const actOf = new Map(order.map((c) => [c.id, c.act]));
    let links = 0;
    const perAct = {};

    for (const c of challenges) {
      if (c.builtOn === undefined) continue;
      if (!Array.isArray(c.builtOn)) {
        fail('builtOn', `Challenge '${c.id}' has a "builtOn" that is not an array of challenge ids.`);
        continue;
      }
      const here = positionOf.get(c.id);
      for (const dep of c.builtOn) {
        if (typeof dep !== 'string' || !dep) {
          fail('builtOn', `Challenge '${c.id}' lists a "builtOn" entry that is not a challenge id.`);
          continue;
        }
        if (dep === c.id) {
          fail('builtOn', `Challenge '${c.id}' lists itself in "builtOn".`);
          continue;
        }
        if (!positionOf.has(dep)) {
          fail('builtOn', `Challenge '${c.id}' says it builds on '${dep}', which is not a challenge in this pack. `
            + 'A builtOn id names a challenge in the same pack — ids are unique across the site, but a '
            + 'student only ever works through one course at a time.');
          continue;
        }
        if (positionOf.get(dep) >= here) {
          fail('builtOn', `Challenge '${c.id}' says it builds on '${dep}', which comes later in the course. `
            + 'A student reaching this challenge has not done that one yet.');
          continue;
        }
        if ((actOf.get(dep) ?? 0) > (c.act ?? 0)) {
          fail('builtOn', `Challenge '${c.id}' (act ${c.act}) says it builds on '${dep}', which is in act `
            + `${actOf.get(dep)}. A dependency must be in an act at or before this one.`);
          continue;
        }
        links++;
        perAct[c.act] = (perAct[c.act] || 0) + 1;
      }
    }

    const actCount = Math.max(1, (manifest.acts || []).length);
    results.checks.builtOn = { pass: results.checks.builtOn.pass, links, acts: actCount, perAct };
    if (links / actCount < 1) {
      results.builtOnGap = { links, acts: actCount, perAct };
    }
  }

  // ── CHECK 10: does the brief name anything in the room? ─────────────────────
  //
  // Only for a challenge graded on the command, and only when the challenge's
  // own answer names an object. `cls` and `pwd` take no operand, so there is
  // nothing for their scene to name and asking for one would be noise.
  for (const c of challenges) {
    if (c.success?.kind === 'flag') continue;
    if (!predicateKinds(c.success).has('commandMatches')) continue;

    const plat = c.platform || platforms[0] || 'linux';
    const isWin = plat === 'windows';
    const fsv = filesystems[plat] || filesystems[platforms[0]];
    if (!fsv) continue;
    const home = homeFor(isWin);
    const cwd = c.setup?.cwd || home;

    const solutions = Array.isArray(c.acceptedVariants) && c.acceptedVariants.length
      ? c.acceptedVariants
      : [c.brief?.match(/`([^`]+)`/)?.[1]].filter(Boolean);
    if (!solutions.length) continue;

    // Every accepted answer must name an object, not just one of them. If the
    // challenge can be solved with a bare command, the scene owes nobody a
    // filename: `ls` on its own is a complete answer to "what is in here".
    const operandSets = solutions.map((s) => operandsOf(s, isWin));
    if (!operandSets.every((ops) => ops.length > 0)) continue;

    results.checks.sceneObjects.checked++;
    const named = new Set(operandSets.flat());
    const words = `${c.brief || ''} ${c.objective || ''}`.split(/[\s,;()]+/).filter(Boolean);
    const grounded = words.some((w) => {
      if (namesSomethingReal(w, fsv, cwd, home, isWin)) return true;
      // A path the challenge CREATES, or one it proves is absent, does not
      // resolve yet and still names the thing in the room — provided the
      // pack's own answer uses the same word.
      const t = w.replace(/^[`"'(]+/, '').replace(/[`"'.,;:!?)]+$/, '');
      if (looksLikeAPath(t, isWin) && named.has(t)) return true;
      // A thing can be named without its full path or its extension.
      // `where cmd` is about a program that really is on this machine, at
      // C:\\Windows\\System32\\cmd.exe -- so the brief saying "the program
      // `cmd`" names the thing in the room as precisely as a path would.
      if (!named.has(t)) return false;
      const base = t.toLowerCase();
      return Object.keys(fsv).some((key) => {
        const leaf = key.split(/[/\\]/).pop().toLowerCase();
        return leaf === base || leaf.replace(/\.[^.]+$/, '') === base;
      });
    });

    if (!grounded) {
      results.checks.sceneObjects.missing++;
      results.checks.sceneObjects.pass = false;
      results.sceneWithoutObject.push({
        id: c.id,
        act: c.act,
        title: c.title,
        operands: [...named].slice(0, 4)
      });
    }
  }

  // ── CHECK 11: a tool the course itself called unreal ────────────────────────
  //
  // `courseTools` is an honesty map: "tcpdump is a real thing, it is not
  // simulated here". Requiring one of those names as an answer makes the
  // course contradict itself, and the student meets a wall the pack built and
  // then forgot about. This one FAILS, because there is no version of it that
  // is merely untidy: the challenge cannot be solved as written.
  {
    const courseTools = manifest.courseTools || {};
    const declared = new Set(Object.keys(courseTools).filter((k) => !k.startsWith('//')));
    results.checks.toolHonesty.toolsDeclared = declared.size;
    if (declared.size) {
      for (const c of challenges) {
        const heads = new Set();
        for (const v of c.acceptedVariants || []) for (const h of headWords(v)) heads.add(h);
        for (const pat of commandMatchPatterns(c.success)) {
          const h = patternHead(pat);
          if (h) heads.add(h);
        }
        results.checks.toolHonesty.answersChecked += heads.size;
        for (const h of heads) {
          if (!declared.has(h)) continue;
          fail('toolHonesty', `Challenge '${c.id}' is answered with '${h}', but manifest.courseTools `
            + `declares '${h}' as a real tool this simulator does NOT provide. The course tells the `
            + 'student it does not exist here and then requires it. Remove it from courseTools, or '
            + 'stop grading on it.');
        }
      }
    }
  }

  if (verbose) {
    console.log(`[${id}] valid=${results.valid} errors=${results.errors.length} warnings=${results.warnings.length}`);
    results.errors.forEach(e => console.log('  ERROR:', e));
  }

  // ── Does the wording of a check reject a correct answer? ────────────────
  // A commandMatches pattern is written by hand, and one anchored a character
  // tighter than its author meant refuses a student who did the job. This
  // rewrites each accepted solution in ways that cannot change what it does --
  // quoting, ./ and absolute paths, split and long flags -- and reports any
  // that produce the required result and are refused anyway.
  for (const challenge of challenges) {
    // A commandMatches with nothing to rewrite is the blind spot in the check
    // above, and it is exactly the shape most likely to be too tight: a
    // hand-written pattern that no machine has ever tried to satisfy any other
    // way. One accepted answer is all it takes to make it checkable.
    const { text: textCheck } = splitPredicate(challenge.success);
    if (textCheck && !(challenge.acceptedVariants || []).length) {
      results.uncheckablePatterns.push({
        id: challenge.id,
        act: challenge.act,
        title: challenge.title,
        pattern: textCheck.predicate === 'commandMatches' ? textCheck.pattern : textCheck.predicate
      });
    }

    try {
      const audit = auditChallenge(packObj, challenge, {
        runPipeline,
        evaluatePredicate,
        flagSpecsFor: (name, platform) => {
          try { return registry.get(name, platform)?.flags || {}; } catch { return {}; }
        }
      });
      for (const u of audit.unfair) {
        results.unfairRejections.push({
          id: challenge.id,
          act: challenge.act,
          title: challenge.title,
          variant: u.variant,
          from: u.from,
          pattern: u.textPattern
        });
      }
    } catch {
      // A challenge this cannot rewrite is not a challenge with a problem.
    }
  }

  // Something a pack claims to teach and nobody defines. The engine covers the
  // shell; anything left is this course's own vocabulary, and only this course
  // can write it.
  results.undefinedTerms = undefinedTerms(packObj);

  // A challenge whose task is never stated as a task. The brief is a scene and
  // the instruction is a sentence somewhere inside it, so a student scanning
  // for "what do I have to do" finds prose and gives up on reading it. Only
  // the pack can write this line: the engine does not know what this course
  // asked for.
  results.unframedTasks = challenges
    .filter(c => typeof c.objective !== 'string' || c.objective.trim().length === 0)
    .map(c => ({ id: c.id, act: c.act, title: c.title }));

  return results;
}

#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shellgrounds CLI — curriculum validator and pack authoring tool.

import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { PACKS } from '../packs/index.js';
import { validatePack, checkGlobalChallengeIds, checkCommandHonesty } from '../packages/engine/validate/packValidator.js';
import { resolvePackTarget, registryPacks } from '../packages/engine/validate/packSource.js';
import { PackFormatError } from '../packages/engine/validate/packFile.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { explainPredicate, renderExplanation } from '../packages/engine/validate/explain.js';
import { generateUserFlag } from '../packages/engine/crypto-utils.js';
import { ERROR_MARKERS } from '../packages/engine/constants.js';
import { exportPack } from '../scripts/pack-export.mjs';
import { importPack } from '../scripts/pack-import.mjs';
import { scaffoldPack } from '../scripts/pack-scaffold.mjs';

/** A path the user can paste back: relative when it is inside the project, absolute when not. */
const displayPath = (p) => {
  const rel = relative(process.cwd(), p);
  return (!rel || rel.startsWith('..')) ? p : rel;
};

const RULE = '='.repeat(80);
const THIN = '-'.repeat(80);

const USAGE = `
Shellgrounds CLI — author and check curriculum packs.

Usage:
  shellgrounds validate [target ...] [--all] [--json] [--verbose]
  shellgrounds new <pack-id> [outDir] [--force]
  shellgrounds try <challenge-id> "<command>" [--pack <target>] [--json]
  shellgrounds export <target> [out.pack.json]
  shellgrounds import <file.pack.json> [outDir] [--force]

A <target> is a registered pack id, a path to a .pack.json file, or a path to a
pack directory. With no target, validate checks every registered pack.

Commands:
  validate   Machine-proves that every challenge is solvable, and reports the
             content problems that do not stop a pack shipping but should.
  new        Scaffolds a pack that already passes validation.
  try        Runs one command against one challenge and shows what the student
             would see, whether it passes, and why.
  export     Writes a pack out as a single self-contained .pack.json.
  import     Turns a .pack.json back into a pack directory.

Registered packs: ${Object.keys(PACKS).join(', ')}
`;

// ── validate ────────────────────────────────────────────────────────────────

async function cmdValidate(args) {
  const isJson = args.includes('--json');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const positional = args.filter((a) => !a.startsWith('-'));

  const targets = positional.length ? positional : null;
  const loaded = [];
  const loadWarnings = [];

  if (!targets) {
    for (const { id, pack } of registryPacks()) loaded.push({ id, pack, origin: 'registry', packFile: null });
  } else {
    for (const target of targets) {
      const { pack, origin, warnings } = await resolvePackTarget(target);
      let packFile = null;
      if (origin === 'file') {
        packFile = JSON.parse(await readFile(resolve(target), 'utf8'));
      }
      loaded.push({ id: pack.id, pack, origin, packFile });
      for (const w of warnings) loadWarnings.push(`[${pack.id}] ${w}`);
    }
  }

  // ── Globally unique challenge ids ─────────────────────────────────────────
  // Checked across everything in this run PLUS everything already registered,
  // so an author validating one new pack still finds out that they picked an id
  // the shipped content already uses. packs/index.js throws on a duplicate at
  // import time, which takes the whole site down; this catches it first and
  // says which two packs collided.
  const idCheckInput = [...loaded.map((l) => l.pack)];
  for (const { id, pack } of registryPacks()) {
    if (!idCheckInput.some((p) => p.id === id)) idCheckInput.push(pack);
  }
  const idCheck = checkGlobalChallengeIds(idCheckInput);

  // ── Commands the engine implements and still calls unreal ─────────────────
  // Engine-wide, not pack-specific, so it runs once beside the id check. A
  // command lands in the registry and its entry in unknown-command.js is left
  // behind; the message is now dead, but it is the message a student would get
  // if anything ever stopped resolving the command, and it says the opposite of
  // the truth. This is also the staleness that hides a newly implemented
  // command from the person who implemented it.
  const honesty = checkCommandHonesty();

  const reports = [];
  for (const { pack, packFile } of loaded) {
    reports.push(await validatePack(pack, { verbose, packFile }));
  }

  const allPass = reports.every((r) => r.valid) && idCheck.pass;

  if (isJson) {
    console.log(JSON.stringify(
      targets ? { globalChallengeIds: idCheck, commandHonesty: honesty, packs: reports } : reports,
      null,
      2
    ));
    process.exit(allPass ? 0 : 1);
  }

  console.log(`\n${RULE}`);
  console.log('                 SHELLGROUNDS — CONTENT PACK VALIDATOR REPORT');
  console.log(`${RULE}\n`);

  for (const w of loadWarnings) console.log(`  ⚠️ ${w}`);
  if (loadWarnings.length) console.log('');

  console.log(`Challenge ids: ${idCheck.totalIds} across ${idCheck.packsChecked} packs [${idCheck.pass ? '✅ all unique' : '❌ COLLISION'}]`);
  if (!idCheck.pass) {
    for (const c of idCheck.collisions) console.log(`  ❌ ${c}`);
  }
  if (!honesty.pass) {
    console.log(`IMPLEMENTED BUT CALLED UNREAL: ${honesty.stale.length} of ${honesty.checked} commands are simulated and still listed as not simulated`);
    console.log('  Remove each from REAL_LINUX / REAL_WINDOWS in packages/engine/unknown-command.js.');
    const shownStale = verbose ? honesty.stale : honesty.stale.slice(0, 10);
    console.log(`  · ${shownStale.map((c) => `${c.name} (${c.platform})`).join(', ')}`);
    if (!verbose && honesty.stale.length > shownStale.length) {
      console.log(`  · …and ${honesty.stale.length - shownStale.length} more (--verbose lists all)`);
    }
  }
  console.log(`${THIN}\n`);

  let totalBlind = 0;
  let totalUnfair = 0;
  let totalUncheckable = 0;
  let totalUndefined = 0;
  let totalUnframed = 0;
  let totalBadVariants = 0;
  let totalTooMuch = 0;
  let totalCold = 0;
  let totalLate = 0;
  let totalSceneless = 0;
  let totalRemoved = 0;

  for (const rep of reports) {
    const statusSymbol = rep.valid ? '✅ PASS' : '❌ FAIL';
    console.log(`Pack: ${rep.packName} (${rep.packId}) [${statusSymbol}]`);
    console.log(`- Solvability:      ${rep.checks.solvability.solved}/${rep.checks.solvability.total} challenges proven (${rep.checks.solvability.variantsTested} variants tested)`);
    console.log(`- VFS Integrity:    ${rep.checks.vfsPaths.tested} nodes validated`);
    console.log(`- Flags:            ${rep.checks.flagPlaceholders.placeholders} placeholders mapped to challenges`);
    console.log(`- Total Points:     ${rep.checks.coverageReport.totalPoints} pts across ${Object.keys(rep.checks.coverageReport.pointsPerAct).length} acts`);
    console.log(`- Concepts Taught:  ${rep.checks.coverageReport.conceptsCount} distinct skills`);
    if (rep.checks.packFormat.checked) {
      console.log(`- Pack Format:      version ${rep.checks.packFormat.formatVersion} [${rep.checks.packFormat.pass ? 'ok' : 'INVALID'}]`);
    }

    if (rep.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of rep.errors) console.log(`  ❌ ${err}`);
    }

    // ── Broken accepted variants ────────────────────────────────────────────
    // Its own heading, its own count. An accepted variant that fails is the
    // course sanctioning an answer that does not work: a student types a line
    // this pack calls correct and is marked wrong.
    const av = rep.checks.acceptedVariants;
    totalBadVariants += av.failed;
    if (av.failed > 0) {
      console.log(`\nBROKEN ACCEPTED VARIANTS: ${av.failed} of ${av.tested} listed answers do not work`);
      for (const f of rep.variantFailures) {
        console.log(`  ✗ ${f.id} (act ${f.act}) — "${f.variant}"`);
        console.log(`      ${f.reason}`);
      }
    }

    // ── Keystroke grading ───────────────────────────────────────────────────
    const oa = rep.checks.outputAssertions;
    totalBlind += oa.blind;
    if (oa.blind > 0) {
      const pct = Math.round((oa.blind / oa.checked) * 100);
      console.log(`\nGRADES KEYSTROKES ONLY: ${oa.blind} of ${oa.checked} challenges (${pct}%) check the typed command and nothing else`);
      console.log('  These pass a wrong answer that was typed correctly, and fail a right answer typed differently.');
      const shown = verbose ? rep.outputBlind : rep.outputBlind.slice(0, 6);
      for (const c of shown) console.log(`  · ${c.id} (act ${c.act}) — ${c.title}`);
      if (!verbose && rep.outputBlind.length > shown.length) {
        console.log(`  · …and ${rep.outputBlind.length - shown.length} more (--verbose lists all, --json has the full set)`);
      }
    }

    // ── Solutions refused for their spelling ──────────────────────────────
    // Not an error: the pack works. But each line here is a student who did
    // the job correctly and was marked wrong, which is the failure a course
    // can least afford.
    const unfair = rep.unfairRejections || [];
    totalUnfair += unfair.length;
    if (unfair.length > 0) {
      console.log(`\nCORRECT ANSWERS REFUSED: ${unfair.length} rewritings of your own accepted answers are rejected`);
      console.log('  Each does what the challenge asks and fails only its commandMatches pattern.');
      const shown = verbose ? unfair : unfair.slice(0, 8);
      for (const u of shown) {
        console.log(`  · ${u.id} — "${u.variant}"`);
        console.log(`      rewrites "${u.from}" · blocked by ${u.pattern}`);
      }
      if (!verbose && unfair.length > shown.length) {
        console.log(`  · …and ${unfair.length - shown.length} more (--verbose lists all)`);
      }
    }

    // ── Words nothing defines ─────────────────────────────────────────────
    // A pack claims to teach a thing and no one says what it is. The engine
    // covers the shell, so whatever is left is this course's own vocabulary.
    const undef = rep.undefinedTerms || [];
    totalUndefined += undef.length;
    if (undef.length > 0) {
      console.log(`\nTAUGHT BUT NEVER DEFINED: ${undef.length} terms this pack teaches and nothing explains`);
      console.log('  A student meets these with no idea what they are. Add them to manifest.glossary.');
      const shown = verbose ? undef : undef.slice(0, 10);
      for (const u of shown) console.log(`  · ${u.tag}   (first taught in ${u.firstSeenIn})`);
      if (!verbose && undef.length > shown.length) {
        console.log(`  · …and ${undef.length - shown.length} more (--verbose lists all)`);
      }
    }

    // ── Tasks nobody stated as a task ─────────────────────────────────────
    // The brief is a scene. Somewhere in it is the instruction, and nothing
    // marks which sentence that is, so a student scanning for what to do reads
    // three sentences of story and stops reading. One labelled line fixes it.
    const unframed = rep.unframedTasks || [];
    totalUnframed += unframed.length;
    if (unframed.length > 0) {
      console.log(`\nNO TASK LINE: ${unframed.length} challenges never say plainly what to do`);
      console.log('  Add an "objective" to each: one sentence, the goal not the command.');
      const shown = verbose ? unframed : unframed.slice(0, 8);
      for (const u of shown) console.log(`  · ${u.id} (act ${u.act}) — ${u.title}`);
      if (!verbose && unframed.length > shown.length) {
        console.log(`  · …and ${unframed.length - shown.length} more (--verbose lists all)`);
      }
    }

    // ── Patterns nothing can check ────────────────────────────────────────
    // The check above can only rewrite an answer the pack already accepts. A
    // commandMatches with no acceptedVariants is therefore invisible to it --
    // and is the likeliest of all to be too tight, having never been tried any
    // other way by anything.
    const blind = rep.uncheckablePatterns || [];
    totalUncheckable += blind.length;
    if (blind.length > 0) {
      console.log(`\nPATTERNS NOTHING CAN CHECK: ${blind.length} commandMatches with no acceptedVariants`);
      console.log('  Add one working answer to each and the check above can try the other spellings.');
      const shown = verbose ? blind : blind.slice(0, 8);
      for (const b of shown) console.log(`  · ${b.id} (act ${b.act}) — ${b.pattern}`);
      if (!verbose && blind.length > shown.length) {
        console.log(`  · …and ${blind.length - shown.length} more (--verbose lists all)`);
      }
    }

    // ── Ideas that arrive at the wrong moment ─────────────────────────────
    // The `teaches` tags read as a course rather than counted. Every one of
    // these took a specialist reading all 104 challenges to find; none of them
    // is visible from inside a single challenge, which is why nobody had.
    const tooMuch = rep.tooMuchAtOnce || [];
    totalTooMuch += tooMuch.length;
    if (tooMuch.length > 0) {
      console.log(`\nTOO MUCH AT ONCE: ${tooMuch.length} ${tooMuch.length === 1 ? 'challenge introduces' : 'challenges introduce'} more than two new ideas`);
      console.log('  A student meeting three unfamiliar things at once cannot tell which one they got wrong.');
      const shown = verbose ? tooMuch : tooMuch.slice(0, 8);
      for (const t of shown) console.log(`  · ${t.id} (act ${t.act}) — new here: ${t.tags.join(', ')}`);
      if (!verbose && tooMuch.length > shown.length) {
        console.log(`  · …and ${tooMuch.length - shown.length} more (--verbose lists all)`);
      }
    }

    const cold = rep.coldInSynthesis || [];
    totalCold += cold.length;
    if (cold.length > 0) {
      console.log(`\nA NEW IDEA INSIDE A SYNTHESIS: ${cold.length} ${cold.length === 1 ? 'challenge combines' : 'challenges combine'} known tools and slip in an unknown one`);
      console.log('  A challenge that puts four learned things together is a fair test. The fifth, met cold, is not.');
      const shown = verbose ? cold : cold.slice(0, 8);
      for (const c of shown) console.log(`  · ${c.id} (act ${c.act}) — ${c.total} ideas, first met here: ${c.tags.join(', ')}`);
      if (!verbose && cold.length > shown.length) {
        console.log(`  · …and ${cold.length - shown.length} more (--verbose lists all)`);
      }
    }

    const late = rep.taughtLate || [];
    totalLate += late.length;
    if (late.length > 0) {
      console.log(`\nTAUGHT AFTER IT WAS NEEDED: ${late.length} ${late.length === 1 ? 'idea gets its' : 'ideas get their'} own lesson after a challenge already required ${late.length === 1 ? 'it' : 'them'}`);
      console.log('  Move the lesson earlier. The student who met it cold has already decided they cannot do this.');
      const shown = verbose ? late : late.slice(0, 8);
      for (const l of shown) {
        console.log(`  · ${l.tag} — needed in ${l.neededIn} (act ${l.neededAct}), taught in ${l.dedicatedIn} (act ${l.dedicatedAct})`);
      }
      if (!verbose && late.length > shown.length) {
        console.log(`  · …and ${late.length - shown.length} more (--verbose lists all)`);
      }
    }

    // ── A scene with nothing in it ────────────────────────────────────────
    const sceneless = rep.sceneWithoutObject || [];
    totalSceneless += sceneless.length;
    if (sceneless.length > 0) {
      console.log(`\nTHE SCENE NEVER NEEDED THE TOOL: ${sceneless.length} of ${rep.checks.sceneObjects.checked} ${sceneless.length === 1 ? 'brief names' : 'briefs name'} nothing that is on the machine`);
      console.log('  The answer takes a file or a path; the story names none. Name the thing in the room.');
      const shown = verbose ? sceneless : sceneless.slice(0, 8);
      for (const s of shown) console.log(`  · ${s.id} (act ${s.act}) — the answer names ${s.operands.map((o) => `'${o}'`).join(', ')}, the brief does not`);
      if (!verbose && sceneless.length > shown.length) {
        console.log(`  · …and ${sceneless.length - shown.length} more (--verbose lists all)`);
      }
    }

    // ── Fields the format no longer has ───────────────────────────────────
    const removed = rep.removedFields || [];
    totalRemoved += removed.length;
    if (removed.length > 0) {
      console.log(`\nREMOVED FIELDS STILL DECLARED: ${removed.length} manifest ${removed.length === 1 ? 'field is' : 'fields are'} no longer part of the format`);
      console.log('  Nothing reads them and nothing will. Delete them from pack.json.');
      for (const f of removed) console.log(`  · ${f.field} — ${f.why}`);
    }

    // ── A course of separate drills ───────────────────────────────────────
    // Not a defect in any one challenge, which is exactly why it survives
    // every review that reads one challenge at a time.
    if (rep.builtOnGap) {
      const g = rep.builtOnGap;
      console.log(`\nNOTHING BUILDS ON ANYTHING: ${g.links} stated dependencies across ${g.acts} acts`);
      console.log('  Add "builtOn": ["earlier-challenge-id"] where a challenge genuinely needs an earlier one.');
      console.log('  Without it the course is a list of drills that happen to be in an order.');
    }

    if (rep.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warn of rep.warnings) console.log(`  ⚠️ ${warn}`);
    }
    console.log(`${THIN}\n`);
  }

  const anyFinding = totalBadVariants || totalBlind || totalUnfair || totalUncheckable
    || totalUndefined || totalUnframed || totalTooMuch || totalCold || totalLate || totalSceneless || totalRemoved;
  if (reports.length > 1 && anyFinding) {
    console.log('Across all packs checked:');
    console.log(`  broken accepted variants: ${totalBadVariants}`);
    console.log(`  correct answers refused:   ${totalUnfair}`);
    console.log(`  uncheckable patterns:     ${totalUncheckable}`);
    console.log(`  taught but undefined:     ${totalUndefined}`);
    console.log(`  challenges with no task line: ${totalUnframed}`);
    console.log(`  keystroke-only challenges: ${totalBlind}`);
    console.log(`  more than two new ideas at once: ${totalTooMuch}`);
    console.log(`  new idea inside a synthesis: ${totalCold}`);
    console.log(`  taught after it was needed: ${totalLate}`);
    console.log(`  briefs naming nothing on the machine: ${totalSceneless}`);
    console.log(`  removed fields still declared: ${totalRemoved}`);
    console.log(`${THIN}\n`);
  }

  if (allPass) {
    console.log('✨ All content packs validated successfully! Solvability machine-proven.\n');
    process.exit(0);
  }
  console.error('❌ Validation failed on one or more packs.\n');
  process.exit(1);
}

// ── try ─────────────────────────────────────────────────────────────────────

const TRY_SECRET = 'shellgrounds-try-secret';
const TRY_HANDLE = 'author';

/** Substitutes [[FLAG:…]] placeholders the way a real session does. */
function prepareFs(pack, platform, challenges) {
  const fs = pack.createFs(platform);
  const flags = {};
  for (const c of challenges) {
    if (c.success?.kind === 'flag' && !c.success.staticFlag) {
      flags[c.id] = generateUserFlag(TRY_SECRET, TRY_HANDLE, c.id, pack.id);
    }
  }
  const out = {};
  for (const [key, node] of Object.entries(fs)) {
    if (node.type === 'file' && typeof node.content === 'string') {
      let text = node.content;
      for (const [cId, val] of Object.entries(flags)) text = text.replaceAll(`[[FLAG:${cId}]]`, val);
      text = text.replaceAll('[[FLAG:USER_HANDLE]]', TRY_HANDLE);
      out[key] = { ...node, content: text };
    } else {
      out[key] = node;
    }
  }
  return { fs: out, flags };
}

function diffFilesystems(before, after) {
  const changes = [];
  for (const key of Object.keys(after)) {
    if (!(key in before)) changes.push(`created  ${key}`);
    else if (before[key].content !== after[key].content) changes.push(`modified ${key}`);
    else if (before[key].mode !== after[key].mode) {
      changes.push(`chmod    ${key} ${(before[key].mode & 0o777).toString(8)} -> ${(after[key].mode & 0o777).toString(8)}`);
    } else if (before[key].owner !== after[key].owner) {
      changes.push(`chown    ${key} ${before[key].owner} -> ${after[key].owner}`);
    }
  }
  for (const key of Object.keys(before)) if (!(key in after)) changes.push(`deleted  ${key}`);
  return changes;
}

async function cmdTry(args) {
  const isJson = args.includes('--json');
  const packIdx = args.indexOf('--pack');
  const packTarget = packIdx >= 0 ? args[packIdx + 1] : null;
  const skip = packIdx >= 0 ? new Set([packIdx, packIdx + 1]) : new Set();
  const positional = args.filter((a, i) => !skip.has(i) && !a.startsWith('--'));

  const [challengeId, command] = positional;
  if (!challengeId || command === undefined) {
    console.error('Usage: shellgrounds try <challenge-id> "<command>" [--pack <target>]');
    process.exit(1);
  }

  let pack = null;
  if (packTarget) {
    ({ pack } = await resolvePackTarget(packTarget));
  } else {
    for (const { pack: p } of registryPacks()) {
      if (p.challenges.some((c) => c.id === challengeId)) { pack = p; break; }
    }
  }
  if (!pack) {
    throw new PackFormatError(
      `No registered pack has a challenge '${challengeId}'. If the pack is not registered yet, ` +
      'name it with --pack <path-to-pack-dir-or-.pack.json>.'
    );
  }

  const challenge = pack.challenges.find((c) => c.id === challengeId);
  if (!challenge) {
    throw new PackFormatError(`Pack '${pack.id}' has no challenge '${challengeId}'.`);
  }

  const platform = challenge.platform || pack.manifest.platforms?.[0] || 'linux';
  const isWindows = platform === 'windows';
  const user = (isWindows ? pack.manifest.windows?.user : pack.manifest.linux?.user)
    || (isWindows ? 'Student' : 'student');
  const home = (isWindows ? pack.manifest.windows?.home : pack.manifest.linux?.home)
    || (isWindows ? 'C:\\Users\\Student' : '/home/student');
  const cwd = challenge.setup?.cwd || home;

  const { fs: startFs, flags } = prepareFs(pack, platform, pack.challenges);
  const res = runPipeline(command, cwd, startFs, platform, {
    packCommands: pack.commands || {},
    packHelp: pack.help || {},
    user,
    installedPackages: new Set(Object.keys(pack.commands || {}))
  });

  const ctx = {
    fs: res.fs,
    cwd: res.newCwd || cwd,
    commandText: command,
    stdout: res.stdout,
    stderr: res.stderr,
    output: res.output,
    status: res.status,
    isWindows,
    user,
    trusted: pack.trusted !== false
  };
  // A flag challenge is not scored by a command at all: the student reads a
  // FLAG{...} out of the terminal and submits it. Judging the command against
  // the predicate would print a red REJECTS for the command that is meant to
  // reveal the flag. What an author actually needs to know is whether their
  // flag reached the screen.
  const isFlagChallenge = challenge.success?.kind === 'flag';
  const thisFlag = flags[challenge.id] || challenge.success?.staticFlag || null;
  const flagRevealed = !!thisFlag && String(res.output || '').includes(thisFlag);
  const passed = isFlagChallenge ? flagRevealed : evaluatePredicate(challenge.success, ctx);
  const explanation = explainPredicate(challenge.success, ctx);
  const clean = !res.hasError && !ERROR_MARKERS.test(res.output || '');
  const changes = diffFilesystems(startFs, res.fs || startFs);

  if (isJson) {
    console.log(JSON.stringify({
      packId: pack.id,
      challengeId,
      platform,
      cwd,
      command,
      stdout: res.stdout,
      stderr: res.stderr,
      output: res.output,
      status: res.status,
      newCwd: res.newCwd || cwd,
      clean,
      passed,
      isFlagChallenge,
      flagRevealed,
      explanation,
      filesystemChanges: changes
    }, null, 2));
    process.exit(passed ? 0 : 1);
  }

  const prompt = isWindows ? `${cwd}>` : `${user}@${pack.manifest.linux?.host || 'sandbox'}:${cwd}$`;

  console.log(`\n${RULE}`);
  console.log(`  ${pack.id} / ${challenge.id} — ${challenge.title}  (act ${challenge.act}, ${challenge.points} pts)`);
  console.log(RULE);
  console.log(`\nBrief: ${challenge.brief}\n`);
  console.log('--- what the student sees ' + '-'.repeat(54));
  console.log(`${prompt} ${command}`);
  const shown = (res.output ?? '').replace(/\n$/, '');
  if (shown) console.log(shown);
  console.log('-'.repeat(80));
  console.log(`exit status ${res.status}${clean ? '' : '   (the command reported an error)'}`);
  if ((res.newCwd || cwd) !== cwd) console.log(`working directory: ${cwd} -> ${res.newCwd}`);
  if (changes.length) {
    console.log('filesystem changes:');
    for (const c of changes) console.log(`  ${c}`);
  }

  if (isFlagChallenge) {
    console.log(`\nVERDICT: ${flagRevealed ? '✅ this command REVEALS the flag' : '❌ this command does not reveal the flag'}`);
    console.log('  A flag challenge is scored on what the student SUBMITS, not on what they type, so');
    console.log('  there is no command to check. The question is whether the flag reached the screen.');
    console.log(`\n  flag for handle '${TRY_HANDLE}': ${thisFlag || '(none generated)'}`);
    console.log(`  it comes from the [[FLAG:${challenge.id}]] placeholder in the filesystem, and every`);
    console.log('  student gets a different value derived from their handle, so a leaked flag is useless.');
    if (challenge.success.flagFile) console.log(`  flagFile: ${challenge.success.flagFile}`);
  } else {
    console.log(`\nVERDICT: ${passed ? '✅ the checker ACCEPTS this command' : '❌ the checker REJECTS this command'}`);
    console.log('Why:');
    for (const line of renderExplanation(explanation, '  ')) console.log(line);
  }

  if (Array.isArray(challenge.acceptedVariants) && challenge.acceptedVariants.length) {
    console.log(`\nacceptedVariants: ${challenge.acceptedVariants.map((v) => JSON.stringify(v)).join(', ')}`);
  }
  console.log('');
  process.exit(passed ? 0 : 1);
}

// ── new / export / import ───────────────────────────────────────────────────

async function cmdNew(args) {
  const force = args.includes('--force');
  const [packId, outDir] = args.filter((a) => !a.startsWith('-'));
  if (!packId) {
    console.error('Usage: shellgrounds new <pack-id> [outDir] [--force]');
    process.exit(1);
  }
  const r = await scaffoldPack(packId, outDir, { force });
  const rel = displayPath(r.outDir);
  console.log(`Created ${rel}`);
  for (const f of r.written) console.log(`  ${f}`);
  console.log('\nIt already passes. Check for yourself:');
  console.log(`  node bin/shellgrounds.js validate ${rel}`);
  console.log(`  node bin/shellgrounds.js try ${r.idPrefix}-2-count "grep -c ERROR notes/log.txt" --pack ${rel}`);
  console.log(`\nEvery "//" key in those files is a comment. Read them, then edit around them.`);
}

async function cmdExport(args) {
  const [target, out] = args.filter((a) => !a.startsWith('-'));
  if (!target) {
    console.error('Usage: shellgrounds export <target> [out.pack.json]');
    process.exit(1);
  }
  const r = await exportPack(target, out);
  for (const w of r.warnings) console.log(`  ⚠️ ${w}`);
  console.log(`Exported ${r.file.id} (${r.origin}) -> ${displayPath(r.outPath)}`);
  console.log(`  formatVersion ${r.file.formatVersion}, ${r.stats.challenges} challenges, ${r.stats.acts} acts, ${r.stats.badges} badges, ${(r.stats.bytes / 1024).toFixed(1)} KiB`);
  for (const [plat, s] of Object.entries(r.stats.filesystems)) {
    console.log(`  filesystem ${plat}: ${s.files} files, ${s.dirs} directories — data, not code`);
  }
  if (r.unconvertible.length) {
    console.log(`\n  NOT EXPORTED: ${r.unconvertible.length} pack command(s) written in JavaScript: ${r.unconvertible.join(', ')}`);
    console.log('  Their names and man pages survive; their behaviour does not. A .pack.json can only');
    console.log('  hold a command that prints fixed text, because anything else would be code.');
  }
  console.log(`\nCheck the exported file: node bin/shellgrounds.js validate ${displayPath(r.outPath)}`);
}

async function cmdImport(args) {
  const force = args.includes('--force');
  const [file, outDir] = args.filter((a) => !a.startsWith('-'));
  if (!file) {
    console.error('Usage: shellgrounds import <file.pack.json> [outDir] [--force]');
    process.exit(1);
  }
  const r = await importPack(file, outDir, { force });
  for (const w of r.warnings) console.log(`  ⚠️ ${w}`);
  const rel = displayPath(r.outDir);
  console.log(`Imported ${r.packId} -> ${rel}`);
  for (const f of r.written) console.log(`  ${f}`);
  console.log(`\nValidate it:  node bin/shellgrounds.js validate ${rel}`);
  console.log(`To show it in the app, paste the snippet in ${rel}/README.md into packs/index.js.`);
}

// ── entry point ─────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'validate';
  const args = argv[0] && !argv[0].startsWith('-') ? argv.slice(1) : argv;

  switch (command) {
    case 'validate': return cmdValidate(args);
    case 'new': return cmdNew(args);
    case 'try': return cmdTry(args);
    case 'export': return cmdExport(args);
    case 'import': return cmdImport(args);
    case 'help': case '--help': case '-h':
      console.log(USAGE);
      return process.exit(0);
    default:
      console.error(`Unknown command '${command}'.`);
      console.log(USAGE);
      return process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof PackFormatError) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  console.error('Fatal validator error:', err);
  process.exit(1);
});

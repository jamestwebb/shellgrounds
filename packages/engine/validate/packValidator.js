// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
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

const TEST_SECRET = 'pack-validator-secret';
const TEST_HANDLE = 'validator_bot';

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

export async function validatePack(packObj, options = {}) {
  const { verbose = false } = options;
  const { id, manifest, challenges, help = {}, commands = {}, createFs } = packObj;

  const results = {
    packId: id,
    packName: manifest.name,
    valid: true,
    errors: [],
    warnings: [],
    checks: {
      vfsPaths: { pass: true, tested: 0 },
      solvability: { pass: true, total: challenges.length, solved: 0, variantsTested: 0, flagsVerified: 0 },
      flagPlaceholders: { pass: true, placeholders: 0, mapped: 0 },
      actProgression: { pass: true, actsCount: manifest.acts.length, gatedActsChecked: 0 },
      briefCommands: { pass: true, commandsTested: 0 },
      manPageFlags: { pass: true, flagsChecked: 0 },
      coverageReport: {}
    }
  };
  const fail = (check, msg) => {
    results.valid = false;
    results.checks[check].pass = false;
    results.errors.push(msg);
  };

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
    const startFs = getPreparedFs(plat);

    actPoints[challenge.act] = (actPoints[challenge.act] || 0) + (challenge.points || 0);
    if (Array.isArray(challenge.teaches)) challenge.teaches.forEach(t => teachesConcepts.add(t));

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
        status: res.status, isWindows: isWin, trusted: true
      });
      // A solution that errors is not a solution — unless it deliberately
      // demonstrates failure handling (`||`, or an explicit expected status).
      const intentionalFailure = sol.includes('||') || challenge.success?.predicate === 'exitStatusIs';
      const clean = intentionalFailure || (!res.hasError && !ERROR_MARKERS.test(res.output || ''));
      if (predicateOk && clean) passedAtLeastOne = true;
      else failures.push(`'${sol}' (predicate=${predicateOk}, clean=${clean})`);
    }

    if (passedAtLeastOne) {
      results.checks.solvability.solved++;
      if (failures.length) {
        results.warnings.push(`Challenge '${challenge.id}': some acceptedVariants failed: ${failures.join('; ')}`);
      }
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
    concepts: Array.from(teachesConcepts).sort()
  };

  if (verbose) {
    console.log(`[${id}] valid=${results.valid} errors=${results.errors.length} warnings=${results.warnings.length}`);
    results.errors.forEach(e => console.log('  ERROR:', e));
  }

  return results;
}

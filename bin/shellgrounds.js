#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shellgrounds CLI — curriculum validator and pack authoring tool.

import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { PACKS } from '../packs/index.js';
import { validatePack, checkGlobalChallengeIds } from '../packages/engine/validate/packValidator.js';
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

  const reports = [];
  for (const { pack, packFile } of loaded) {
    reports.push(await validatePack(pack, { verbose, packFile }));
  }

  const allPass = reports.every((r) => r.valid) && idCheck.pass;

  if (isJson) {
    console.log(JSON.stringify(
      targets ? { globalChallengeIds: idCheck, packs: reports } : reports,
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
  console.log(`${THIN}\n`);

  let totalBlind = 0;
  let totalBadVariants = 0;

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

    if (rep.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warn of rep.warnings) console.log(`  ⚠️ ${warn}`);
    }
    console.log(`${THIN}\n`);
  }

  if (reports.length > 1 && (totalBadVariants || totalBlind)) {
    console.log('Across all packs checked:');
    console.log(`  broken accepted variants: ${totalBadVariants}`);
    console.log(`  keystroke-only challenges: ${totalBlind}`);
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

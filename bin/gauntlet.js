#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// The Gauntlet CLI — Curriculum Validator and Development Tool

import { PACKS, getPack } from '../packs/index.js';
import { validatePack } from '../packages/engine/validate/packValidator.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'validate';
  const isJson = args.includes('--json');
  const isAll = args.includes('--all') || !args[1] || args[1].startsWith('--');
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (command !== 'validate') {
    console.log(`
The Gauntlet CLI

Usage:
  gauntlet validate [pack-id] [--all] [--json] [--verbose]

Commands:
  validate    Machine-proves that curriculum challenges are 100% solvable.
`);
    process.exit(0);
  }

  const targetPacks = isAll ? Object.keys(PACKS) : [args[1]];
  let allPass = true;
  const reports = [];

  for (const packId of targetPacks) {
    const packObj = getPack(packId);
    if (!packObj) {
      console.error(`Pack not found: ${packId}`);
      process.exit(1);
    }

    const report = await validatePack(packObj, { verbose });
    reports.push(report);
    if (!report.valid) {
      allPass = false;
    }
  }

  if (isJson) {
    console.log(JSON.stringify(reports, null, 2));
    process.exit(allPass ? 0 : 1);
  }

  // Human-readable formatted output
  console.log('\n================================================================================');
  console.log('                 THE GAUNTLET — CONTENT PACK VALIDATOR REPORT');
  console.log('================================================================================\n');

  for (const rep of reports) {
    const statusSymbol = rep.valid ? '✅ PASS' : '❌ FAIL';
    console.log(`Pack: ${rep.packName} (${rep.packId}) [${statusSymbol}]`);
    console.log(`- Solvability:      ${rep.checks.solvability.solved}/${rep.checks.solvability.total} challenges proven (${rep.checks.solvability.variantsTested} variants tested)`);
    console.log(`- VFS Integrity:    ${rep.checks.vfsPaths.tested} nodes validated`);
    console.log(`- Flags:            ${rep.checks.flagPlaceholders.placeholders} placeholders mapped to challenges`);
    console.log(`- Total Points:     ${rep.checks.coverageReport.totalPoints} pts across ${Object.keys(rep.checks.coverageReport.pointsPerAct).length} acts`);
    console.log(`- Concepts Taught:  ${rep.checks.coverageReport.conceptsCount} distinct skills`);

    if (rep.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of rep.errors) {
        console.log(`  ❌ ${err}`);
      }
    }

    if (rep.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warn of rep.warnings) {
        console.log(`  ⚠️ ${warn}`);
      }
    }
    console.log('--------------------------------------------------------------------------------\n');
  }

  if (allPass) {
    console.log('✨ All content packs validated successfully! Solvability machine-proven.\n');
    process.exit(0);
  } else {
    console.error('❌ Validation failed on one or more packs.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal validator error:', err);
  process.exit(1);
});

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Generates packs/registry.gen.js by scanning packs/*/ for pack.json.
//
// Why a generated file rather than dynamic discovery: the registry is imported
// by BOTH the browser bundle and the Netlify functions. Vite's import.meta.glob
// solves it for the browser only; Node has no equivalent. A generated file of
// plain static imports is understood by both, and it is committed so that
// deploying needs no extra build step.
//
// Run it after adding, importing or removing a pack:
//   node scripts/build-registry.mjs        (npm run build does this for you)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = path.join(ROOT, 'packs');
const OUT = path.join(PACKS_DIR, 'registry.gen.js');

const ident = (id) => id.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));

function discover() {
  return fs.readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => fs.existsSync(path.join(PACKS_DIR, name, 'pack.json')))
    .sort()
    .map(dir => {
      const manifest = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, dir, 'pack.json'), 'utf8'));
      const has = (f) => fs.existsSync(path.join(PACKS_DIR, dir, f));
      // Read the real export names rather than assuming a convention. The
      // shipped packs predate any convention, and a teacher's hand-written pack
      // should not fail to load over the spelling of a function name.
      const exportsOf = (f, re) => {
        if (!has(f)) return null;
        const src = fs.readFileSync(path.join(PACKS_DIR, dir, f), 'utf8');
        const m = src.match(re);
        return m ? m[1] : null;
      };
      return {
        dir,
        id: manifest.id || dir,
        name: manifest.name || dir,
        platforms: manifest.platforms || ['linux'],
        hasHelp: has('help.json'),
        commandsExport: exportsOf('commands.js', /export\s+const\s+(\w*PACK_COMMANDS|\w*Commands)\b/),
        linuxExport: exportsOf('fs.linux.js', /export\s+function\s+(create\w*Filesystem)\b/),
        windowsExport: exportsOf('fs.windows.js', /export\s+function\s+(create\w*Filesystem)\b/)
      };
    });
}

function generate(packs) {
  const lines = [
    '// GENERATED FILE — do not edit by hand.',
    '// Written by scripts/build-registry.mjs, which scans packs/*/pack.json.',
    '// Add a pack directory (or run `gauntlet import`), then regenerate:',
    '//   node scripts/build-registry.mjs',
    ''
  ];

  for (const p of packs) {
    const v = ident(p.id);
    lines.push(`import ${v}Manifest from './${p.dir}/pack.json' with { type: 'json' };`);
    lines.push(`import ${v}Challenges from './${p.dir}/challenges.json' with { type: 'json' };`);
    if (p.hasHelp) lines.push(`import ${v}Help from './${p.dir}/help.json' with { type: 'json' };`);
    if (p.commandsExport) lines.push(`import { ${p.commandsExport} as ${v}Commands } from './${p.dir}/commands.js';`);
    if (p.linuxExport) lines.push(`import { ${p.linuxExport} as ${v}Linux } from './${p.dir}/fs.linux.js';`);
    if (p.windowsExport) lines.push(`import { ${p.windowsExport} as ${v}Windows } from './${p.dir}/fs.windows.js';`);
    lines.push('');
  }

  lines.push('export const GENERATED_PACKS = {');
  for (const p of packs) {
    const v = ident(p.id);
    // A single-platform pack answers for either request rather than handing
    // back an empty disk, which is what the hand-written registry did.
    const linux = p.linuxExport ? `${v}Linux()` : (p.windowsExport ? `${v}Windows()` : '{}');
    const windows = p.windowsExport ? `${v}Windows()` : (p.linuxExport ? `${v}Linux()` : '{}');
    lines.push(`  '${p.id}': {`);
    lines.push(`    id: '${p.id}',`);
    lines.push(`    manifest: ${v}Manifest,`);
    lines.push(`    challenges: ${v}Challenges,`);
    lines.push(`    help: ${p.hasHelp ? `${v}Help` : '{}'},`);
    lines.push(`    commands: ${p.commandsExport ? `${v}Commands` : '{}'},`);
    lines.push(`    createFs: (platform) => platform === 'windows' ? ${windows} : ${linux}`);
    lines.push('  },');
  }
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

const packs = discover();
if (packs.length === 0) {
  console.error('No packs found under packs/. Nothing written.');
  process.exit(1);
}
const next = generate(packs);
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
if (prev === next) {
  console.log(`packs/registry.gen.js is up to date (${packs.length} packs).`);
} else {
  fs.writeFileSync(OUT, next);
  console.log(`Wrote packs/registry.gen.js — ${packs.length} packs: ${packs.map(p => p.id).join(', ')}`);
}

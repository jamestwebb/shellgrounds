#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Export a directory pack to one self-contained .pack.json.
//
//   node scripts/pack-export.mjs linux-fundamentals
//   node scripts/pack-export.mjs ./packs/my-course build/my-course.pack.json
//
// The interesting case is a pack whose filesystem is JavaScript. There is no
// way to translate `fs.linux.js` statically, so the exporter does the only
// honest thing: it runs the builder ONCE, here, on the author's own machine,
// and serialises the tree it produced. The result is data. Nobody downstream —
// no importer, no browser, no student — ever runs that code again.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serializePack } from '../packages/engine/validate/packFile.js';
import { resolvePackTarget } from '../packages/engine/validate/packSource.js';

// A pack id becomes a filename when no output path is given. It comes from a
// pack.json that may have been downloaded, and `"id": "../../../../tmp/x"`
// wrote outside the repository. Ids are identifiers, not paths.
const SAFE_EXPORT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
function assertSafeExportName(id) {
  if (!SAFE_EXPORT_ID.test(String(id ?? ''))) {
    throw new Error(
      `Refusing to export: the pack id ${JSON.stringify(id)} is not a safe filename. `
      + 'Use letters, numbers, dot, dash or underscore, or pass an explicit output path.'
    );
  }
  return id;
}

/**
 * @returns {{ outPath: string, file: object, unconvertible: string[], stats: object, warnings: string[] }}
 */
export async function exportPack(target, outPath = null, options = {}) {
  const { pack, origin, warnings } = await resolvePackTarget(target);
  const { file, unconvertible } = serializePack(pack, {
    generator: options.generator || 'gauntlet export'
  });

  const stats = {
    challenges: file.challenges.length,
    acts: file.acts.length,
    badges: file.badges.length,
    filesystems: {}
  };
  for (const [plat, spec] of Object.entries(file.filesystems)) {
    let files = 0;
    let dirs = 0;
    const walk = (children) => {
      for (const node of Object.values(children || {})) {
        if (node.type === 'dir') { dirs++; walk(node.children); } else { files++; }
      }
    };
    walk(spec.tree);
    stats.filesystems[plat] = { files, dirs };
  }

  const json = `${JSON.stringify(file, null, 2)}\n`;
  // Only the id needs guarding: an explicit output path is the operator's own
  // choice, but a downloaded pack's id must not decide where we write.
  const finalPath = resolve(outPath || `${assertSafeExportName(file.id)}.pack.json`);
  if (options.write !== false) {
    await mkdir(dirname(finalPath), { recursive: true });
    await writeFile(finalPath, json, 'utf8');
  }
  stats.bytes = Buffer.byteLength(json, 'utf8');

  return { outPath: finalPath, file, unconvertible, stats, warnings, origin };
}

async function main() {
  const [target, out] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: node scripts/pack-export.mjs <pack-id|path> [out.pack.json]');
    process.exit(1);
  }
  const r = await exportPack(target, out);
  for (const w of r.warnings) console.warn(`warning: ${w}`);
  console.log(`Exported ${r.file.id} (${r.origin}) -> ${r.outPath}`);
  console.log(`  ${r.stats.challenges} challenges, ${r.stats.acts} acts, ${r.stats.badges} badges, ${(r.stats.bytes / 1024).toFixed(1)} KiB`);
  for (const [plat, s] of Object.entries(r.stats.filesystems)) {
    console.log(`  filesystem ${plat}: ${s.files} files, ${s.dirs} directories`);
  }
  if (r.unconvertible.length) {
    console.log('');
    console.log(`  NOT EXPORTED: ${r.unconvertible.length} pack command(s) written in JavaScript:`);
    for (const name of r.unconvertible) console.log(`    - ${name}`);
    console.log('  Their names and man pages are kept, their behaviour is not. A .pack.json can');
    console.log('  only hold a command that prints fixed text. Rewrite them, or drop them.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

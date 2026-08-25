// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Resolves "which pack do you mean?" for the CLI.
//
// An author types one of three things and means the same kind of object:
//   a registered id      forensics-cli-101
//   a single file        ./my-course.pack.json
//   a pack directory     ./packs/my-course
// Every command in bin/shellgrounds.js accepts all three, so `new` -> `validate`
// -> `try` -> `export` works on a pack that is not in the registry yet. That
// matters: today a teacher cannot see their pack validate until someone edits
// packs/index.js for them.

import { readFile, stat as fsStat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKS } from '../../../packs/index.js';
import {
  loadPackFile, expandFilesystem, buildStaticCommand, stripComments, PackFormatError
} from './packFile.js';

const readJson = async (path) => {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new PackFormatError(`${path} is not valid JSON: ${err.message}`);
  }
};

const exists = async (path) => {
  try { await fsStat(path); return true; } catch { return false; }
};

/**
 * Loads a pack directory WITHOUT executing author JavaScript when it can.
 *
 * A directory whose filesystem is `fs.linux.json` is pure data and loads the
 * same way a .pack.json does. The three packs shipped today still use
 * `fs.linux.js`, so the JS path stays — but it is taken only for a directory
 * on this machine, it is announced in `warnings`, and a pack that arrived from
 * outside should be a .pack.json, which can never reach this branch.
 */
export async function loadPackDirectory(dir) {
  const root = resolve(dir);
  const warnings = [];
  // `//`-prefixed keys are comments in this format, so a hand-edited pack.json
  // can explain itself. They are dropped before anything reads the data.
  const manifest = stripComments(await readJson(join(root, 'pack.json')));
  const challenges = stripComments(await readJson(join(root, 'challenges.json')));
  const help = await exists(join(root, 'help.json'))
    ? stripComments(await readJson(join(root, 'help.json')))
    : {};

  const commands = {};
  if (await exists(join(root, 'commands.json'))) {
    const declared = await readJson(join(root, 'commands.json'));
    for (const [name, spec] of Object.entries(declared)) {
      if (spec?.unconvertible) continue;
      commands[name] = buildStaticCommand(name, spec);
    }
  } else if (await exists(join(root, 'commands.js'))) {
    const mod = await import(pathToFileURL(join(root, 'commands.js')).href);
    const bag = Object.values(mod).find((v) => v && typeof v === 'object' && !Array.isArray(v));
    Object.assign(commands, bag || {});
    warnings.push(`${basename(root)}/commands.js is JavaScript: loading it ran the author's code. ` +
      'Only do this for a pack you wrote. Exported packs carry declarative commands instead.');
  }

  const platforms = manifest.platforms || ['linux'];
  const specs = {};
  const jsBuilders = {};
  for (const plat of platforms) {
    const jsonPath = join(root, `fs.${plat}.json`);
    if (await exists(jsonPath)) {
      specs[plat] = await readJson(jsonPath);
      continue;
    }
    const jsPath = join(root, `fs.${plat}.js`);
    if (await exists(jsPath)) {
      const mod = await import(pathToFileURL(jsPath).href);
      const fn = Object.values(mod).find((v) => typeof v === 'function');
      if (!fn) throw new PackFormatError(`${jsPath} exports no filesystem function`);
      jsBuilders[plat] = fn;
      warnings.push(`${basename(root)}/fs.${plat}.js is JavaScript: building the filesystem ran the ` +
        "author's code. `shellgrounds export` turns it into data.");
      continue;
    }
    throw new PackFormatError(`${root} has neither fs.${plat}.json nor fs.${plat}.js for platform '${plat}'.`);
  }

  return {
    id: manifest.id || basename(root),
    manifest,
    challenges,
    help,
    commands,
    trusted: false,
    warnings,
    sourceDir: root,
    createFs(platform = platforms[0]) {
      if (jsBuilders[platform]) return jsBuilders[platform](platform);
      const spec = specs[platform] || specs[platforms[0]];
      if (!spec) throw new PackFormatError(`No filesystem for platform '${platform}'`);
      return expandFilesystem(spec, { isWindows: platform === 'windows' });
    }
  };
}

/**
 * Resolve a target to a pack object. Returns { pack, origin, warnings }.
 * `origin` is one of 'registry', 'file', 'directory'.
 */
export async function resolvePackTarget(target) {
  if (!target) throw new PackFormatError('No pack given.');

  if (Object.prototype.hasOwnProperty.call(PACKS, target)) {
    return { pack: { trusted: true, ...PACKS[target] }, origin: 'registry', warnings: [] };
  }

  const looksLikePath = target.includes('/') || target.includes('\\') || target.endsWith('.json');
  if (!looksLikePath) {
    throw new PackFormatError(
      `No pack '${target}'. Registered packs: ${Object.keys(PACKS).join(', ')}. ` +
      'You can also pass a path to a .pack.json file or to a pack directory.'
    );
  }

  const path = resolve(target);
  let st;
  try {
    st = await fsStat(path);
  } catch {
    throw new PackFormatError(`No such file or directory: ${path}`);
  }

  if (st.isDirectory()) {
    const pack = await loadPackDirectory(path);
    return { pack, origin: 'directory', warnings: pack.warnings || [] };
  }

  const raw = await readJson(path);
  const pack = loadPackFile(raw);
  return { pack, origin: 'file', warnings: [] };
}

/** Every pack the CLI should validate when no target is named. */
export function registryPacks() {
  return Object.entries(PACKS).map(([id, pack]) => ({ id, pack: { trusted: true, ...pack } }));
}

export { readJson, exists };

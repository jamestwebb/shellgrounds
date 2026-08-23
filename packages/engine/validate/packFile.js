// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The single-file pack format (`.pack.json`): serialise, load, and guard.
//
// WHY THIS EXISTS
// A directory pack ships JavaScript: `fs.linux.js` builds the filesystem and
// `commands.js` may add virtual tools. That is fine for content this project
// wrote. It is not fine for content a stranger uploads, because importing it
// runs their code in every student's browser. There is no sandbox here and no
// review step, so the format itself has to make code impossible rather than
// merely discouraged.
//
// So a `.pack.json` is data all the way down. The filesystem is a tree of
// nodes with content, mode and owner; a challenge's success condition is a
// named predicate with arguments; a pack command is fixed text. Nothing in the
// file is ever compiled, evaluated, or imported. `assertNoCode()` below proves
// that for a given file instead of assuming it.

import { md5, sha256Sync } from '../crypto-utils.js';
import { normalizePath } from '../vfs/path.js';

/** Bump when a change would stop an older loader reading a newer file. */
export const PACK_FORMAT_VERSION = 1;
export const PACK_FILE_KIND = 'gauntlet-pack';

/** The mtime every shipped pack uses, and the scaffold's default. */
export const DEFAULT_MTIME = '2026-08-17T09:30:00.000Z';

export class PackFormatError extends Error {
  constructor(message, path = '') {
    super(path ? `${message} (at ${path})` : message);
    this.name = 'PackFormatError';
    this.path = path;
  }
}

// ── Comments ────────────────────────────────────────────────────────────────
// JSON has no comment syntax, and a format a teacher edits by hand needs one.
// Any object key that starts with `//` is a comment and is dropped on load.
// `//` is safe as a marker because a path separator can never appear in a file
// name, so a comment key can never collide with a node in the filesystem tree.
const isCommentKey = (k) => typeof k === 'string' && k.startsWith('//');

/** Returns a deep copy with every comment key removed. */
export function stripComments(value) {
  if (Array.isArray(value)) return value.map(stripComments);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isCommentKey(k)) continue;
      out[k] = stripComments(v);
    }
    return out;
  }
  return value;
}

// ── The no-code guard ───────────────────────────────────────────────────────
// Three ways code could ride in, all refused by name:
//
//   1. A function value. `JSON.parse` cannot produce one, but `loadPackFile`
//      also accepts an object built in memory, and a pack editor will one day
//      hand it one. Refuse rather than trust the caller.
//   2. `__proto__`, `constructor` or `prototype` as an own key. `JSON.parse`
//      DOES create an own `__proto__` property, and a later spread or merge of
//      that object is a prototype-pollution primitive.
//   3. A `js` predicate. `predicates.js` already refuses to run one for an
//      untrusted pack, but a pack file must not be able to carry it at all —
//      defence in depth, and a much clearer error for the author.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_GUARD_DEPTH = 64;

export function assertNoCode(value, path = '$', depth = 0) {
  if (depth > MAX_GUARD_DEPTH) {
    throw new PackFormatError('Pack file nests deeper than 64 levels; refusing to read it', path);
  }
  const t = typeof value;
  if (t === 'function') {
    throw new PackFormatError(
      'Pack file contains a function. A .pack.json is data only — a filesystem is a tree of ' +
      'nodes, a success condition is a named predicate, and a pack command is fixed text. ' +
      'Nothing in a pack file is ever executed. Rewrite this as data',
      path
    );
  }
  if (t === 'symbol' || t === 'bigint') {
    throw new PackFormatError(`Pack file contains a ${t}, which JSON cannot represent`, path);
  }
  if (value === null || t !== 'object') return value;

  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoCode(v, `${path}[${i}]`, depth + 1));
    return value;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new PackFormatError(
        `Pack file sets the reserved key '${key}'. That is a prototype-pollution vector, not a ` +
        'pack field. Remove it',
        path
      );
    }
    const desc = Object.getOwnPropertyDescriptor(value, key);
    if (desc && (typeof desc.get === 'function' || typeof desc.set === 'function')) {
      throw new PackFormatError(
        `Pack file defines an accessor (getter/setter) for '${key}'. Pack data must be plain values`,
        path
      );
    }
    assertNoCode(value[key], `${path}.${key}`, depth + 1);
  }

  // predicates.js reads `predicate || kind`, so a pack could request the js
  // predicate under the other name and slip past a check that read only one.
  if ((typeof value.predicate === 'string' && value.predicate === 'js')
      || (typeof value.kind === 'string' && value.kind === 'js')) {
    throw new PackFormatError(
      "Pack file uses the 'js' predicate. That predicate runs JavaScript and is available only to " +
      'packs shipped with the platform. Use a declarative predicate, or allOf/anyOf to combine ' +
      'several. docs/PACK-FORMAT.md lists every predicate',
      path
    );
  }
  return value;
}

// ── Mode helpers ────────────────────────────────────────────────────────────
// Modes are written as octal strings ("0644", "0755", "1777"). A teacher reads
// `chmod 600` in their own terminal; writing 384 in the pack file would make
// them translate every permission by hand.

export function modeToString(mode) {
  const n = typeof mode === 'number' ? mode : parseInt(String(mode), 8);
  if (!Number.isFinite(n)) return '0644';
  return n.toString(8).padStart(4, '0');
}

export function modeToNumber(mode, fallback) {
  if (mode === undefined || mode === null) return fallback;
  if (typeof mode === 'number') return mode;
  const n = parseInt(String(mode), 8);
  if (!Number.isFinite(n)) {
    throw new PackFormatError(`Mode '${mode}' is not an octal number like "0644"`);
  }
  return n;
}

// ── Filesystem: flat map <-> nested tree ────────────────────────────────────
// The engine works on a FLAT map of absolute path -> node, because every
// command does an O(1) lookup by path. That shape is miserable to read or hand
// edit: the same directory name is repeated in every descendant's key, and a
// directory's `contents` array has to be kept in sync with its children by
// hand. The pack file therefore stores a NESTED tree and expands it on load.
// The nesting is the authoring surface; the flat map is the runtime one.

const joinPath = (parent, name, isWindows) =>
  isWindows ? `${parent}\\${name}` : (parent === '/' ? `/${name}` : `${parent}/${name}`);

/** Fields the loader derives, so a pack file only carries them when overridden. */
function derivedFileFields(content, hidden) {
  return {
    fileType: 'ASCII text',
    size: content.length,
    md5: md5(content),
    sha256: sha256Sync(content),
    attrib: hidden ? 'H' : 'A',
    hidden: false
  };
}

const KNOWN_FILE_FIELDS = new Set([
  'type', 'content', 'children', 'order',
  'fileType', 'size', 'md5', 'sha256', 'attrib', 'hidden',
  'mode', 'owner', 'group', 'mtime'
]);

/**
 * Expands one platform's filesystem spec into the flat VFS map the engine uses.
 * Pure data in, pure data out — no import, no eval, no builder callback.
 */
export function expandFilesystem(spec, options = {}) {
  const clean = stripComments(assertNoCode(spec, '$.filesystem'));
  const windows = options.isWindows !== undefined
    ? !!options.isWindows
    : clean.platform === 'windows';
  const rootKey = clean.root ? normalizePath(clean.root, windows) : (windows ? 'C:' : '/');

  const d = clean.defaults || {};
  const defaults = {
    owner: d.owner || (windows ? 'Student' : 'student'),
    group: d.group || (windows ? 'Users' : 'student'),
    fileMode: modeToNumber(d.fileMode, 0o644),
    dirMode: modeToNumber(d.dirMode, 0o755),
    mtime: d.mtime || DEFAULT_MTIME
  };

  const rootSpec = clean.rootNode || {};
  const out = {};

  function buildDir(nodeSpec, path) {
    const children = nodeSpec.children || {};
    const names = Array.isArray(nodeSpec.order) && nodeSpec.order.length
      ? nodeSpec.order.filter((n) => Object.prototype.hasOwnProperty.call(children, n))
      : Object.keys(children).filter((k) => !isCommentKey(k));

    // A name in `order` that has no child, or a child missing from `order`,
    // means the file was edited by hand and is now inconsistent. Repair by
    // appending the strays rather than silently dropping a file.
    for (const k of Object.keys(children)) {
      if (!isCommentKey(k) && !names.includes(k)) names.push(k);
    }

    const extras = {};
    for (const [k, v] of Object.entries(nodeSpec)) {
      if (!KNOWN_FILE_FIELDS.has(k) && !isCommentKey(k)) extras[k] = v;
    }

    out[path] = {
      type: 'dir',
      contents: names.slice(),
      mode: modeToNumber(nodeSpec.mode, defaults.dirMode),
      owner: nodeSpec.owner || defaults.owner,
      group: nodeSpec.group || defaults.group,
      mtime: nodeSpec.mtime || defaults.mtime,
      attrib: nodeSpec.attrib !== undefined ? nodeSpec.attrib : (windows ? 'D' : undefined),
      ...extras
    };

    for (const name of names) {
      if (name.includes('/') || name.includes('\\')) {
        throw new PackFormatError(
          `Filesystem entry '${name}' contains a path separator. Nest a directory instead of ` +
          'putting a path in one name',
          path
        );
      }
      buildNode(children[name], joinPath(path, name, windows));
    }
  }

  function buildNode(nodeSpec, path) {
    if (!nodeSpec || typeof nodeSpec !== 'object' || Array.isArray(nodeSpec)) {
      throw new PackFormatError('Filesystem node must be an object with a "type" of "file" or "dir"', path);
    }
    const type = nodeSpec.type
      || (nodeSpec.children !== undefined ? 'dir' : (nodeSpec.content !== undefined ? 'file' : null));
    if (type === 'dir') return buildDir(nodeSpec, path);
    if (type !== 'file') {
      throw new PackFormatError(`Filesystem node has type '${nodeSpec.type}'; expected "file" or "dir"`, path);
    }
    if (typeof nodeSpec.content !== 'string') {
      throw new PackFormatError('File node needs a "content" string (use "" for an empty file)', path);
    }
    const content = nodeSpec.content;
    const hidden = nodeSpec.hidden === true;
    const der = derivedFileFields(content, hidden);
    const extras = {};
    for (const [k, v] of Object.entries(nodeSpec)) {
      if (!KNOWN_FILE_FIELDS.has(k) && !isCommentKey(k)) extras[k] = v;
    }
    out[path] = {
      type: 'file',
      content,
      fileType: nodeSpec.fileType !== undefined ? nodeSpec.fileType : der.fileType,
      mode: modeToNumber(nodeSpec.mode, defaults.fileMode),
      owner: nodeSpec.owner || defaults.owner,
      group: nodeSpec.group || defaults.group,
      size: nodeSpec.size !== undefined ? nodeSpec.size : der.size,
      mtime: nodeSpec.mtime || defaults.mtime,
      md5: nodeSpec.md5 !== undefined ? nodeSpec.md5 : der.md5,
      sha256: nodeSpec.sha256 !== undefined ? nodeSpec.sha256 : der.sha256,
      attrib: nodeSpec.attrib !== undefined ? nodeSpec.attrib : der.attrib,
      hidden,
      ...extras
    };
  }

  buildDir({ ...rootSpec, children: clean.tree || {}, order: clean.rootOrder }, rootKey);
  // Root is owned by root on every real system, and the directory builder never
  // rewrites it, so keep those values unless the pack file overrides them.
  out[rootKey] = {
    ...out[rootKey],
    mode: modeToNumber(rootSpec.mode, 0o755),
    owner: rootSpec.owner || 'root',
    group: rootSpec.group || 'root',
    mtime: rootSpec.mtime || defaults.mtime,
    attrib: rootSpec.attrib !== undefined ? rootSpec.attrib : 'D'
  };

  return out;
}

/**
 * The inverse: turn a flat VFS map back into the nested tree the file stores.
 * Fields that the loader can derive are omitted, so the file stays readable and
 * a hand edit to `content` does not leave a stale hash behind.
 */
export function collapseFilesystem(fs, options = {}) {
  const windows = !!options.isWindows;
  const rootKey = windows ? 'C:' : '/';
  if (!fs[rootKey]) {
    throw new PackFormatError(`Filesystem has no root node '${rootKey}'`);
  }

  // Defaults = the most common value, so the common case disappears from the
  // file and the exceptional case (a root-owned, mode 0400 shadow file) stands
  // out on the page.
  const modal = (pick) => {
    const counts = new Map();
    for (const node of Object.values(fs)) {
      const v = pick(node);
      if (v === undefined) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    let best, bestN = -1;
    for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
    return best;
  };

  const defaults = {
    owner: modal((n) => n.owner) ?? (windows ? 'Student' : 'student'),
    group: modal((n) => n.group) ?? (windows ? 'Users' : 'student'),
    fileMode: modeToString(modal((n) => (n.type === 'file' ? n.mode : undefined)) ?? 0o644),
    dirMode: modeToString(modal((n) => (n.type === 'dir' ? n.mode : undefined)) ?? 0o755),
    mtime: modal((n) => n.mtime) ?? DEFAULT_MTIME
  };
  const defNum = {
    fileMode: modeToNumber(defaults.fileMode, 0o644),
    dirMode: modeToNumber(defaults.dirMode, 0o755)
  };

  function nodeSpec(node) {
    const spec = {};
    if (node.type === 'file') {
      const content = typeof node.content === 'string' ? node.content : '';
      const hidden = node.hidden === true;
      const der = derivedFileFields(content, hidden);
      spec.type = 'file';
      spec.content = content;
      if (node.mode !== defNum.fileMode) spec.mode = modeToString(node.mode);
      if (node.owner !== defaults.owner) spec.owner = node.owner;
      if (node.group !== defaults.group) spec.group = node.group;
      if (node.mtime !== defaults.mtime) spec.mtime = node.mtime;
      if (hidden) spec.hidden = true;
      if (node.fileType !== der.fileType) spec.fileType = node.fileType;
      if (node.size !== der.size) spec.size = node.size;
      if (node.md5 !== der.md5) spec.md5 = node.md5;
      if (node.sha256 !== der.sha256) spec.sha256 = node.sha256;
      if (node.attrib !== der.attrib) spec.attrib = node.attrib;
    } else {
      spec.type = 'dir';
      if (node.mode !== defNum.dirMode) spec.mode = modeToString(node.mode);
      if (node.owner !== defaults.owner) spec.owner = node.owner;
      if (node.group !== defaults.group) spec.group = node.group;
      if (node.mtime !== defaults.mtime) spec.mtime = node.mtime;
      const derAttrib = windows ? 'D' : undefined;
      if (node.attrib !== derAttrib) spec.attrib = node.attrib;
    }
    for (const [k, v] of Object.entries(node)) {
      if (!KNOWN_FILE_FIELDS.has(k) && k !== 'contents') spec[k] = v;
    }
    for (const k of Object.keys(spec)) if (spec[k] === undefined) delete spec[k];
    return spec;
  }

  function walk(path) {
    const node = fs[path];
    if (!node) throw new PackFormatError(`Directory entry points at '${path}', which has no node`);
    const spec = nodeSpec(node);
    if (node.type !== 'dir') return spec;
    const names = node.contents || [];
    const children = {};
    for (const name of names) {
      children[name] = walk(joinPath(path, name, windows));
    }
    spec.children = children;
    // JavaScript reorders integer-like object keys, so a directory holding a
    // file named "2026" would come back in a different order than it went in.
    // Record the order explicitly only when that would actually happen.
    const roundTripped = Object.keys(JSON.parse(JSON.stringify(children)));
    if (roundTripped.join(' ') !== names.join(' ')) spec.order = names.slice();
    return spec;
  }

  const rootWalked = walk(rootKey);
  const rootNode = { ...rootWalked };
  delete rootNode.children;
  delete rootNode.type;
  const standardRoot = { mode: '0755', owner: 'root', group: 'root', attrib: 'D' };
  const rootIsStandard = ['mode', 'owner', 'group', 'attrib'].every((k) => {
    const actual = k === 'mode' ? modeToString(fs[rootKey].mode) : fs[rootKey][k];
    return actual === standardRoot[k];
  }) && (fs[rootKey].mtime === defaults.mtime);

  const spec = {
    platform: windows ? 'windows' : 'linux',
    root: rootKey,
    defaults,
    tree: rootWalked.children || {}
  };
  if (!rootIsStandard) spec.rootNode = rootNode;
  if (rootWalked.order) spec.rootOrder = rootWalked.order;
  return spec;
}

// ── Pack commands ───────────────────────────────────────────────────────────
// A pack command in a `.pack.json` prints fixed text. That is enough for the
// usual teaching purpose — a fake tool that exists so students meet a name and
// a man page, and whose output can hide a flag — and it is the only shape that
// can be data. A command that computes something needs code, so it cannot
// cross this boundary; `serializePack` records the ones it could not convert.

export function buildStaticCommand(name, spec) {
  const platforms = Array.isArray(spec.platforms) ? spec.platforms.slice() : ['linux'];
  const byArgs = Array.isArray(spec.byArgs) ? spec.byArgs : [];
  const stdout = typeof spec.stdout === 'string' ? spec.stdout : '';
  const stderr = typeof spec.stderr === 'string' ? spec.stderr : '';
  const status = Number.isInteger(spec.status) ? spec.status : 0;
  return {
    name,
    platforms,
    flags: spec.flags && typeof spec.flags === 'object' ? spec.flags : {},
    usage: spec.usage || name,
    man: spec.man && typeof spec.man === 'object' ? spec.man : undefined,
    // The only closure the loader ever creates. It reads captured strings and
    // returns them; it never touches the pack file's data as code.
    run(ctx = {}) {
      const argv = Array.isArray(ctx.args) ? ctx.args.join(' ') : '';
      for (const rule of byArgs) {
        if (typeof rule?.args === 'string' && rule.args.trim() === argv.trim()) {
          return {
            stdout: typeof rule.stdout === 'string' ? rule.stdout : '',
            stderr: typeof rule.stderr === 'string' ? rule.stderr : '',
            status: Number.isInteger(rule.status) ? rule.status : 0
          };
        }
      }
      return { stdout, stderr, status };
    }
  };
}

// ── Serialise a loaded pack to the single-file format ───────────────────────

export function serializePack(packObj, options = {}) {
  const { id, manifest, challenges, help = {}, commands = {}, createFs } = packObj;
  const platforms = manifest.platforms || ['linux'];

  const { acts, badges, ...restManifest } = manifest;

  const filesystems = {};
  for (const plat of platforms) {
    const fs = createFs(plat);
    filesystems[plat] = collapseFilesystem(fs, { isWindows: plat === 'windows' });
  }

  const cmdOut = {};
  const unconvertible = [];
  for (const [name, def] of Object.entries(commands || {})) {
    if (!def) continue;
    const hasCode = typeof def.run === 'function' || typeof def.handler === 'function';
    const entry = {
      platforms: def.platforms || ['linux'],
      usage: def.usage || name
    };
    if (def.man) entry.man = JSON.parse(JSON.stringify(def.man));
    if (def.flags) entry.flags = JSON.parse(JSON.stringify(def.flags));
    if (hasCode) {
      // Honest rather than lossy: the name and the man page survive so the
      // author can see what has to be rebuilt, and the flag stops anyone
      // believing the export was complete.
      entry.unconvertible = true;
      entry['//'] = 'This command was JavaScript in the source pack. Its behaviour could not be ' +
        'exported. Rewrite it as fixed "stdout" text, or drop it.';
      unconvertible.push(name);
    } else {
      if (typeof def.stdout === 'string') entry.stdout = def.stdout;
      if (typeof def.stderr === 'string') entry.stderr = def.stderr;
      if (Number.isInteger(def.status)) entry.status = def.status;
      if (Array.isArray(def.byArgs)) entry.byArgs = JSON.parse(JSON.stringify(def.byArgs));
    }
    cmdOut[name] = entry;
  }

  const file = {
    formatVersion: PACK_FORMAT_VERSION,
    kind: PACK_FILE_KIND,
    id,
    manifest: JSON.parse(JSON.stringify(restManifest)),
    acts: JSON.parse(JSON.stringify(acts || [])),
    badges: JSON.parse(JSON.stringify(badges || [])),
    challenges: JSON.parse(JSON.stringify(challenges)),
    help: JSON.parse(JSON.stringify(help || {})),
    commands: cmdOut,
    filesystems
  };
  if (options.generator) file.generator = options.generator;
  return { file, unconvertible };
}

// ── Structural validation, including the format version ─────────────────────

export function validatePackFileStructure(raw) {
  const errors = [];
  const warnings = [];
  const push = (m) => errors.push(m);

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: ['Pack file is not a JSON object.'], warnings };
  }

  const v = raw.formatVersion;
  if (v === undefined) {
    push('Pack file has no "formatVersion". Every .pack.json must declare one; this file is version ' +
      `${PACK_FORMAT_VERSION}.`);
  } else if (!Number.isInteger(v) || v < 1) {
    push(`"formatVersion" is ${JSON.stringify(v)}; it must be a whole number of 1 or more.`);
  } else if (v > PACK_FORMAT_VERSION) {
    push(`Pack file declares formatVersion ${v}, but this platform reads up to ` +
      `${PACK_FORMAT_VERSION}. Update the platform, or ask the author to export at version ` +
      `${PACK_FORMAT_VERSION}.`);
  } else if (v < PACK_FORMAT_VERSION) {
    warnings.push(`Pack file is formatVersion ${v}; the current version is ${PACK_FORMAT_VERSION}. ` +
      'It still loads. Re-export it to move it forward.');
  }

  if (raw.kind !== undefined && raw.kind !== PACK_FILE_KIND) {
    push(`"kind" is ${JSON.stringify(raw.kind)}; expected "${PACK_FILE_KIND}".`);
  }

  const manifest = raw.manifest || {};
  const id = raw.id || manifest.id;
  if (!id || typeof id !== 'string') push('Pack file has no "id".');
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    push(`Pack id '${id}' must be lower-case letters, digits and hyphens, starting with a letter or digit.`);
  }
  if (!manifest.name) push('manifest.name is missing. That is the title a student sees.');
  if (!manifest.version) warnings.push('manifest.version is missing; use "1.0.0".');

  const platforms = manifest.platforms;
  if (!Array.isArray(platforms) || platforms.length === 0) {
    push('manifest.platforms must be a non-empty array, e.g. ["linux"].');
  } else {
    for (const p of platforms) {
      if (p !== 'linux' && p !== 'windows') push(`Unknown platform '${p}'. Use "linux" or "windows".`);
      if (!raw.filesystems || !raw.filesystems[p]) {
        push(`manifest.platforms lists '${p}' but there is no filesystems.${p} in the pack file.`);
      }
    }
  }

  const acts = raw.acts ?? manifest.acts;
  if (!Array.isArray(acts) || acts.length === 0) push('"acts" must be a non-empty array.');
  else {
    const seen = new Set();
    for (const a of acts) {
      if (!Number.isInteger(a?.id)) push(`Act ${JSON.stringify(a?.name ?? a)} has no whole-number "id".`);
      else if (seen.has(a.id)) push(`Two acts share id ${a.id}.`);
      else seen.add(a.id);
      if (!a?.name) warnings.push(`Act ${a?.id} has no "name".`);
      if (a?.unlockThreshold !== undefined && (typeof a.unlockThreshold !== 'number' || a.unlockThreshold < 0 || a.unlockThreshold > 1)) {
        push(`Act ${a.id} unlockThreshold must be a number from 0 to 1 (0.8 means 80%).`);
      }
    }
  }

  const badges = raw.badges ?? manifest.badges ?? [];
  if (!Array.isArray(badges)) push('"badges" must be an array.');
  else {
    const actIds = new Set((Array.isArray(acts) ? acts : []).map((a) => a?.id));
    const seen = new Set();
    for (const b of badges) {
      if (!b?.id) push('A badge has no "id".');
      else if (seen.has(b.id)) push(`Two badges share id '${b.id}'.`);
      else seen.add(b.id);
      if (b?.act !== undefined && !actIds.has(b.act)) {
        push(`Badge '${b?.id}' is awarded for act ${b.act}, but no act has that id.`);
      }
    }
  }

  const challenges = raw.challenges;
  if (!Array.isArray(challenges) || challenges.length === 0) {
    push('"challenges" must be a non-empty array.');
  } else {
    const actIds = new Set((Array.isArray(acts) ? acts : []).map((a) => a?.id));
    const seen = new Set();
    for (const c of challenges) {
      const where = c?.id ? `Challenge '${c.id}'` : `Challenge ${JSON.stringify(c?.title ?? '?')}`;
      if (!c?.id) push(`${where} has no "id".`);
      else if (seen.has(c.id)) push(`Two challenges share id '${c.id}'. Ids must be unique.`);
      else seen.add(c.id);
      if (!c?.title) push(`${where} has no "title".`);
      if (!c?.brief) push(`${where} has no "brief".`);
      if (!Number.isInteger(c?.act)) push(`${where} has no whole-number "act".`);
      else if (actIds.size && !actIds.has(c.act)) push(`${where} is in act ${c.act}, but no act has that id.`);
      if (typeof c?.points !== 'number' || c.points < 0) push(`${where} needs a "points" number of 0 or more.`);
      if (!c?.success || typeof c.success !== 'object') push(`${where} has no "success" condition.`);
      if (Array.isArray(c?.hints)) {
        for (const h of c.hints) {
          if (typeof h?.cost !== 'number' || h.cost < 0) push(`${where} has a hint with no "cost" number.`);
          if (!h?.text) push(`${where} has a hint with no "text".`);
        }
      }
      if (c?.platform && Array.isArray(platforms) && !platforms.includes(c.platform)) {
        push(`${where} runs on platform '${c.platform}', which manifest.platforms does not list.`);
      }
    }
  }

  if (raw.filesystems && typeof raw.filesystems === 'object') {
    for (const [plat, spec] of Object.entries(raw.filesystems)) {
      if (!spec || typeof spec !== 'object') { push(`filesystems.${plat} is not an object.`); continue; }
      if (!spec.tree || typeof spec.tree !== 'object') push(`filesystems.${plat} has no "tree" object.`);
    }
  } else {
    push('Pack file has no "filesystems" object.');
  }

  for (const [name, def] of Object.entries(raw.commands || {})) {
    if (def?.unconvertible) {
      warnings.push(`Pack command '${name}' is marked unconvertible: it was JavaScript in the ` +
        'source pack and does nothing here. Rewrite it as fixed "stdout" text or remove it.');
    }
  }

  return { errors, warnings };
}

// ── Load a pack file into the object shape the engine and validator expect ──

export function loadPackFile(raw, options = {}) {
  assertNoCode(raw, '$');
  const clean = stripComments(raw);
  const { errors } = validatePackFileStructure(clean);
  if (errors.length && options.strict !== false) {
    throw new PackFormatError(`Pack file is not valid:\n  - ${errors.join('\n  - ')}`);
  }

  const manifest = {
    ...clean.manifest,
    id: clean.id || clean.manifest?.id,
    acts: clean.acts ?? clean.manifest?.acts ?? [],
    badges: clean.badges ?? clean.manifest?.badges ?? []
  };

  const commands = {};
  for (const [name, def] of Object.entries(clean.commands || {})) {
    if (def?.unconvertible) continue;
    commands[name] = buildStaticCommand(name, def);
  }

  const specs = clean.filesystems || {};
  return {
    id: manifest.id,
    formatVersion: clean.formatVersion,
    manifest,
    challenges: clean.challenges || [],
    help: clean.help || {},
    commands,
    // A pack loaded from a file is never trusted: `evaluatePredicate` refuses
    // the `js` predicate for it even if the guard above were somehow bypassed.
    trusted: false,
    createFs(platform = manifest.platforms?.[0] || 'linux') {
      const spec = specs[platform] || specs[manifest.platforms?.[0]] || Object.values(specs)[0];
      if (!spec) throw new PackFormatError(`Pack file has no filesystem for platform '${platform}'`);
      return expandFilesystem(spec, { isWindows: platform === 'windows' });
    }
  };
}

/** Parse JSON text and load it. The only entry point an importer should use. */
export function parsePackFile(text, options = {}) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new PackFormatError(`Pack file is not valid JSON: ${err.message}`);
  }
  return loadPackFile(raw, options);
}

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Virtual Filesystem Operations: read, write, mkdir, unlink, chmod, chown, stat

import { normalizePath, resolvePath, findVfsKey, dirname, basename } from './path.js';
import { md5, sha256Sync } from '../crypto-utils.js';

/**
 * Parses numeric or symbolic mode string into octal number
 * Examples: '755' -> 0o755, '644' -> 0o644, 'u+x' -> modifies currentMode
 */
export function parseMode(modeStr, currentMode = 0o644, isDir = false) {
  if (typeof modeStr === 'number') {
    return modeStr;
  }
  const clean = String(modeStr).trim();
  if (/^[0-7]{3,4}$/.test(clean)) {
    return parseInt(clean, 8);
  }

  // Symbolic mode: e.g. u+x, g-w, a+r, +x, u=rwx,go=rx
  let mode = currentMode;
  const clauses = clean.split(',');

  for (const clause of clauses) {
    const match = clause.match(/^([ugoa]*)([\+\-\=])([rwxXst]*)$/);
    if (!match) continue;

    let [, who, op, perms] = match;
    if (!who || who === 'a') who = 'ugo';

    let permBits = 0;
    if (perms.includes('r')) permBits |= 4;
    if (perms.includes('w')) permBits |= 2;
    if (perms.includes('x')) permBits |= 1;

    for (const target of who) {
      const shift = target === 'u' ? 6 : target === 'g' ? 3 : 0;
      const mask = 7 << shift;
      const bits = permBits << shift;

      if (op === '+') {
        mode |= bits;
      } else if (op === '-') {
        mode &= ~bits;
      } else if (op === '=') {
        mode = (mode & ~mask) | bits;
      }
    }
  }

  return mode;
}

/**
 * Formats octal mode into standard ls -l format: -rwxr-xr-x / drwxr-xr-x
 */
export function formatMode(mode = 0o644, isDir = false, isSymlink = false) {
  const typeChar = isSymlink ? 'l' : (isDir ? 'd' : '-');
  const u = (mode >> 6) & 7;
  const g = (mode >> 3) & 7;
  const o = mode & 7;

  const toRwx = (n) => `${n & 4 ? 'r' : '-'}${n & 2 ? 'w' : '-'}${n & 1 ? 'x' : '-'}`;
  return `${typeChar}${toRwx(u)}${toRwx(g)}${toRwx(o)}`;
}

/**
 * Verifies if user has required access ('r', 'w', 'x') on a VFS node
 */
export function hasPermission(node, requiredAccess, user = 'student', isWindows = false) {
  if (isWindows) {
    if (requiredAccess === 'w' && node?.attrib?.includes('R')) {
      return false;
    }
    return true;
  }

  if (!node) return false;
  if (user === 'root') return true;

  const reqBit = requiredAccess === 'r' ? 4 : (requiredAccess === 'w' ? 2 : 1);
  const mode = typeof node.mode === 'number' ? node.mode : 0o644;
  const owner = node.owner || 'student';
  const group = node.group || 'student';

  if (owner === user) {
    return ((mode >> 6) & reqBit) === reqBit;
  } else if (group === user) {
    return ((mode >> 3) & reqBit) === reqBit;
  } else {
    return (mode & reqBit) === reqBit;
  }
}

/**
 * Returns stat information for a given path
 */
export function stat(fs, targetPath, isWindows = false) {
  const realKey = findVfsKey(fs, targetPath, isWindows);
  if (!realKey || !fs[realKey]) {
    return { exists: false, error: 'No such file or directory' };
  }

  const node = fs[realKey];
  const isDir = node.type === 'dir';
  const isFile = node.type === 'file';
  const isSymlink = node.type === 'symlink';

  const defaultMode = isDir ? 0o755 : 0o644;
  const mode = typeof node.mode === 'number' ? node.mode : defaultMode;
  const size = isFile ? (typeof node.size === 'number' ? node.size : (node.content ? node.content.length : 0)) : (isDir ? 4096 : 0);
  const mtime = node.mtime || '2026-08-17T09:30:00.000Z';

  return {
    exists: true,
    path: realKey,
    node,
    type: node.type,
    isDir,
    isFile,
    isSymlink,
    mode,
    modeStr: formatMode(mode, isDir, isSymlink),
    owner: node.owner || (isWindows ? 'Administrator' : 'student'),
    group: node.group || (isWindows ? 'Users' : 'student'),
    size,
    mtime,
    attrib: node.attrib || (isDir ? 'D' : 'A'),
    hidden: node.hidden || node.attrib?.includes('H') || basename(realKey, isWindows).startsWith('.')
  };
}

/**
 * Reads file content with permission check
 */
export function readFile(fs, targetPath, isWindows = false, options = {}) {
  const { user = 'student' } = options;
  const realKey = findVfsKey(fs, targetPath, isWindows);
  if (!realKey || !fs[realKey]) {
    return { ok: false, error: isWindows ? 'The system cannot find the file specified.' : `No such file or directory: ${targetPath}` };
  }

  const node = fs[realKey];
  if (node.type === 'dir') {
    return { ok: false, error: isWindows ? 'Access is denied.' : `Is a directory: ${targetPath}` };
  }

  if (!hasPermission(node, 'r', user, isWindows)) {
    return { ok: false, error: `Permission denied: ${targetPath}`, status: 1 };
  }

  return {
    ok: true,
    content: node.content || '',
    node,
    path: realKey
  };
}

/**
 * Writes or appends content to a file with permission checks
 */
export function writeFile(fs, targetPath, content, isWindows = false, options = {}) {
  const {
    append = false,
    user = 'student',
    mode = 0o644,
    owner = user,
    group = user,
    checkPerms = true
  } = options;

  const textContent = typeof content === 'string' ? content : String(content);
  const normPath = normalizePath(targetPath, isWindows);
  const parentPath = dirname(normPath, isWindows);

  // Check parent directory
  const parentKey = findVfsKey(fs, parentPath, isWindows);
  if (!parentKey || !fs[parentKey] || fs[parentKey].type !== 'dir') {
    return { ok: false, error: isWindows ? 'The system cannot find the path specified.' : `No such file or directory: ${parentPath}` };
  }

  const parentNode = fs[parentKey];
  if (checkPerms && !hasPermission(parentNode, 'w', user, isWindows)) {
    return { ok: false, error: `Permission denied: ${parentPath}` };
  }

  const existingKey = findVfsKey(fs, normPath, isWindows);
  const workingFs = { ...fs };

  if (existingKey && workingFs[existingKey]) {
    const existing = workingFs[existingKey];
    if (existing.type === 'dir') {
      return { ok: false, error: isWindows ? 'Access is denied.' : `Is a directory: ${targetPath}` };
    }
    if (checkPerms && !hasPermission(existing, 'w', user, isWindows)) {
      return { ok: false, error: `Permission denied: ${targetPath}` };
    }

    const finalContent = append ? `${existing.content || ''}${textContent}` : textContent;
    workingFs[existingKey] = {
      ...existing,
      content: finalContent,
      size: finalContent.length,
      md5: md5(finalContent),
      sha256: sha256Sync(finalContent),
      mtime: new Date().toISOString()
    };
    return { ok: true, fs: workingFs, path: existingKey };
  }

  // Create new file
  const fileName = basename(normPath, isWindows);
  const updatedParent = {
    ...parentNode,
    contents: parentNode.contents.includes(fileName) ? [...parentNode.contents] : [...parentNode.contents, fileName]
  };
  workingFs[parentKey] = updatedParent;

  workingFs[normPath] = {
    type: 'file',
    content: textContent,
    fileType: 'ASCII text',
    mode,
    owner,
    group,
    size: textContent.length,
    md5: md5(textContent),
    sha256: sha256Sync(textContent),
    mtime: new Date().toISOString(),
    attrib: isWindows ? 'A' : undefined
  };

  return { ok: true, fs: workingFs, path: normPath };
}

/**
 * Creates a directory
 */
export function mkdir(fs, targetPath, isWindows = false, options = {}) {
  const {
    recursive = false,
    user = 'student',
    mode = 0o755,
    owner = user,
    group = user
  } = options;

  const normPath = normalizePath(targetPath, isWindows);
  const existingKey = findVfsKey(fs, normPath, isWindows);
  if (existingKey) {
    if (recursive) return { ok: true, fs };
    return { ok: false, error: isWindows ? 'A subdirectory or file already exists.' : `File exists: ${targetPath}` };
  }

  const parentPath = dirname(normPath, isWindows);
  const parentKey = findVfsKey(fs, parentPath, isWindows);

  const workingFs = { ...fs };

  if (!parentKey || !workingFs[parentKey]) {
    if (!recursive) {
      return { ok: false, error: isWindows ? 'The system cannot find the path specified.' : `No such file or directory: ${parentPath}` };
    }
    const recResult = mkdir(workingFs, parentPath, isWindows, { recursive: true, user, mode, owner, group });
    if (!recResult.ok) return recResult;
    Object.assign(workingFs, recResult.fs);
  }

  const resolvedParentKey = findVfsKey(workingFs, parentPath, isWindows);
  const parentNode = workingFs[resolvedParentKey];
  if (!hasPermission(parentNode, 'w', user, isWindows)) {
    return { ok: false, error: `Permission denied: ${parentPath}` };
  }

  const dirName = basename(normPath, isWindows);
  workingFs[resolvedParentKey] = {
    ...parentNode,
    contents: parentNode.contents.includes(dirName) ? [...parentNode.contents] : [...parentNode.contents, dirName]
  };

  workingFs[normPath] = {
    type: 'dir',
    contents: [],
    mode,
    owner,
    group,
    mtime: new Date().toISOString(),
    attrib: isWindows ? 'D' : undefined
  };

  return { ok: true, fs: workingFs, path: normPath };
}

/**
 * Removes empty directory
 */
export function rmdir(fs, targetPath, isWindows = false, options = {}) {
  const { user = 'student' } = options;
  const realKey = findVfsKey(fs, targetPath, isWindows);
  if (!realKey || !fs[realKey]) {
    return { ok: false, error: isWindows ? 'The system cannot find the path specified.' : `No such file or directory: ${targetPath}` };
  }

  const node = fs[realKey];
  if (node.type !== 'dir') {
    return { ok: false, error: isWindows ? 'The directory name is invalid.' : `Not a directory: ${targetPath}` };
  }

  if (node.contents && node.contents.length > 0) {
    return { ok: false, error: isWindows ? 'The directory is not empty.' : `Directory not empty: ${targetPath}` };
  }

  // rmdir has already proved the target is an empty directory, so pass
  // recursive: true. Without it unlink refuses every directory and rmdir could
  // never succeed at all — `rmdir emptydir` answered "Is a directory".
  return unlink(fs, targetPath, isWindows, { user, recursive: true });
}

/**
 * Removes file or directory
 */
export function unlink(fs, targetPath, isWindows = false, options = {}) {
  const { recursive = false, force = false, user = 'student' } = options;
  const realKey = findVfsKey(fs, targetPath, isWindows);

  if (!realKey || !fs[realKey]) {
    if (force) return { ok: true, fs };
    return { ok: false, error: isWindows ? 'Could Not Find' : `No such file or directory: ${targetPath}` };
  }

  const node = fs[realKey];
  if (node.type === 'dir' && !recursive) {
    return { ok: false, error: isWindows ? 'Access is denied.' : `Is a directory: ${targetPath}` };
  }

  const parentPath = dirname(realKey, isWindows);
  const parentKey = findVfsKey(fs, parentPath, isWindows);
  if (parentKey && fs[parentKey] && !hasPermission(fs[parentKey], 'w', user, isWindows)) {
    if (!force) return { ok: false, error: `Permission denied: ${realKey}` };
  }

  const workingFs = { ...fs };

  // If directory recursive, remove all nested entries
  if (node.type === 'dir') {
    const prefix = isWindows ? `${realKey}\\` : (realKey === '/' ? '/' : `${realKey}/`);
    const prefixLower = prefix.toLowerCase();
    for (const key of Object.keys(workingFs)) {
      if (key.toLowerCase().startsWith(prefixLower)) {
        delete workingFs[key];
      }
    }
  }

  delete workingFs[realKey];

  if (parentKey && workingFs[parentKey]) {
    const fileName = basename(realKey, isWindows);
    workingFs[parentKey] = {
      ...workingFs[parentKey],
      contents: workingFs[parentKey].contents.filter(c => c !== fileName && (!isWindows || c.toLowerCase() !== fileName.toLowerCase()))
    };
  }

  return { ok: true, fs: workingFs };
}

/**
 * Changes file permissions
 */
export function chmod(fs, targetPath, modeStr, isWindows = false, options = {}) {
  const { recursive = false, user = 'student' } = options;
  const realKey = findVfsKey(fs, targetPath, isWindows);
  if (!realKey || !fs[realKey]) {
    return { ok: false, error: `chmod: cannot access '${targetPath}': No such file or directory` };
  }

  const workingFs = { ...fs };
  const applyChmod = (key) => {
    const node = workingFs[key];
    if (!node) return;
    if (user !== 'root' && node.owner && node.owner !== user) {
      return; // permission denied in real chmod if not owner or root
    }
    const currentMode = typeof node.mode === 'number' ? node.mode : (node.type === 'dir' ? 0o755 : 0o644);
    const newMode = parseMode(modeStr, currentMode, node.type === 'dir');
    workingFs[key] = { ...node, mode: newMode };
  };

  applyChmod(realKey);

  if (recursive && workingFs[realKey]?.type === 'dir') {
    const prefix = isWindows ? `${realKey}\\` : (realKey === '/' ? '/' : `${realKey}/`);
    for (const key of Object.keys(workingFs)) {
      if (key.startsWith(prefix)) {
        applyChmod(key);
      }
    }
  }

  return { ok: true, fs: workingFs };
}

/**
 * Changes file owner and group
 */
export function chown(fs, targetPath, ownerGroupStr, isWindows = false, options = {}) {
  const { recursive = false, user = 'student' } = options;
  if (user !== 'root') {
    return { ok: false, error: `chown: changing ownership of '${targetPath}': Operation not permitted` };
  }

  const realKey = findVfsKey(fs, targetPath, isWindows);
  if (!realKey || !fs[realKey]) {
    return { ok: false, error: `chown: cannot access '${targetPath}': No such file or directory` };
  }

  const parts = ownerGroupStr.split(/[:.]/);
  const newOwner = parts[0] || undefined;
  const newGroup = parts[1] || undefined;

  const workingFs = { ...fs };
  const applyChown = (key) => {
    const node = workingFs[key];
    if (!node) return;
    workingFs[key] = {
      ...node,
      owner: newOwner || node.owner,
      group: newGroup || node.group
    };
  };

  applyChown(realKey);
  if (recursive && workingFs[realKey]?.type === 'dir') {
    const prefix = isWindows ? `${realKey}\\` : (realKey === '/' ? '/' : `${realKey}/`);
    for (const key of Object.keys(workingFs)) {
      if (key.startsWith(prefix)) {
        applyChown(key);
      }
    }
  }

  return { ok: true, fs: workingFs };
}

/**
 * Copies a file or directory
 */
export function copyFile(fs, srcPath, destPath, isWindows = false, options = {}) {
  const { recursive = false, user = 'student' } = options;
  const srcKey = findVfsKey(fs, srcPath, isWindows);
  if (!srcKey || !fs[srcKey]) {
    return { ok: false, error: isWindows ? 'The system cannot find the file specified.' : `cp: cannot stat '${srcPath}': No such file or directory` };
  }

  const srcNode = fs[srcKey];
  if (srcNode.type === 'dir' && !recursive) {
    return { ok: false, error: isWindows ? 'Access is denied.' : `cp: -r not specified; omitting directory '${srcPath}'` };
  }

  let finalDest = normalizePath(destPath, isWindows);
  const destKey = findVfsKey(fs, destPath, isWindows);
  if (destKey && fs[destKey]?.type === 'dir') {
    finalDest = isWindows ? `${destKey}\\${basename(srcKey, isWindows)}` : `${destKey === '/' ? '' : destKey}/${basename(srcKey, isWindows)}`;
  }

  if (srcNode.type === 'file') {
    return writeFile(fs, finalDest, srcNode.content || '', isWindows, {
      user,
      mode: srcNode.mode,
      owner: user,
      group: user
    });
  }

  // Recursive directory copy
  let workingFs = { ...fs };
  const mkdirRes = mkdir(workingFs, finalDest, isWindows, { user, mode: srcNode.mode });
  if (!mkdirRes.ok) return mkdirRes;
  workingFs = mkdirRes.fs;

  const srcPrefix = isWindows ? `${srcKey}\\` : `${srcKey}/`;
  for (const key of Object.keys(fs)) {
    if (key.startsWith(srcPrefix)) {
      const rel = key.slice(srcPrefix.length);
      const subDest = isWindows ? `${finalDest}\\${rel}` : `${finalDest}/${rel}`;
      const subNode = fs[key];
      if (subNode.type === 'dir') {
        const subMkdir = mkdir(workingFs, subDest, isWindows, { user, mode: subNode.mode });
        if (subMkdir.ok) workingFs = subMkdir.fs;
      } else {
        const subWrite = writeFile(workingFs, subDest, subNode.content || '', isWindows, {
          user,
          mode: subNode.mode
        });
        if (subWrite.ok) workingFs = subWrite.fs;
      }
    }
  }

  return { ok: true, fs: workingFs };
}

/**
 * Moves or renames a file or directory
 */
export function moveFile(fs, srcPath, destPath, isWindows = false, options = {}) {
  const { user = 'student' } = options;
  const copyRes = copyFile(fs, srcPath, destPath, isWindows, { recursive: true, user });
  if (!copyRes.ok) return copyRes;
  return unlink(copyRes.fs, srcPath, isWindows, { recursive: true, force: true, user });
}

/**
 * Updates mtime or creates an empty file
 */
export function touch(fs, targetPath, isWindows = false, options = {}) {
  const { user = 'student' } = options;
  const realKey = findVfsKey(fs, targetPath, isWindows);
  if (realKey && fs[realKey]) {
    const workingFs = { ...fs };
    workingFs[realKey] = { ...fs[realKey], mtime: new Date().toISOString() };
    return { ok: true, fs: workingFs, path: realKey };
  }
  return writeFile(fs, targetPath, '', isWindows, { user });
}

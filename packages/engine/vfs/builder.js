// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// VFS Builder for Declarative Filesystems

import { md5, sha256Sync } from '../crypto-utils.js';
import { normalizePath, resolvePath } from './path.js';

export { normalizePath, resolvePath };

/**
 * Creates a file node descriptor
 */
export function file(content = '', options = {}) {
  const textContent = typeof content === 'string' ? content : String(content);
  const defaultMode = options.mode !== undefined ? options.mode : 0o644;
  return {
    _isFile: true,
    content: textContent,
    fileType: options.fileType || 'ASCII text',
    mode: defaultMode,
    // Left undefined when the author did not set one, so buildFS fills it from
    // the pack's own home directory. Hardcoding 'student' meant a pack whose
    // user is anybody else owned nothing inside its own home, and any
    // permissions challenge broke the moment a pack renamed its user.
    owner: options.owner,
    group: options.group,
    size: options.size !== undefined ? options.size : textContent.length,
    mtime: options.mtime || '2026-08-17T09:30:00.000Z',
    md5: options.md5 || md5(textContent),
    sha256: options.sha256 || sha256Sync(textContent),
    attrib: options.attrib || (options.hidden ? 'H' : 'A'),
    hidden: options.hidden || false,
    ...options
  };
}

/**
 * Creates a directory descriptor
 */
export function dir(options = {}) {
  return {
    _isDir: true,
    mode: options.mode !== undefined ? options.mode : 0o755,
    owner: options.owner,
    group: options.group,
    mtime: options.mtime || '2026-08-17T09:30:00.000Z',
    attrib: options.attrib || 'D',
    ...options
  };
}

/**
 * Builds a flat VFS map from a nested declarative tree
 */
// The owning user implied by a home directory: /home/<name> -> <name>,
// C:\Users\<Name> -> <Name>. Deriving this (rather than defaulting to a fixed
// name) prevents a whole bug class: when a pack's home directory belongs to a
// different name than the logged-in user, mode 755 grants others no write bit
// and the user cannot create files in their own home directory.
function ownerFromHome(home, isWindows) {
  if (!home) return null;
  const parts = String(home).split(isWindows ? '\\' : '/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export function buildFS(config = {}) {
  const {
    tree = {},
    isWindows = false,
    home = isWindows ? 'C:\\Users\\Student' : '/home/student'
  } = config;
  const derivedOwner = ownerFromHome(home, isWindows) || (isWindows ? 'Administrator' : 'student');
  const {
    defaultOwner = derivedOwner,
    defaultGroup = isWindows ? 'Users' : derivedOwner
  } = config;

  const fs = {};
  const rootKey = isWindows ? 'C:' : '/';

  fs[rootKey] = {
    type: 'dir',
    contents: [],
    mode: 0o755,
    owner: 'root',
    group: 'root',
    mtime: '2026-08-17T09:30:00.000Z',
    attrib: 'D'
  };

  // Well-known system directories carry real-world modes. /tmp is 1777
  // (world-writable, sticky) on every Unix; without this a pack's scratch
  // directory is writable only by whoever happens to own it.
  const SYSTEM_DIR_MODES = isWindows ? {} : { '/tmp': 0o1777, '/var/tmp': 0o1777 };
  const SYSTEM_DIR_OWNER = isWindows ? {} : { '/tmp': 'root', '/var/tmp': 'root' };

  // Ownership follows LOCATION, the way a real machine works: your home is
  // yours, and /etc and /var belong to root. Deriving every file's owner from
  // the pack's home user handed the student /etc/passwd and quietly removed the
  // permission lesson from every pack.
  const homeNorm = home ? normalizePath(home, isWindows) : null;
  function ownerForPath(path) {
    if (isWindows) return { owner: defaultOwner, group: defaultGroup };
    const norm = normalizePath(path, isWindows);
    if (homeNorm && (norm === homeNorm || norm.startsWith(`${homeNorm}/`))) {
      return { owner: defaultOwner, group: defaultGroup };
    }
    if (norm.startsWith('/tmp/') || norm.startsWith('/var/tmp/')) {
      return { owner: defaultOwner, group: defaultGroup };
    }
    return { owner: 'root', group: 'root' };
  }

  function ensureDir(path, mode = null, owner = null, group = null) {
    const norm = normalizePath(path, isWindows);
    if (mode === null) mode = SYSTEM_DIR_MODES[norm] ?? 0o755;
    if (owner === null) owner = SYSTEM_DIR_OWNER[norm] ?? ownerForPath(norm).owner;
    if (group === null) group = SYSTEM_DIR_OWNER[norm] ?? ownerForPath(norm).group;
    if (!fs[norm]) {
      fs[norm] = {
        type: 'dir',
        contents: [],
        mode,
        owner,
        group,
        mtime: '2026-08-17T09:30:00.000Z',
        attrib: isWindows ? 'D' : undefined
      };
    }
    return norm;
  }

  function addEntryToParent(parentPath, childName) {
    const normParent = normalizePath(parentPath, isWindows);
    ensureDir(normParent);
    if (!fs[normParent].contents.includes(childName)) {
      fs[normParent].contents.push(childName);
    }
  }

  function ensurePathHierarchy(fullPath) {
    if (isWindows) {
      const parts = fullPath.split('\\');
      let current = parts[0];
      ensureDir(current);
      for (let i = 1; i < parts.length; i++) {
        const next = `${current}\\${parts[i]}`;
        addEntryToParent(current, parts[i]);
        ensureDir(next);
        current = next;
      }
      return current;
    } else {
      const parts = fullPath.split('/').filter(Boolean);
      let current = '';
      ensureDir('/');
      for (let i = 0; i < parts.length; i++) {
        const parent = current === '' ? '/' : current;
        const next = `${current}/${parts[i]}`;
        addEntryToParent(parent, parts[i]);
        ensureDir(next);
        current = next;
      }
      return current || '/';
    }
  }

  function traverse(subtree, currentPath) {
    for (const [name, value] of Object.entries(subtree)) {
      if (name.includes('/') || (isWindows && name.includes('\\'))) {
        const targetPath = isWindows
          ? (name.startsWith('C:') ? name : `C:\\${name.replace(/\//g, '\\')}`)
          : (name.startsWith('/') ? name : `/${name}`);

        ensurePathHierarchy(targetPath);
        traverse(value, targetPath);
      } else if (value && value._isFile) {
        const filePath = isWindows
          ? `${currentPath}\\${name}`
          : (currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);

        const normFilePath = normalizePath(filePath, isWindows);
        addEntryToParent(currentPath, name);

        const { _isFile, ...fileNode } = value;
        // Spread FIRST, then the resolved fields. The other order let an
        // undefined owner on the node overwrite the value just computed from
        // it, so every file came out owned by nobody.
        fs[normFilePath] = {
          ...fileNode,
          type: 'file',
          mode: fileNode.mode !== undefined ? fileNode.mode : 0o644,
          owner: fileNode.owner || ownerForPath(normFilePath).owner,
          group: fileNode.group || ownerForPath(normFilePath).group,
          size: fileNode.size !== undefined ? fileNode.size : (fileNode.content ? fileNode.content.length : 0),
          mtime: fileNode.mtime || '2026-08-17T09:30:00.000Z'
        };
      } else if (value && value._isDir) {
        const dirPath = isWindows
          ? `${currentPath}\\${name}`
          : (currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);

        const normDirPath = normalizePath(dirPath, isWindows);
        addEntryToParent(currentPath, name);
        const { _isDir, ...dirNode } = value;
        ensureDir(normDirPath, dirNode.mode, dirNode.owner, dirNode.group);
        if (dirNode.contents) {
          traverse(dirNode.contents, normDirPath);
        }
      } else if (typeof value === 'object' && value !== null) {
        const dirPath = isWindows
          ? `${currentPath}\\${name}`
          : (currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);

        const normDirPath = normalizePath(dirPath, isWindows);
        addEntryToParent(currentPath, name);
        ensureDir(normDirPath);
        traverse(value, normDirPath);
      }
    }
  }

  traverse(tree, rootKey);

  return {
    fs,
    home,
    isWindows
  };
}

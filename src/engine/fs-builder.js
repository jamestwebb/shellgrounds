// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// VFS Builder for Shellgrounds virtual filesystems

import { md5, sha256Sync } from './crypto-utils.js';

/**
 * Creates a file node descriptor
 */
export function file(content = '', options = {}) {
  const textContent = typeof content === 'string' ? content : String(content);
  return {
    _isFile: true,
    content: textContent,
    fileType: options.fileType || 'ASCII text',
    md5: options.md5 || md5(textContent),
    sha256: options.sha256 || sha256Sync(textContent),
    attrib: options.attrib || (options.hidden ? 'H' : 'A'),
    hidden: options.hidden || false,
    ...options
  };
}

/**
 * Normalizes a path to leading slash and no trailing slash (except root '/')
 */
export function normalizePath(path, isWindows = false) {
  if (isWindows) {
    let clean = path.replace(/\//g, '\\');
    // Remove duplicate backslashes
    clean = clean.replace(/\\+/g, '\\');
    if (clean.endsWith('\\') && clean.length > 3) {
      clean = clean.slice(0, -1);
    }
    return clean;
  } else {
    let clean = path.replace(/\\/g, '/');
    clean = clean.replace(/\/+/g, '/');
    if (clean.endsWith('/') && clean.length > 1) {
      clean = clean.slice(0, -1);
    }
    return clean.startsWith('/') ? clean : `/${clean}`;
  }
}

/**
 * Builds a flat VFS map from a nested declarative tree
 */
export function buildFS(config = {}) {
  const { tree = {}, isWindows = false, home = isWindows ? 'C:\\Users\\Analyst' : '/home/analyst' } = config;
  const fs = {};

  // Ensure root directory exists
  const rootKey = isWindows ? 'C:' : '/';
  fs[rootKey] = {
    type: 'dir',
    contents: [],
    attrib: 'D'
  };

  function ensureDir(path) {
    const norm = normalizePath(path, isWindows);
    if (!fs[norm]) {
      fs[norm] = {
        type: 'dir',
        contents: [],
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
      let current = parts[0]; // e.g. 'C:'
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
        // Multi-segment path key (e.g. 'home/analyst' or 'mnt/c/Users/analyst')
        const targetPath = isWindows
          ? (name.startsWith('C:') ? name : `C:\\${name.replace(/\//g, '\\')}`)
          : (name.startsWith('/') ? name : `/${name}`);
        
        ensurePathHierarchy(targetPath);
        traverse(value, targetPath);
      } else if (value && value._isFile) {
        // File node
        const filePath = isWindows
          ? `${currentPath}\\${name}`
          : (currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);
        
        const normFilePath = normalizePath(filePath, isWindows);
        addEntryToParent(currentPath, name);

        const { _isFile, ...fileNode } = value;
        fs[normFilePath] = {
          type: 'file',
          ...fileNode
        };
      } else if (typeof value === 'object' && value !== null) {
        // Directory node
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

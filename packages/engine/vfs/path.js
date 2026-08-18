// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Path resolution and normalization primitives for the Virtual Filesystem

/**
 * Normalizes a path to standard formatting:
 * - Linux: starts with '/', no trailing slash (unless root '/'), deduplicates '//'
 * - Windows: starts with drive (e.g. 'C:'), backslashes, no trailing slash (unless 'C:\' or 'C:'), deduplicates '\\'
 */
export function normalizePath(path, isWindows = false) {
  if (!path || typeof path !== 'string') {
    return isWindows ? 'C:' : '/';
  }

  if (isWindows) {
    let clean = path.replace(/\//g, '\\');
    clean = clean.replace(/\\+/g, '\\');
    if (clean.endsWith('\\') && clean.length > 3) {
      clean = clean.slice(0, -1);
    }
    if (/^[a-zA-Z]:$/.test(clean)) {
      clean = clean.toUpperCase();
    } else if (/^[a-zA-Z]:\\/.test(clean)) {
      clean = clean[0].toUpperCase() + clean.slice(1);
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
 * Single source of truth for resolving target path relative to current working directory
 */
export function resolvePath(cwd, target, isWindows = false, home = isWindows ? 'C:\\Users\\Student' : '/home/student') {
  if (!target || target === '.') {
    return normalizePath(cwd, isWindows);
  }

  if (!isWindows) {
    if (target === '~' || target === home) {
      return home;
    }
    if (target.startsWith('~/')) {
      target = `${home}/${target.slice(2)}`;
    }

    if (target.startsWith('/')) {
      const parts = target.split('/').filter(Boolean);
      const stack = [];
      for (const p of parts) {
        if (p === '..') stack.pop();
        else if (p !== '.') stack.push(p);
      }
      return stack.length === 0 ? '/' : '/' + stack.join('/');
    }

    const base = cwd === '/' ? '' : cwd;
    const combined = `${base}/${target}`.split('/').filter(Boolean);
    const stack = [];
    for (const p of combined) {
      if (p === '..') stack.pop();
      else if (p !== '.') stack.push(p);
    }
    return stack.length === 0 ? '/' : '/' + stack.join('/');
  } else {
    // Windows resolution
    let cleanTarget = target.replace(/\//g, '\\');
    if (cleanTarget === '~' || cleanTarget === home) {
      return home;
    }
    if (cleanTarget.startsWith('~\\')) {
      cleanTarget = `${home}\\${cleanTarget.slice(2)}`;
    }

    // Absolute path with drive e.g. C:\foo or C:
    if (/^[A-Za-z]:/i.test(cleanTarget)) {
      const drive = cleanTarget.slice(0, 2).toUpperCase();
      let rest = cleanTarget.slice(2);
      if (rest.startsWith('\\')) rest = rest.slice(1);
      const parts = rest.split('\\').filter(Boolean);
      const stack = [];
      for (const p of parts) {
        if (p === '..') stack.pop();
        else if (p !== '.') stack.push(p);
      }
      return stack.length === 0 ? drive : `${drive}\\${stack.join('\\')}`;
    }

    const parts = cleanTarget.split('\\').filter(Boolean);
    const cwdParts = cwd.split('\\').filter(Boolean);
    const drive = (cwdParts[0] && cwdParts[0].includes(':')) ? cwdParts[0].toUpperCase() : 'C:';
    const baseParts = cwdParts.slice(1);

    const stack = [...baseParts];
    for (const p of parts) {
      if (p === '..') stack.pop();
      else if (p !== '.') stack.push(p);
    }
    return stack.length === 0 ? drive : `${drive}\\${stack.join('\\')}`;
  }
}

/**
 * Case-insensitive lookup for Windows paths in VFS map
 */
export function findVfsKey(fs, targetPath, isWindows = false) {
  if (!fs) return null;
  const norm = normalizePath(targetPath, isWindows);
  if (fs[norm]) return norm;
  if (isWindows) {
    const normLower = norm.toLowerCase();
    for (const key of Object.keys(fs)) {
      if (key.toLowerCase() === normLower) {
        return key;
      }
    }
  }
  return null;
}

export function dirname(path, isWindows = false) {
  const norm = normalizePath(path, isWindows);
  const sep = isWindows ? '\\' : '/';
  const parts = norm.split(sep).filter(Boolean);
  if (isWindows) {
    if (parts.length <= 1) return parts[0] || 'C:';
    parts.pop();
    return parts.join('\\');
  } else {
    if (parts.length <= 1) return '/';
    parts.pop();
    return '/' + parts.join('/');
  }
}

export function basename(path, isWindows = false) {
  const norm = normalizePath(path, isWindows);
  const sep = isWindows ? '\\' : '/';
  const parts = norm.split(sep).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

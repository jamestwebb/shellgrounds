// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Shell Expansion: Brace, Tilde, Variable, and Globbing Expansion

import { resolvePath, normalizePath, findVfsKey, dirname, basename } from '../vfs/path.js';

/**
 * Performs brace expansion: e.g. "file_{a,b}.txt" -> ["file_a.txt", "file_b.txt"]
 */
export function expandBraces(word) {
  const match = word.match(/\{([^{}]+)\}/);
  if (!match) return [word];

  const prefix = word.slice(0, match.index);
  const suffix = word.slice(match.index + match[0].length);
  const options = match[1].split(',');

  if (options.length <= 1) {
    return [word]; // Not a comma-separated brace
  }

  const results = [];
  for (const opt of options) {
    const expandedInner = expandBraces(`${prefix}${opt}${suffix}`);
    results.push(...expandedInner);
  }
  return results;
}

/**
 * Expands environment variables in a string
 * Respects single/double quotes if unparsed string, or direct map lookup
 */
export function expandVariables(text, env = {}, lastStatus = 0) {
  if (!text || typeof text !== 'string') return '';

  const fullEnv = {
    HOME: '/home/student',
    USER: 'student',
    SHELL: '/bin/bash',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    PWD: '/home/student',
    '?': String(lastStatus),
    ...env
  };

  // Windows CMD style %VAR%
  let result = text.replace(/%([A-Za-z0-9_]+)%/g, (match, varName) => {
    const key = Object.keys(fullEnv).find(k => k.toLowerCase() === varName.toLowerCase());
    return key && fullEnv[key] !== undefined ? fullEnv[key] : match;
  });

  // Bash style $VAR and ${VAR} and $?
  result = result.replace(/\$\{([A-Za-z0-9_?]+)\}/g, (match, varName) => {
    return fullEnv[varName] !== undefined ? String(fullEnv[varName]) : '';
  });

  result = result.replace(/\$([A-Za-z0-9_?]+)/g, (match, varName) => {
    return fullEnv[varName] !== undefined ? String(fullEnv[varName]) : '';
  });

  return result;
}

/**
 * Converts a shell glob pattern (e.g. *.txt, test_?, [a-z]*) to a RegExp
 */
function globToRegex(pattern) {
  let regexStr = '^';
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && !inClass) {
      regexStr += '[^/]*';
    } else if (c === '?' && !inClass) {
      regexStr += '[^/]';
    } else if (c === '[' && !inClass) {
      inClass = true;
      regexStr += '[';
    } else if (c === ']' && inClass) {
      inClass = false;
      regexStr += ']';
    } else if ('\\.+^$(){}|'.includes(c)) {
      regexStr += '\\' + c;
    } else {
      regexStr += c;
    }
  }

  regexStr += '$';
  return new RegExp(regexStr);
}

/**
 * Expands glob patterns (*, ?, [a-z]) against the virtual filesystem
 */
export function expandGlob(pattern, cwd, fs, isWindows = false) {
  if (!pattern || typeof pattern !== 'string') return [pattern];

  // If no glob characters, return literal
  if (!/[*?\[\]]/.test(pattern)) {
    return [pattern];
  }

  const sep = isWindows ? '\\' : '/';
  const targetPattern = pattern.replace(isWindows ? /\//g : /\\/g, sep);

  let searchDir = cwd;
  let filePattern = targetPattern;

  const lastSlashIndex = targetPattern.lastIndexOf(sep);
  if (lastSlashIndex !== -1) {
    const dirPart = targetPattern.slice(0, lastSlashIndex);
    searchDir = resolvePath(cwd, dirPart || (isWindows ? 'C:' : '/'), isWindows);
    filePattern = targetPattern.slice(lastSlashIndex + 1);
  }

  const dirKey = findVfsKey(fs, searchDir, isWindows);
  if (!dirKey || !fs[dirKey] || fs[dirKey].type !== 'dir') {
    return [pattern]; // Directory doesn't exist, glob doesn't match
  }

  const entries = fs[dirKey].contents || [];
  const regex = globToRegex(filePattern);
  const matches = [];

  const allowHidden = filePattern.startsWith('.');

  for (const entry of entries) {
    if (!allowHidden && entry.startsWith('.')) {
      continue;
    }
    if (regex.test(entry)) {
      if (lastSlashIndex !== -1) {
        const prefix = targetPattern.slice(0, lastSlashIndex + 1);
        matches.push(`${prefix}${entry}`);
      } else {
        matches.push(entry);
      }
    }
  }

  if (matches.length === 0) {
    return [pattern]; // No match leaves the pattern literal (standard bash behavior)
  }

  // Sort matches lexicographically
  matches.sort((a, b) => a.localeCompare(b));
  return matches;
}

/**
 * Full expansion pipeline for raw command words:
 * 1. Brace expansion
 * 2. Tilde expansion
 * 3. Variable expansion (for double quoted and unquoted parts)
 * 4. Glob expansion (only on unquoted parts)
 */
export function expandWord(token, cwd, fs, env = {}, lastStatus = 0, isWindows = false) {
  if (!token || typeof token !== 'object') {
    return [token];
  }

  // If token is a literal from single quotes: do NOT expand variables or globs
  if (token.type === 'single') {
    return [token.value];
  }

  // If token is from double quotes: expand variables, but NOT globs
  if (token.type === 'double') {
    return [expandVariables(token.value, env, lastStatus)];
  }

  // Unquoted token: full expansion
  let raw = token.value || '';

  // 1. Tilde expansion
  const home = env.HOME || (isWindows
    ? (env.USERPROFILE || (cwd.includes('\\Users\\') ? cwd.split('\\').slice(0, 3).join('\\') : 'C:\\Users\\Student'))
    : (cwd.startsWith('/home/') ? '/' + cwd.split('/').slice(1, 3).join('/') : '/home/student'));
  if (raw === '~') {
    raw = home;
  } else if (raw.startsWith('~/') && !isWindows) {
    raw = `${home}/${raw.slice(2)}`;
  } else if (raw.startsWith('~\\') && isWindows) {
    raw = `${home}\\${raw.slice(2)}`;
  }

  // 2. Variable expansion
  const varExpanded = expandVariables(raw, env, lastStatus);

  // 3. Brace expansion
  const braceExpanded = expandBraces(varExpanded);

  // 4. Glob expansion
  const results = [];
  for (const word of braceExpanded) {
    const globResults = expandGlob(word, cwd, fs, isWindows);
    results.push(...globResults);
  }

  return results;
}

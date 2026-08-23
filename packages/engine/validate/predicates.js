// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Declarative Validation Predicates for Challenges and Verification

import { findVfsKey, resolvePath, normalizePath } from '../vfs/path.js';
import { stat, readFile } from '../vfs/ops.js';
import { md5, sha256Sync } from '../crypto-utils.js';
import { compileSafe, testSafe } from './safe-regex.js';

/**
 * Evaluates a declarative predicate against an execution result state.
 *
 * Context object provided to predicate evaluation:
 * {
 *   fs: Object (VFS map),
 *   cwd: string (current directory),
 *   commandText: string (command executed by user),
 *   stdout: string,
 *   stderr: string,
 *   output: string,
 *   status: number,
 *   isWindows: boolean,
 *   user: string,
 *   env: Object
 * }
 *
 * Every predicate is DATA. There is deliberately no predicate that executes a
 * function supplied by a pack: that is what lets a teacher open a pack somebody
 * else wrote without running their code. A `js` predicate used to exist for
 * checks awkward to express as data; nothing ever used it, and it was the one
 * field that could have broken that promise, so it was removed. If a future
 * check cannot be expressed here, add a named data predicate for it rather than
 * an escape hatch — every teacher can then read and trust it.
 */
export function evaluatePredicate(predicateConfig, context = {}) {
  if (!predicateConfig) return false;

  const {
    fs = {},
    cwd = '/',
    commandText = '',
    stdout = '',
    stderr = '',
    output = '',
    status = 0,
    isWindows = false,
    user = 'student'
  } = context;

  const type = predicateConfig.predicate || predicateConfig.kind;

  switch (type) {
    case 'fileExists': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const st = stat(fs, resolved, isWindows);
      return st.exists && st.isFile;
    }

    case 'dirExists': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const st = stat(fs, resolved, isWindows);
      return st.exists && st.isDir;
    }

    case 'fileMatches': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const res = readFile(fs, resolved, isWindows, { user });
      if (!res.ok) return false;
      const regex = compileSafe(predicateConfig.pattern, predicateConfig.flags || 'i');
      return testSafe(regex, res.content);
    }

    case 'fileEquals': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const res = readFile(fs, resolved, isWindows, { user });
      if (!res.ok) return false;
      return res.content.trim() === String(predicateConfig.text).trim();
    }

    case 'lineCountAtLeast': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const res = readFile(fs, resolved, isWindows, { user });
      if (!res.ok) return false;
      const lines = res.content.split('\n').filter(l => l.trim().length > 0);
      return lines.length >= (predicateConfig.n || 1);
    }

    case 'fileHashEquals': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const res = readFile(fs, resolved, isWindows, { user });
      if (!res.ok) return false;
      const algo = (predicateConfig.algo || 'sha256').toLowerCase();
      const actualHash = algo === 'md5' ? md5(res.content) : sha256Sync(res.content);
      return actualHash.toLowerCase() === String(predicateConfig.hex).toLowerCase();
    }

    case 'cwdIs': {
      const expected = normalizePath(predicateConfig.path, isWindows);
      const actual = normalizePath(cwd, isWindows);
      return isWindows ? expected.toLowerCase() === actual.toLowerCase() : expected === actual;
    }

    case 'commandMatches': {
      if (!commandText || !predicateConfig.pattern) return false;
      const regex = compileSafe(predicateConfig.pattern, predicateConfig.flags || 'i');
      return testSafe(regex, commandText.trim());
    }

    case 'outputMatches': {
      const textToTest = stdout || output || '';
      if (!predicateConfig.pattern) return false;
      const regex = compileSafe(predicateConfig.pattern, predicateConfig.flags || 'i');
      return testSafe(regex, textToTest);
    }

    // Output predicates. A challenge that only checks the typed command grades
    // keystrokes, not understanding: it marks a student wrong for a smarter
    // equivalent command, and marks them right when the simulation printed
    // something false. Assert on what the terminal actually produced.
    case 'outputContains': {
      const textToTest = stdout || output || '';
      const needle = String(predicateConfig.text ?? '');
      if (!needle) return false;
      return predicateConfig.caseSensitive
        ? textToTest.includes(needle)
        : textToTest.toLowerCase().includes(needle.toLowerCase());
    }

    case 'outputEquals': {
      const textToTest = (stdout || output || '');
      const expected = String(predicateConfig.text ?? '');
      const norm = (t) => t.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
      return norm(textToTest) === norm(expected);
    }

    case 'outputLineCountIs': {
      const textToTest = (stdout || output || '');
      const lines = textToTest.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0);
      return lines.length === Number(predicateConfig.n);
    }

    case 'exitStatusIs': {
      return status === (predicateConfig.status !== undefined ? predicateConfig.status : 0);
    }

    case 'fileHasMode': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const st = stat(fs, resolved, isWindows);
      if (!st.exists) return false;
      const expectedMode = typeof predicateConfig.mode === 'number'
        ? predicateConfig.mode
        : parseInt(predicateConfig.mode, 8);
      return (st.mode & 0o777) === expectedMode;
    }

    case 'fileHasOwner': {
      const resolved = resolvePath(cwd, predicateConfig.path, isWindows);
      const st = stat(fs, resolved, isWindows);
      return st.exists && st.owner === predicateConfig.owner;
    }

    case 'allOf': {
      const predicates = predicateConfig.predicates || [];
      return predicates.length > 0 && predicates.every(p => evaluatePredicate(p, context));
    }

    case 'anyOf': {
      const predicates = predicateConfig.predicates || [];
      return predicates.some(p => evaluatePredicate(p, context));
    }

    default:
      return false;
  }
}

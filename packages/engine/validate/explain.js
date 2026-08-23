// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Explains WHY a success condition passed or failed.
//
// `evaluatePredicate` answers yes or no, which is all a student's submission
// needs. An author debugging a challenge needs the other half: which clause
// failed, what it looked for, and what was actually there. This module walks
// the same predicate tree and produces that account. It never decides the
// verdict — `evaluatePredicate` remains the single source of truth, and every
// leaf below is checked by calling it — so the explanation cannot drift into
// disagreeing with the real checker.

import { evaluatePredicate } from './predicates.js';
import { resolvePath, normalizePath } from '../vfs/path.js';
import { stat, readFile } from '../vfs/ops.js';

const clip = (s, n = 120) => {
  const t = String(s ?? '').replace(/\n/g, '\\n');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function leafDetail(cfg, ctx) {
  const type = cfg.predicate || cfg.kind;
  const { fs = {}, cwd = '/', isWindows = false, user = 'student' } = ctx;
  const seen = ctx.stdout || ctx.output || '';

  const pathInfo = (p) => {
    const resolved = resolvePath(cwd, p, isWindows);
    const st = stat(fs, resolved, isWindows);
    const what = !st.exists ? 'does not exist' : (st.isDir ? 'is a directory' : 'is a file');
    return { resolved, st, what };
  };

  switch (type) {
    case 'fileExists': {
      const { resolved, what } = pathInfo(cfg.path);
      return `wants a file at ${resolved}; it ${what}`;
    }
    case 'dirExists': {
      const { resolved, what } = pathInfo(cfg.path);
      return `wants a directory at ${resolved}; it ${what}`;
    }
    case 'fileMatches': {
      const { resolved, st } = pathInfo(cfg.path);
      if (!st.exists) return `wants ${resolved} to match /${cfg.pattern}/; the file does not exist`;
      const res = readFile(fs, resolved, isWindows, { user });
      if (!res.ok) return `wants ${resolved} to match /${cfg.pattern}/; cannot read it (${res.error})`;
      return `wants ${resolved} to match /${cfg.pattern}/; file holds "${clip(res.content)}"`;
    }
    case 'fileEquals': {
      const { resolved, st } = pathInfo(cfg.path);
      if (!st.exists) return `wants ${resolved} to equal "${clip(cfg.text)}"; the file does not exist`;
      const res = readFile(fs, resolved, isWindows, { user });
      return `wants ${resolved} to equal "${clip(cfg.text)}"; it holds "${clip(res.ok ? res.content : res.error)}"`;
    }
    case 'lineCountAtLeast': {
      const { resolved } = pathInfo(cfg.path);
      const res = readFile(fs, resolved, isWindows, { user });
      const n = res.ok ? res.content.split('\n').filter((l) => l.trim()).length : 0;
      return `wants ${resolved} to hold at least ${cfg.n || 1} non-blank lines; it holds ${n}`;
    }
    case 'fileHashEquals': {
      const { resolved } = pathInfo(cfg.path);
      return `wants the ${cfg.algo || 'sha256'} of ${resolved} to equal ${clip(cfg.hex, 24)}`;
    }
    case 'cwdIs':
      return `wants the working directory to be ${normalizePath(cfg.path, isWindows)}; it is ${normalizePath(cwd, isWindows)}`;
    case 'commandMatches':
      return `wants the typed command to match /${cfg.pattern}/${cfg.flags || 'i'}; the command was "${clip(ctx.commandText)}"`;
    case 'outputMatches':
      return `wants the output to match /${cfg.pattern}/${cfg.flags || 'i'}; the output was "${clip(seen)}"`;
    case 'outputContains':
      return `wants the output to contain "${clip(cfg.text, 60)}"${cfg.caseSensitive ? ' (case-sensitive)' : ''}; the output was "${clip(seen)}"`;
    case 'outputEquals':
      return `wants the output to equal "${clip(cfg.text, 60)}"; the output was "${clip(seen)}"`;
    case 'outputLineCountIs': {
      const n = String(seen).replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim()).length;
      return `wants exactly ${cfg.n} non-blank output lines; there were ${n}`;
    }
    case 'exitStatusIs':
      return `wants exit status ${cfg.status ?? 0}; the status was ${ctx.status ?? 0}`;
    case 'fileHasMode': {
      const { resolved, st } = pathInfo(cfg.path);
      const want = typeof cfg.mode === 'number' ? cfg.mode : parseInt(cfg.mode, 8);
      const got = st.exists ? (st.mode & 0o777).toString(8) : 'n/a';
      return `wants ${resolved} to have mode ${want.toString(8)}; it has ${got}`;
    }
    case 'fileHasOwner': {
      const { resolved, st } = pathInfo(cfg.path);
      return `wants ${resolved} to be owned by ${cfg.owner}; owner is ${st.exists ? st.owner : 'n/a'}`;
    }
    case 'flag':
      return 'is a flag challenge: the student finds a FLAG{…} string and submits it, so there is ' +
        'no command to check. Look for the [[FLAG:<id>]] placeholder in the filesystem';
    case 'js':
      return 'runs JavaScript supplied by the pack (first-party packs only)';
    default:
      return `uses an unknown predicate '${type}', which always fails. Check the spelling against ` +
        'docs/PACK-FORMAT.md';
  }
}

/**
 * Returns a tree of { predicate, ok, detail, children } mirroring the success
 * condition, with `ok` taken from evaluatePredicate at every level.
 */
export function explainPredicate(cfg, ctx) {
  if (!cfg) return { predicate: '(none)', ok: false, detail: 'the challenge declares no success condition' };
  const type = cfg.predicate || cfg.kind;
  const ok = evaluatePredicate(cfg, ctx);

  if (type === 'allOf' || type === 'anyOf') {
    const kids = (cfg.predicates || []).map((p) => explainPredicate(p, ctx));
    const detail = type === 'allOf'
      ? `every one of the ${kids.length} conditions below must hold`
      : `at least one of the ${kids.length} conditions below must hold`;
    return { predicate: type, ok, detail, children: kids };
  }
  return { predicate: type, ok, detail: leafDetail(cfg, ctx) };
}

/** Renders an explanation tree as indented lines for the terminal. */
export function renderExplanation(node, indent = '') {
  const mark = node.ok ? 'PASS' : 'FAIL';
  const lines = [`${indent}[${mark}] ${node.predicate}: ${node.detail}`];
  for (const child of node.children || []) {
    lines.push(...renderExplanation(child, `${indent}    `));
  }
  return lines;
}

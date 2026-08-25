// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Content that is written, validated, documented — and never shown to anybody.
//
// This class of defect is invisible from inside the code, because every piece
// of it is correct. The pack author writes the field. The validator checks it.
// The format documents it. The tests pass. Nothing anywhere is broken. The
// student simply never sees it, and no one finds out until somebody uses the
// product and asks why it does not say what the act is about.
//
// Three instances had shipped before anyone looked:
//
//   manifest.acts[].tagline   in all three packs, explaining each act in plain
//                             words, while the sidebar rendered `glyph` -- a
//                             decorative "---.---" -- in the slot it belonged in.
//   manifest.messages         the sentence a student reads when a real command
//                             is not simulated. The engine had taken the
//                             parameter since it was written. No caller ever
//                             passed it, so every course shipped the generic
//                             wording instead of its own.
//   manifest.windows.host     the pack names its machine; the Windows prompt
//                             said 'Desktop' regardless.
//
// So the rule is: anything a pack carries must be read by something, and any
// component that exists must be rendered somewhere. What is deliberately not
// is listed below WITH ITS REASON, because a list of known-dead content is a
// decision, and silence is not.
//
// The matching is deliberately loose -- a field name appearing anywhere in the
// source counts as read. It therefore under-reports (a common word like `name`
// matches something eventually). It is here to catch the NEXT one, not to
// prove the current set exhaustively.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PACKS } from '../packs/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');

const sources = [];
const collect = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!/node_modules|\.git|dist/.test(rel)) collect(rel); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) sources.push([rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')]);
  }
};
collect('src');
collect('packages/engine');
collect('netlify');

// Validators and the pack format itself do not count as a reader: checking a
// field is not the same as showing it, and that gap is the whole defect.
const consumers = sources.filter(([f]) => !f.includes('/validate/'));

/** Fields nothing reads, on purpose, each with the reason it stays that way. */
const DELIBERATELY_UNREAD = {
  // linux.shell, windows.shell, theme.titleBar and theme.sidebarTone each stood
  // here with the same closing line: "this entry goes when the last pack.json
  // drops the field". All three packs have now dropped all four, so the entries
  // went with them. An exemption that outlives the thing it excuses is how a
  // list of known-dead content quietly becomes a list nobody reads.
  'glyph':
    'Decorative. The sidebar slot it used to occupy now carries the act tagline.',
  'commandCheckExemptReason':
    'A note for the next author, read by humans opening the JSON.',
  'success.flagFile':
    'Authoring and checking only: the validator proves the file exists and holds '
    + 'the placeholder, and the instructor guide prints where the flag lives. The '
    + 'flag a student sees is resolved from the flag map by challenge id.',
  'commandCheckExemptSnippets':
    'A control for the validator rather than content for a student: it turns off '
    + 'the brief-command check for the snippets named in it.'
};

/**
 * Components that exist and are never rendered, each with the reason.
 *
 * Empty, and worth keeping empty. It held two entries: CommandReference, which
 * was unreachable because nothing ever set activeTab to 'reference', and
 * BadgeCelebration, which was imported and whose setter was never called.
 * CommandReference was deleted -- one registry-derived Reference tab replaced
 * it -- and BadgeCelebration is now rendered when a solve completes an act.
 */
const NOT_MOUNTED = {};

const OPAQUE = new Set(['glossary', 'courseTools', 'commands', 'filesystems', 'help', 'tree']);

const fieldNames = () => {
  const found = new Map();               // leaf name -> dotted path first seen at
  const walk = (obj, prefix, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 3) return;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('//')) continue;
      const at = prefix ? `${prefix}.${k}` : k;
      if (!found.has(k)) found.set(k, at);
      if (OPAQUE.has(k)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, at, depth + 1);
      else if (Array.isArray(v) && v.length && typeof v[0] === 'object') walk(v[0], `${at}[]`, depth + 1);
    }
  };
  for (const pack of Object.values(PACKS)) {
    walk(pack.manifest, 'manifest');
    for (const c of pack.challenges) walk(c, 'challenge');
  }
  return found;
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// ── A forwarder is not a reader ─────────────────────────────────────────────
//
// `manifest.courseTools` walked straight past this test for months on the
// strength of one line in src/data/challenges.js:
//
//     export const COURSE_TOOLS = forensicsPack.courseTools || {};
//
// That line mentions the field, so the loose match counted it — and then
// nothing imported COURSE_TOOLS, nothing passed it to `packTools`, and every
// student who typed a real tool the course had promised to name got the
// generic message instead. A module that only hands a value onward proves
// nothing about whether anybody took it.
//
// So a single-line `export const X = <expression>;` with no call in it, and a
// bare `export { … } from '…'`, are removed before the search. Anything that
// picks the value apart, calls something with it, or renders it survives the
// strip and still counts.
const FORWARDING = /^[ \t]*export[ \t]+(?:const|let|var)[ \t]+\w+[ \t]*=[ \t]*[^;()]*;[ \t]*$/gm;
const BARE_REEXPORT = /^[ \t]*export[ \t]+(?:\*|\{[^}]*\})[ \t]*(?:from[ \t]*['"][^'"]+['"])?[ \t]*;?[ \t]*$/gm;
const consumersRead = consumers.map(([f, src]) => [f, src.replace(FORWARDING, '').replace(BARE_REEXPORT, '')]);

const isRead = (name) => {
  const re = new RegExp(`(\\.${escape(name)}\\b|['"\`]${escape(name)}['"\`]\\s*[:\\]])`);
  return consumersRead.some(([, src]) => re.test(src));
};

const allowedKey = (dotted, leaf) => {
  const tail = dotted.replace(/^manifest\.|^challenge\./, '').replace(/\[\]/g, '');
  return DELIBERATELY_UNREAD[tail] !== undefined ? tail
    : DELIBERATELY_UNREAD[leaf] !== undefined ? leaf
      : null;
};

describe('nothing a pack writes goes unread', () => {
  it('has a reader for every field, or a written reason why not', () => {
    const orphans = [];
    for (const [leaf, dotted] of fieldNames()) {
      if (isRead(leaf)) continue;
      if (allowedKey(dotted, leaf)) continue;
      orphans.push(dotted);
    }
    expect(orphans).toEqual([]);
  });

  it('gives every deliberately-unread field a reason worth reading', () => {
    for (const [field, why] of Object.entries(DELIBERATELY_UNREAD)) {
      expect(why.length, `${field} needs a real reason`).toBeGreaterThan(40);
    }
  });

  // The three that started this. Each was authored in every pack and shown to
  // nobody; if any of them stops being read again, that is the same bug back.
  it('shows the act tagline, the pack\'s own unsimulated wording, and the pack\'s hostname', () => {
    const sidebar = sources.find(([f]) => f.endsWith('ChallengeSidebar.jsx'))[1];
    const app = sources.find(([f]) => f.endsWith('src/App.jsx'))[1];
    expect(sidebar).toMatch(/currentAct\.tagline/);
    expect(app).toMatch(/unsimulatedMessage:\s*currentPack\.manifest\.messages\?\.unsimulated/);
    expect(app).toMatch(/manifest\.windows\?\.host/);
  });
});

describe('nothing built goes unrendered', () => {
  const componentFiles = fs.readdirSync(path.join(ROOT, 'src/components'))
    .filter(f => f.endsWith('.jsx'));

  // Read the exported component names rather than the filenames: Onboarding.jsx
  // exports Welcome, ChoosePack and PackBriefing, all three of which render.
  const exported = componentFiles.flatMap(f => {
    const src = fs.readFileSync(path.join(ROOT, 'src/components', f), 'utf8');
    return [...src.matchAll(/^export (?:const|function|default function) ([A-Z]\w+)/gm)]
      .map(m => ({ name: m[1], file: `src/components/${f}` }));
  });

  it('renders every exported component somewhere, or says why it does not', () => {
    const unmounted = [];
    for (const { name, file } of exported) {
      const re = new RegExp(`<${name}[\\s/>]`);
      const rendered = sources.some(([f, src]) => f !== file && re.test(src));
      if (!rendered && !NOT_MOUNTED[name]) unmounted.push(`${name} (${file})`);
    }
    expect(unmounted).toEqual([]);
  });

  it('gives every unmounted component a reason worth reading', () => {
    for (const [name, why] of Object.entries(NOT_MOUNTED)) {
      expect(why.length, `${name} needs a real reason`).toBeGreaterThan(40);
    }
  });
});

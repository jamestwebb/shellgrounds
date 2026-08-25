// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Fading-scaffolding lint: from act 2 on, a challenge must not hand over its
// own answer for free.
//
// A third-party pedagogy review found that 60 of 60 command challenges printed
// the required command inside the brief, so a student could finish a pack by
// transcription without ever choosing a tool. Removing that text once is not
// enough: the next pack author will reintroduce it unless the rule is checked.
//
// The rule:
//   act 1        onboarding. The brief and the free hint may both show the
//                whole command line. Nothing here is checked.
//   act 2 and up the brief and any FREE (cost 0) hint may name a tool, but must
//                not contain a command line that solves the challenge outright.
//                The exact line belongs in a hint that costs XP.
//
// "Solves it outright" is measured, not guessed: every backticked snippet is
// executed and tested against the challenge's own success condition. A snippet
// that is quoted in order to FAIL (`cat /etc/shadow` before sudo is taught) is
// therefore fine, because it does not satisfy the predicate.
//
// ── The hole this used to have ──────────────────────────────────────────────
//
// The lint used to skip any snippet shorter than two words, on the reasoning
// that "a bare tool name is guidance, not an answer: use `grep`". That is true
// right up to the point where the tool name IS the whole answer, and then it is
// exactly backwards. The free hint for w3-tasklist read "the cmd.exe equivalent
// of Task Manager is a single command: `tasklist`" — which is the answer, typed
// out, for nothing — and the lint waved it through for being one word long.
// Eight of them had accumulated behind that skip.
//
// The skip is gone. Every snippet is now judged the same way: run it, and see
// whether it satisfies the challenge. The eight it uncovered are listed in
// KNOWN_BARE_GIVEAWAYS below, because a content pass is rewriting those hints
// and a red suite in the meantime tells nobody anything they do not know.

import { describe, it, expect } from 'vitest';
import { PACKS } from '../packs/index.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { registry } from '../packages/engine/commands/registry.js';

const FIRST_GATED_ACT = 2;

/**
 * Give-aways that existed before the one-word skip was removed, each waiting on
 * a content rewrite. This is a ratchet, not an amnesty:
 *
 *   - a NEW give-away fails the suite, exactly as before;
 *   - an entry here that no longer fires ALSO fails the suite, so a fixed hint
 *     cannot leave its excuse behind;
 *   - only a single-word snippet may be listed. A whole command line handed
 *     over free is never something to note and leave.
 *
 * Key is `packId/challengeId/snippet`. Delete the line when you fix the hint.
 */
const KNOWN_BARE_GIVEAWAYS = new Set([
  // The four windows-cmd-essentials entries that stood here -- w2-cls,
  // w3-tasklist, w3-ipconfig, w3-systeminfo -- were removed when the content
  // pass rewrote those hints. The ratchet caught them itself: it failed the
  // suite saying the excuses were stale, which is the half of this design that
  // stops an allowlist quietly becoming permanent.
  // The free hint names the command, and the command alone is the answer.
  'forensics-cli-101/act6-nav/dir',
  // A pack tool that prints its flag when run bare, named in backticks by the
  // text that is supposed to make the student work out which tool to reach for.
  'forensics-cli-101/act3-apt/evtrace',
  'forensics-cli-101/act3-man/evtrace'
]);

/** Filled in as the packs are walked; checked once, at the end, for staleness. */
const stillOwed = new Set();

describe('Fading scaffolding (act 2+ briefs must not give the answer)', () => {
  for (const [packId, pack] of Object.entries(PACKS)) {
    it(`'${packId}': no act-2+ brief or free hint solves its own challenge`, () => {
      const { manifest, challenges, commands = {}, help = {}, createFs } = pack;
      const platforms = manifest.platforms || ['linux'];
      const filesystems = Object.fromEntries(platforms.map(p => [p, createFs(p)]));

      // getAll() defaults to linux; both platforms must be requested or the
      // lint quietly ignores every Windows snippet.
      const knownCommands = new Set([
        ...registry.getAll('linux').map(c => c.name),
        ...registry.getAll('windows').map(c => c.name),
        ...Object.keys(commands)
      ]);

      const violations = [];

      for (const c of challenges) {
        if ((c.act ?? 1) < FIRST_GATED_ACT) continue;

        const plat = c.platform || platforms[0];
        const isWin = plat === 'windows';
        const user = (isWin ? manifest.windows?.user : manifest.linux?.user)
          || (isWin ? 'Student' : 'student');
        const home = (isWin ? manifest.windows?.home : manifest.linux?.home)
          || (isWin ? 'C:\\Users\\Student' : '/home/student');
        const cwd = c.setup?.cwd || home;
        const isFlag = c.success?.kind === 'flag';

        // Only the text a student sees without paying: the brief plus free hints.
        const freeText = [
          ['brief', c.brief || ''],
          ...(c.hints || [])
            .filter(h => (h.cost || 0) === 0)
            .map((h, i) => [`free hint ${i}`, h.text || ''])
        ];

        for (const [where, text] of freeText) {
          for (const m of text.matchAll(/`([^`]+)`/g)) {
            const snippet = m[1].trim();
            const words = snippet.split(/\s+/);
            if (!knownCommands.has(words[0])) continue;

            const res = runPipeline(snippet, cwd, { ...filesystems[plat] }, plat, {
              packCommands: commands,
              packHelp: help,
              user,
              installedPackages: new Set(Object.keys(commands))
            });

            const gaveAnswer = isFlag
              // The placeholder is unreplaced here, so seeing it means that in a
              // live session this line would print the student's real flag.
              ? String(res.output || '').includes('[[FLAG:')
              : evaluatePredicate(c.success, {
                  fs: res.fs,
                  cwd: res.newCwd || cwd,
                  commandText: snippet,
                  stdout: res.stdout,
                  stderr: res.stderr,
                  output: res.output,
                  status: res.status,
                  isWindows: isWin,
                  trusted: true
                });

            if (gaveAnswer) {
              const key = `${packId}/${c.id}/${snippet}`;
              // A known one is only excused while it is still one bare word:
              // an edit that grows it into a command line is a new give-away.
              if (words.length === 1 && KNOWN_BARE_GIVEAWAYS.has(key)) {
                stillOwed.add(key);
                continue;
              }
              violations.push(
                `${packId}/${c.id} (act ${c.act}): its ${where} contains \`${snippet}\`, ` +
                `which solves the challenge on its own. Move that line into a hint with a cost.`
              );
            }
          }
        }
      }

      expect(violations, `\n${violations.join('\n')}\n`).toEqual([]);
    });
  }

  // Runs last, after every pack above has walked its snippets. An entry that no
  // longer fires means the hint was rewritten and the excuse outlived it, which
  // is how an allowlist turns into a place findings go to be forgotten.
  it('has no stale entries in KNOWN_BARE_GIVEAWAYS', () => {
    const fixed = [...KNOWN_BARE_GIVEAWAYS].filter(k => !stillOwed.has(k));
    expect(
      fixed,
      `\nThese hints no longer give the answer away. Delete them from ` +
      `KNOWN_BARE_GIVEAWAYS in this file:\n${fixed.join('\n')}\n`
    ).toEqual([]);
  });
});

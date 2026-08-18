// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
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

import { describe, it, expect } from 'vitest';
import { PACKS } from '../packs/index.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../packages/engine/validate/predicates.js';
import { registry } from '../packages/engine/commands/registry.js';

const FIRST_GATED_ACT = 2;

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
            // A bare tool name is guidance, not an answer: "use `grep`".
            if (words.length < 2) continue;
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
});

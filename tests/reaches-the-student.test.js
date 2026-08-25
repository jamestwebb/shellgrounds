// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Six things that were built, validated, documented — and never reached anybody.
//
// tests/nothing-written-is-unread.test.js catches the shape of this defect in
// general: a pack field nobody reads, a component nobody renders. It caught
// these as a LIST OF EXEMPTIONS, each with a written reason, which is honest
// and is not the same as fixed. This file is what the exemptions were traded
// for. Each block below holds one of them shut.
//
// The defect is worth restating, because every instance of it looks like
// working code from the inside. The pack author writes the field. The
// validator checks it. The format documents it. The component compiles. The
// tests pass. Nothing is broken. A student simply never sees it, and nobody
// finds out until somebody uses the product.
//
// These are source-shape assertions, which is a weaker instrument than
// rendering the app, and it is the instrument that fits: the failures being
// guarded are all "the value never leaves the module it was declared in", and
// that is visible in the source. They will not catch a wiring that is present
// and wrong. They will catch a wiring that is deleted, which is how all six of
// these got here.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const app = read('src/App.jsx');
const sidebar = read('src/components/ChallengeSidebar.jsx');
const boot = read('src/components/Boot.jsx');
const boundary = read('src/components/SimulationBoundary.jsx');

describe('one Reference screen, and it is the true one', () => {
  // There were two: this one, derived from the command registry the shell
  // actually executes from, and a hand-written man-page screen that had
  // already gone stale -- it documented the home directory as /home/analyst, a
  // path removed from everywhere else in the codebase. A reference that is
  // confidently wrong is worse than none, because a student who cannot find a
  // file believes the reference and doubts themselves.
  it('has deleted the hand-written reference and its stale source', () => {
    expect(exists('src/components/CommandReference.jsx')).toBe(false);
    expect(exists('src/engine/help.js')).toBe(false);
  });

  it('reaches the student, as a tab rather than an overlay', () => {
    expect(app).toMatch(/setActiveTab\('reference'\)/);
    expect(app).toMatch(/activeTab === 'reference'[\s\S]{0,120}<SimulationBoundary/);
  });

  it('is no longer a modal, so nothing has to be dismissed to type again', () => {
    expect(app).not.toContain('showBoundaryModal');
    expect(boundary).not.toContain('isOpen');
    expect(boundary).not.toContain('aria-modal');
  });

  it('keeps the one idea worth carrying over: how to read this on a real shell', () => {
    expect(boundary).toContain('real shell:');
    expect(boundary).toMatch(/man \$\{name\}/);
    expect(boundary).toMatch(/\$\{name\} \/\?/);
  });

  it('derives its entries from the registry, so it cannot go stale', () => {
    expect(boundary).toMatch(/registry\.getBoundaryReport\(\)/);
  });
});

describe('earning a badge is not silent', () => {
  it('renders the celebration overlay that had only ever been imported', () => {
    expect(app).toMatch(/<BadgeCelebration\s+badge=\{newBadge\}/);
    expect(app).toMatch(/onClose=\{\(\) => setNewBadge\(null\)\}/);
  });

  it('asks the shared rule rather than a second copy of it', () => {
    expect(app).toMatch(/from '\.\.\/packages\/engine\/badges\.js'/);
    expect(exists('packages/engine/badges.js')).toBe(true);
  });

  it('fires on the transition, not on the standing fact', () => {
    // A student who already holds the badge must not be congratulated again
    // every time they practise a challenge in that act, so the before-set is
    // computed and subtracted rather than the after-set simply being shown.
    expect(app).toMatch(/celebrateNewBadges\s*=\s*useCallback/);
    expect(app).toMatch(/const held = new Set\(badgesEarned\(currentPack, beforeIds\)/);
    expect(app).toMatch(/\.find\(b => !held\.has\(b\.id\)\)/);
  });

  it('works in practice mode, which never asks the server', () => {
    // Practice mode updates solvesMap locally and returns before any submit.
    // A celebration hung off the submit response would be silent for every
    // student who is only trying the product out.
    const success = app.slice(app.indexOf('const handleChallengeSuccess'));
    const practiceBlock = success.slice(
      success.indexOf('if (isPracticeMode) {'),
      success.indexOf('const res = await submitFlagApi')
    );
    expect(practiceBlock).toContain('celebrateNewBadges(');
  });
});

describe('the pack\'s own words for a tool it does not simulate', () => {
  // A forensics student who typed `mmls` -- a Sleuth Kit tool their own course
  // names in its briefs -- was told "command not found". That is not true, and
  // the pack had already written the true sentence for it in courseTools. The
  // engine has taken `packTools` since it was written; nothing passed it.
  it('passes courseTools to the engine as packTools', () => {
    expect(app).toMatch(/packTools:\s*currentPack\.manifest\.courseTools/);
  });

  it('passes the pack\'s unsupported-syntax wording the same way', () => {
    expect(app).toMatch(
      /unsupportedSyntaxMessage:\s*currentPack\.manifest\.messages\?\.unsupportedSyntax/
    );
  });

  it('uses the parameter names the engine actually reads', () => {
    // Threading a value under a name the engine does not destructure is the
    // same defect wearing a fix: it looks wired and changes nothing.
    const exec = read('packages/engine/shell/exec.js');
    for (const param of ['packTools', 'unsimulatedMessage', 'unsupportedSyntaxMessage']) {
      expect(exec, `exec.js no longer reads ${param}`).toMatch(
        new RegExp(`^\\s*${param}\\s*(=|,|$)`, 'm')
      );
    }
  });
});

describe('the boot animation stops replaying', () => {
  it('remembers on the device rather than on the server', () => {
    // Boot runs before a session exists, so there is no token to authenticate
    // the seen endpoint with. Per-device is also the right grain: this is a
    // curtain going up on a machine, not a lesson learned by an account.
    expect(boot).toContain("'shellgrounds.bootSeen'");
    expect(boot).not.toContain('markScreenSeen');
  });

  it('wraps every storage access, because a locked-down profile throws', () => {
    const accesses = boot.match(/window\.localStorage/g) || [];
    expect(accesses.length).toBeGreaterThan(1);
    // One try/catch per access, as src/utils/terminalThemes.js already does.
    expect((boot.match(/try \{/g) || []).length).toBeGreaterThanOrEqual(accesses.length);
  });

  it('decides once, before anything paints', () => {
    expect(app).toMatch(/useState\(\(\) => hasSeenBoot\(\)\)/);
    expect(app).toMatch(/brief=\{bootBrief\}/);
    expect(app).toMatch(/rememberBootSeen\(\)/);
  });

  it('still shows something, and still lets Enter through', () => {
    expect(boot).toMatch(/if \(brief\) \{/);
    expect(boot).toMatch(/setCanSkip\(true\)/);
  });
});

describe('builtOn is one line a student can follow', () => {
  // `teaches` says what a challenge covers; `builtOn` says what it assumes was
  // already done. No shipped pack declares one yet -- `validate` reports
  // "NOTHING BUILDS ON ANYTHING" for all three -- so this renders nothing
  // today and renders the moment a pack author writes the field, which is the
  // opposite of how the other five entries here got broken.
  it('renders the line, and only a line', () => {
    expect(sidebar).toContain('Follows on from:');
    expect(sidebar).toMatch(/currentChallenge\?\.builtOn \|\| \[\]/);
  });

  it('makes it clickable, and moves the act with it', () => {
    // The named challenge is usually in an earlier act; selecting it without
    // moving the act leaves the list showing somewhere else entirely.
    expect(sidebar).toMatch(/if \(dep\.act\) setActiveActId\(dep\.act\)/);
    expect(sidebar).toMatch(/onSelectChallenge\(dep\.id\)/);
  });

  it('drops an id that names nothing rather than rendering a dead link', () => {
    expect(sidebar).toMatch(/\.map\(id => challenges\.find\(c => c\.id === id\)\)\s*\n\s*\.filter\(Boolean\)/);
  });
});

describe('what the sidebar rework put there stays there', () => {
  // Reworked hours before this file was written, and easy to undo by accident
  // while editing the same region. tests/task-framing.test.js owns these; they
  // are repeated here because this file edits that exact block.
  it('still frames the task, the situation and the act', () => {
    expect(sidebar).toContain('YOUR TASK');
    expect(sidebar).toContain('THE SITUATION');
    expect(sidebar).toMatch(/currentAct\.tagline/);
    expect(sidebar).toMatch(/currentChallenge\.objective \|\| currentChallenge\.brief/);
  });
});

// ── And now the same three things, for real ────────────────────────────────
//
// Everything above reads source text. These run the code, because for three of
// the six the observable effect is a sentence a student reads or a screen they
// do not have to sit through, and a test that watches the effect survives a
// refactor that a test watching the spelling does not.

describe('what the student actually gets', () => {
  it('answers a tool the course named, in the course\'s own words', async () => {
    const { runPipeline } = await import('../packages/engine/shell/exec.js');
    const { getPack } = await import('../packs/index.js');
    const pack = getPack('forensics-cli-101');
    const fsTree = pack.createFs('linux');
    const cwd = pack.manifest.linux.home;

    // `fls` is a Sleuth Kit tool this course names and does not simulate.
    // Without packTools the student is told it is not a command, which is
    // false, reads as "you typed it wrong", and sends them to retype a thing
    // they got right.
    //
    // This used to ask about `mmls`, which the pack now simulates as a command
    // of its own -- along with real `dd` -- because Act V used to be graded on
    // invented commands while courseTools told the student the real ones were
    // not available here.
    const withTools = runPipeline('fls disk.dd', cwd, fsTree, 'linux', {
      packTools: pack.manifest.courseTools,
      unsimulatedMessage: pack.manifest.messages.unsimulated
    });
    expect(withTools.output).toContain('including deleted ones');
    expect(withTools.output).not.toMatch(/command not found/i);

    const without = runPipeline('fls disk.dd', cwd, fsTree, 'linux', {});
    expect(without.output).not.toContain('including deleted ones');
  });

  it('uses the pack\'s wording for syntax this shell does not parse', async () => {
    const { runPipeline } = await import('../packages/engine/shell/exec.js');
    const { getPack } = await import('../packs/index.js');
    const pack = getPack('forensics-cli-101');
    const fsTree = pack.createFs('linux');
    const cwd = pack.manifest.linux.home;
    const own = pack.manifest.messages.unsupportedSyntax;

    // Find a construct the tokenizer refuses. If none of these is refused any
    // more that is good news for the shell, and this assertion has nothing
    // left to say -- so it says so rather than passing quietly.
    const refused = ['cat <(echo hi)', 'echo ${x:-y}', 'cat file &'].find(line =>
      runPipeline(line, cwd, fsTree, 'linux', {}).hasError
    );
    expect(refused, 'no unsupported syntax left to test the wording against').toBeTruthy();
    expect(runPipeline(refused, cwd, fsTree, 'linux', { unsupportedSyntaxMessage: own }).output)
      .toContain(own);
  });

  it('remembers the boot curtain per device, and shrugs when it cannot', async () => {
    const { hasSeenBoot, rememberBootSeen } = await import('../src/components/Boot.jsx');
    const original = globalThis.window;
    try {
      const store = new Map();
      globalThis.window = {
        localStorage: {
          getItem: (k) => (store.has(k) ? store.get(k) : null),
          setItem: (k, v) => store.set(k, String(v))
        }
      };
      expect(hasSeenBoot()).toBe(false);
      rememberBootSeen();
      expect(hasSeenBoot()).toBe(true);

      // A private window, a locked-down school profile, or blocked site data
      // make these throw. A start screen that will not render because it could
      // not read a preference is a far worse failure than one animation too
      // many, so both helpers swallow it and the full sequence simply plays.
      globalThis.window = {
        localStorage: {
          getItem: () => { throw new Error('blocked'); },
          setItem: () => { throw new Error('blocked'); }
        }
      };
      expect(hasSeenBoot()).toBe(false);
      expect(() => rememberBootSeen()).not.toThrow();

      // No window at all, which is what a server render or a test sees.
      globalThis.window = undefined;
      expect(hasSeenBoot()).toBe(false);
      expect(() => rememberBootSeen()).not.toThrow();
    } finally {
      globalThis.window = original;
    }
  });
});

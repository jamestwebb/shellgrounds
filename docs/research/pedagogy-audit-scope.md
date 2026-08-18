# Review: does this actually teach the command line?

## Read this before the rest — it changes what you are being asked to do

The prepended guardrail describes a defect hunt on a Tauri/Rust/SQLite desktop
app. Both parts are wrong for this run. Ignore them and read the following
instead.

**The software.** A browser game that teaches command-line basics. Vite + React
+ Tailwind, plain JavaScript, deployed as a static site on Netlify with a few
serverless functions. There is no Rust, no SQLite, and no real shell — the
terminal is a JavaScript simulation of `bash` and `cmd.exe` that runs entirely
in the page against a virtual filesystem.

**How a student uses it.** They pick a content pack, register a handle, and are
given a numbered list of challenges in a sidebar. Each challenge has a short
brief and optional hints. They type commands into the simulated terminal. A
challenge is solved by typing a matching command, by reaching a filesystem
state, or by finding a `FLAG{...}` token hidden in a file and submitting it.
Points accumulate on a leaderboard. Later acts unlock once enough of the
previous act is solved.

**Who you are for this review.** You are an expert in both the Linux shell and
the Windows command prompt, and you have taught beginners for years — high
school and undergraduate students who have never opened a terminal. You are
reviewing this as curriculum and as instructional design, not as code quality.

**This is not a bug hunt.** Do not report crashes, races, or performance unless
a defect directly damages the learning experience. Code correctness has already
been reviewed elsewhere. If the code is flawless and the teaching is weak, this
review must say the teaching is weak.

## The five questions, in priority order

1. **Does it teach the command line?** Take the three packs in `packs/` as the
   curriculum. Read every challenge in order. Does a student who finishes a pack
   come out able to work in a real terminal, or only able to complete this game?
   Name the specific transferable skills gained, and name what a beginner
   course should cover that is missing entirely.

2. **Does it help — is the instruction sound?** Judge the briefs, the hints, the
   ordering, and the post-command explanations against how beginners actually
   learn. Look for: concepts used before they are introduced; difficulty that
   jumps rather than climbs; challenges solvable by pattern-matching the brief
   without understanding; hints that give the answer instead of a next step;
   scaffolding that never fades, so the student is still being led at the end.

3. **Is it fun?** Be concrete and be honest. What would actually hold the
   attention of a 16-to-20-year-old for one class period, and what would make
   them disengage? Consider pace, the reward loop, the flag hunt, the
   leaderboard, and how failure feels. A leaderboard is not automatically
   motivating; say what it does to the student who is last.

4. **What should change?** This is the most useful part of your report. Give
   ranked, specific, implementable recommendations. Prefer "challenge
   `act2-pipe` should come after `act2-grep` because X" over "improve the
   ordering". Cover both content (what a pack should contain) and mechanics
   (how the game teaches, rewards, and corrects).

5. **Is it useful to a teacher?** Judge what an instructor gets: the pack
   format, whether they could author their own pack, the validator, the
   generated instructor guide, and the admin view. Would a teacher adopt this
   for a class of 30, and what would stop them?

## Files

The curriculum — read all of it, this is the substance of the review:

- `packs/forensics-cli-101/challenges.json` — 30 challenges, digital-forensics
  framing, Linux
- `packs/linux-fundamentals/challenges.json` — 40 challenges, general Linux
- `packs/windows-cmd-essentials/challenges.json` — 27 challenges, `cmd.exe`
- `packs/*/fs.*.js` — the virtual filesystem each pack explores
- `packs/*/help.json`, `packs/forensics-cli-101/commands.js` — in-game help and
  pack-specific commands
- `packs/*/README.md`, `packs/*/pack.json` — the pack's own description of itself

Each challenge object carries `brief`, `hints`, `points`, `act`, and a `success`
condition. `success.kind` is `command` (a regex over the typed line), `flag` (a
per-student token found in a file), or `state` (a predicate over the virtual
filesystem). Judge the brief and hints as teaching text, and judge the success
condition for whether it rewards understanding or rewards guessing.

How the game teaches around the challenges:

- `packages/engine/coach.js` — the explanation shown after a command runs
- `packages/engine/unknown-command.js` — what a student sees when they type a
  real command the simulator does not implement
- `src/components/ChallengeSidebar.jsx` — briefs, hints, progress, act gating
- `src/components/Terminal.jsx`, `src/components/CommandReference.jsx` — the
  terminal itself and the in-game command reference
- `src/components/Boot.jsx`, `src/components/Gate.jsx` — the first two minutes a
  student experiences
- `src/components/Leaderboard.jsx`, `src/components/BadgeCelebration.jsx` — the
  reward loop

What the simulated shell can actually do, which bounds what can be taught:

- `packages/engine/commands/linux/index.js`,
  `packages/engine/commands/windows/index.js` — every implemented command
- `packages/engine/shell/tokenizer.js`, `shell/exec.js` — pipes, redirection,
  quoting, `&&`, exit codes
- `packages/engine/complete.js` — Tab completion

For the teacher question:

- `README.md`, `DESIGN.md` — how the project presents itself
- `packages/engine/validate/packValidator.js`, `bin/gauntlet.js` — the tool that
  checks a hand-authored pack is solvable
- `scripts/build-instructor-guide.mjs` — generates an answer-key PDF
- `src/components/AdminOverview.jsx` — what an instructor sees during class

Ignore `src/engine/` and `src/data/challenges.js`. Those are a superseded copy
kept only until the migration finishes; `packages/engine/` and `packs/` are live.

## Your verdict is the deliverable

You are judging finished work, not surveying it. Reject by default. This passes
only if you would genuinely put it in front of your own students on Monday.

Answer each of the five questions in its own section, then end your report with
a VERDICT block in exactly this form:

    VERDICT: PASS | FAIL
    TEACHES-CLI: YES | PARTIALLY | NO — <one sentence>
    FUN: YES | PARTIALLY | NO — <one sentence>
    TEACHER-READY: YES | PARTIALLY | NO — <one sentence>
    TOP-3-CHANGES:
      1. <the single highest-value change, named specifically>
      2. …
      3. …

Rules for the verdict:

- "Pretty good" is a FAIL. "Acceptable" is a FAIL. "A solid start" is a FAIL.
- Every claim needs evidence: name the challenge id, the file, or the exact
  text you are judging. "The hints are too generous" is not evidence.
  "`act1-ls` hint 2 contains the literal answer `ls -la`" is evidence.
- Do not soften the report to be encouraging. An honest FAIL with three
  specific changes is worth more to us than a PASS.
- If a criticism applies to one pack but not the others, say which.

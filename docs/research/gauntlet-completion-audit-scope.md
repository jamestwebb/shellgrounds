# Audit scope: can every student actually finish The Gauntlet?

We maintain an educational browser game that teaches command-line basics to
absolute beginners (a university forensics course). Students register a handle,
type commands into a SIMULATED shell (JavaScript, no real execution), capture
FLAG{...} tokens, and submit them for points. We are hardening it before class
tonight and want a careful review of one question:

**Is there any path where a student who does the right thing fails to get
credit, or gets permanently stuck?**

This is a correctness/reliability review of completion paths, not a security
review. Please read the source and report concrete defects.

## Files

Challenge definitions and the truth about what "solved" means:
- src/data/challenges.js — every challenge: `brief`, `hints`, `points`, and a
  `success` object of kind `command` (regex over the typed line), `flag`
  (a per-user token the student must find and submit), or `state` (a predicate
  over the virtual filesystem). Verify each challenge is actually achievable by
  following its own brief and hints, and that its regex accepts the reasonable
  command variants a beginner would type (extra spaces, quotes, different flag
  order, relative vs. absolute paths, trailing arguments).

The simulated shell (shared by client and server):
- src/engine/tokenizer.js — quoting, pipes `|`, redirection `>`/`>>`/`2>`
- src/engine/pipeline.js — multi-stage execution, filesystem writes
- src/engine/exec.linux.js, exec.windows.js — the commands themselves
- src/engine/unknown-command.js — messages for unsimulated commands
- src/engine/fs.warren.js, fs.topside.js, fs-builder.js — the virtual filesystem
  the challenges refer to. Confirm every path a brief/hint mentions exists.
- src/utils/vfs-injector.js — splices per-user flags into files via
  `[[FLAG:challenge-id]]` placeholders. Confirm every flag-kind challenge has a
  reachable placeholder, and no placeholder is orphaned.

Scoring and progression:
- netlify/functions/submit-flag.js — server-side validation. For `command` and
  `state` kinds it RE-RUNS the student's command server-side (`replayCommand`)
  against a fresh filesystem before awarding points. Look for mismatches between
  what succeeds in the student's live session and what succeeds in that replay
  (working directory, installed-package state from `sudo apt-get install`,
  filesystem changes made by earlier commands, pipes/redirection).
- src/App.jsx — the client's command loop, auto-solve detection, act unlocking,
  session restore, and what it tells the student on failure.
- src/components/ChallengeSidebar.jsx — act gating, hints, flag submission.

## What to hunt

1. Any challenge whose `success` condition cannot be met by following its brief
   and hints, or that requires state the replay cannot reproduce.
2. Regexes that reject correct beginner variants (or accept obviously wrong ones).
3. Flag placeholders that never render, render as literal text, or are
   unreachable with the simulated commands.
4. Progression deadlocks: act-unlock thresholds vs. the number of challenges in
   an act (e.g. an act where the 80% rule is impossible or off-by-one), or a
   challenge that can be permanently locked out.
5. Client/server disagreement: a command the client counts as solved but the
   server rejects (or vice versa), including working-directory assumptions.
6. Silent failures — any path where the student gets no feedback at all.
7. Tokenizer/executor bugs that would make a correct command fail.

Report each finding with severity, file:line, the exact student action that
triggers it, and what the student experiences.

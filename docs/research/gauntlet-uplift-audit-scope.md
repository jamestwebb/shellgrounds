# IMPORTANT — EXECUTION INSTRUCTIONS (read first)

Do NOT produce an implementation plan, and do NOT ask for approval or wait for a
"Proceed" confirmation. This is a non-interactive run: any request for
confirmation will receive no answer and the run will be lost.

Begin reading the source immediately and output the FINAL REPORT as your only
deliverable, sorted by severity. Read the files before reporting; do not
speculate about code you have not opened.

# Audit scope: can a student get stuck in The Gauntlet after the uplift?

We maintain an educational browser game that teaches command-line basics to
absolute beginners. It has just been restructured from a single-curriculum app
into a reusable engine plus swappable content packs, and a large "shell
fidelity" change landed at the same time. We are hardening it before students
use it and want a careful review of one question:

**Is there any path where a student who does the right thing fails to progress,
or becomes permanently stuck?**

This is a correctness/reliability review. Please read the source and report
concrete defects with file:line and a reproduction.

## Architecture to review

New layering (the segmentation we want assessed):
- `packages/engine/` — domain-free engine. `shell/tokenizer.js` (quoting, pipes,
  redirection, lists), `shell/expand.js` (glob + variable expansion),
  `shell/exec.js` (pipeline + list execution, exit codes, streams),
  `shell/streams.js`, `vfs/builder.js` + `vfs/ops.js` + `vfs/path.js`
  (filesystem with mode/owner permissions), `commands/registry.js` and
  `commands/linux/index.js` + `commands/windows/index.js` (one registry driving
  execution, tab completion, and help), `validate/predicates.js` (declarative
  success conditions), `validate/packValidator.js` (proves a pack is solvable),
  `unknown-command.js`, `coach.js`.
- `packs/` — curriculum. Each pack has `pack.json` (acts, unlock policy, home
  dirs, user names, theme), `challenges.json`, `fs.linux.js` / `fs.windows.js`
  (virtual filesystem), optional `commands.js` (pack-supplied virtual commands)
  and `help.json`. Three packs: `forensics-cli-101`, `linux-fundamentals`,
  `windows-cmd-essentials`.
- `src/` — React app. `App.jsx` runs the command loop, detects challenge
  completion, gates acts, restores sessions, and switches packs.
- `netlify/functions/` — registration, session, per-user flag manifest, and
  `submit-flag.js`, which RE-EXECUTES the student's command server-side against
  a freshly built filesystem before awarding points.

## Assess the segmentation

1. Is the engine/pack boundary actually clean, or does engine code still depend
   on specific curriculum content (and vice versa)? Cite anything that would
   break a third-party pack author.
2. Is there duplicated logic that can drift between client and server —
   especially anything used both by `src/App.jsx` and `netlify/functions/
   submit-flag.js` (challenge completion rules, act unlocking, error detection,
   flag derivation, working-directory assumptions)? Divergence here means a
   challenge that completes in the browser but is rejected by the server.

## Progression blockers to hunt

3. **Challenge completion**: for each `success` shape (`kind: "flag"`,
   `predicate: commandMatches | outputMatches | fileExists | fileMatches |
   lineCountAtLeast | cwdIs | exitStatusIs | allOf | anyOf`), can a student
   satisfy it by following the brief and hints? Do the predicates accept the
   reasonable command variants a beginner types (extra spaces, quotes, relative
   vs absolute paths, different flag order, trailing arguments)?
4. **Client/server replay mismatch**: `submit-flag.js` replays the command with
   a fresh filesystem and the student's reported working directory. Find cases
   where the browser accepts but the replay rejects — state built by earlier
   commands (created files, installed packages, changed directory), pipes and
   redirection, or permission differences.
5. **Act progression**: unlock thresholds vs. challenge counts per act. Can any
   act become unreachable, or require 100% of the previous act?
6. **Permissions**: `vfs/ops.js` enforces mode/owner. Can a student be blocked
   from a legitimate action — writing in their home directory, using /tmp,
   reading a file a challenge requires?
7. **Silent failures**: any path where a correct action produces no feedback and
   no credit, or where output is silently wrong (a filter that does not filter,
   a redirect that does not write, a flag placeholder rendered literally).
8. **Session and pack state**: switching packs, resuming a session, or a token
   issued for one pack being used with another — can progress be lost or can a
   student land in an inconsistent state?

Report each finding with severity, file:line, the exact student action that
triggers it, and what the student experiences.

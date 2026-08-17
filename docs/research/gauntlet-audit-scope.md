# Audit scope: The Gauntlet — Forensics CLI 101 (educational CLI challenge site)

We are the maintainers hardening our own classroom web app before its first
deployment. It is a Vite/React SPA with Netlify Functions and a Postgres
backend. Students register a pseudonymous handle with a shared class password,
solve simulated-terminal challenges, and appear on a leaderboard. Please review
the SOURCE for correctness defects and for places where the intended safe
behavior is not fully enforced, so we can fix them before students use it.

## Files to review

Server (Netlify Functions):
- netlify/functions/register-handle.js — handle registration; intended: class
  password required, handle claimable exactly once, SFW-filtered.
- netlify/functions/session.js — session restore + rolling token refresh.
- netlify/functions/manifest.js — per-user flag manifest.
- netlify/functions/submit-flag.js — scoring; intended: flags validate only for
  the submitting user's own HMAC-derived values; command/state challenges are
  re-executed server-side (replayCommand) before points are awarded; a
  challenge can score at most once per player.
- netlify/functions/leaderboard.js, admin-overview.js — read models; intended:
  admin data only for handles in ADMIN_HANDLES.
- netlify/functions/utils/db.js — Neon Postgres + local-dev memory store.

Simulated-shell engine (pure JS, runs client AND server via the replay path):
- src/engine/tokenizer.js — quoting, pipes, stdout/stderr redirection parsing.
- src/engine/pipeline.js — multi-stage execution, VFS writes for redirection.
- src/engine/exec.linux.js, exec.windows.js — command implementations.
- src/engine/fs-builder.js, fs.warren.js, fs.topside.js — virtual filesystem.
- src/engine/crypto-utils.js — MD5/SHA-256/HMAC implementations, session token
  create/verify, per-user flag derivation. Confirm the implementations are
  correct (test vectors welcome) and that token verification cannot succeed for
  a token minted with different inputs.
- src/utils/vfs-injector.js — splices per-user flags into the VFS.

Client wiring:
- src/App.jsx — session bootstrap, command execution loop, solve bookkeeping,
  auto-advance; look for state races (stale closures, double submissions,
  desyncs between solvesMap/totalScore and the server).
- src/components/ChallengeSidebar.jsx, Terminal.jsx, Gate.jsx — hint reveal
  accounting, submission flows, keyboard handling.
- src/utils/api.js — fetch layer; response handling on non-JSON errors.

## Defect classes to hunt

1. Correctness bugs in the tokenizer/pipeline (quoting, redirection targets,
   escape handling, multi-stage stdin/stdout threading, VFS mutation of shared
   node objects between React state snapshots).
2. Places where the scoring intent above is not fully enforced by the code —
   e.g. inputs that let a submission validate without the corresponding work,
   duplicate-award windows, or replayCommand accepting commands that did not
   actually succeed. Flag any gap so we can close it.
3. Crypto implementation errors (HMAC padding, base32, MD5/SHA-256 edge cases,
   non-constant-time comparisons worth upgrading).
4. Server/client drift: values computed on both sides that can disagree
   (flag maps, hint penalties, act unlock logic, error-marker regexes).
5. React state-management races and stale-closure bugs in App.jsx.
6. DB-layer issues: the dev memory store's file persistence, missing awaits,
   unhandled promise rejections, SQL correctness in the Neon paths.

Report each finding with severity, file:line, and a concrete failure scenario.

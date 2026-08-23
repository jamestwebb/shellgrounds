# Post-build code and bug review — Netlify functions, branch `shellgrounds`

Assessment only. **No fix in this document has been applied.**

| | |
|---|---|
| Reviewer | `agy` / Antigravity, **Gemini 3.1 Pro (High)** — non-Anthropic, via the `gemini-audit` skill |
| Sandbox | throwaway source-only `git worktree` at ref `shellgrounds`, 168 tracked files, deleted after the run |
| Privacy pre-flight | passed — `.env` is gitignored; only `.env.example` (a template, no live values) is tracked |
| Reviewer report | `docs/research/gemini-audit-shellgrounds-server.md` (7 findings) |
| Verification | every finding driven through the **real handlers** via `tests/functions.helpers.js` |
| Baseline | `npx vitest run` → 22 files, **379 passed**, before and after this review |
| Result | **14 confirmed · 2 plausible · 12 rejected** |

The reviewer produced 7 findings. Three were correct in substance, two were
correct in mechanism but wrong about severity or reachability, and two were
wrong. Verifying them turned up seven further defects the reviewer missed,
including the highest-severity one on this page.

---

## Verdict on each of the seven scope questions

| # | Scope question | Verdict |
|---|---|---|
| 1 | Instructor handle protection | **The guard itself is correct. The window before it exists is not.** See C1. |
| 2 | Pack binding | **Correct.** Cross-pack scoring works, act gating stays inside one pack, nothing trusts the token's `packId` for authorisation. |
| 3 | Compare-and-swap | **No double-score, no false success, no spin.** But it gives up after 5 tries (C3) and has one unguarded branch (C7). |
| 4 | Client-supplied `cwd` | **Traversal, separators, case, length and type are all handled.** The residual is grading fidelity, not scoring (C10). |
| 5 | Hint pricing | **Correct.** The client cannot lower the penalty by any route — except the legacy-key seam in C6. |
| 6 | Flag submission | **Correct.** No cross-challenge reuse, no cross-student collision in 8 000 derived flags. |
| 7 | Corrupt-store guard | **Correct for malformed JSON. Blind to a truncated file** (C5). |

---

# Confirmed findings

## C1 — CRITICAL — A student can own the gradebook by registering before the teacher configures `ADMIN_HANDLES`

`netlify/functions/register-handle.js:71` · `netlify/functions/utils/admin.js:5-13`

The setup-code guard only fires when `isAdminHandle(cleanHandle)` is already
true, and that depends entirely on `ADMIN_HANDLES` being set **at the moment of
registration**. `.env.example` presents `ADMIN_HANDLES` as optional and
documents `ADMIN_HANDLES=""` as a supported state, so the gap is the documented
default, not an exotic misconfiguration.

Concrete inputs → wrong outcome (demonstrated end to end):

```
env: ADMIN_HANDLES unset, INSTRUCTOR_SETUP_CODE set
POST /api/register-handle {"handle":"profsmith","classPassword":"<class password>"}
  -> 200  (no setupCode supplied, none demanded — isAdminHandle() said "ordinary student")

... the teacher now sets ADMIN_HANDLES=profsmith and redeploys ...

GET /api/session              -> isAdmin: true
GET /api/admin-overview?view=answers  -> 200   full answer key
GET /api/admin-overview?format=csv    -> 200   full gradebook
```

The student never possesses `INSTRUCTOR_SETUP_CODE` and is never asked for it.
This is the original demonstrated bug, reachable through the time-of-configuration
window that the fix does not cover.

Severity for a school: **critical**. It hands one student every other student's
scores and the answer key, and the natural deployment order — put the site up,
try it, configure the instructor account afterwards — walks straight into it.

Smallest correct fix: make the claim, not the configuration, authoritative.
Record `isInstructor` on the player record at creation time and have
`isAdminHandle` require **both** the `ADMIN_HANDLES` membership and that stored
flag. A handle registered before configuration then stays an ordinary student
for ever. A one-line alternative that also closes it: refuse registration
entirely while `ADMIN_HANDLES` is unset, matching how `CLASS_PASSWORD` already
fails closed at `register-handle.js:46`.

The reviewer raised this one, but with the wrong example — it claimed a student
could register the literal handle `admin`. They cannot: `checkSFW` rejects any
handle containing `admin` (`packages/engine/sfw-filter.js:18`), verified. The
severity call was right; the mechanism was not.

---

## C2 — HIGH — `PACKS[x]` accepts `Object.prototype` keys, so `getPack()` can return the `Object` constructor and `manifest.js` throws uncaught

`packs/index.js:46` · `netlify/functions/manifest.js:37,41` ·
`netlify/functions/admin-overview.js:81` · `netlify/functions/register-handle.js:87` ·
`netlify/functions/leaderboard.js:38`

`GENERATED_PACKS` is an object literal, so it inherits from `Object.prototype`.
Every pack-id guard in the codebase is a bare truthiness test on `PACKS[x]`, and
`constructor`, `__proto__`, `toString`, `valueOf`, `hasOwnProperty` and
`isPrototypeOf` all pass it. `getPack()` then returns whatever that lookup
yielded — for `constructor`, the `Object` function itself.

```
GET /api/manifest?packId=constructor
  -> TypeError: pack.challenges is not iterable, thrown OUT of the handler
     (manifest.js is the one function with no try/catch)
```

It persists, because `register-handle.js:87` uses the same guard:

```
POST /api/register-handle {"handle":"student2", "classPassword":"...", "packId":"constructor"}
  -> 200, packId: "constructor"   baked into the signed session token
GET  /api/session   -> 200, packId: "constructor"   (client stores it)
GET  /api/manifest  -> TypeError, uncaught          (no query parameter needed)
```

The student's flags never load again on any device using that token, and the
only escape is clearing browser storage. No data is disclosed and no score is
altered.

Severity for a school: **high**. It is self-inflicted rather than an attack on
others, but it is an unhandled exception in a serverless handler reachable from
an unprivileged request, and the broken state is signed into a 72-hour token.

Smallest correct fix: one predicate, used by all five call sites.

```js
export const hasPack = (id) => Object.prototype.hasOwnProperty.call(PACKS, id);
```

and `getPack` returns `hasPack(packId) ? PACKS[packId] : PACKS[DEFAULT_PACK_ID]`.
`getPackForChallenge` is already safe — `CHALLENGE_INDEX` is a `Map`.

Missed by the reviewer.

---

## C3 — MEDIUM — Ten simultaneous submissions from one student lose five solves and return five 500s

`netlify/functions/utils/store.js:20,189-219` · `netlify/functions/submit-flag.js:271`

`addSolve` retries a lost compare-and-swap `RETRIES = 5` times with **no backoff
and no jitter**, then throws. `submit-flag.js` catches the throw and answers
`500 {"error":"Internal error processing submission"}`. The student is told the
server broke; the solve is simply gone.

Driven through the real handler — one student, ten act-1 challenges submitted
concurrently:

```
statuses: 200,200,200,200,200,500,500,500,500,500
persisted solves: 5 of 10
```

Measured threshold: exactly `RETRIES` writes survive, regardless of load
(n = 6 → 5, n = 40 → 5). Contention is per-handle only, so one busy class does
not cause it; a client that batches or replays queued submissions does.

The good news, verified: it **never** double-scores (six concurrent solves of one
challenge yield exactly one `alreadySolved:false`), never spins, and never
reports success without persisting — reported successes equalled persisted
records in every run.

Smallest correct fix: exponential backoff with jitter between attempts, and
raise `RETRIES`. `await new Promise(r => setTimeout(r, 2 ** attempt * 10 + Math.random() * 20))`
before the next iteration turns a tight collision loop into a spread one.

Missed by the reviewer.

---

## C4 — MEDIUM (dev only) — The local file backend loses 200 of 450 writes across processes, silently, with no error

`netlify/functions/utils/store.js:60-67,78-88`

`setJSON` reads the whole map, checks `onlyIfMatch` against **one key**, then
`save(all)` rewrites **every** key from that stale snapshot. Within one process
this is safe only because `readFileSync`/`writeFileSync`/`renameSync` are
indivisible. Across processes it is not, and the per-key ETag cannot help,
because the clobbering happens to the other keys.

Three Node processes, 150 distinct `addSolve` calls each, one shared blob file:

```
writes reported successful: 450
writes actually persisted:  250
200 solves reported OK but LOST — and every call returned success
```

`scripts/dev-functions.mjs` is a single process, so the shipped dev stack does
not trigger this; two terminals, or a stale process that survived
`start-dev.sh`'s `pkill`, would. Production uses Netlify Blobs and is unaffected.

Smallest correct fix: an exclusive lock around load → check → save. `fs.mkdirSync`
on a `.lock` directory, or `fs.openSync(lock, 'wx')`, with a bounded spin, is
enough and adds no dependency.

Reviewer's finding, and its mechanism was right. The reviewer described it as a
lost ETag race; the sharper statement is that `save(all)` makes the ETag
irrelevant for every key except the one being written.

---

## C5 — MEDIUM (dev only) — A truncated (zero-byte) blob file is treated as an empty store and overwritten, erasing the class

`netlify/functions/utils/store.js:47`

The guard at `store.js:48-57` is emphatic that a parse failure must never fall
back to `{}`, because the next `setJSON` would erase every player and score. The
line immediately above it does exactly that for an empty file:

```js
if (raw.trim() === '') return {};
```

A zero-byte file is the classic outcome of a crash, a full disk, or a stray
shell redirect — precisely the situations the guard exists for.

```
store contains: players/victim2, solves/victim2
truncate the file to 0 bytes
addSolve(...)  ->  succeeds, no error
file after:    {"solves/victim2":{...}}
players/victim2 survived?  false
```

Malformed JSON is handled correctly, verified: the file is left byte-for-byte
intact and a clear error is thrown. Only the empty case leaks through. The
temp-file-and-rename path itself is sound — same directory so the rename is
atomic, the temp name carries the pid, and no stray temp files remain after a
failure.

Smallest correct fix: delete the special case. `ENOENT` at `store.js:44` already
returns `{}` for a store that does not exist yet, which is the only legitimate
empty case; an existing-but-empty file should throw exactly like a corrupt one.

Missed by the reviewer.

---

## C6 — MEDIUM — A pre-pack-scoping hint record is shadowed by the new scoped key, collapsing the penalty

`netlify/functions/utils/store.js:279` vs `:290-293`

`hintCountFor` reads the scoped key `<packId>/<challengeId>` and falls back to
the legacy bare `<challengeId>`. `openHint` reads **only** the scoped key. So
re-opening any hint writes a scoped count of 1 that permanently shadows a larger
legacy count.

```
planted legacy record:      {"l1-boss": 2}      (both hints already opened)
hintCountFor sees:          2
POST /api/hint {"challengeId":"l1-boss","index":0}   -> 200
store now:                  {"l1-boss": 2, "linux-fundamentals/l1-boss": 1}
hintCountFor NOW sees:      1                   <- penalty basis collapsed
```

The student pays for one hint instead of two on a challenge where they read
both. `addSolve` does **not** have this bug — it goes through `readSolveEntry`,
which checks both key shapes, verified. The asymmetry is the defect.

Severity depends on whether any live store still holds legacy hint records. If
none do, this is dead code; if any do, it silently over-credits.

Smallest correct fix: one line at `store.js:279` —

```js
const current = hintCountFor(hints, packId, challengeId);
```

so the scoped record adopts the legacy count instead of starting from zero.

Reviewer's finding, correct as stated. Its best catch.

---

## C7 — MEDIUM (latent) — When the backend returns no ETag, the write becomes unconditional and a dropped solve still reports success

`netlify/functions/utils/store.js:211` (and the identical `:283` in `openHint`)

```js
const opts = etag ? { onlyIfMatch: etag } : (data ? {} : { onlyIfNew: true });
```

`data` present with `etag` absent degrades to a last-write-wins overwrite, and
`res.modified !== false` then reports success to both racers.

Verified by substituting a backend whose `getWithMetadata` omits `etag` (loaded
through a Node module hook, driving the real `store.js`):

```
two concurrent solves     -> both reported alreadySolved:false
write kinds               -> compare-and-swap: 0 | UNCONDITIONAL: 2
persisted                 -> ["linux-fundamentals/B"]
two 200-OK successes, one solve silently DROPPED
```

This is not purely hypothetical. `@netlify/blobs@10` builds its result as
`etag: res?.headers.get("etag") ?? void 0` (`node_modules/@netlify/blobs/dist/main.js:145,187`),
so any response that reaches the client without an `ETag` header produces
exactly this state. Today's service does send one, which is why the branch is
latent rather than active.

Smallest correct fix: treat "record exists but has no ETag" as a hard failure
rather than a licence to overwrite — throw, or retry, but never fall through to
`{}`. `onlyIfNew` for the not-yet-created case stays correct.

Reviewer's finding. Its severity call of HIGH assumed the branch was live; it is
reachable but not currently taken.

---

## C8 — MEDIUM — A whitespace-only `INSTRUCTOR_SETUP_CODE` or `CLASS_PASSWORD` is matched by any whitespace string

`netlify/functions/register-handle.js:50,80`

Both comparisons trim **both sides**:

```js
if (!classPassword || classPassword.trim() !== expectedPassword.trim())
if (!setupCode    || String(setupCode).trim() !== expectedSetup.trim())
```

A value of `"   "` is truthy, so the `!expectedSetup` fail-closed branch at
`register-handle.js:73` does not fire, and `"   ".trim()` is `""`, which any
whitespace input also trims to.

```
env INSTRUCTOR_SETUP_CODE = "   "
POST /api/register-handle {"handle":"profsmith","classPassword":"...","setupCode":" "}
  -> 200, isAdmin: true
GET /api/admin-overview -> 200      full gradebook
```

The same holds for `CLASS_PASSWORD = "  "` with `classPassword: "\t"`. A value
pasted into the Netlify UI with only whitespace in it is a realistic way to get
there, and it currently reads as configured.

Smallest correct fix: trim the environment value once at read time and treat the
result as unset when empty — `const expectedSetup = (process.env.INSTRUCTOR_SETUP_CODE || '').trim();`
then `if (!expectedSetup)` catches it. Same for the class password.

Missed by the reviewer.

---

## C9 — MEDIUM — An `ADMIN_HANDLES` value containing a reserved word makes the instructor account permanently unclaimable, silently

`packages/engine/sfw-filter.js:18-24` reached from `netlify/functions/register-handle.js:57`

`checkSFW` runs before the admin guard and rejects any handle containing
`admin`, `moderator`, `staff`, `system`, `support`, `official` or `root`.
`ADMIN_HANDLES` is not checked against that list at any point.

```
env ADMIN_HANDLES = "admin_prof", INSTRUCTOR_SETUP_CODE set
teacher: POST /api/register-handle {"handle":"admin_prof", ..., "setupCode":"<correct>"}
  -> 400 {"error":"Handle cannot contain reserved term \"admin\""}
```

Nobody can ever hold that handle, so `isAdminHandle` is never satisfiable, so
the gradebook, the answer key and the triage view are unreachable for the whole
term. `ADMIN_HANDLES=admin` is the single most likely value a teacher would
choose, and nothing warns them. This fails closed, which is the right direction,
but it fails silently at the worst moment.

Smallest correct fix: validate `ADMIN_HANDLES` entries through `checkSFW` at
startup and log a loud, specific error naming the rejected entry; or exempt
configured instructor handles from `BLOCKED_PATTERNS` (they are named by the
site owner, not chosen by a student).

Missed by the reviewer.

---

## C10 — LOW — 27 challenges can be scored from a client-chosen directory that makes the check trivially true

`netlify/functions/submit-flag.js:65-73`

`startingCwd` accepts the browser's `cwd` whenever it names a real directory and
the challenge is not `cwdIs`. For a challenge graded only on its output, that
lets the student pick the directory that makes the intended lesson unnecessary.

```
l1-cat teaches relative paths: "cat Documents/notes.txt" from /home/student
POST /api/submit-flag {"challengeId":"l1-cat","commandText":"cat notes.txt",
                       "cwd":"/home/student/Documents"}
  -> 200, points 15
```

A weak `commandMatches` does not save it either — `l1-glob`'s pattern is just
`\*\.js`, so `ls *.js` from `/home/student/projects/web` scores a challenge whose
point is `ls projects/web/*.js` from home:

```
POST /api/submit-flag {"challengeId":"l1-glob","commandText":"ls *.js",
                       "cwd":"/home/student/projects/web"}   -> 200
```

Across all three packs, **27 of 104** challenges are non-flag with neither a
`cwdIs` predicate nor a `commandMatches`, so the client's directory can change
the verdict.

Severity for a school: **low**. The student still runs a real command that
produces the real output; what they skip is the path handling the challenge
meant to teach. It is a grading-fidelity gap, not score inflation, and it is
consistent with the design note at `submit-flag.js:59-64`.

Everything else about the `cwd` guard held under attack, verified: `..`
traversal, `.` segments, uppercase paths, a 400-character path and a
2 000-element path all fail `stat` and fall back correctly; a non-string (`null`,
`42`, `{}`, `["/home/student"]`) is caught by the `typeof` test at
`submit-flag.js:70` — which matters, because `stat` resolves every one of those
to `/` if it ever reaches it; and all four `cwdIs` challenges reject `echo hi`
with a forged `cwd`.

Smallest correct fix (content, not code): give every path-teaching challenge a
`commandMatches` that pins the path form. If a code-side fix is wanted, honour
the client `cwd` only when the challenge opts in with a flag such as
`allowClientCwd: true`.

Reviewer raised the general area, but its stated mechanism — a relative-path
`fileExists` satisfied from another directory — does not exist: **zero** shipped
challenges use a relative path in any file predicate, checked across all three
packs.

---

## C11 — LOW — A non-string `flag` or `commandText` produces a 500

`netlify/functions/submit-flag.js:157,173-174,196`

```
POST /api/submit-flag {"flag": 5}
  -> 500 {"error":"Internal error processing submission"}     TypeError: flag.trim is not a function
POST /api/submit-flag {"challengeId":"l1-ls","commandText":{}}
  -> 500 {"error":"Internal error processing submission"}     TypeError: commandText.trim is not a function
```

The response body leaks nothing — the stack stays in the server log — so this is
robustness, not disclosure. Smallest correct fix: coerce once at the top,
`const flagStr = typeof flag === 'string' ? flag : ''`, likewise `commandText`.

Missed by the reviewer.

---

## C12 — LOW — `/api/leaderboard` publishes the class roster with no authentication

`netlify/functions/leaderboard.js:31-38`

Unlike every other function, `leaderboard.js` never reads the `Authorization`
header. An anonymous request returns every registered handle, each score, solve
count, earned badges and a `lastSeen` timestamp:

```
GET /api/leaderboard        (no token)
-> 200 {"totalPlayers":2,"leaderboard":[{"rank":1,"handle":"alice",...,"lastSeen":"..."},...]}
```

For a scoreboard this is arguably the point, and handles are pseudonyms rather
than names. But `lastSeen` is an activity log for identifiable minors if the
class uses recognisable handles, and the endpoint is `Cache-Control: public`.
Worth a deliberate decision rather than an accident.

Smallest correct fix: require a valid session token, exactly as `session.js`
does. Everyone who should see the board already holds one.

Missed by the reviewer.

---

## C13 — LOW — `index: null` silently opens hint 0

`netlify/functions/hint.js:34-35`

`Number(null)` is `0`, which passes `Number.isInteger(i) && i >= 0`, so a request
with a null index opens and records the first hint the student never asked for.
Every other bad value is handled correctly, verified: `-1` and `1.5` → 400;
`999`, `Number.MAX_SAFE_INTEGER` and `1e21` → 404; `"1"`, `"0x1"`, `"1e0"`,
`true` and `[1]` coerce to a valid in-range index.

Smallest correct fix: `if (!challengeId || typeof index !== 'number' || !Number.isInteger(index) || index < 0)`.

Missed by the reviewer.

---

## C14 — LOW — `startingCwd` returns the client's raw string instead of the canonical path it validated

`netlify/functions/submit-flag.js:72`

```js
return st.exists && st.isDir ? clientCwd : fallback;
```

`stat` already resolved the path and returned the real key in `st.path`;
discarding it means the replay runs with whatever spelling the client sent.
`/home/student/Documents/` (trailing slash) and `\home\student\Documents`
(backslashes, on a Linux challenge) both validate and are then passed through
verbatim. Nothing exploitable follows today, because no shipped predicate
resolves a relative path, but it makes C10 harder to reason about.

Smallest correct fix: `return st.exists && st.isDir ? st.path : fallback;`

Missed by the reviewer.

---

# Plausible — real in the code, not demonstrated to bite

**P1 — `csvCell`'s prefix list omits space and newline.** `admin-overview.js:61`
guards `/^[=+\-@\t\r]/`. Not reachable today: `checkSFW` trims and enforces
`^[a-zA-Z0-9_-]+$`, so ` =cmd`, `=cmd`, `@SUM` and `\t=x` are all rejected at
registration, verified, and the one dangerous-looking handle that does get
through (`-cmd`, `-1-1`, `-2-3-4-5`) is correctly emitted as `"'-cmd"`. The
other column is a server-generated ISO timestamp. It becomes real the moment the
handle charset widens or a free-text column is added. The reviewer rated this
MEDIUM and claimed DDE execution via ` =cmd|' /C calc'!A0` — that handle cannot
be registered, and the pipe and bang are outside the charset regardless. Adding
` ` and `\n` to the class costs nothing.

**P2 — `openHint` shares C7's no-ETag branch** (`store.js:283`). The same
unconditional-overwrite fall-through exists for hint records, which would lose a
hint-opened record and under-charge the student. Same mechanism as C7, but only
the `addSolve` half was demonstrated.

---

# Rejected — checked and not true

1. **Reviewer: a student registers the literal handle `admin` while `ADMIN_HANDLES` is unset.** `checkSFW` rejects it — `400 Handle cannot contain reserved term "admin"`. The severity was right; see C1 for the mechanism that actually works.
2. **Reviewer: `submit-flag.js` passes the client `cwd` "blindly" for all challenges, satisfying a relative `fileExists`.** It is existence-checked, type-checked, length-capped and exempted for `cwdIs`; and zero shipped challenges use a relative path in any file predicate. See C10 for the real, narrower version.
3. **Reviewer: CSV injection via a handle beginning with a space.** No handle can contain a space anywhere. Downgraded to P1.
4. **Reviewer: the N+1 in `leaderboard.js` and `admin-overview.js` "will exhaust serverless execution time limits".** Measured at classroom scale: 41 players → leaderboard 2 ms, admin overview 3 ms, triage 2 ms. Against real Blobs, ~80 sequential round-trips is perhaps 2–4 s — slow, worth a `Promise.all`, nowhere near a timeout. A performance nit, not a defect. (Its cited line numbers were also wrong.)
5. **`isAdminHandle` and the registration guard disagreeing.** They call the same function on the same string. Eleven variants held: exact, `UPPERCASE`, `MiXeD`, leading space, trailing space, tab-wrapped, wrong code, numeric code, array code, padded code, and no code. Unicode lookalikes are impossible — the charset is ASCII-only.
6. **Timing attack on the setup code or class password.** Non-constant-time `!==`, but remote timing on a short string over HTTPS in a serverless cold-start environment is not a school threat model. Noted, not filed.
7. **Unset or empty `INSTRUCTOR_SETUP_CODE` opening the guard.** Both fail closed with 403 and a clear server-log line. Only the whitespace-only case fails, and that is C8.
8. **Double-scoring, dropped writes, spinning, or false success in the CAS loop.** Six concurrent solves of one challenge → exactly one `alreadySolved:false`. Across n = 6…40, reported successes equalled persisted records every time. The failure mode is C3, and it is loud, not silent.
9. **Two functions racing on one record.** `submit-flag` writes `solves/<handle>`, `hint` writes `hints/<handle>`. Different keys; no contention.
10. **Traversal, separator, case, symlink-shaped and over-long `cwd`.** `/home/student/../../etc`, `/home/student/./Documents`, `/HOME/STUDENT/Documents`, a 400-character path and a 400-segment path all fail `stat` and fall back to the author's directory.
11. **Client influence over the hint penalty.** `openHint` is monotonic — `Math.max(current, index+1)` — so the client can only ever raise it. Re-opening index 0 after opening index 1 leaves the record at 2. Nothing in the submission body (`hintPenalty`, `hintsUsed`, `points`, `earnedPoints`) is read; `submit-flag.js:264` prices from the server's own record.
12. **A flag scoring the wrong challenge, or colliding across students.** A flag submitted with a `challengeId` is checked against that challenge only (`submit-flag.js:178-180`) — `flag(act1-hidden)` sent as `challengeId=act1-cd` → 400. One student's flag rejected for another. 8 000 derived flags across 400 synthetic students × 3 packs: **zero collisions**.
13. **Students reaching `admin-overview`.** All four views → 403 for a student token, 401 with no token, 401 with a garbage token, 401 for a token signed with the wrong secret, 401 for a hand-built unsigned token. `view=student&handle=__proto__` → 404.
14. **Resource exhaustion at classroom scale.** One `submit-flag` costs 1.8 ms including the VFS rebuild, per-challenge HMAC derivation and flag injection. A 1 MB `commandText` costs 129 ms; 1 000 pipes, 1 000 `||`, 20 000 quote characters and 500 globs are all under 20 ms. A wrong flag with no `challengeId` — the full cross-pack HMAC scan — is 0.5 ms. No superlinear path found.
15. **Legacy solve keys crossing pack boundaries in the act gate.** `submit-flag.js:232-237` admits legacy keys from any pack, but the gate then intersects them with *this* pack's challenge ids, and ids are globally unique (enforced at `packs/index.js:24-39`). Correct as written.

---

# Recommended order of work

1. **C1** — before this branch is used with a real class, in any form.
2. **C2**, **C8**, **C9** — small, self-contained, each one line to a few lines.
3. **C3**, **C6**, **C7** — the store layer, best done as one pass.
4. **C5**, **C4** — the dev backend; C5 is a deletion, C4 needs a lock.
5. **C11**, **C13**, **C14**, **C12**, **P1** — hardening.
6. **C10** — a content decision, not a code fix.

Nothing here has been changed. `npx vitest run` is green at 379 tests.

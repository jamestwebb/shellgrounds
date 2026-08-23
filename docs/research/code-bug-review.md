# Code & bug review — auth, scoring, and pack-binding subsystem

Third-party adversarial review (agy / Gemini 3.1 Pro High, non-Anthropic) plus
local adversarial verification. Assessment only — **no fixes applied**.

Scope: `netlify/functions/{submit-flag,session,register-handle,leaderboard,admin-overview,manifest}.js`,
`netlify/functions/utils/{store,admin}.js`, `packages/engine/{crypto-utils,sfw-filter}.js`,
`packs/index.js`, `src/utils/api.js`. Ref `9c643e7`.

Severity is calibrated to **a classroom scoreboard**, not to a bank. "HIGH" here
means "an instructor would have to re-grade or a student sees another student's
data", not "money moves".

---

## 1. Gate status

| Item | Result |
|---|---|
| `agy models` | exit 0, model list returned |
| Reviewer model | Gemini 3.1 Pro (High) — non-Anthropic, as the gate requires |
| Isolation | throwaway source-only `git worktree`, deleted after the run |
| Deny-list pre-flight | passed, no secret/DB/env file tracked |
| Reviewer output | `docs/research/gemini-audit-authscore.md` (5 findings), `.err` empty |
| Scope input | `docs/research/auth-scoring-audit-scope.md` |

**Ref note.** The wrapper audits a worktree at `HEAD` (`9c643e7`); the working
tree carries uncommitted changes. In the 12 scoped files the only non-comment
deltas are exactly the known-issue #7 fixes (`normalizeSolve` in
`admin-overview.js` and `submit-flag.js`, the leaderboard weekly-window NaN
test, `p.createdAt` → `p.created_at`) plus a licence-header sweep across the
repo. So agy reviewed the code *without* those fixes and correctly did not
report them. **All line numbers below are against the working tree**, which is
also what every harness imported. Nothing in this session modified any source
file; the 78-file working-tree diff predates it.

agy ran and returned. It found 5 defects and explicitly cleared three areas
(token shapes, constant-time compare, hint-penalty bounds). Verification
confirmed 3 of its 5, downgraded 1, and split 1. Local verification added 6
findings agy missed, including two score-integrity defects.

**Counts: 11 CONFIRMED · 3 PLAUSIBLE · 9 REJECTED.**

Verification harnesses (throwaway, not committed) live in the session
scratchpad: `h1.mjs` (authorization, CSV, cwd), `h3.mjs` (scoring, races),
`h4.mjs` (crypto, storage). All import the real modules and drive the real
Netlify handlers with real `Request` objects against the real `fileBackend`
store.

---

## 2. Confirmed findings, ranked

### C1 — HIGH — A student can register the instructor's handle and become the instructor

`netlify/functions/register-handle.js:41-56` · `netlify/functions/utils/admin.js:12-14` ·
`netlify/functions/admin-overview.js:31-33`

Instructor identity is *only* "your handle string appears in `ADMIN_HANDLES`".
Registration is first-come, gated by nothing but the class password — which every
student has by design. `register-handle.js` never consults `adminHandles()`.
`checkSFW` blocks the literal words `admin`, `root`, `staff`, `moderator`, but
`ADMIN_HANDLES` holds a real name like `prof_webb`, which passes every filter.

**Demonstrated** (`h1.mjs`, `ADMIN_HANDLES=prof_webb`):

```
F1 register prof_webb            -> 200  {"success":true,"handle":"prof_webb","token":"cHJvZl93ZWJi…"}
F1 admin-overview as squatter    -> 200  {"totalPlayers":…,"playerSummaries":[…],"challengeStats":[…]}
F1 session.isAdmin               -> true
```

One POST with the class password buys the whole gradebook (every handle, every
score, every solve time), the answer-key admin tab, and the act-gate bypass at
`submit-flag.js:180`.

`DESIGN.md:422` treats this as handled — *"James claims his own handle +
ADMIN_HANDLES on day one."* That is a procedure, not a control. It fails to a
typo in the env var, to an instructor who never registers because they only use
the admin view, and to a second instructor added mid-semester. `admin-overview`
itself is correctly gated; the hole is that anyone can obtain the gating identity.

**Smallest correct fix.** In `register-handle.js`, after `checkSFW`, refuse an
admin handle unless a second secret is supplied:

```js
if (isAdminHandle(cleanHandle) && (req.headers.get('x-instructor-key') || '') !== process.env.INSTRUCTOR_KEY) {
  return json(403, { error: 'That handle is reserved.' });
}
```

Cheaper stopgap with no new env var: refuse registration of any handle in
`ADMIN_HANDLES` outright, and have the instructor's account created by the
deploy/seed step instead of the public form.

---

### C2 — MEDIUM-HIGH — Concurrent solves are silently lost, and the student is told they scored

`netlify/functions/utils/store.js:89-107`

`addSolve` is read-modify-write on a single blob per student
(`solves/<handle>`), with no compare-and-set. `submit-flag.js` returns
`success: true` with the point value *before* knowing whether the write survived.

The file header calls this "acceptable by design… the losing write is
re-earnable". Verification shows the failure is larger and quieter than that
comment implies.

**Demonstrated** (`h3.mjs`, four concurrent submits for four different act-2
challenges by one student):

```
F7 responses: [["l2-grep",20],["l2-grep-i",20],["l2-grep-v",25],["l2-wc-l",20]]
F7 solves before 9  after 10  expected 13
F7 act-2 ids actually stored: [ 'l2-wc-l' ]
```

Four HTTP 200s awarding 85 points; 65 points reached the store as 20. The
student has no signal that anything was dropped — the UI showed four successes —
so "re-earnable" never happens in practice. Two browser tabs, a flaky connection
that retries, or any client that batches pending submissions reproduces this.

**Smallest correct fix.** One blob per solve —
`solves/<handle>/<challengeId>` — so concurrent writes touch disjoint keys, and
`getSolves` becomes a prefix `list`. That removes the race outright rather than
narrowing it. (agy proposed the same shape.) A cheaper mitigation that does not
remove the race: re-read after write and return `alreadySolved`/a retry hint if
the record is missing.

---

### C3 — MEDIUM — The hint penalty is whatever the student says it is

`netlify/functions/submit-flag.js:106, 199-204`

`hintsUsed` arrives in the request body. The server keeps no record of which
hints a student actually opened, so the penalty is self-declared.

**Demonstrated** (`h3.mjs`, identical command, identical challenge, two students):

```
F5 honest declares hintsUsed=2 -> {"challengeId":"l2-grep","points":10}
F5 liar   declares hintsUsed=0 -> {"challengeId":"l2-grep","points":20}
```

Same work, double the score. Across `linux-fundamentals` the paid hints total
10-15 points each on 29 challenges — several hundred points of graded difference
between a student who tells the truth and one who edits one JSON field. For a
graded artefact that is the whole point of the penalty mechanic being defeated.

**Smallest correct fix.** Record hint reveals server-side: a `POST /api/hint`
that returns the hint text and appends `{challengeId, hintIndex}` to
`hints/<handle>`; `submit-flag` then computes the penalty from the store and
ignores the client field. Until that exists, the penalty column is advisory and
should not be presented to students as enforced.

---

### C4 — MEDIUM — Client-supplied `cwd` satisfies every `cwdIs` challenge without the command

`netlify/functions/submit-flag.js:58-60` (cwd accepted) · `:136-145` (`cwd: res.newCwd || cwd`) ·
`packages/engine/validate/predicates.js` `cwdIs`

`replayCommand` accepts the client's `cwd` verbatim as the *starting* directory
whenever it is a string of length 1..299. `runPipeline` returns that same value
as `newCwd` when the command does not `cd`. The predicate then evaluates against
it. The input the verifier is supposed to prove is handed to it by the party
being verified.

**Demonstrated** (`h1.mjs`, pack `linux-fundamentals`):

```
F2 l1-cd        via {commandText:"echo hi", cwd:"/home/student/Documents"} -> 200, 15 points
F2 l1-cd-parent via {commandText:"echo hi", cwd:"/home/student"}           -> 200, 15 points
```

Affects 4 challenges (`l1-cd`, `l1-cd-parent`, `w1-cd-nav`, `w1-cd-parent`),
60 points, and it means those four challenges verify nothing at all. Every other
predicate in the three packs uses an **absolute** path, so the blast radius stops
there — a `fileExists`/`dirExists`/`fileHasMode` challenge cannot be moved by
`cwd`. Kept at MEDIUM rather than HIGH because the honest answer (`cd Documents`)
is no harder than the forgery; the defect is that the proof is not a proof.

**Smallest correct fix.** For a `cwdIs` challenge, ignore the client `cwd` and
start the replay at `challenge.setup.cwd`:

```js
const cwd = (challenge.success?.predicate === 'cwdIs')
  ? (challenge.setup?.cwd || defaultCwd)
  : (typeof clientCwd === 'string' && …);
```

Stronger and barely larger: always start at `challenge.setup.cwd` and drop the
`cwd` field from the request contract. Nothing in the three packs needs a
client-chosen starting directory.

---

### C5 — MEDIUM (local dev only) — One corrupt byte in the local blob file destroys the whole class

`netlify/functions/utils/store.js:25` (`catch { return {} }`) · `:26-30` (non-atomic `writeFileSync`)

`load()` swallows a JSON parse failure and returns `{}`. The next `setJSON`
serialises that empty object plus one new key and overwrites the file. Every
player and every solve is gone, with no error anywhere.

**Demonstrated** (`h4.mjs`):

```
T7 before, solves/x = {"c1":{"points":50}}
   (file truncated mid-write, as an interrupted process would leave it)
T7 after a truncated file + one write, file = {"players/y":…,"solves/y":{}}
T7 solves/x now = {} <- silently gone
```

`store.js:21` says "Never used in production", which holds — production throws
instead of falling back. But `scripts/start-dev.sh:12` sets `NETLIFY_DEV=true`
and the newest commit added that local stack, so this *is* the live store for
anyone running the class locally, and `writeFileSync` is not atomic.

**Smallest correct fix.** Fail loudly instead of silently:

```js
const load = () => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
};
```

Plus write via temp file + `fs.renameSync` so a partial write can never be
observed.

---

### C6 — LOW-MEDIUM — N+1 sequential blob reads on both list endpoints

`netlify/functions/utils/store.js:134-138` · `netlify/functions/admin-overview.js:57-58` ·
`netlify/functions/leaderboard.js:42-43`

`listPlayers()` awaits each player blob in a `for…of`; each caller then awaits
each solves blob in a second `for…of`. Nothing is parallel. A class of N costs
2N strictly serial round trips on an endpoint every student loads.

Confirmed by reading — the sequential `await`s are unambiguous. agy's stronger
claim (that this *will* hit the 10 s function timeout) is not verified here and
sits in §3; the local `fileBackend` makes the measurement meaningless and no
staging deployment was available.

**Smallest correct fix.** `Promise.all(blobs.map(b => s.get(b.key, {type:'json'})))`
in `listPlayers`, and the same shape for the per-player solves loop in both
callers. Three lines, no behaviour change.

---

### C7 — LOW — CSV formula injection in the gradebook via a hyphen-leading handle

`netlify/functions/admin-overview.js:96-99`

Rows are built by concatenation: `` `"${ps.handle}",…` ``. Against the actual
charset this was checked properly, not assumed. `sfw-filter.js:42` allows
`[a-zA-Z0-9_-]`, which **excludes** `"`, `,`, CR, LF, `=`, `+`, `@` — so the row
cannot be broken and the classic `=cmd|…` payload is unreachable. It **includes**
a leading `-`, which Excel and Sheets still treat as a formula despite the CSV
quoting.

**Demonstrated** (`h1.mjs`):

```
F4 register "-1-1"   -> 200
F4 register "-2-3-4" -> 200
Handle,Total Score,Solves Count,Last Active
"-1-1",0,0,"…"
"-2-3-4",0,0,"…"
```

`-1-1` evaluates to `-2`; `-abc` yields `#NAME?`. Worst case is a mangled or
missing handle in one gradebook row, which the instructor then has to reconcile
by hand. No code execution is reachable through this charset.

**Smallest correct fix.** Prefix the field: `` `"'${ps.handle}"` ``. Or, better
for the root cause, disallow a leading `-` in `checkSFW`.

---

### C8 — LOW — The leaderboard's "last seen" is really "registered at"

`netlify/functions/utils/store.js:69` (only writer) · `netlify/functions/leaderboard.js:65, 72`

`last_seen` is set once inside `createPlayer` and never updated — `grep -rn
last_seen` over `netlify/ packages/ src/` returns exactly those two hits.
`session.js` does not touch it. So the leaderboard column is a registration
timestamp, and the third-level tiebreak (`leaderboard.js:72`) ranks equal scores
by who signed up first rather than who is still active.

**Demonstrated** (`h3.mjs`, F8): three students with identical scores rank in
registration order, with `lastSeen` values milliseconds apart and unchanged after
ten solves each.

**Smallest correct fix.** Update the field where the session is already being
read — in `session.js` after `getPlayer`, write back
`{...player, last_seen: new Date().toISOString()}`. Note this write also races
(same pattern as C2), but a lost `last_seen` costs nothing.

---

### C9 — LOW — The signed expiry field is malleable

`packages/engine/crypto-utils.js:370, 377` (`parseInt`) vs `:372, 379` (signature over the *parsed* value)

The signature covers `${handle}:${expiry}` where `expiry` is the **parsed
number**, not the raw field. Any raw field that `parseInt`s to the same number
verifies.

**Demonstrated** (`h4.mjs`):

```
T2 expiry "1787700088601" -> "1787700088601xyz" verifies: {"handle":"bob","expiry":1787700088601,…}
```

No privilege is gained — the same handle and the same expiry come back — so this
is a correctness defect, not a break. It matters because "the signature verified"
does not currently mean "these bytes are the bytes I signed", which is the
assumption any future change to this file will make.

**Smallest correct fix.** After parsing, `if (String(expiry) !== expiryStr) return null;`
Add `if (!Number.isFinite(expiry)) return null;` in the same line of defence —
`Date.now() > NaN` is `false`, so a NaN expiry currently sails past the expiry
check and is stopped only by the signature (T3).

---

### C10 — LOW — Colon-delimited payloads have no separator escaping (latent, unreachable today)

`packages/engine/crypto-utils.js:316` (flag scope) · `:341-343` (token payload) · `:367-382` (split)

Both the token payload and the flag scope are colon-joined and colon-split with
no escaping and no field-count binding, so a colon inside any field shifts the
meaning of the others.

**Demonstrated at module level** (`h4.mjs`):

```
T1 createSessionToken(S,'alice:linux-fundamentals')  # 3-field signing, no packId
   raw:      alice:linux-fundamentals:1787700088599:7e3e1356…
   verifies: {"handle":"alice","packId":"linux-fundamentals",…}   <- 3-form read as 4-form
T6 generateUserFlag(S,'a:b','c') === generateUserFlag(S,'a','b:c') : true
```

**Not reachable through the app.** `checkSFW` (`sfw-filter.js:42`) rejects `:`,
`register-handle.js` is the only issuer of a fresh handle, `session.js` only
re-mints a handle that already came out of a verified token, and `packs/index.js`
keys are a fixed literal set. Filed as CONFIRMED because the primitive is
genuinely ambiguous and the entire defence is one regex in a different file;
kept at LOW because the regex is currently correct.

**Smallest correct fix.** Refuse the ambiguity at the source, so the crypto does
not depend on the filter:

```js
if (String(handle).includes(':') || String(targetPackId).includes(':')) {
  throw new Error('handle and packId must not contain ":"');
}
```

in `createSessionToken`, and the same guard in `generateUserFlag`.

---

### C11 — LOW — `!act.unlockThreshold` makes the documented `?? 0.8` default dead code

`netlify/functions/submit-flag.js:16` vs `:20`

Line 16 returns `true` for any falsy `unlockThreshold`, so line 20's
`act.unlockThreshold ?? 0.8` can never see `undefined`. A pack author who omits
the field gets a fully open act, not the 0.8 the code advertises.

Verified against every pack: `forensics-cli-101` `[1:0.0, 2:0.8, 3:0.8, 4:0.8,
5:0.8, 6:0.0]`, `linux-fundamentals` `[1:0.0, 2:0.8, 3:0.8, 4:0.8]`,
`windows-cmd-essentials` `[1:0.0, 2:0.8, 3:0.8]`. **No act omits the field**, and
both `0.0` uses are deliberate (act 1 has no prior act; forensics act 6
"Topside" is an intentionally open side quest). So this is a latent authoring
hazard, not a live defect — agy rated it MEDIUM on the assumption a pack already
omitted the field; that assumption is false. Downgraded to LOW.

**Smallest correct fix.** `if (!act) return true;` and let the `?? 0.8` on line
20 do its job, with `0` still opening the act because
`Math.ceil(n*0) = 0 → required = 1`… which is *not* the current meaning of `0.0`.
If `0.0` must keep meaning "fully open", write it explicitly:
`if (!act || act.unlockThreshold === 0) return true;`

---

## 3. Plausible, not demonstrated

**P1 — The N+1 reads hit the 10 s function timeout at ~100 students.**
agy's arithmetic (200 serial round trips) is right; the per-read latency of
Netlify Blobs with `consistency: 'strong'` is not measured here and the local
`fileBackend` cannot stand in for it. At a 40-student class the pattern is
merely wasteful. The fix in C6 is cheap enough to apply without settling this.

**P2 — `sha256Sync` is not injective over ill-formed UTF-16.**
`crypto-utils.js:201-207`: a lone high surrogate at the end of a string reads
`charCodeAt(i+1)` as `NaN`, masks it to `0`, and encodes identically to that
surrogate followed by `U+DC00`. Demonstrated at module level —
`sha256Sync('\ud83d') === sha256Sync('🐀')` returns `true` (`h4.mjs`, T5b). No
path reaches it: handles are `[a-zA-Z0-9_-]`, challenge ids and pack ids are
ASCII literals, and `SESSION_SECRET` is operator-chosen. Marked PLAUSIBLE because
no input the app accepts can trigger it.

**P3 — Two concurrent registrations claim the same handle.**
`store.js:66-71` is check-then-write with no CAS, exactly like C2. Two racing
`register-handle` calls could both see no existing player and both return
`created: true`, issuing two valid tokens for one handle and one shared score.
Not demonstrated: the single-process harness serialises `fileBackend` writes, and
reproducing it needs the real Blobs backend. Same fix family as C2.

---

## 4. Rejected, with reasons

| Claim | Verdict |
|---|---|
| `hintsUsed` can produce a negative or unbounded score | **Rejected.** `h3.mjs` F3b drove `-5, 999, 'abc', null, {}, [3], 1e308`. Result is always in `[0, Σ hint costs]`: garbage → `NaN` → penalty 0 → 20 pts; huge → clamped to `hints.length` → 10 pts. `Math.max(0, …)` at `submit-flag.js:204` holds. (The *honesty* problem is real and is C3; the *bounds* are fine — agy also cleared this.) |
| An already-solved challenge can be re-scored | **Rejected.** `h3.mjs` F6: the second submit returns `{"alreadySolved":true,"points":10}`, no new record. Guarded twice, at `submit-flag.js:187` and `store.js:92`. |
| A session token can be forged, truncated, or shape-confused over the network | **Rejected.** T1/T3/T4: an expired token returns `null`; a NaN expiry passes the expiry test but fails the signature; the 3→4 shape confusion needs a `:` in the handle, which `sfw-filter.js:42` rejects. Every token that verifies was minted by the server. (Latent fragility filed as C10.) |
| `timingSafeEqualStr` leaks via the length check | **Rejected.** `crypto-utils.js:350-357` exits early only on a length mismatch; the signature is always 64 hex chars, so the length is public. The loop has no early exit. |
| `hmacSha256`'s unmasked `charCodeAt` weakens the key | **Rejected as a security defect.** XOR is injective and `String.fromCharCode` + the UTF-8 encoder preserve distinctness — T5 confirms three non-ASCII secrets give three distinct MACs. It *is* a spec deviation: for a non-ASCII `SESSION_SECRET` this is not RFC 2104 HMAC, so migrating to `crypto.createHmac` would invalidate every live token and every issued flag. Worth a comment, not a fix. |
| `Content-Disposition` header injection via `packId` | **Rejected.** `admin-overview.js:104` interpolates `pack.id`, and `getPack` (`packs/index.js:48-50`) returns an object from a fixed literal registry or the default. An arbitrary query `packId` never reaches the header. |
| A 500 path leaks the secret or a token | **Rejected.** All five catch blocks return a fixed string (`submit-flag.js:221`, `session.js:62`, `register-handle.js:67`, `leaderboard.js:100`, `admin-overview.js:120`). `console.error` writes the stack to the function log, which is instructor-side. No response body echoes `SESSION_SECRET`, a token, or a stack. The missing-secret path returns "Server is not configured", which discloses only a misconfiguration. |
| `commandText.includes('||')` bypasses the error check for score | **Rejected.** `submit-flag.js:72` does skip `ERROR_MARKERS` when the command contains `||`, but the escape buys nothing: `commandMatches` patterns are `^…$`-anchored, so appending `|| true` breaks the match, and state predicates still require the real end state. The clause exists for `l4-list-or`, whose canonical answer contains `||`. |
| A student can weaken a `fileExists`/`dirExists`/`fileHasMode` challenge via `cwd` | **Rejected.** Every such predicate in all three packs uses an absolute path (`resolvePath` ignores `cwd` for those), so C4 stops at the four `cwdIs` challenges. Verified by dumping every `success` object across the three packs. |

Also checked and clean: `admin-overview` is the only instructor endpoint and it
is gated (`:31-33`); `session.js:33` only *reports* `isAdmin` and grants nothing;
`manifest.js` binds `packId` from the token before the query string (`:31`), so a
student cannot read another pack's flags; `leaderboard.js` is deliberately public
and exposes only handle, score, count, badges.

---

## 5. Known issues the review materially deepened

**Known issue #2 (`/api/manifest` returns every flag) — the consequence is worse
than "the client knows the flags".** `submit-flag.js:115-127` ignores
`challengeId` entirely whenever a `flag` field is present and instead scans
*every* challenge in the pack for a match. So a student holding their manifest
can bulk-POST all 18 forensics flag values and collect each one. The only brake
is `isActUnlocked`, and by design (`:18-21`) it never requires 100% of the prior
act — `required = min(max(1, ceil(n·t)), n-1)`. Once act 1 is finished honestly,
the remaining flag challenges fall in a few requests. The client-side-simulation
argument for shipping the flags is sound; the argument for the *server* accepting
a flag that was never bound to the submitted `challengeId` is not. Binding the
match to `challengeId` when one is supplied costs one line and removes the bulk
path without touching the manifest design.

**Solve records are not pack-scoped, and the gradebook CSV sums across packs.**
`store.js:57` keys solves as `solves/<handle>` with no pack component.
`admin-overview.js:63-79` filters `challengeStats` to the requested pack but
accumulates `playerPoints` from *every* entry in the blob. A student who works
two packs exports one merged total, and the `?packId=` selector silently does not
scope the CSV's score column. `leaderboard.js:10-12` already notes the
missing scoping for badges; the gradebook consequence is not noted anywhere and
is the one that reaches a grade. This is adjacent to known issue #1 but is a
distinct defect that survives the planned pack-binding fix unless solve keys gain
a pack component at the same time.

**Known issue #1's fix should land together with C4 and C3.** All three are the
same shape — the server trusting a client-supplied field (`packId` by omission,
`cwd`, `hintsUsed`) as evidence. Fixing them separately invites a fourth.

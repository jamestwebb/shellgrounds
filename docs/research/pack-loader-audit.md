# Pack-loader adversarial audit — `shellgrounds`

Third-party reviewer: **agy / Antigravity, Gemini 3.1 Pro (High)**, run source-only
in a throwaway git worktree (168 tracked files, privacy pre-flight passed, ref
`shellgrounds`). Every finding below was then **verified by execution** on the real
code — malicious `.pack.json` files, crafted directory packs, and odd command
lines — not by reasoning. Harnesses live in the session scratchpad.

Status legend: **CONFIRMED** (demonstrated), **PARTIAL** (real defect, but the
reviewer's stated impact is narrower than claimed), **REJECTED** (claim not
reproducible), **HOLDS** (safe behaviour proven enforced).

Assessment only — **no fixes applied.**

---

## Did the no-code boundary hold?

**For the single-file `.pack.json` format — the actual download-and-load vector —
YES, against code injection.** `loadPackFile` runs `assertNoCode(raw)` first, and I
demonstrated it rejects: function values; own `__proto__`, `constructor`,
`prototype` keys (including nested inside arrays and two-hop `constructor.prototype`);
getters/setters; the `js` predicate reached via `.predicate`; and nesting past 64
levels. A `{"__proto__":{...}}` parsed from JSON *is* caught (it is a real own
property after `JSON.parse`, and `Object.getOwnPropertyNames` sees it).

**But "data only" is not "safe", and the boundary has real gaps:**

1. The pack's **data drives `new RegExp`** in success predicates. A valid-but-evil
   pattern is a CPU bomb (ReDoS) the format does nothing to bound. This is the most
   important finding — it defeats the *spirit* of the guarantee without carrying any
   "code".
2. The **directory-pack load path (`loadPackDirectory`) never calls `assertNoCode`
   at all**, and its unvalidated `id` reaches a filesystem write and a generated JS
   file. Directory packs are meant for local authoring, but the export/import tools
   accept a stranger's directory.
3. The live evaluation call sites hardcode `trusted: true` regardless of the pack's
   real `trusted` flag. Harmless today (untrusted packs never reach those sites),
   but a loaded trap once teacher packs are wired into the running app.

Counts: **8 CONFIRMED**, **1 PARTIAL**, **2 claims REJECTED as over-stated**, **3
HOLDS**.

---

## Confirmed findings (most severe first)

### 1. HIGH — ReDoS in pack-supplied success predicates
`packages/engine/validate/predicates.js:61, 97, 104` (`fileMatches`,
`commandMatches`, `outputMatches`).

The pack author writes `success.pattern`; the code compiles it with `new RegExp`
and runs it against author-controlled content (file bodies, output). The server
runs this during replay-grading, and `validatePack` runs it during solvability
checks.

Exploit (`.pack.json` fragment):
```json
{ "success": { "predicate": "outputMatches", "pattern": "^(a+)+$" } }
```
against output/content of `"aaaaaaaa…!"`. **Measured: a 40-char input pinned one
CPU for 69 seconds** in a direct `evaluatePredicate` call; each added character
doubles it. A challenge whose accepted solution `cat`s an author-supplied file of
`a`s makes the server hang on every submission, and makes `gauntlet validate` /
CI never terminate.

Smallest correct fix: run pack patterns under a bounded engine — `re2` (linear,
no backtracking) — or wrap every `new RegExp(...).test()` on pack data in a
worker/timeout. `re2` is the clean fix because these patterns are untrusted by
design.

### 2. HIGH — Path traversal: a directory pack writes outside the target on export
`scripts/pack-export.mjs:48` + `packages/engine/validate/packSource.js:43-107`
(`loadPackDirectory` returns `manifest.id` with **no** `validatePackFileStructure`,
so the id-format regex is never applied).

`finalPath = resolve(outPath || \`${file.id}.pack.json\`)`. A directory pack with
`"id": "../../../../../../tmp/PWNED-EXPORT"` and no output path is written outside
the working directory.

**Reproduced:** `exportPack('<evil-dir>', null, {})` wrote
`/tmp/claude-1000/PWNED-EXPORT.pack.json` — outside the repo — and the file is on
disk. `pack-import.mjs` is safe on this point because it *does* call
`validatePackFileStructure` (id regex enforced) before using `pack.id`.

Smallest correct fix: validate directory packs in `loadPackDirectory` (call
`validatePackFileStructure`), and/or `basename(file.id)` before building any path.

### 3. HIGH — Unescaped `id` interpolated into generated registry JavaScript
`scripts/build-registry.mjs:81-82` (`'${p.id}': {` and `id: '${p.id}',`).

`manifest.id` is read raw (no validation on the directory path) and pasted into the
generated `registry.gen.js` inside single quotes at two positions. A pack id
containing a quote breaks out of the string literal.

**Reproduced:** an id of
`ok', pwned: (()=>{ console.log('PWNED') })(), x: '` produced a `registry.gen.js`
whose object literal is broken open.

**Reviewer's "arbitrary code execution / RCE" claim — REJECTED as demonstrated.**
Because the id is interpolated into *both* an object-key position (`'id':`) and a
value position (`id: 'id'`) with conflicting grammar, every payload I tried
(computed-key breakout, IIFE-as-value, comment injection, string-concat) produced a
**SyntaxError**, not running code — confirmed by importing each generated file.
Real, demonstrated impact: a hostile or careless id **corrupts the shared registry
and breaks the build/import for the whole app** (integrity + DoS). Still must be
fixed.

Smallest correct fix: `JSON.stringify(p.id)` at every interpolation, and validate
the id (reuse the `/^[a-z0-9][a-z0-9-]*$/` rule) on the directory path.

### 4. MEDIUM — Directory-pack load skips `assertNoCode`; `stripComments` has no depth limit
`packages/engine/validate/packSource.js:48` (calls `stripComments(readJson(...))`
with no `assertNoCode`) and `packages/engine/validate/packFile.js:44` (`stripComments`
recurses unbounded).

Two demonstrated effects on a directory pack's `pack.json`:
- `{"manifest":{"__proto__":{"polluted":"YES"}}}` → after `stripComments`,
  `out.manifest`'s **prototype is replaced** (`out.manifest.polluted === "YES"`).
  **Reviewer's "prototype pollution" impact is PARTIAL:** it is *object-local* — I
  confirmed `({}).polluted` stays `undefined`, so `Object.prototype` is **not**
  globally polluted. Lower blast radius than claimed, but still a guard the
  single-file path enforces and this path skips.
- ~60,000-deep nesting → `stripComments` throws
  `RangeError: Maximum call stack size exceeded` (`assertNoCode`'s 64-level limit
  never runs here). Crashes load/validation.

Smallest correct fix: call `assertNoCode(raw, '$')` in `loadPackDirectory` before
`stripComments`, and give `stripComments` the same `MAX_GUARD_DEPTH` guard.

### 5. MEDIUM — `sed` throws an uncaught `SyntaxError` on an invalid regex (student-reachable today)
`packages/engine/commands/linux/index.js` (sed handler, `new RegExp` ~line 1253).

`runPipeline` has no error boundary in the React handler, so an uncaught throw makes
the terminal **silently swallow the command**. **Reproduced:** `sed 's/(/x/' a.txt`
→ `SyntaxError: Invalid regular expression: /(/: Unterminated group`. Also `s/)/…`,
`s/[/…`, `s/[a-/…`, `s/*/…`, `s/+/…`, `s/?/…`, `s/(?/…`, `s/(((/…`, trailing `\`.
`grep`, `awk`, and `find` do **not** throw on the same bad patterns (they guard or
fall back) — sed is the outlier. No pack needed; any student hits it.

Smallest correct fix: wrap sed's `new RegExp` in try/catch and emit
`sed: -e expression: … ` to stderr with status 1, matching real sed.

### 6. LOW — Glob compiles to a catastrophic-backtracking RegExp
`packages/engine/shell/expand.js:93` (`globToRegex`).

`*` becomes `.*`; a pattern of many `*`s compiles to `^a.*a.*…b$`. **Measured:**
`ls a*a*a*…b` (10 stars) took 6.8 s; 12 stars did not finish in 30 s. Client-side
and self-inflicted (the student types it), so it freezes only their own tab —
hence LOW — but it is a real hang with no bound.

Smallest correct fix: cap glob complexity, or match globs with a linear matcher
rather than a backtracking RegExp.

### 7. LOW — Option expecting a value gets `"true"` / `0` when the value is missing
`packages/engine/commands/registry.js:114` and `:202`.

`flags[key] = spec.type === 'number' ? Number(val) : String(val)` with `val` still
the boolean `true` (long option) or `''` (short option). **Reproduced:**
`head -n` → `flags.n === "true"`; `head --lines` → `"true"`; `cut -c` → `"true"`;
`head -n` end-to-end silently prints nothing at status 0 instead of the bash error
`option requires an argument -- 'n'`. Wrong, but does not throw.

Smallest correct fix: when a string/number option has no available value, return
`{ error: "option requires an argument -- '<opt>'", status: 2 }`.

### 8. LOW — `kind: 'js'` slips past the `assertNoCode` predicate check (defence-in-depth gap)
`packages/engine/validate/packFile.js:113` only rejects `predicate === 'js'`, but
`evaluatePredicate` dispatches on `predicate || kind` (`predicates.js:42`). A pack
using `{"success":{"kind":"js", …}}` is **not** rejected by the guard.
**Reproduced:** `assertNoCode` accepts it. No code runs (JSON cannot carry a
function, and the `js` branch needs `typeof fn === 'function'`), so this is not an
execution path today — but it is a hole in the stated guard and should also reject
`kind === 'js'`.

---

## Latent boundary risk (confirmed code state, not yet exploitable)

**`trusted: true` is hardcoded at the live evaluation call sites** —
`src/App.jsx:333` and `netlify/functions/submit-flag.js:217` pass `trusted: true`
unconditionally, ignoring `pack.trusted`. Safe **only** because both sites read
packs exclusively from the committed `PACKS` registry (`packs/index.js` →
`registry.gen.js`), so a file-loaded (`trusted:false`) pack never reaches them
today. The moment the "teachers load each other's packs" feature wires a loaded
pack into `App`/`submit-flag`, an untrusted pack's `js` predicate would run with
`trusted:true`. Derive `trusted` from the pack object at these call sites *before*
that feature ships. (The `js` branch still requires a real function, which JSON
cannot supply — but do not rely on that as the only line of defence.)

---

## Holds (safe behaviour proven enforced)

- **`.pack.json` `trusted` field cannot be forged.** `loadPackFile` hardcodes
  `trusted: false` in its returned object; a `"trusted": true` inside the file is
  ignored. Confirmed.
- **Filesystem-tree path-separator injection is refused.** `expandFilesystem`
  throws `PackFormatError` for any node name containing `/` or `\`
  (`packFile.js:226`). Confirmed — a tree key `../etc` cannot create a sibling path.
- **Single-file prototype-pollution guard.** `assertNoCode` rejects own
  `__proto__` / `constructor` / `prototype` (nested, in arrays, two-hop),
  functions, accessors, and >64 depth on the `.pack.json` path. Confirmed by
  execution.

---

## Reviewer accuracy

agy produced 7 findings; all 7 point at real code defects. Two impact claims were
over-stated and are corrected above: the build-registry finding is an
integrity/build-DoS injection, **not** RCE (dual key+value interpolation forces a
syntax error — demonstrated across four payloads); the directory-pack finding is
**object-local** prototype replacement, **not** global `Object.prototype`
pollution. The independent pass added four findings agy missed: the sed uncaught
throw (student-reachable today), the glob ReDoS, the `kind:'js'` guard gap, and the
hardcoded-`trusted` latent risk.

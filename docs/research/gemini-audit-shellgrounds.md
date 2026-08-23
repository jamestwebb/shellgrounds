# Third-party audit — Gemini 3.1 Pro (High), verified

Run on a source-only throwaway worktree, 193 tracked files. Every finding was
checked against the real code before anything changed; three did not survive
that check in the form they were reported.

| # | Reported | Verdict | Evidence |
|---|---|---|---|
| F1 | CRITICAL — etag fallback defeats compare-and-swap | **PARTIAL** | The fallback branch is unreachable: the real SDK and the local file backend both implement `getWithMetadata`. No live data loss. It was a trap for whoever changes the storage layer next, and it failed OPEN. Fixed by failing loudly instead. |
| F2 | CRITICAL — ReDoS bypasses the nested-quantifier check | **CONFIRMED** | `(a+a)+`, `(a+[a-z])+`, `([a-z]+x)+` were all accepted. `^(a+a)+$` takes **2,011ms against 40 characters**, and it is exponential. |
| F3 | HIGH — correct answers marked wrong | **CONFIRMED** | `echo "Permission denied"` exits 0 but matched `ERROR_MARKERS`. A pack already carried a `commandCheckExemptReason` for this exact collision, which is the tell that it had bitten before. |
| F4 | HIGH — the reveal scrambles when the grid resizes | **CONFIRMED** | Roster 4 → 24 squares, roster 40 → 216, and the permutations share nothing. The area guard held; the *squares* did not. My own test only asserted area, which is why it passed. |
| F5 | MEDIUM — static flag bypasses act gating | **REFUTED** | The gate runs after the flag-matching block, on whatever challenge was resolved. Demonstrated: a locked act's flag returns **403 with and without a `challengeId`**. |
| F6 | MEDIUM — CSV injection via leading whitespace | **REFUTED as stated** | A handle is `[A-Za-z0-9_-]`, so `" =CMD()"` cannot be registered. Taken as hardening anyway — the guard exists for free-text columns, which are not so restricted. |
| F7 | MEDIUM — workers keep running after a failure | **CONFIRMED** | All 200 calls ran after a rejection at item 5. |
| F8 | LOW — xorshift seed can stick at zero | **CONFIRMED** | State 0 returns 0 for ever and the shuffle degenerates to a rotation. Needs an FNV-1a hash of exactly zero, ~1 in 4 billion. One-line guard. |

Gemini also confirmed two properties I claimed: the instructor check never
accepts `ADMIN_HANDLES` membership alone, and path traversal on pack import and
export is genuinely prevented.

## On F2, honestly

The static check is now blunt — a quantifier *anywhere* inside a quantified
group is refused, which will reject some patterns that would have been fine.
That is the right trade for a field a pack author fills in.

It is still a heuristic, and heuristics here have been wrong before. So a
pattern is now also **timed** at pack-validation time against input built to
make a backtracking engine work hardest, and refused if it exceeds 50ms. The
two nets catch different things: the static check catches `([a-z]+x)+`, which
the probe's inputs do not exercise; the probe catches anything the next clever
bypass gets past the regex. Neither is a proof, and the file says so.

---

## The original report

Here is the pre-release code-quality and reliability audit of the Shellgrounds backend and engine.

**CRITICAL -- `readWithEtag` fallback silently defeats compare-and-swap, causing data loss**
* **Location:** `netlify/functions/utils/store.js:165`
* **Scenario:** If the Netlify Blobs SDK lacks `getWithMetadata` (e.g. during local dev with the mock, or an older SDK), `readWithEtag` falls back to `get()` and returns `etag: null`. In `addSolve` (line 381), `const opts = etag ? ... : (data ? {} : { onlyIfNew: true });` resolves to an empty object `{}` when updating an existing record. The subsequent `s.setJSON` call then performs a blind overwrite. If two students submit a solve simultaneously, the second write will silently erase the first student's points, completely defeating the concurrency protections.
* **Fix:** If strong consistency is strictly required, remove the fallback and fail loudly if `getWithMetadata` is missing, rather than failing open to last-write-wins.

**CRITICAL -- Exponential backtracking DOS in regex compilation**
* **Location:** `packages/engine/validate/safe-regex.js:20`
* **Scenario:** The `NESTED_QUANTIFIER` check attempts to block catastrophic backtracking by looking for an inner quantifier immediately preceding the closing parenthesis. A malicious or poorly written pack can define a success predicate with `pattern: "(a+a)+"` or `(a+[a-z])+`. Because the inner quantifier is followed by another character, it bypasses the regex check. When the server grades this against a long, near-matching string, it triggers O(2^n) backtracking, pinning the CPU and hanging the endpoint indefinitely.
* **Fix:** Static regex analysis is extremely fragile. Enforce a strict execution timeout (via `vm` or a Worker thread) when testing untrusted patterns, or evaluate patterns using a linear-time engine like `re2`.

**HIGH -- Output checking marks correct answers as wrong**
* **Location:** `netlify/functions/submit-flag.js:106`
* **Scenario:** A challenge requires the student to write a command that outputs a specific error, such as `echo "permission denied"`. The student executes the correct command, which succeeds (exit status 0). However, because the output contains the string "permission denied", `ERROR_MARKERS.test(res.output)` evaluates to `true`. `ok` becomes `false`, and the student is marked wrong despite providing the correct answer.
* **Fix:** The shell emulator (`runPipeline`) already accurately reports `res.hasError` based on exit status and pipeline failures. Remove the `ERROR_MARKERS` heuristic, as grepping output for English phrases introduces false positives for valid commands.

**HIGH -- The reveal picture scrambles and steps backwards when the grid resizes**
* **Location:** `packages/engine/reveal.js:174`
* **Scenario:** A class reaches 50% completion on a 96-tile grid, revealing 48 tiles based on the permutation from `tileOrder(seed, 96)`. Late students register, raising the `target` across a threshold so `revealGrid` selects the next size up (216 tiles). The permutation generated by `tileOrder(seed, 216)` is an entirely different sequence. Even though the overall area (`fraction`) is guarded by `floorFraction`, specific squares that were previously revealed are now covered, completely breaking visual continuity and violating the claim that the picture never goes backwards.
* **Fix:** Decouple the pseudo-random permutation from the grid size. Generate a single, sufficiently large permutation (e.g. using `MAX_TARGET`) and crop it to the current `grid.tiles`, ensuring earlier tiles remain stable as the grid grows.

**MEDIUM -- Global static flag acceptance bypasses act gating**
* **Location:** `netlify/functions/submit-flag.js:182`
* **Scenario:** A student finds a static flag for a challenge in Act 5. They submit the flag in the UI without specifying a `challengeId`. The endpoint iterates through `searchSpace` (which includes all challenges in all packs if `challengeId` is absent), matches the static flag, and records a solve for the Act 5 challenge, completely bypassing the `isActUnlocked` check (which is only enforced later on line 249 for known `challengeId`s).
* **Fix:** Enforce act gating inside the flag-matching loop before accepting the match, or strictly require the client to supply the `challengeId` being answered.

**MEDIUM -- CSV injection via leading whitespace**
* **Location:** `netlify/functions/admin-overview.js:63`
* **Scenario:** A student registers their handle as ` =CMD()`. When the teacher exports the gradebook, the `csvCell` function checks `/^[=+\-@\t\r]/`. Because the string starts with a space, it evades the check and is written without a leading apostrophe. When opened in Excel, the leading space is ignored, and the malicious formula executes on the teacher's machine.
* **Fix:** Update the regex to account for leading whitespace: `/^[ \t]*[=+\-@\r\n]/.test(s)`.

**MEDIUM -- Background workers continue hammering the API after a request fails**
* **Location:** `netlify/functions/utils/store.js:431`
* **Scenario:** While loading the leaderboard, `readAllSolves` calls `mapLimit` with 24 concurrent workers. If one read fails (e.g. a timeout), its worker rejects, causing `Promise.all` to immediately throw an error to the client. However, the other 23 workers are trapped in `while (true)` loops. They silently continue pulling items from `next++` and executing API calls against Netlify Blobs until the entire array is exhausted, wasting runtime and hitting rate limits.
* **Fix:** Add an `aborted` boolean flag. Set it to `true` if `fn` throws, and check `if (aborted) return;` at the start of the `while (true)` loop.

**LOW -- Xorshift seeding can stick at zero**
* **Location:** `packages/engine/reveal.js:108`
* **Scenario:** The FNV-1a hash algorithm is used to seed the `state` for the `tileOrder` xorshift PRNG. If a teacher names their pack such that the string happens to produce an FNV-1a hash of exactly 0, `state` becomes 0. The `next()` function will then endlessly return 0, making the grid reveal completely linear and non-random.
* **Fix:** Add a guard immediately after the seeding loop: `if (state === 0) state = 1;`.

*(Note on properties you claimed: The teacher-only boundary logic in `claim-instructor.js` and `register-handle.js` successfully ensures that being in `ADMIN_HANDLES` is never sufficient on its own. Furthermore, path traversal in `packSource.js` and the import/export scripts is genuinely prevented via strict regex constraints on pack IDs and hardcoded filename generation).*

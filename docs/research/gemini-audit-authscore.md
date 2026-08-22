Here is the pre-release review report of the Gauntlet subsystem. I have reviewed the requested files against your specific focus areas and confirmed the safe behavior of the token construction and validation routines. However, I identified several serious defects in storage concurrency, authorization, performance, and logic.

### Defect Report

**CRITICAL -- Storage race in `addSolve` causes permanent data loss of concurrent solves -- netlify/functions/utils/store.js:90**
* **Concrete failure scenario:** A student simultaneously submits correct flags for Challenge A and Challenge B (via a script or multiple browser tabs). Request A reads `{}` and Request B also reads `{}`. Request A writes `{"A": solve}`. Request B then overwrites the blob with `{"B": solve}`. Challenge A's solve is permanently dropped and the student's score is lower than earned. 
* **Suggested fix direction:** Since Netlify Blobs lacks atomic read-modify-write updates for single blobs, store each solve as a separate individual blob (e.g., `solves/${handle}/${challengeId}`) and use prefix listing to retrieve them, or implement a transactional lock.

**HIGH -- Missing instructor authentication allows students to hijack admin access -- netlify/functions/admin-overview.js:31**
* **Concrete failure scenario:** The instructor endpoints only verify if the user's handle exists in `ADMIN_HANDLES`, but registration does not require a dedicated instructor secret. A student reads the instructor's handle from source (or guesses it) and registers it using the standard student cohort password before the instructor does. The student instantly gains full admin access to the gradebook and instructor data.
* **Suggested fix direction:** Require a dedicated `INSTRUCTOR_SECRET` to be validated in instructor endpoints (e.g., via a secure HTTP header), or validate this secret during `register-handle.js` specifically when an admin handle is requested.

**HIGH -- N+1 sequential blob reads will cause serverless function timeouts -- netlify/functions/admin-overview.js:57**
* **Concrete failure scenario:** `admin-overview.js` and `leaderboard.js` fetch all players, then use a `for...of` loop to sequentially `await` the solves for each player. Furthermore, `listPlayers()` (store.js:136) also sequentially `await`s every player blob. For a class of 100 students, this generates 200 strictly sequential network requests. This will easily hit the 10-second Netlify serverless timeout, causing the endpoints to crash and hang.
* **Suggested fix direction:** Fetch the blobs concurrently using `Promise.all(blobs.map(...))`, or store a consolidated materialized view of the gradebook/leaderboard that updates automatically upon each solve.

**MEDIUM -- Logic error in `isActUnlocked` instantly unlocks acts with default thresholds -- netlify/functions/submit-flag.js:14**
* **Concrete failure scenario:** A pack author omits `unlockThreshold` from an act's configuration, expecting it to default to `0.8` as documented. `!act.unlockThreshold` evaluates to `true` (since it is undefined), triggering the early return `true`. This completely bypasses the threshold math and instantly unlocks the act for all students regardless of their progress.
* **Suggested fix direction:** Change the early return condition to `if (!act) return true;` so the `act.unlockThreshold ?? 0.8` fallback logic executes. (If a strict 0% threshold is needed, use `if (!act || act.unlockThreshold === 0) return true;`).

**LOW -- CSV Formula Injection in gradebook export via student handles -- netlify/functions/admin-overview.js:98**
* **Concrete failure scenario:** The `sfw-filter.js` regex permits handles starting with a hyphen. A student registers a valid handle like `-A1`. When the instructor downloads the CSV and opens it in Excel, the unescaped `"-A1"` is interpreted as a spreadsheet formula (`=-A1`), causing a `#NAME?` error and corrupting the gradebook display for that row.
* **Suggested fix direction:** Prepend a single quote to the handle in the CSV export (e.g., `"'${ps.handle}"`) to force spreadsheet applications to treat the field as plain text safely.

---

### Verifications & Confirmed Safe Behavior
Per your request, I investigated the following attack vectors and verified they **safely repel** exploitation:
* **Token construction and HMAC forging:** Token structures are strictly evaluated by `parts.length === 3` or `parts.length === 4` on a colon split. A handle cannot contain a colon (enforced by `sfw-filter.js`), and `packId`s are strictly validated against predefined strings. A token cannot be truncated or confused between shapes because missing/extra fields will immediately break the strict length checks or fail the cryptographic signature validation.
* **Constant time comparison:** The early exit on `a.length !== b.length` in `timingSafeEqualStr` is safe here because standard HMAC signatures are exactly 64 characters long, ensuring timing leaks are structurally impossible for correct tokens.
* **Hint penalty bounds:** The `Math.min(hintsUsed, hints.length)` structure and `Math.max(0, points - penalty)` arithmetic guarantee that manipulated `hintsUsed` payloads (such as negative numbers, `NaN`, or artificially inflated integers) fail cleanly without crashing or producing negative scores.

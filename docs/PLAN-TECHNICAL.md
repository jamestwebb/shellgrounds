# Technical Plan

Scope: fix the pack/CTF binding, make packs separately deployable CTFs, one-click teacher deploy, instructor tooling, the rename runbook, pack authoring, tests/CI, and a sequenced work plan. Creative/copy decisions (names, briefs, marketing) live in the companion creative plan; nothing here picks a name.

Ground truth used throughout: Vite 6 + React 19 SPA, Netlify Functions v2 (ESM, `Request`/`Response`), Netlify Blobs, no database. `netlify.toml:10-13` redirects `/api/*` to functions. Three packs, 97 challenge ids, all globally unique today. Env vars: `CLASS_PASSWORD`, `SESSION_SECRET`, `ADMIN_HANDLES`, `GAUNTLET_STORE`. Tokens: `createSessionToken(secret, handle, packId)` → base64 `handle:packId:expiry:hmac`, 72h, rolled over on each `/api/session` call (`netlify/functions/session.js:127`). Storage keys `players/<handle>` and `solves/<handle>` (`netlify/functions/utils/store.js:192-193`); solve records are not pack-scoped; `normalizeSolve()` (`store.js:251`) exists because a past arity bug wrote nested records.

---

## 1. Fix the pack/CTF binding

### The bug, restated in code

- `src/utils/api.js:31-45` — `registerHandle()` posts `{handle, classPassword}` only. The server (`netlify/functions/register-handle.js:21,47,56`) *already accepts* a `packId` field and would mint a pack-scoped token, but the client never sends it, so every UI-registered token says `forensics-cli-101` (`packs/index.js:46`).
- `src/App.jsx:98-115` — `handleSelectPack()` swaps React state and the simulated filesystem. No network call. The token still says the old pack.
- `netlify/functions/submit-flag.js:101-103` — pack is resolved from `verified.packId`; `submit-flag.js:112` then looks the challenge id up **in that one pack only**. Any challenge from the other two packs returns 400.
- `src/App.jsx:131-133` — on reload, `data.packId` from the token overwrites the student's chosen pack, so the app itself undoes the switch.

Net effect: 67 of 97 challenges are unscorable for any student who registered through the UI. (Proven live: same challenge, same command, 400 under a forensics token, 200 under a linux-fundamentals token.)

### Design (a): resolve the pack from the challenge id server-side

The token stops carrying pack identity. The submission itself names the challenge; challenge ids are globally unique; the server derives the pack from the id.

- New in `packs/index.js`: `CHALLENGE_INDEX` (a `Map` of `challengeId → packId`, built at module load) and `getPackForChallenge(challengeId)`. Building the map throws on a duplicate id, so a future collision fails the build and CI, never a student.
- `submit-flag.js:101-103`: delete the token-pack resolution. For a challenge-id submission, `const pack = getPackForChallenge(challengeId)`. For a bare-flag submission (`submit-flag.js:115-127`), iterate the challenges of **all enabled packs**; per-pack flag HMACs already include `pack.id` (`packages/engine/crypto-utils.js:312-325`), so flags cannot collide across packs.
- Tokens become the 3-part legacy shape (`crypto-utils.js:341-343` already emits it when no pack is passed; `verifySessionToken` at `crypto-utils.js:360-387` already accepts both shapes and returns `packId: null`). **No crypto change is required.** Old 4-part tokens keep verifying; their `packId` is simply ignored.
- The "which pack is this student looking at" question becomes pure UI state: persist it in `localStorage` (`warren_active_pack`) next to `warren_token` (`src/utils/api.js:20-28`), and mirror it to the player record (`players/<handle>.activePackId`, written on submit) so instructors can see it.

Pros: one source of truth (the submission), pack switching is instant and offline, no re-mint round trip, no stale-token races, multi-pack progress works with one token. Cons: the token no longer records intent, so the collision question must be answered structurally (below).

### Design (b): keep pack in the token, add a re-mint endpoint

New `POST /api/switch-pack` verifies the current token, mints a new one for the requested pack, returns it; `handleSelectPack()` calls it and swaps the stored token; `App.jsx:131-133` stays as-is.

Cons that kill it: (1) `session.js:127` re-mints the token with the *old* pack on every `/api/session` call — a second tab or a background refresh silently reverts the switch, reintroducing exactly this bug's shape; (2) a student is one-pack-at-a-time, so cross-pack progress display needs the server to ignore the token pack anyway; (3) pack identity lives in two places (token + client state) forever, and this bug is precisely what duplicated state does. It also adds a function, an API round trip, and a failure mode (switch offline = stuck).

### Recommendation: (a)

**When two packs later DO collide on an id:** the build-time uniqueness assertion in `CHALLENGE_INDEX` makes collision a conscious decision, not an accident. The escape hatch is already in the request path: have the client send `packId` in the submit body (add it to the destructure at `submit-flag.js:106` now, optional); when present, the server verifies the challenge belongs to that pack and prefers it. With pack-scoped solve keys (next paragraph) nothing else changes. Do not pre-build composite challenge ids; the authoring norm "prefix ids with a pack code" (`l1-`, `w1-`, `act1-` today) plus the CI gate is enough.

**Solves become pack-scoped now**, because the leaderboard and admin views need it in §2 and because the current scheme only works while ids are unique:

- Write path: `submit-flag.js:206` calls `addSolve(handle, `${pack.id}/${challenge.id}`, …)`. `store.js:225` needs no change beyond accepting the composite key.
- Read path / migration: **no batch migration.** `getSolves()` callers pass records through a new `resolveSolveKey(key)` helper in `store.js`: a key containing `/` splits into `{packId, challengeId}`; a bare legacy key is attributed via `CHALLENGE_INDEX` (unique ids make this attribution exact — this is the window in which lazy migration is free, which is another reason to ship now). Optionally rewrite the record under the composite key on first read (write-behind upgrade), same pattern as `normalizeSolve()`.
- `normalizeSolve()` is untouched; it handles record *shape*, `resolveSolveKey` handles record *identity*.

**What `/api/session` must return** (`session.js:104-128`): keep `handle`, `isAdmin`, rolling `token` (now 3-part); return `solves` as `[{packId, challengeId, points, hintPenalty, netPoints, solvedAt}]` (packId from `resolveSolveKey`); add `scoresByPack: {<packId>: n}`; drop the top-level `packId` claim or rename it `lastActivePackId` sourced from the player record. Client: `App.jsx:131-133` changes to "restore pack from `localStorage`, else `lastActivePackId`, else default" — the server stops being able to overwrite a deliberate choice.

**What `/api/leaderboard` must return**: accept `?packId=`; filter each player's solves through `resolveSolveKey` to the requested pack; badge rules are already computed per pack (`leaderboard.js:71-79`). Response gains `packId`. Full shape in §2.

### Exact functions and lines to change

| File | Change |
|---|---|
| `packs/index.js` | add `CHALLENGE_INDEX`, `getPackForChallenge()`, duplicate-id throw (after line 44) |
| `netlify/functions/submit-flag.js:101-103` | resolve pack from challenge id / body `packId`, not token |
| `netlify/functions/submit-flag.js:106` | accept optional `packId` in body |
| `netlify/functions/submit-flag.js:115-127` | bare-flag path iterates all enabled packs |
| `netlify/functions/submit-flag.js:173-174, 187, 206` | composite solve keys via `resolveSolveKey` |
| `netlify/functions/session.js:100, 108-127` | drop token-pack; per-pack solves; 3-part re-mint (`createSessionToken(secret, handle)`) |
| `netlify/functions/register-handle.js:47, 56` | mint 3-part token; `packId` body field becomes advisory (`lastActivePackId` seed) |
| `netlify/functions/manifest.js:31` | pack from `?packId=` query (validated against enabled packs), not token |
| `netlify/functions/leaderboard.js:87-155` | `?packId=` filter (§2) |
| `netlify/functions/utils/store.js` | `resolveSolveKey()` helper; nothing else |
| `src/utils/api.js:31-45` | (unchanged registration payload is now fine) |
| `src/utils/api.js:67-76` | `fetchManifest(packId)` sends `?packId=` |
| `src/utils/api.js:78-95` | `submitFlagApi` sends `packId`; **fix the latent arg-order bug**: `src/App.jsx:331` and `:378` pass `cwd` in the `hintsUsedByChallenge` slot, so `cwd` never reaches the server today and replay always falls back to `challenge.setup.cwd` (`submit-flag.js:58-60`). Convert `submitFlagApi` to a single options-object parameter. |
| `src/App.jsx:98-115` | `handleSelectPack` persists to `localStorage`, refetches manifest for the new pack |
| `src/App.jsx:131-133` | restore from localStorage/`lastActivePackId`; server no longer overrides |
| `src/utils/api.js:103-110` | `fetchAdminOverview(packId)` actually forwards its argument (today `AdminOverview.jsx:22` passes it and `api.js:103` drops it, so the JSON view always shows the token's pack) |

### Tests to add

New file `tests/functions.submit-flag.test.js` (see §7 for the harness): register a handle through the real `register-handle` handler, then POST `submit-flag` with `challengeId: 'l1-pwd'`, `commandText: 'pwd'` — assert 200 and `points: 10`. This is the exact live repro and fails on today's code. Add: cross-pack second solve in the same session (one solve in each of two packs, both land, both keys pack-scoped); legacy 4-part token still accepted; legacy bare solve key attributed to the right pack; duplicate-challenge-id fixture makes `CHALLENGE_INDEX` throw.

**Acceptance criterion:** a student who registers through the UI, switches to any enabled pack, solves, reloads, and switches again ends with correct per-pack scores; the new function-level suite passes; `node bin/gauntlet.js validate` and the existing 96 tests stay green.

---

## 2. Packs as separate CTFs, enabled per deployment

### Where the config lives: a config blob, seeded by an env var

Three candidates:

- **Committed file** — wrong audience: changing it means editing the repo and redeploying, which the §3 teacher cannot do.
- **`ENABLED_PACKS` env var only** — deploy-button friendly (the template can prompt for it, §3) and consistent with `ADMIN_HANDLES`, but changing it later means navigating the Netlify dashboard and triggering a redeploy; also invisible to the admin UI.
- **Config blob, seeded from the env var** — chosen. Blob `config/settings` in the existing store: `{ enabledPacks: ["forensics-cli-101", …], updatedAt, updatedBy }`. On first read, if the blob is absent, seed it from `process.env.ENABLED_PACKS` (comma-separated) or "all packs" when unset. An admin edits it live from the UI with no redeploy. This mirrors the store's existing role as the only mutable state and keeps the deploy button able to preconfigure it.

Implementation: `getSettings()` / `setSettings()` in `netlify/functions/utils/store.js`; new function `netlify/functions/config.js` — `GET` (any valid session token) returns `{ enabledPacks: [{id, name, version, acts, badges, platforms}] }` built by filtering `listPacks()` (`packs/index.js:52-62`); `POST` (admin only, via `isAdminHandle`, `netlify/functions/utils/admin.js:134`) updates the list, validating every id against `PACKS`.

### How the UI learns

`PackSelector.jsx:186` currently calls the bundled `listPacks()` — every deployment shows all three packs regardless of the instructor's intent. Change: `App.jsx` fetches `/api/config` after session init and passes `enabledPacks` down; `PackSelector` renders only those; the pack indicator button (`App.jsx:450-457`) hides when only one pack is enabled. `manifest.js` and `submit-flag.js` reject a `packId` not in `enabledPacks` (403 with a clear message) so devtools cannot re-enable a hidden pack.

### One leaderboard per enabled pack

Yes — each enabled pack is its own CTF with its own board. This falls straight out of §1's pack-scoped solve keys; there is no separate scoreboard *storage* namespace, only a filter: `GET /api/leaderboard?packId=X&window=all|week` returns `{ success, packId, window, totalPlayers, leaderboard: [{rank, handle, score, solveCount, badges, lastSeen}] }` where score/solveCount count only solves whose `resolveSolveKey().packId === X`. `src/components/Leaderboard.jsx` gains a pack tab strip over the enabled packs (default: the student's active pack). Keep the existing no-param behavior (all-pack combined board) as an "Overall" tab — it costs nothing and instructors will ask for it. Note: `Leaderboard.jsx:10` imports `BADGE_DEFINITIONS` from the legacy shim `src/data/challenges.js:9-10`, which hardcodes the forensics pack — replace with per-pack badges from the API response while in there.

### Join one CTF or roam all?

Students **roam all enabled packs** with one handle and one registration. Rationale: registration is handle+password only; per-pack rosters would require per-pack registration for zero pedagogic gain; per-pack leaderboards already keep competition fair; and design (a) made roaming free. "One class = one pack" is expressed by enabling exactly one pack.

### Several class sections on one Netlify site?

No — one site per section, and that is the feature, not a limitation. Blobs stores are site-scoped, so a second site is automatically a clean roster, clean scores, its own `CLASS_PASSWORD`, its own admin list, at zero marginal cost on the free tier. The §3 deploy button makes standing up a section a ~10-minute task. True multi-tenant sections on one site (per-course passwords, rosters, instructor accounts) is the MODULES-DESIGN course object (`docs/MODULES-DESIGN.md` §4-6) and is out of scope here; nothing in this plan blocks it — pack-scoped solve keys are a prerequisite it lists (§6.2) and we ship them.

### A pack disabled AFTER students have solves in it

Explicit policy, implemented in this order:

1. **Solve records are never deleted or rewritten** by a config change. Disabling filters visibility only.
2. `submit-flag.js` rejects new submissions for disabled packs (403 "This module is closed").
3. `/api/leaderboard` refuses `?packId=` of a disabled pack (404); the "Overall" tab **keeps counting** disabled-pack solves — points earned stay earned. (If an instructor wants them gone from the overall board, they re-enable or exports mid-semester; do not build a third state.)
4. `/api/session` still returns the disabled-pack solves (flagged with their packId) so a student's history is intact; the client detects that its stored active pack is no longer enabled and falls back to the first enabled pack with a one-line notice.
5. `admin-overview.js` continues to accept disabled packIds — instructors keep gradebook access to closed modules. Only student-facing surfaces filter.
6. Re-enabling restores everything; nothing was lost.

**Acceptance criterion:** with `enabledPacks: ["linux-fundamentals"]`, a student sees exactly one pack, cannot submit to the others even by hand-crafted request, the leaderboard shows only that pack's board; disabling a pack mid-class hides its board and blocks new solves while `admin-overview?packId=` still exports its grades; re-enabling restores the board with all prior scores.

---

## 3. One-click free deploy for a non-technical teacher

### The mechanism: Deploy to Netlify button + `[template.environment]`

The real mechanism is Netlify's template deploy flow. The button URL for this repo (today's name; §5 updates it):

```
https://app.netlify.com/start/deploy?repository=https://github.com/jamestwebb/the-gauntlet
```

Requirements: the GitHub repo must be **public**. The flow clones the repo into the teacher's own GitHub account, creates a Netlify site linked to that clone, and — this is the load-bearing part — **prompts for every env var listed in `[template.environment]` in `netlify.toml`**, showing the value string as the field's description. Add to `netlify.toml`:

```toml
[template.environment]
  CLASS_PASSWORD = "The password your students will type to join. Pick anything; you will say it out loud in class."
  ADMIN_HANDLES = "Your instructor handle(s), comma-separated. Register these handles yourself before telling students the password."
  ENABLED_PACKS = "Optional: comma-separated pack ids to offer (leave blank for all)."
```

Deliberately **not** listed: `SESSION_SECRET` (self-provisioned below — a teacher should not be asked to invent cryptographic material) and `GAUNTLET_STORE` (safe default in code, `store.js:181`). Put the button in `README.md` markdown: `[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=...)`.

### Drag-and-drop deploy: verdict — NO

Reason it through: Netlify Drop deploys a folder of prebuilt static assets. This site needs (1) a build (`npm run build`; the dropped folder would have to be a locally built `dist/`, which already assumes a terminal and Node — the person we are targeting has neither), (2) serverless functions bundled from `netlify/functions/` — Drop's flow does not build or bundle functions, (3) env vars set **before** the first student registers — Drop has no env-var step, so the site comes up returning 500 from `register-handle.js:30-33` (fail-closed by design), and (4) a git link for updates, which Drop never creates, so every fix means a re-drag. Every one of these is fatal alone. The button flow does all four. Verdict: do not document drag-and-drop; document the button only.

### SESSION_SECRET self-provisioning

The teacher cannot run `openssl`. A function can mint the secret itself:

- New `getSessionSecret()` in `netlify/functions/utils/store.js` (or a sibling `secrets.js`): return `process.env.SESSION_SECRET` if set (power users keep full control and rotation-by-env); else read blob `config/session-secret`; else generate `crypto.randomBytes(32).toString('hex')` (Node `crypto` is available in Functions), write it to the blob, **re-read the blob and use the stored value** — the re-read makes the two-concurrent-cold-starts race converge on one winner (blob writes are last-write-wins; the store is already `consistency: 'strong'`, `store.js:180-183`). Every function that reads `process.env.SESSION_SECRET` today (`register-handle.js:29`, `session.js:85`, `submit-flag.js:87`, `manifest.js:8`, `admin-overview.js:16`) switches to `await getSessionSecret()`.

**Security cost, stated plainly:** the secret moves from Netlify's env-var store into the same blob store as the data it signs. Anyone with Netlify site access can read it either way, so the practical trust boundary is unchanged; what is lost is (1) separation between "data an attacker might exfiltrate via a blob-layer bug" and "the key that signs flags/sessions", and (2) env-managed rotation (rotation becomes "delete the blob" — document it; deleting it invalidates all sessions and regenerates all flags, same blast radius as rotating the env var today). For a classroom scoreboard signing 72-hour tokens and per-student flags, this is an acceptable trade for removing the single hardest step for the target user. The env var remains the override for anyone who cares.

### First-run setup: claiming the first admin

`ADMIN_HANDLES` is prompted by the button, but a teacher may leave it blank or typo it. Add a first-claim fallback:

- `isAdminHandle()` (`netlify/functions/utils/admin.js:134-136`) becomes async and checks the env list **or** blob `config/admins` (a JSON array).
- In `register-handle.js`, after `createPlayer` succeeds (line 49): if the env list is empty **and** `config/admins` does not exist, write `[cleanHandle]` to `config/admins` and include `firstAdmin: true` in the response; the UI shows "You are the instructor for this site."
- Risk: a student who registers first becomes admin. Mitigations: registration is already gated by `CLASS_PASSWORD`, which the teacher sets during deploy and has not yet announced; the documented flow is "deploy → register yourself → announce password", same as today's README (`README.md:84`, `.env.example:16`). A later admin-management UI can edit `config/admins`; not in this plan's critical path.

### Complete env-var table

| Variable | Required? | Default / fallback | Prompted by button? | Read at |
|---|---|---|---|---|
| `CLASS_PASSWORD` (alias `COHORT_PASSWORD`) | **Yes** | none — API fails closed with 500 | Yes | `register-handle.js:28` |
| `SESSION_SECRET` | No (after this work) | self-provisioned into blob `config/session-secret` | No | `getSessionSecret()` everywhere `SESSION_SECRET` is read today |
| `ADMIN_HANDLES` | No | empty → first-claim flow writes `config/admins` | Yes | `utils/admin.js:128` |
| `ENABLED_PACKS` | No | all packs; seeds `config/settings` on first read | Yes | new `utils/store.js#getSettings()` |
| `GAUNTLET_STORE` | No | `gauntlet-fall2026` | No | `store.js:181` |
| `VITE_API_BASE` | No | `/api` (dev-only override) | No | `src/utils/api.js:7` |

**Acceptance criterion:** starting from a clean browser and a Netlify account, a tester who is forbidden to open a terminal reaches a working site — registers the instructor handle, sees the INSTRUCTOR tab, registers a fake student in a second browser, solves a challenge — in under 20 minutes, entering only `CLASS_PASSWORD` and `ADMIN_HANDLES` in the deploy form.

---

## 4. Instructor UI: answers and helping students

### First, the leak check (checked, not assumed)

**The client bundle already contains the full answer key, for every student.** `src/App.jsx:23` imports `packs/index.js`, which imports all three `challenges.json` files (`packs/index.js:4-17`); `src/data/challenges.js:4-5`, `PackSelector.jsx:181`, and `AdminOverview.jsx:7` do the same. So the production JS bundle served to students contains, for all 97 challenges: `acceptedVariants` (the canonical solutions — the validator solves with exactly these, `packages/engine/validate/packValidator.js:182-183`), the `success` predicates and regex patterns (for `commandMatches` challenges the pattern **is** the answer), and **all hint texts including costed hints** — a student can read every paid hint free in devtools, and `hintsUsed` is client-reported anyway (`submit-flag.js:106`). Separately, `/api/manifest` (`manifest.js:34-43`) hands each student the literal values of all their flags so the client can inject them into the VFS — a student can read `flags` from the network tab and submit a flag without ever running a command (the server accepts a bare correct flag, `submit-flag.js:115-127`).

Said plainly: **there is no answer-key secrecy today.** Command-proof challenges are still honest (the server replays the command), but flag challenges and the hint economy are honor-system for anyone who opens devtools. Consequence for this section: shipping an instructor answer-key *view* leaks nothing new. The real fix — challenges served from a session-gated endpoint with hints/variants/patterns stripped for students, and server-side hint unlock accounting — is real work (it breaks the offline practice mode and the client-side auto-check at `App.jsx:285-302`) and is scheduled as its own phase-4 item, not smuggled into the UI work.

### Additions to `src/components/AdminOverview.jsx`

The component today (all in `AdminOverview.jsx`): three metric cards, a challenge solve-rate table with a STUCK POINT chip (rate < 35% with > 3 players, line ~190), a gradebook table, a recent-solves feed, CSV export (lines 35-59). Add four things:

**1. Answer key view** (new tab inside AdminOverview). Data source: the bundle it already imports — `getPack(selectedPackId).challenges`. Per challenge render: title, act, points, brief, canonical solution (`acceptedVariants[0]`), all accepted variants, the `success` object verbatim (predicate name + pattern/args), hints with costs, `successMessage`. No new endpoint and no new response fields are needed for this view; it is a pure client render gated by the `session.isAdmin` flag (which the server sets from `ADMIN_HANDLES`, `session.js:102`). Security rule: the admin *tab* is cosmetic gating (any student can read the same JSON from the bundle today); the enforceable rule is that **every server response stays admin-gated** (`admin-overview.js:31-33` pattern) and that the phase-4 challenge-serving split removes the bundle copy — at which point this view switches to an admin-only endpoint field (`challengeStats[].answerKey`) with zero UI change.

**2. Per-student view** — click a row in the gradebook table → drill-down panel. Needs new server data from `admin-overview.js`:

- `playerSummaries[].solvedIds: ["<packId>/<challengeId>", …]` — already read in the loop at `admin-overview.js:63-79`, just not returned.
- `playerSummaries[].frontier` — computed server-side: the first unsolved challenge, in act order, of the selected pack whose act is unlocked for that student (reuse `isActUnlocked` from `submit-flag.js:12-24`; move it to a shared util so the two cannot drift). This is "exactly where the student is stuck".
- `playerSummaries[].recentAttempts` — what they last tried. This data does not exist today; submit-flag discards failures. Add an attempts log: in the failure path of `submit-flag.js` (before the 400 at line 166-170), append `{challengeId, packId, commandText: commandText.slice(0, 300), flagSubmitted: !!flag, at}` to blob `attempts/<handle>`, capped as a ring buffer (keep last 50; one read-modify-write per failed submission is fine at classroom scale under the store's documented last-write-wins policy, `store.js:12-14`). New `store.js` helpers `addAttempt(handle, entry)` / `getAttempts(handle)`. `admin-overview.js` returns the last 10 per player when a `?handle=` drill-down param is passed (avoid N×blob reads on the overview load; the drill-down fetches one player).

**3. "Class is stuck on this" signal.** Keep the existing solve-rate chip and sharpen it with the attempts data: `challengeStats[].failedAttempts7d` (count of ring-buffer entries per challenge across players, computed in the same overview loop) and flag `classStuck: true` when `failedAttempts7d >= max(5, 2 × solveCount)` — many tries, few successes. Render as a distinct chip with the top-3 most-tried wrong commands (`challengeStats[].commonWrongAnswers`, top commandText values) so the instructor sees *what* the class is typing, which is the actually useful part in lecture.

**4. Fix the pack selector plumbing**: `AdminOverview.jsx:22` passes `packId` to `fetchAdminOverview`, which drops it (`src/utils/api.js:103-110` takes no parameter) — the JSON view silently shows the token pack. One-line fix; already listed in §1's table.

Serving function: `netlify/functions/admin-overview.js` serves all of the above; new response fields: `playerSummaries[].solvedIds`, `.frontier`, `.recentAttempts` (drill-down only), `challengeStats[].failedAttempts7d`, `.classStuck`, `.commonWrongAnswers`, plus the existing shape unchanged.

**Acceptance criterion:** an admin session can, for any enabled or disabled pack, read the full answer key, open any student and see their frontier challenge plus their last 10 failed attempts verbatim, and see a class-stuck chip appear after ≥5 failed attempts with ≤2 solves on one challenge; a non-admin token gets 403 from every new server field (function-level test).

---

## 5. Renaming the project (runbook — name chosen by the creative agent)

Current state: GitHub repo `jamestwebb/the-gauntlet`, npm `name: "the-warren"` (`package.json:2`), folder `warren/`, UI brand "THE GAUNTLET — Forensics CLI 101". Write `NEWNAME` for the chosen name and `newname` for its slug.

**Scope note:** "Warren/Topside" inside `packs/forensics-cli-101/` (`pack.json` theme, `fs.linux.js`, `WarrenMap.jsx`, `commands.js`) is *pack lore*, not product brand — rename only if the creative agent renames the pack. `tests/debranding.test.js:8-19` forbids `warren` (and other lore words) inside `packages/engine/` only; if `NEWNAME` overlaps any lore word, add it to that list's exemptions consciously.

### A. Files that carry the name (grep-verified)

Product brand (must change):
1. `package.json:2` — `"name"`; also the `validate` script path if `bin/gauntlet.js` is renamed (`package.json:11`).
2. `index.html` — `<title>`, `<meta name="description">` (lines 7-8).
3. `README.md` — title, prose, deploy-button URL (§3), env table.
4. `src/App.jsx:445` — header wordmark "THE GAUNTLET".
5. `src/components/Gate.jsx:71-75, 162, 171` — gate heading, tagline, button text, footer.
6. `src/components/Boot.jsx`, `BrandMark.jsx`, `KeyboardGuard.jsx`, `Leaderboard.jsx`, `SimulationBoundary.jsx` — brand strings (grep `-i gauntlet`).
7. `src/components/AdminOverview.jsx:96` ("INSTRUCTOR CONSOLE // THE GAUNTLET") and `:49` CSV filename; server twin at `netlify/functions/admin-overview.js:104`.
8. `netlify/functions/register-handle.js:52, 63` — user-facing messages.
9. `bin/gauntlet.js` — usage text and, if desired, the filename (update `package.json:11` and `.github/workflows/ci.yml` in the same commit).
10. `.env.example` — comments and `GAUNTLET_STORE` line; `.github/workflows/ci.yml:1` — workflow name.
11. `src/utils/api.js:20-28` — `warren_token` localStorage key: **keep it**, or migrate (read old key, write new, delete old) — a bare rename logs every student out mid-semester. Same for the §1 `warren_active_pack` key.
12. Docs (`docs/*.md`, `packs/AUTHORING.md`, `packs/index.js` header comments) — cosmetic, batch with sed.

### B. `GAUNTLET_STORE` — the data-orphaning trap

Two separate renames; do not conflate:
- **The env var name** (`GAUNTLET_STORE` → `NEWNAME_STORE`): safe only with a dual-read shim in `store.js:181`: `process.env.NEWNAME_STORE || process.env.GAUNTLET_STORE || 'gauntlet-fall2026'`. Keep the shim at least one semester.
- **The store value** (`gauntlet-fall2026`): renaming the *value* points the site at an empty store — every player, solve, and (after §3) the self-provisioned SESSION_SECRET is orphaned in the old store, which also invalidates every session and regenerates every flag. **Never change the value mid-semester.** Change the *default* value in code only for the next-semester default, and document recovery: set the env var back to the old value, or accept the reset at a term boundary (`store.js:5-8` documents this as the intended lifecycle). Old data is removed with `netlify blobs:delete` when grades are archived.

### C. GitHub repo rename — what breaks

`gh repo rename NEWNAME` (Settings → General otherwise). GitHub installs a permanent redirect from `jamestwebb/the-gauntlet`:
- **Existing clones:** keep working via the redirect; update anyway (`git remote set-url origin https://github.com/jamestwebb/newname.git`) because the redirect dies the moment anyone creates a *new* repo under the old name.
- **Deploy-button URL:** the `app.netlify.com/start/deploy?repository=` link resolves through the same redirect, but update it in `README.md` — third-party copies of the old URL are the reason to do the repo rename *before* announcing the button.
- **Netlify↔GitHub link:** Netlify tracks the repo by ID and survives the rename; verify with one post-rename push → deploy, and relink in Site settings if it does not fire.

### D. Netlify site rename — what breaks

Renaming the site slug changes `https://<site>.netlify.app` immediately and **the old subdomain is not redirected — students' bookmarks break**. Do this only between semesters, or attach a custom domain first and rename the slug beneath it freely.

### E. Order of operations

1. Branch. Code + docs strings (A), `store.js` dual-read shim (B), localStorage migration (A.11). Run `npm test` (fix `debranding.test.js` interactions), `npm run validate`, `npm run build`, and the §7 function suite. Merge.
2. GitHub repo rename (C). Update local remotes. Push; confirm CI runs and Netlify deploys.
3. Update deploy-button URL + README references; commit.
4. Netlify env: add `NEWNAME_STORE` with the **current** value; leave `GAUNTLET_STORE` in place for one release. Do not touch the value.
5. Netlify site rename (D) — deferred to a term boundary unless a custom domain is live.
6. Next term: retire the old env var and the dual-read shim; new default store value ships with the new brand.

**Acceptance criterion:** after steps 1-4, a mid-semester student's existing token, active pack, and scores survive a deploy of the renamed code (verified in staging with a pre-rename token and store), CI is green, and the deploy button provisions a working site from the renamed repo.

---

## 6. Authoring new packs

### What the two documents already cover

- `packs/AUTHORING.md` covers **pedagogy only**: the fading-scaffolding rule by act (brief/free-hint/costed-hint table), brief-writing and hint-writing norms, hint costs, and the fact that `tests/scaffolding.test.js` executes brief/free-hint snippets against the challenge's own predicate. It explicitly says the mechanical rules "are enforced by `node bin/gauntlet.js validate`" — and then never states them. There is no file-contract reference anywhere.
- `docs/MODULES-DESIGN.md` is a forward-looking proposal: module taxonomy (what honestly fits the engine: dead-box analysis; a catalogue of four new packs with effort notes), module=pack decision, a curated `packs/skills.json` vocabulary, challenge schema v2 (`scaffold` tier, `skills` tags), course objects, instructor accounts. It documents today's ground truth precisely (§0.1) but prescribes tomorrow's contract, not today's.

### The file contract today (as enforced by code — this is what a TA must produce)

A pack is a directory under `packs/` plus a **hand-edit to the registry** (`packs/index.js:19-44`: three imports and a `PACKS` entry with `id`, `manifest`, `challenges`, `help`, `commands`, `createFs(platform)`):

- `pack.json` — `id`, `name`, `version`, `platforms`, per-platform `{home, user, host, shell}`, `theme`, `messages`, `courseTools` (real-tools honesty map), `acts` (id, name, tagline, icon, `unlockThreshold`), `badges` (see `packs/forensics-cli-101/pack.json`).
- `challenges.json` — array of `{id, act, title, points, brief, setup{cwd}, success{kind|predicate,…}, hints[{cost,text}], successMessage, teaches[], acceptedVariants[], platform?, commandCheckExempt*}`. Every challenge **must** declare `acceptedVariants` or quote a runnable command in its brief, or the validator fails it (`packValidator.js:190`).
- `fs.linux.js` / `fs.windows.js` — exported `create*Filesystem()` returning the VFS node map; flag placement via `[[FLAG:<challengeId>]]` placeholders in file content (`submit-flag.js:41-52`).
- Optional `commands.js` (pack-specific virtual commands) and `help.json`.

### How `bin/gauntlet.js validate` proves it

`node bin/gauntlet.js validate [pack-id] [--all] [--json] [--verbose]` runs `validatePack` (`packages/engine/validate/packValidator.js`) and machine-proves: every challenge solvable by replaying `acceptedVariants` through the simulated shell against a fresh VFS with real flags injected; VFS node integrity; every flag placeholder maps to a challenge and every flag challenge's flag is reachable; act-progression math cannot deadlock; briefs' quoted commands actually run; `setup.cwd` exists. `tests/validator-catches.test.js` proves the validator itself catches each breakage class. CI runs `validate --all --json` on every push (`.github/workflows/ci.yml`).

### What is missing today (this is the authoring backlog)

1. **Registry auto-discovery** — the single sharpest edge. A TA who writes a perfect pack directory still has to edit `packs/index.js` (imports must be static for Vite, so true runtime discovery is out). Fix: `node bin/gauntlet.js new <pack-id>` scaffolds the directory *and* a generated `packs/registry.gen.js` (checked in, regenerated by the CLI, imported by `packs/index.js`), so the human never edits the registry. (S/M)
2. **A written schema reference** — `packs/AUTHORING.md` needs a "file contract" section: every `pack.json` field, every `challenges.json` field, the list of predicates in `packages/engine/validate/predicates.js` with argument shapes, the VFS node format (`mode`/`owner`/`group` semantics), and the `[[FLAG:id]]` / `[[FLAG:USER_HANDLE]]` placeholder rules. Today this knowledge lives only in the three existing packs as examples. (M)
3. **Challenge-id namespacing rule** — with §1's global-uniqueness CI gate, AUTHORING.md must state: "prefix every id with your pack's short code" and `gauntlet new` should enforce it. (S)
4. **A dev loop for content** — `gauntlet validate` is batch; authors want `gauntlet try <pack> <challengeId> "<command>"` to run one command against the challenge's VFS and print the predicate verdict. All pieces exist (`runPipeline`, `evaluatePredicate`); this is a CLI subcommand. (S/M)
5. **The engine command envelope, written down** — which commands/flags the simulator implements per platform (MODULES-DESIGN §0.1 catalogues them; move that table into AUTHORING.md so authors stop discovering `find -perm` is missing by failing validation). (S)
6. Longer term, adopt MODULES-DESIGN's `scaffold` tier and `skills` vocabulary — deliberately out of this plan's scope; nothing here conflicts with it.

**Acceptance criterion:** a TA who has never read the engine source, given only `packs/AUTHORING.md`, produces a 5-challenge pack that passes `gauntlet validate` and appears in the UI without editing any file outside their pack directory (post-item-1) — dry-run this with a real TA.

---

## 7. Test and CI plan

### Why 96 passing tests missed the pack-binding bug

Every existing test file exercises the **engine and content layers**: tokenizer, executors, pipeline, VFS, validator, scoring math, SFW filter, scaffolding lint, fidelity. `tests/crypto.test.js:33-41` even proves a token carries `packId` faithfully — the primitive worked perfectly. **No test imports anything under `netlify/functions/` or `src/`**, so no test ever composed the real sequence *register → token → switch pack in UI → submit*. The bug lived entirely in that composition seam: correct crypto, correct engine, wrong wiring. The suite proved every part and never the whole.

### The regression test that would have caught it

New harness `tests/functions.helpers.js`: set `process.env.{SESSION_SECRET, CLASS_PASSWORD, ADMIN_HANDLES, NETLIFY_DEV='true'}` and point cwd at a temp dir so `store()` falls into `fileBackend()` (`store.js:158-190` — this local JSON backend already exists; tests get persistence for free with no Netlify emulator). Functions are ESM default exports taking a `Request` — invoke them directly.

`tests/functions.pack-binding.test.js` (fails on today's code, passes after §1):

1. POST `register-handle` `{handle:'s1', classPassword}` — through the UI-equivalent payload, i.e. **no packId**.
2. POST `submit-flag` with the returned token, `{challengeId:'l1-pwd', commandText:'pwd', cwd:'/home/student'}` (a linux-fundamentals challenge; `l1-pwd` is the live-proof challenge).
3. Assert 200 and `points: 10`. Today: 400 `INCORRECT FLAG OR INVALID COMMAND PROOF`.
4. Companion case: same session then solves a forensics challenge — both solves present in `/api/session`, each attributed to its own pack.

### The full pre-ship bar

Function-level suite (all via the harness):
- **Auth**: register happy path; duplicate handle 409; wrong password 403; missing env 500; tampered/expired token 401 on session/submit/manifest/admin; legacy 4-part token accepted post-§1.
- **Pack binding** (above) + composite solve keys + legacy bare-key attribution + `CHALLENGE_INDEX` duplicate-id throw.
- **Enabled packs (§2)**: disabled pack → 403 on submit, 404 on its leaderboard, hidden from `/api/config`, still served by admin-overview; re-enable restores.
- **Leaderboard**: per-pack filtering, weekly window, badge award per pack.
- **Admin (§4)**: non-admin 403 on every new field/param; attempts ring buffer caps at 50; frontier computation matches `isActUnlocked`.
- **Deploy path (§3)**: `getSessionSecret()` generates once, is stable across two calls, env var wins when set; first-admin claim happens exactly once.
- **Client seam**: unit-test `submitFlagApi`'s options-object refactor so the `cwd`-in-the-wrong-slot class of bug (App.jsx:331/378) cannot recur silently.

CI (`.github/workflows/ci.yml` already runs `npm test`, `validate --all --json`, `npm run build`): the new suites run under `npm test` automatically; add the global-challenge-id-uniqueness assertion to the validator so `validate --all` is the CI gate for content collisions.

**Acceptance criterion:** the pack-binding regression test demonstrably fails on the pre-fix commit and passes on the fix commit (run it against both, once, and record it in the PR); total suite green in CI; no function file remains unimported by any test.

---

## 8. Sequenced work plan

Sizes: S ≤ half a day, M ≈ 1-3 days, L > 3 days.

**Phase 0 — Function test harness** *(prerequisite for touching functions safely; no dependencies)*
- 0.1 (S) `tests/functions.helpers.js`: env stubbing + fileBackend store + Request invokers.
- 0.2 (S) Pack-binding regression test, committed failing-then-fixed alongside Phase 1.

**Phase 1 — THE PACK-BINDING FIX** *(first; the 30→97-challenge difference; depends: 0)* — ships independently as one release.
- 1.1 (S) `CHALLENGE_INDEX` + `getPackForChallenge` + duplicate-id throw in `packs/index.js`; validator uniqueness check.
- 1.2 (M) Server: submit-flag pack resolution + all-pack flag search; composite solve keys + `resolveSolveKey` lazy migration; session/manifest/leaderboard/register per §1 table.
- 1.3 (S) Client: `handleSelectPack` persistence, reload restore, `fetchManifest(packId)`, `submitFlagApi` options-object (fixes the `cwd` slot bug), `fetchAdminOverview` forwards `packId`.
- 1.4 (S) Function tests: cross-pack solves, legacy token, legacy keys.

**Phase 2 — Separate CTFs per deployment** *(depends: 1 for pack-scoped scores)*
- 2.1 (S) `config/settings` blob + `ENABLED_PACKS` seed + `GET/POST /api/config`.
- 2.2 (S) Enforcement in submit-flag/manifest/leaderboard; disabled-pack policy §2 items 1-6.
- 2.3 (M) UI: PackSelector from `/api/config`; per-pack leaderboard tabs + Overall; replace `src/data/challenges.js` badge shim in `Leaderboard.jsx`.

**Phase 3 — One-click deploy** *(independent of 1-2; ships any time)*
- 3.1 (S) `[template.environment]` in `netlify.toml` + README deploy button.
- 3.2 (M) `getSessionSecret()` self-provisioning + all five call sites + tests.
- 3.3 (S) First-admin claim in register-handle + `isAdminHandle` blob check.
- 3.4 (S) The 20-minute no-terminal acceptance walkthrough, documented.

**Phase 4 — Instructor UI** *(4.1 independent; 4.2-4.3 depend on 1 for pack-scoped data)*
- 4.1 (S) Answer-key tab (client-rendered from the bundle; honest about the existing leak).
- 4.2 (M) Attempts log (`attempts/<handle>` ring buffer) + submit-flag failure hook.
- 4.3 (M) Per-student drill-down (`solvedIds`, `frontier`, `recentAttempts`) + class-stuck signal + common-wrong-answers.
- 4.4 (L, separately scheduled) Server-side challenge serving: strip `acceptedVariants`/hint texts/patterns from the student bundle, server-side hint accounting; closes the §4 leak for real. Do not block 4.1-4.3 on it.

**Phase 5 — Rename** *(runbook §5; depends on the creative agent's name; steps 1-4 any time, step 5 at term boundary)* — (M total).

**Phase 6 — Authoring** *(independent)*
- 6.1 (M) AUTHORING.md file-contract + predicate + engine-envelope reference.
- 6.2 (M) `gauntlet new <pack-id>` scaffold + generated registry.
- 6.3 (S/M) `gauntlet try` single-challenge dev loop.

Independently shippable units: Phase 1 alone (the product goes from 30 to 97 scorable challenges); Phase 3 alone (teachers can deploy today's product); Phase 6 alone. Phase 2 should follow 1 within the same semester so leaderboards match the new multi-pack reality.

---

## RISKS AND OPEN QUESTIONS

1. **Live data during the Phase-1 cutover.** Existing solve records are bare-keyed and stay valid via `resolveSolveKey`, but the lazy attribution is only exact while ids are globally unique. Risk is low (CI now enforces uniqueness) but the write-behind upgrade should land in the same release so the bare-key population only shrinks. Confirm against the production store before deploy (`netlify blobs:list`).
2. **Rolling-token interaction.** Post-§1, `session.js:127` mints 3-part tokens while students hold 4-part ones; both verify. But any cached client code (open tabs from the old bundle) will keep calling `handleSelectPack` expecting server pack authority. Accept: a hard refresh fixes it; the 72h token horizon bounds the mixed period.
3. **`hintsUsed` is client-reported and hint texts ship in the bundle** (§4). Until 4.4, hint penalties and flag-challenge integrity are honor-system. Decide: is 4.4 required before marketing the product outside a single trusted classroom? (Recommendation: yes for any multi-institution pitch.)
4. **Blob read amplification.** `leaderboard.js:97-116` and `admin-overview.js:53-89` do one `get` per player per request; per-pack tabs multiply calls to these endpoints. Fine at classroom scale (≤50 players, 30s CDN cache on leaderboard), but a 200-student deployment should get a cached aggregate blob (`agg/leaderboard`) refreshed on write — measure before building.
5. **Attempts log privacy.** `attempts/<handle>` stores literal student keystrokes (truncated to 300 chars). Commands can contain personal strings. Decide retention (proposal: ring buffer only, cleared with the store each term) and say so in instructor docs.
6. **`config/session-secret` in Blobs** (§3): accepted trade, but if the same store is ever exposed via a future user-facing blob feature, the secret must move first. Keep it in a key prefix (`config/`) that no listing endpoint ever serves.
7. **First-admin claim race** (§3): a student who obtains the class password before the teacher registers can claim admin. The documented deploy order prevents it; a `SETUP_CODE` variant (extra prompted env var) is the hardening if a pilot shows teachers announcing the password early.
8. **Netlify template-flow drift.** The `[template.environment]` prompt behavior and the `/start/deploy` URL format are Netlify product surface, not API contract — verify against Netlify's current docs at Phase-3 implementation time, and re-test the button after any repo rename.
9. **Open question — pack disabled with an active leader.** §2 keeps disabled-pack points on the Overall board. If an instructor disables a pack *because* of a scoring dispute, they may expect those points gone. Needs one instructor conversation before Phase 2 hardens the policy.
10. **Open question — `manifest.js` is Functions v1 style** (`exports.handler` with `event`, `manifest.js:7-18`) while every other function is v2. It works, but the §1 edit touches it; migrate it to v2 in passing or leave it? (Recommendation: migrate in 1.2; it is 20 lines and removes the only v1 code path.)
11. **Open question — practice mode vs. enabled packs.** Practice sandbox (`App.jsx:161-166`) is fully client-side and will still show all bundled packs even when disabled server-side. Decide whether practice mode respects `enabledPacks` (needs `/api/config` to be token-optional) or is explicitly exempt. Proposal: exempt, labeled "practice content may differ from your class".

# Modules & Courses — Design

**Status:** proposal · **Created:** 2026-08-18 · **Depends on:** the pack architecture shipped per `docs/UPLIFT-PLAN.md` §4
**The owner's ask:** *"fundamentals but then modules for particular cybersecurity areas that professors could stand up. If we make it modular, professors log in and then set what modules/challenges they want to offer. How are they displayed as units to the students?"*

---

## 0. The recommendation in one page

1. **A module is a pack.** No new content format. `pack.json` gains `kind`, `skills.requires`, `skills.teaches`, and an estimated time. New cyber modules are authored small (8–15 challenges) where the existing packs are large; the three existing packs become modules unchanged.
2. **A course is a new, Blobs-stored object** — an instructor-owned document naming an ordered list of modules, a join code, and a join password. The course, not the deployment, is now the unit of: password, roster, leaderboard, gradebook, and progression. Composition happens here, not in the content format.
3. **Instructors are Blobs-stored accounts** (username + scrypt password hash), bootstrapped by one env var (`INSTRUCTOR_SIGNUP_CODE`), then self-sustaining via instructor-minted invite codes. `ADMIN_HANDLES` is retired. No database.
4. **Scaffolding stops being a function of act number.** Every challenge declares `scaffold: "full" | "guided" | "objective"`; the lint gates on the tier, and the validator additionally requires that the first challenge teaching any skill *introduced by that module* is scaffolded — so a module dropped into any course position still teaches before it tests.
5. **Students see a syllabus:** the course home page is a numbered list of units with progress bars and lock states. Inside a unit, the existing three-pane sidebar + terminal UI is unchanged.
6. **Solve records are re-keyed `packId/challengeId`** (fixing the known collision bug), flags become HMACs over `courseId:packId:handle:challengeId`, and all player data moves under `courses/{courseId}/…` prefixes.
7. **First shippable slice:** instructor accounts + the course object + course-scoped join/roster/leaderboard/gradebook, with the three existing packs as the only selectable modules. No new content, no engine change, nothing about the current student experience inside a pack changes.

New module catalogue (§1): **Log Triage**, **Permissions Audit**, **Network Artifacts (static)**, **Windows Incident Response** — all buildable on the engine as it stands (one new `find -perm` flag). Live packet capture, memory forensics, cloud CLIs, and exploitation tooling are declared out of scope with reasons.

---

## 0.1 Verified ground truth this design builds on

Everything below was read from the code on 2026-08-18, not assumed.

| Fact | Where |
|---|---|
| Pack registry is a build-time module map; server and client both import it | `packs/index.js:20-56` |
| Session token = base64 `handle[:packId]:expiry:hmac`; verifier accepts 3- or 4-part | `packages/engine/crypto-utils.js:328-385` |
| Per-student flag = `FLAG{12×base32}` from HMAC over `packId:handle:challengeId` | `packages/engine/crypto-utils.js:312-326` |
| Server re-runs the student's command against a fresh VFS before awarding | `netlify/functions/submit-flag.js:35-75` |
| Solves stored per handle, keyed by **bare** `challengeId` — the collision bug | `netlify/functions/utils/store.js:58,78-88` |
| Players are a single global namespace `players/{handle}` | `netlify/functions/utils/store.js:57` |
| One global class password from env, fail-closed | `netlify/functions/register-handle.js:28-38` |
| Instructor = handle listed in `ADMIN_HANDLES` env var | `netlify/functions/session.js:32-36`, `netlify/functions/admin-overview.js:30-36` |
| Leaderboard is deployment-global and hardcodes the forensics pack's badges/challenges for **every** pack | `netlify/functions/leaderboard.js:5,57-66` |
| Act gate: `unlockThreshold` of previous act, clamped so 100% is never required | `netlify/functions/submit-flag.js:11-23`, mirrored in `packages/engine/validate/packValidator.js:24-27` |
| Scaffolding lint gates on `act >= 2` (`FIRST_GATED_ACT`), executes backticked snippets against the challenge's own predicate | `tests/scaffolding.test.js:28,46-105` |
| Validator proves solvability, act math, flag placement, brief commands, man-page flags | `packages/engine/validate/packValidator.js:49-350` |
| Stuck-point flag: solve rate < 35% with > 3 players | `src/components/AdminOverview.jsx:190` |
| The SPA has **no URL routing** — a `viewState` state machine only | `src/App.jsx:41,404-430` |
| Netlify redirects: `/api/*` only; no SPA catch-all yet | `netlify.toml:9-12` |
| VFS nodes carry real `mode`/`owner`/`group`; `fileHasMode` predicate exists | `packages/engine/vfs/builder.js:14-38`, `packages/engine/validate/predicates.js:112` |
| Engine command surface: ~53 Linux (incl. `uniq -c`, `awk`, `sed`, `xargs`, `ps`, `tar`), ~24 cmd.exe (incl. `tasklist`, `attrib`, `certutil`, `findstr`) | `packages/engine/commands/linux/index.js`, `windows/index.js` |
| `find` implements `-name -iname -type -maxdepth -size -mtime -delete -exec` — **no `-perm`** | `packages/engine/commands/linux/index.js` (find flags block) |
| Pack-supplied virtual commands work and ship today (`map`, `tracker`, `scan`, `extract`) | `packs/forensics-cli-101/commands.js` |

**Latent defects this design fixes in passing** (they sit exactly on the seams being rebuilt):

- **B1 — solve-key collision.** `store.js:58` keys solves by bare `challengeId`; two packs sharing an id would merge progress. Fixed by composite keys (§6.2).
- **B2 — `addSolve` arity mismatch.** `submit-flag.js:196-201` passes one object `{points, hintPenalty, earnedPoints, solvedAt}` where `store.js:78` expects `(points, hintPenalty)` — the stored record nests the object under `.points`, so `session.js:44-48` computes `object - 0 = NaN` net points. Fixed by the new solve-record schema (§6.2). *(Worth confirming against production data; the read path may be masking it via the client-side solve map.)*
- **B3 — leaderboard is pack-blind and global.** `leaderboard.js:5` imports the forensics pack's `CHALLENGES`/`BADGE_DEFINITIONS` for everyone. Replaced by the course-scoped leaderboard (§5.4).
- **B4 — `fetchAdminOverview` drops its argument.** `AdminOverview.jsx:23` passes `packId`; `src/utils/api.js:101-107` ignores it, so the JSON view always shows the token's pack. Superseded by the course-scoped endpoint (§4.6).

---

## 1. Module taxonomy — what genuinely works as a CLI module

The engine's honest envelope: **a writable virtual filesystem with permissions, text-in/text-out commands, pipes, redirection, and per-student flags. No processes beyond fixtures, no network, no execution of file content, no sub-REPLs.** A module fits when its real-world workflow is *"interrogate files with shell tools."* A module lies when its real-world workflow is *"interact with live state"* — and per the honesty principle (`docs/UPLIFT-PLAN.md` §0 non-goals), we do not fake live state with canned text and call it the skill.

### 1.1 The catalogue

**Core (exists — becomes the prerequisite layer):**

| Module | Now | Size | Platform | Requires | Engine status |
|---|---|---|---|---|---|
| `linux-fundamentals` | shipping | 40 ch / 4 acts | Linux | — | done |
| `windows-cmd-essentials` | shipping | 27 ch / 3 acts | Windows | — | done |
| `forensics-cli-101` | shipping | 30 ch / 6 acts | Linux + Win act | Linux navigation, `cat`, `grep` basics | done |

**New cybersecurity modules (author these, in this order):**

| # | Module id | Teaches | Size | Platform | Requires (skill tags, §2.3) | Engine gap |
|---|---|---|---|---|---|---|
| 1 | `log-triage` | Incident triage over auth/web logs: `grep -v/-c`, `sort`, `uniq -c`, `cut`, `awk '{print $N}'`, frequency analysis, building a findings file with `>`/`>>`, `tee`. Scenario: SSH brute-force + web-shell hunt in `/var/log`. | ~14 ch / 3 acts | Linux | `pipes`, `grep-basics`, `redirection` | **None.** Every command exists (`uniq -c` confirmed implemented). Content only. |
| 2 | `perm-audit` | Reading `ls -l`, octal vs symbolic `chmod`, `chown`, `sudo`, hunting world-writable files and SUID binaries with `find`, why `/etc/shadow` is denied. Scenario: harden a misconfigured web host image. | ~10 ch / 2 acts | Linux | `navigation`, `find-basics` | **`find -perm`** (S — one flag on an existing command; VFS modes are already real, `builder.js:14-38`). |
| 3 | `net-artifacts` | Network evidence **as static artifacts**: pre-exported `tshark`/Zeek-style `conn.log`, `dns.log`, `http.log`; beaconing and DNS-exfil detection via `cut | sort | uniq -c | sort -rn`; IOC extraction to a report file. | ~12 ch / 3 acts | Linux | `pipes`, `sort-uniq`, `awk-fields` | **None** — the artifacts are text files placed in the VFS. See the honesty note below. |
| 4 | `win-incident` | Windows IR with cmd.exe: `findstr /r` over exported event-log text, `tasklist` fixture triage, `attrib` hidden persistence, `.reg` export analysis with `findstr`, `certutil -hashfile` IOC matching. | ~12 ch / 3 acts | Windows | `cmd-navigation`, `findstr-basics` | **None** — `tasklist`, `attrib`, `certutil`, `findstr` all exist. Registry content ships as exported `.reg` **text files**, so no `reg query` command is needed. |

Later, if demand appears (do not build speculatively):

| Module | Notes |
|---|---|
| `shell-logic` | Exit codes, `&&`/`||`, `$?`, `test`, variables, quoting. This is `linux-fundamentals` Act IV today; carve it out only if instructors ask for fundamentals-without-scripting. Carving is cheap because a module is a pack (§2). |
| `integrity-hashing` | Chain-of-custody hashing drills. Currently well covered inside `forensics-cli-101`; a standalone version is a re-cut, not new ground. |
| `powershell-essentials` | Gated behind the second engine, `docs/UPLIFT-PLAN.md` §9.12. Not a modules-project concern. |

**The honesty note for `net-artifacts`** (this is the line between it and the rejected packet-capture module): the pack's framing is *"a colleague already ran `tshark -r capture.pcap` / Zeek on the wire data; you have the text exports."* That is a real and common triage posture — SOC analysts grep flat exports constantly — and every skill practiced (field extraction, frequency analysis, filtering) transfers verbatim to a real box. The module's `pack.json` `courseTools` map declares `tshark`, `tcpdump`, `wireshark`, `zeek` as *real tools not simulated here* (the mechanism already shipping at `packs/forensics-cli-101/pack.json:29-51`), and the first brief says so in plain text. What we never do is accept `tcpdump -i eth0` and print canned packets.

### 1.2 Rejected areas, with reasons

Each of these is tempting, requested often in cyber curricula, and would teach the wrong thing here:

- **Live packet capture (`tcpdump`, `wireshark`).** The skill *is* the interaction with a live interface — filters changing what you see, timing, follow-the-stream. A canned replay teaches incantations against fake liveness. The static-artifact module above captures the transferable 60% honestly.
- **Memory forensics (Volatility).** Output is a function of a real memory image and a plugin ecosystem; there is no process/memory model in the engine and building a fake one violates non-goal 3 (`docs/UPLIFT-PLAN.md` §0). `vol` stays in `courseTools` as a named real tool.
- **Cloud CLIs (`aws`, `az`, `gcloud`).** Service-state semantics, IAM, pagination, auth flows — a faithful simulation is a second product larger than this one. Also no filesystem to leverage.
- **Exploitation / live scanning (`nmap`, `metasploit`).** No network, no services, no execution model. A *saved* `nmap -oN` output file being grepped is legitimate and small — it lives inside `net-artifacts` as one or two challenges, not as a module claiming to teach scanning.
- **Password cracking (`john`, `hashcat`).** The real skill is wordlist/mask/GPU mechanics against real hash formats; a simulated cracker that "finds" a planted password teaches theater. Hash *identification and verification* (format recognition, `sha256sum` comparison) is already in `forensics-cli-101`.
- **`sqlite3` / any sub-REPL.** The engine has no sub-interpreter concept; faking a REPL inside the line-oriented pipeline would fork the tokenizer. Declared out (it is already listed as a real-but-unsimulated `courseTool`).
- **Editors (`vim`, `nano`) as a module.** A UI subsystem, not a curriculum unit — tracked separately in `docs/UPLIFT-PLAN.md` P8.

The catalogue's honest shape: **the platform's sweet spot is dead-box analysis and configuration audit.** All four new modules live there. That is a feature to state in marketing, not a limitation to hide.

---

## 2. Module vs. pack — a module IS a pack

### 2.1 The decision

Three candidate shapes were considered:

1. **Module = pack** (chosen). A module is a pack directory with module metadata in its manifest; the curriculum unit and the authoring/validation/theming unit stay the same object.
2. **Module = a slice of a pack** (act ranges or challenge lists inside a bigger pack). Rejected: every existing tool — `packValidator.js` (validates a pack), `scripts/build-instructor-guide.mjs` (renders a pack), `tests/scaffolding.test.js` (lints a pack), `createFs` (builds a pack's filesystem), the act-unlock math — operates on whole packs. Slices would force a sub-pack addressing scheme through all of them, and two modules sharing one VFS couple their content forever (editing module A's filesystem risks breaking module B's solvability proof).
3. **Module = a tag layer over a global challenge pool.** Rejected harder: it dissolves the pack's strongest property — a coherent scenario filesystem where `[[FLAG:id]]` placement, act math, and narrative are validated as a unit. A tag-assembled "module" has no provable solvability story and no home directory.

The thing the owner actually needs — *professors select and order units* — is a **composition** concern, and composition gets its own object: the **course** (§4, §6). Content format stays put; a course is a list of pack ids plus policy. This is the smallest design that delivers the sentence "professors log in and then set what modules they want to offer."

Practical consequence for authoring: **new modules are small packs** (8–15 challenges, 2–3 acts, one tight scenario, ~60–120 minutes of student time). The existing packs are big because they were courses; new packs are small because they are units. Nothing enforces size — it is an authoring norm for `packs/AUTHORING.md`.

### 2.2 What happens to the three existing packs

Nothing structural. Each gains the v2 manifest fields (§2.4) and becomes a selectable module as-is:

- `linux-fundamentals` → `kind: "core"`. The default Unit 1 of almost every course.
- `windows-cmd-essentials` → `kind: "core"`. The Windows-track parallel.
- `forensics-cli-101` → `kind: "module"`, `requires: ["navigation", "file-viewing", "grep-basics"]`. It is oversized for a module (30 challenges) but splitting it now buys nothing and costs re-validation of the capstone chain; revisit only if instructors ask for a shorter forensics unit.

`DEFAULT_PACK_ID` (`packs/index.js:59`) stops meaning "the curriculum" and survives only as the practice-sandbox default.

### 2.3 The skill graph: `teaches` + `requires` over a curated vocabulary

`teaches` exists on every challenge today but is free-text and messy — the three packs currently use 170+ distinct strings including near-duplicates (`'cd ..'` vs `'parent-directory'` vs `'parent-directories'`, `'pipes'` vs `'pipelines'`, `'wildcards'` vs `'globbing'`). A graph built on that is noise. So:

**New file: `packs/skills.json`** — the single curated vocabulary (~40 entries), engine-neutral, owned like a schema:

```jsonc
// packs/skills.json (excerpt — full list is an authoring task)
{
  "navigation":      { "label": "Moving around",        "summary": "pwd, cd, relative vs absolute paths" },
  "file-viewing":    { "label": "Reading files",        "summary": "cat, head, tail, less" },
  "hidden-files":    { "label": "Hidden files",         "summary": "dotfiles, ls -a, attrib +h" },
  "grep-basics":     { "label": "Pattern search",       "summary": "grep, findstr, case-insensitive matching" },
  "grep-filters":    { "label": "Search refinement",    "summary": "-v, -c, -n, inverted and counted matches" },
  "pipes":           { "label": "Pipelines",            "summary": "connecting commands with |" },
  "redirection":     { "label": "Redirection",          "summary": ">, >>, writing results to files" },
  "sort-uniq":       { "label": "Sort & count",         "summary": "sort, uniq -c, frequency analysis" },
  "awk-fields":      { "label": "Field extraction",     "summary": "cut, awk '{print $N}'" },
  "find-basics":     { "label": "Finding files",        "summary": "find -name, -type, dir /s" },
  "permissions":     { "label": "Permissions",          "summary": "ls -l, chmod, chown, sudo" },
  "hashing":         { "label": "Hashing",              "summary": "md5sum, sha256sum, certutil -hashfile" },
  "cmd-navigation":  { "label": "CMD navigation",       "summary": "cd, dir, tree on Windows" },
  "findstr-basics":  { "label": "findstr",              "summary": "findstr, /i, /r on Windows" },
  "env-vars":        { "label": "Environment variables","summary": "$VAR, %VAR%, set, export" },
  "exit-status":     { "label": "Exit status",          "summary": "$?, &&, ||, test" }
  // …
}
```

Challenge-level `teaches` keeps its free-text richness (it doubles as display copy), but **each challenge additionally maps to vocabulary tags**, and the pack manifest carries the rollup:

```jsonc
// pack.json v2 (additions only — everything shipping today is unchanged)
{
  "schemaVersion": 2,
  "kind": "module",                      // "core" | "module"
  "estimatedMinutes": 90,
  "skills": {
    "requires": ["pipes", "grep-basics", "redirection"],   // vocabulary tags only
    "teaches":  ["sort-uniq", "awk-fields", "grep-filters"] // what this module ADDS
  }
}
```

**`requires` names skills, not packs.** This is the load-bearing choice: a course that opens with `windows-cmd-essentials` and a course that opens with `linux-fundamentals` both satisfy different modules' prerequisites, and swapping in a future alternative fundamentals pack breaks nothing. Pack-id prerequisites would hard-wire the catalogue into every module.

**Where the graph is enforced — author time and course-build time, never play time:**

- `packValidator.js` (new checks): every `requires`/`teaches` tag exists in `skills.json`; `skills.teaches` is consistent with the challenges' vocabulary tags; warning if a challenge exercises a vocabulary tag that is neither in `requires` nor taught earlier in the same pack.
- The course builder (§4.5): when the instructor orders modules, the server computes, per position *i*, `requires(module_i) ⊆ ⋃ teaches(modules_0..i-1)` and returns human-readable **warnings, not refusals** ("Unit 3 'Log Triage' uses *pipelines*, which nothing before it teaches"). Instructors override freely — their students may have prior coursework.
- At play time there is **no skill-graph gating**. Runtime unlocking is the instructor's per-module policy (§5.3). A dynamic graph-driven unlock system would be invisible-rule frustration for students and un-debuggable for one developer; rejected as over-build.

### 2.4 Challenge schema v2 (delta)

```jsonc
// challenges.json — one entry, v2 additions marked
{
  "id": "lt2-bruteforce-count",
  "act": 2,
  "title": "How Many Failures?",
  "points": 25,
  "scaffold": "guided",                        // NEW — §3. Required at schemaVersion 2.
  "skills": ["sort-uniq", "pipes"],            // NEW — vocabulary tags (teaches stays free-text)
  "brief": "Count how many failed SSH logins each source address produced in `auth.log`. `sort` and `uniq` will get you there.",
  "setup": { "cwd": "/var/log" },
  "success": { "predicate": "outputMatches", "pattern": "..." },
  "hints": [
    { "cost": 0,  "text": "uniq only collapses adjacent duplicates — sort first." },
    { "cost": 10, "text": "grep 'Failed password' auth.log | awk '{print $11}' | sort | uniq -c" }
  ],
  "teaches": ["uniq -c", "frequency-analysis"],
  "acceptedVariants": ["…"]
}
```

---

## 3. Fading scaffolding across module boundaries

### 3.1 The problem restated

The current rule (`packs/AUTHORING.md`, enforced by `tests/scaffolding.test.js:28`) keys the gate to **act number**: act 1 free, acts 2–3 named-tool-only, act 4+ objective-only. Act number worked as a difficulty proxy when a pack was the whole course. Under composition it breaks two ways:

1. **Position no longer implies recall.** A student whose instructor put `log-triage` second has seen pipes 30 times; one whose instructor put it first has never seen a pipe. "Act 2 of log-triage" carries no information about either student.
2. **Act 1 of every module would reset to spoon-feeding** if we kept the act rule, un-fading the scaffold the pedagogy review made us build.

### 3.2 The replacement: an explicit per-challenge tier, plus a first-teach rule

**Primitive:** `scaffold: "full" | "guided" | "objective"` on every challenge (§2.4).

| Tier | The brief may | The free (cost-0) hint may | The costed hint |
|---|---|---|---|
| `full` | show the whole command line | show the whole command line | not needed |
| `guided` | name the tool; never a working flag/argument combination | nudge toward the flag or argument | gives the exact line |
| `objective` | state the goal only — **no tool names** | name the tool | gives the exact line |

This is the same three-row table already in `packs/AUTHORING.md`, decoupled from act numbers. Fading within a module still happens — authors ramp tiers across their own acts — but the tier is now **stated, not inferred**, so the lint and the instructor guide read the truth instead of a proxy.

**The cross-module rule (this is what solves "module B taken first"):**

> For every vocabulary skill in the module's `skills.teaches` — i.e., every skill this module *introduces* rather than assumes — the first challenge (in act-then-file order) whose `skills` include that tag must be `full` or `guided`.

Consequences:

- A module may open at `objective` tier **only for skills it lists in `requires`**. Recall-testing is legitimate exactly for material the module declares someone else taught.
- The "who taught it?" question moves to the course builder warning (§2.3): if the instructor sequences `log-triage` before anything teaching `pipes`, they get told at build time, in one sentence, and can reorder or accept. The module itself never has to know its position.
- Authors keep full freedom to re-scaffold: `net-artifacts` can teach `awk-fields` gently in its own act 1 even though `linux-fundamentals` also teaches it, simply by listing it in `teaches` and tiering accordingly.

**Rejected alternative — dynamic tiers** (compute the tier at play time from the student's solved-skill set, showing gentler hints to students who lack the prerequisite): pedagogically attractive, and rejected. It means the brief text itself must exist in multiple versions per challenge (authoring cost ×2–3), the lint must verify all versions, the instructor guide forks per student, and two students in one classroom see different briefs for the same challenge — a support nightmare in a lecture hall. If real demand appears, it can be layered on later *because* the tier primitive is per-challenge; nothing in this design forecloses it.

### 3.3 Enforcement — concrete lint changes

`tests/scaffolding.test.js` keeps its execute-the-snippet architecture (lines 46–105, unchanged: run every backticked snippet from the brief and free hints, test against the challenge's own predicate). Two mechanical edits:

```js
// tests/scaffolding.test.js — replaces the FIRST_GATED_ACT constant (line 28)
const tierOf = (c) =>
  c.scaffold ?? (c.act <= 1 ? 'full' : c.act <= 3 ? 'guided' : 'objective');
  // The fallback keeps schemaVersion-1 packs linting exactly as today.

// Gate change (replaces `if ((c.act ?? 1) < FIRST_GATED_ACT) continue;`):
if (tierOf(c) === 'full') continue;
```

And one **new check** the act rule never had, now possible because `objective` is explicit:

```js
// objective tier: the brief may not name the tool at all.
// A backticked single word that is a known command (registry, either platform,
// or a pack command) is a violation — the existing snippet-execution check
// only catches multi-word answers.
if (tierOf(c) === 'objective') {
  for (const m of (c.brief || '').matchAll(/`([^`]+)`/g)) {
    const word = m[1].trim();
    if (!/\s/.test(word) && knownCommands.has(word)) {
      violations.push(`${packId}/${c.id}: objective-tier brief names the tool \`${word}\`.`);
    }
  }
}
```

(`knownCommands` is already built at lines 38–43 from `registry.getAll` on both platforms plus pack commands. Path-like backticks — `` `auth.log` ``, `` `/var/log` `` — pass because they are not command names; naming the *target* stays required per `packs/AUTHORING.md` "name the file or directory involved".)

The **first-teach rule** lands in `packValidator.js` as a new check block (alongside `actProgression`, ~line 245), because it needs the manifest's `skills` rollup, which the scaffolding test doesn't load:

```js
// packValidator.js — new check: firstTeachScaffold
for (const tag of manifest.skills?.teaches || []) {
  const first = challenges
    .filter(c => (c.skills || []).includes(tag))
    .sort((a, b) => (a.act - b.act))[0];
  if (first && tierOf(first) === 'objective') {
    fail('firstTeachScaffold',
      `${id}: skill '${tag}' is introduced by this module but its first ` +
      `challenge '${first.id}' is objective-tier. First contact must be full or guided.`);
  }
}
```

Retrofit cost for the three shipping packs: run the derivation (`act→tier`) once, write the explicit field into each `challenges.json`, eyeball the ~97 assignments. Mostly mechanical; the forensics Windows act (act 6, currently treated as 4+/objective by the act rule) is the one place judgment is needed, since it re-introduces cmd.exe basics and should mostly be `guided` — the current act-number rule actually over-hardens it, which the explicit tier fixes for free.

---

## 4. Faculty experience

### 4.1 The identity problem, and the design

Today an instructor is a **student handle** that appears in `ADMIN_HANDLES` (`session.js:32-36`) — one global, deploy-time, comma-separated env var. That fails multi-instructor in every direction: adding an instructor means a redeploy, every instructor sees every student, and an instructor's "account" is a student registration with a magic name.

**Design: instructor accounts are first-class Blobs records with password auth, bootstrapped by one env secret, then self-sustaining.**

```
instructors/{username}   →  {
  "username": "jwebb",
  "displayName": "Prof. Webb",
  "passwordHash": "scrypt$16384$8$1$<salt-b64>$<hash-b64>",
  "role": "owner",                    // "owner" | "instructor"
  "createdAt": "2026-08-20T…",
  "invitedBy": null                   // or the inviting username
}
invites/{code}           →  { "createdBy": "jwebb", "createdAt": "…", "expiresAt": "…", "usedBy": null }
```

- **Bootstrap:** the deployment owner sets `INSTRUCTOR_SIGNUP_CODE` (long random string) at deploy time. `/teach/signup` accepts `username + password + code`. The first account created this way gets `role: "owner"`. The env code can stay set — it is only a signup gate, and the owner can rotate it whenever.
- **Growth without redeploys:** any instructor mints an invite code from the console (`POST /api/courses?action=invite` in §4.6 — stored under `invites/`, single-use, 14-day expiry). This is how a colleague or a TA gets an account.
- **Passwords:** `crypto.scryptSync(password, salt, 64)` with a random 16-byte salt per account, encoded as shown; verification via `crypto.timingSafeEqual`. Node's built-in scrypt runs comfortably inside a Netlify Function.
- **Sessions:** on login, the server issues an instructor token — the v2 token format (§6.3) with `role: "instructor"`, 12-hour expiry (students keep 72h; instructors gate a gradebook and get the shorter leash). Stored in `localStorage` under a separate key (`gauntlet_teach_token`) so one browser can hold both a student and an instructor session.

**Authorization model (the part that matters because grades are behind it):**

| Rule | Enforcement point |
|---|---|
| Student tokens (`role: "student"`) can never reach instructor endpoints; role is read from the verified token, never from a handle list | every `/api/courses*`, `/api/admin-overview` — replaces the `ADMIN_HANDLES` check at `admin-overview.js:30-36` |
| An instructor reads/writes only courses where `course.owner === token.username` or `token.username ∈ course.staff` | `courses.js`, `admin-overview.js` |
| `role: "owner"` additionally lists all courses and all instructors (deployment stewardship: a departed colleague's course can be reassigned) | `courses.js` |
| Login attempts are rate-limited: `ratelimit/login/{username}` → `{count, windowStart}`, 10 tries / 15 min, checked before scrypt | `instructor-auth.js` |

Honest limits, stated rather than hidden: Blobs writes are last-write-wins, so the rate limiter can leak a few extra attempts under a deliberately racing attacker — acceptable against online password guessing when the passwords are scrypt-hashed and the accounts are invite-gated. `SESSION_SECRET` compromise remains total compromise (already true today for flags and sessions). There is no password reset flow because there is no email channel: reset = the owner deletes `instructors/{username}` via `netlify blobs:delete` and re-invites. Document that in the README rather than building a reset system.

**What the gradebook actually protects, said plainly:** handles chosen by students, solve timestamps, and points. No legal names, no emails, no grades in the registrar sense — the instructor maps handles to their roster offline (unchanged from today). This is why Blobs-with-scrypt is a proportionate answer and SSO/LTI is not required for v1 (it reappears in §8 as the thing to say no to until asked twice).

### 4.2 The instructor's flow

```
/teach ──login/signup──▶ /teach/courses ──new──▶ course builder ──save──▶ /teach/courses/{id}
                              │                                              │
                              └──────────── open existing ───────────────────┘
                                                                dashboard: roster · progress ·
                                                                stuck points · CSV · settings
```

### 4.3 Screen: `/teach/courses` (home)

```
┌────────────────────────────────────────────────────────────────────┐
│ THE GAUNTLET · TEACH                              jwebb ▾  [Logout]│
├────────────────────────────────────────────────────────────────────┤
│  Your courses                                     [+ New course]   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ CIS 4400 — Cyber Fundamentals            Fall 2026    ACTIVE │  │
│  │ join: gauntlet.app/join/CIS4400-FA26 · 43 students · 4 units │  │
│  │ [Open dashboard]                     [Copy join link]        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ CIS 5544 — Forensics Lab                 Fall 2026    ACTIVE │  │
│  │ …                                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [Invite a colleague]  → mints an invites/{code}, shows it once    │
└────────────────────────────────────────────────────────────────────┘
```

### 4.4 Screen: course builder

One screen, not a wizard — four fields and a two-column module picker. Reuses `PackSelector.jsx`'s card styling; ordering is move-up/move-down buttons, **not** drag-and-drop (§8).

```
┌────────────────────────────────────────────────────────────────────────┐
│ New course                                                 [Save]      │
├────────────────────────────────────────────────────────────────────────┤
│ Name      [ CIS 4400 — Cyber Fundamentals    ]                         │
│ Term      [ Fall 2026 ]                                                │
│ Join code [ CIS4400-FA26 ]   students visit /join/CIS4400-FA26         │
│ Password  [ tuxcadet     ]   announced in lecture; rotate any time     │
├───────────────────────────┬────────────────────────────────────────────┤
│ CATALOGUE                 │ THIS COURSE                                │
│                           │                                            │
│ ┌───────────────────────┐ │  1 ▲▼ Shell Fundamentals      TUX  ~4h    │
│ │ Windows CMD Essentials│ │       unlock: open                         │
│ │ WIN · 27 ch · ~3h     │ │  2 ▲▼ Log Triage              TUX  ~90m   │
│ │ teaches: cmd-nav,     │ │       unlock: [70% ▾] of previous unit     │
│ │ findstr, env-vars     │ │  3 ▲▼ Forensics CLI 101       TUX+WIN ~3h │
│ │            [Add →]    │ │       unlock: [70% ▾] of previous unit     │
│ ├───────────────────────┤ │  4 ▲▼ Permissions Audit       TUX  ~60m   │
│ │ Network Artifacts     │ │       unlock: [70% ▾] of previous unit     │
│ │ TUX · 12 ch · ~90m    │ │                                            │
│ │ requires: pipes,      │ │  ⚠ Unit 2 'Log Triage' uses *redirection*, │
│ │ sort-uniq, awk-fields │ │    which no earlier unit teaches.          │
│ │            [Add →]    │ │    [Reorder]  [I know — keep it]           │
│ └───────────────────────┘ │                                            │
│  … one card per pack …    │  Total: 92 challenges · ~9.5h · 2,140 pts  │
└───────────────────────────┴────────────────────────────────────────────┘
```

Card data comes from `listPacks()` (`packs/index.js:63-72`) extended with the v2 manifest fields; the `requires ⊆ prior teaches` warning is computed server-side on save (§2.3) and re-rendered here. Per-module unlock policy is the whole progression model the instructor controls: `open` or `threshold` (fraction of the previous unit's challenges, reusing the exact clamped math of `submit-flag.js:11-23` lifted one level from acts to modules).

### 4.5 Screen: course dashboard `/teach/courses/{id}`

This is `AdminOverview.jsx` re-scoped from (deployment × pack) to (course), keeping everything that works — live feed, stuck points, CSV — and adding the unit-progress matrix, which is the one view a professor actually opens weekly:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ CIS 4400 — Cyber Fundamentals          43 students   [CSV ⭳] [Settings] │
├──────────────────────────────────────────────────────────────────────────┤
│ UNIT PROGRESS                                                            │
│               U1 Shell   U2 Logs   U3 Forensics   U4 Perms               │
│ class median   93%        61%        22%            —(locked med.)       │
│ ▂▅█ distribution bars per unit …                                         │
├──────────────────────────────────────────────────────────────────────────┤
│ STUCK POINTS (solve rate < 35%, > 3 attempts)     ← rule from            │
│  ⚠ U2 lt2-bruteforce-count   28% · median 2 hints    AdminOverview:190   │
│  ⚠ U3 act4-pipeline-chain    31% · median 1 hint                         │
├────────────────────────────────┬─────────────────────────────────────────┤
│ ROSTER (sortable)              │ LIVE FEED                               │
│ handle     score  units  last  │ 14:02 @quartz solved lt2-uniq (+25)     │
│ @quartz    980   2.4/4   2m    │ 13:58 @fern bought hint on lt2-brute…   │
│ @fern      845   2.1/4   6m    │ …                                       │
│  [reset handle] [remove]       │                                         │
├────────────────────────────────┴─────────────────────────────────────────┤
│ SETTINGS: rotate join password · edit units (adds allowed anytime;       │
│ removing a unit with recorded solves requires typed confirmation and     │
│ keeps the solve records) · archive course · leaderboard on/off           │
└──────────────────────────────────────────────────────────────────────────┘
```

CSV gains per-unit columns (Canvas/Blackboard import unchanged in shape):

```
Handle,Total Score,U1 Shell Fundamentals,U2 Log Triage,U3 Forensics CLI 101,U4 Permissions Audit,Solves,Last Active
"quartz",980,760,220,0,0,31,"2026-10-02T14:02:11Z"
```

### 4.6 Server surface (new + changed functions)

All new endpoints follow the existing conventions: Functions v2 default-export `(req) => Response`, `Authorization: Bearer` tokens, JSON bodies, and the `store()` helper from `netlify/functions/utils/store.js`.

```
netlify/functions/instructor-auth.js        NEW
  POST /api/instructor-auth
    {action:"signup", username, password, inviteOrSignupCode} → {token, username, role}
    {action:"login",  username, password}                     → {token, username, role}

netlify/functions/courses.js                NEW  (instructor token required)
  GET   /api/courses                       → {courses:[…summary…]}   (mine; owner sees all)
  POST  /api/courses {name, term, joinCode, joinPassword, modules[]}
                                           → {course, warnings:[…]}  (409 on joinCode clash)
  PATCH /api/courses?id={courseId} {…partial…}
                                           → {course, warnings:[…]}
  POST  /api/courses?id={courseId}&action=rotate-password {joinPassword}
  POST  /api/courses?action=invite         → {inviteCode, expiresAt}
  POST  /api/courses?id={courseId}&action=reset-handle {handle}
                                           → deletes courses/{id}/players/{handle} + solves blob

netlify/functions/course-info.js            NEW  (public, no auth — powers the join page)
  GET /api/course-info?code=CIS4400-FA26   → {name, term, instructorDisplayName,
                                              units:[{name, platform, challengeCount}]}
                                             (never the password, never the roster)

netlify/functions/register-handle.js        CHANGED
  body gains {joinCode, coursePassword}; validates against courses/{courseId};
  legacy env-var path (register-handle.js:28-38) kept behind `!joinCode` for
  single-class deployments until Step 4 of the migration (§7).

netlify/functions/session.js                CHANGED
  returns {handle, courseId, courseName, units:[{packId, position, unlock,
  solvedCount, total}], solves, totalScore}; isAdmin is gone (role lives in
  the token; the instructor console is a different token entirely).

netlify/functions/submit-flag.js            CHANGED
  body gains packId (validated: pack ∈ course.modules; act-unlock check at
  submit-flag.js:170 now preceded by the module-unlock check, same math one
  level up); solve written under the composite key (§6.2); flag scope per §6.3.

netlify/functions/leaderboard.js            CHANGED
  course-scoped: lists courses/{courseId}/players/ instead of players/
  (leaderboard.js:24 listPlayers); badges come from the course's packs, not
  the hardcoded forensics import at leaderboard.js:5. Honors course.leaderboard
  = "hidden". Auth required now (course comes from the student token).

netlify/functions/admin-overview.js         CHANGED
  ?courseId=…&packId=…&format=csv; instructor token; ownership check replaces
  the ADMIN_HANDLES check at admin-overview.js:30-36.
```

`store.js` grows course-aware siblings rather than mutating the old helpers (the old ones keep legacy mode alive until §7 Step 4):

```js
// netlify/functions/utils/store.js — additions
const courseKey        = (courseId)          => `courses/${courseId}`;
const courseCodeKey    = (joinCode)          => `coursecodes/${joinCode.toUpperCase()}`;
const coursePlayerKey  = (courseId, handle)  => `courses/${courseId}/players/${handle.toLowerCase()}`;
const courseSolvesKey  = (courseId, handle)  => `courses/${courseId}/solves/${handle.toLowerCase()}`;
const instructorKey    = (username)          => `instructors/${username.toLowerCase()}`;

export async function getCourseByCode(joinCode) { /* coursecodes → courses lookup */ }
export async function createCourse(course) { /* write both keys; fail if code taken */ }
export async function enrollPlayer(courseId, handle) { /* per-course dedupe */ }
export async function getCourseSolves(courseId, handle) { /* → {} */ }
export async function addCourseSolve(courseId, handle, packId, challengeId, record) {
  // record = { points, hintPenalty, earnedPoints, solvedAt } — one shape, one writer.
  // Fixes B2: no positional-args variant survives.
}
export async function listCoursePlayers(courseId) { /* prefix list */ }
```

---

## 5. Student experience

### 5.1 Joining

Student follows `gauntlet.app/join/CIS4400-FA26` (link or QR on the lecture slide). The join page is the existing `Gate.jsx` with the course identity injected from `/api/course-info`:

```
┌──────────────────────────────────────────────┐
│            ▛▀▜  THE GAUNTLET                 │
│                                              │
│   CIS 4400 — Cyber Fundamentals · Fall 2026  │
│   Instructor: Prof. Webb · 4 units           │
│                                              │
│   handle    [ rabbit_7        ]              │
│   password  [ ************    ]  ← announced │
│                                    in class  │
│              [ ENTER ]                       │
│                                              │
│   Practice sandbox (no course, no scores) →  │
└──────────────────────────────────────────────┘
```

Handles are unique **per course** (`courses/{id}/players/{handle}`), so `alice` in CIS 4400 and `alice` in CIS 5544 are different players — today's global-namespace squatting problem (`store.js:57`) disappears for course students. A wrong URL is a 404 with "ask your instructor for the join link", never a course directory (no public course listing exists).

### 5.2 The course home: a syllabus, not a map

**Decision: a vertical numbered unit list.** Considered and rejected: a graphical "world map" (cannot be auto-generated well for arbitrary module combinations, and `WarrenMap.jsx` is pack-specific scenery, not course structure — it stays as the forensics pack's in-terminal `map` visual); a grid of cards (loses the ordering the instructor deliberately chose). A syllabus list is the mental model both audiences already have, it renders any module count from 1 to 10, and lock states read naturally in sequence.

```
┌────────────────────────────────────────────────────────────────────────┐
│ THE GAUNTLET · CIS 4400 — Cyber Fundamentals    @rabbit_7 · 245 XP     │
│                                        [RANKINGS] [REFERENCE] [Logout] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  UNIT 1 ▸ Shell Fundamentals                        [TUX]              │
│  ██████████████████░░░░  32/40 solved · 760 XP        ● badge earned   │
│  Navigation, files, pipes, permissions.               [CONTINUE →]     │
│                                                                        │
│  UNIT 2 ▸ Log Triage                                [TUX]              │
│  ████░░░░░░░░░░░░░░░░░░  3/14 solved · 65 XP                           │
│  Hunt a brute-force attack through real log formats.  [CONTINUE →]     │
│                                                                        │
│  UNIT 3 ▸ Forensics CLI 101                         [TUX] [WIN]        │
│  🔒 Opens at 70% of Unit 2 — you are at 21%.                           │
│  Recover evidence from a compromised machine.                          │
│  Skills you will use: pipes · hashing · findstr                        │
│                                                                        │
│  UNIT 4 ▸ Permissions Audit                         [TUX]              │
│  🔒 Opens at 70% of Unit 3.                                            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

Rules embodied above:

- **A locked unit shows** its title, one-line description, platform chips, the unlock criterion *with the student's current number*, and its `skills.requires` rendered as "skills you will use" (§2.3 — this is the student-facing face of the skill graph). It does **not** show its challenge list, briefs, or filesystem: the scenario is the reward, and hiding it kills spoiler pressure.
- **Platform chips** `[TUX]` / `[WIN]` per unit; both when the pack declares both (as `forensics-cli-101` does). Inside a unit, per-challenge platform switching already works (`App.jsx:189-199`, `ChallengeSidebar` auto-switch on select) and is untouched.
- **Unlock evaluation is server-side** at submit time (the module-level check in `submit-flag.js`, §4.6) and advisory client-side for display — same trust split acts use today.

### 5.3 Inside a unit

Clicking CONTINUE loads the pack exactly as `handleSelectPack` does now (`App.jsx:99-117`): its filesystem, theme, prompt, acts, pack commands. **The in-unit experience — sidebar acts, briefs, hints, terminal, flag submission — is unchanged by this entire design.** The only sidebar addition is a breadcrumb ("Unit 2 of 4 · Log Triage ▸ course home") replacing the free-choice pack-switcher button (`App.jsx:448-456`); enrolled students navigate packs through the course home, while `PackSelector.jsx` survives verbatim in practice-sandbox mode, which remains course-less and unscored.

Acts inside a module keep their existing `unlockThreshold` behavior — the progression hierarchy is course → units (instructor policy) → acts (author policy) → challenges, and each level's math already exists at the level below it.

### 5.4 Leaderboard, badges, points — course-scoped

- **Leaderboard** ranks only `courses/{courseId}/players/*`, showing per-unit XP columns for unlocked units. The deployment-global board (and B3's hardcoded forensics badge logic, `leaderboard.js:57-66`) is retired. `course.leaderboard: "hidden"` blanks the tab for instructors who find rankings counterproductive — one boolean, already in the course doc (§6.1).
- **Badges** stay pack-defined (`pack.json.badges`, e.g. `packs/forensics-cli-101/pack.json:104-151`) and are earned per unit; the course home shows earned badge dots on each unit row, and `BadgeCelebration.jsx` fires unchanged. No cross-module meta-badges in v1 except one implicit "course complete" state on the home screen when every unit hits its own completion — rendered text, not a new badge object.
- **XP** is the sum of course-scoped net points (`earnedPoints` per solve record, §6.2). Two courses never see each other's numbers.

---

## 6. Data model, multi-tenancy, and routing

### 6.1 Blobs key layout (complete)

One store (env `GAUNTLET_STORE`, unchanged, still rotatable per term). All keys:

```
instructors/{username}                     §4.1 instructor account
invites/{code}                             §4.1 single-use instructor invite
ratelimit/login/{username}                 §4.1 login throttle window

courses/{courseId}                         course document (below)
coursecodes/{JOINCODE}                     → {"courseId": "…"}  (join-code → id lookup)

courses/{courseId}/players/{handle}        {"handle","joinedAt","lastSeen"}
courses/{courseId}/solves/{handle}         solve map (below)

players/{handle}                           LEGACY single-class mode only (store.js:57)
solves/{handle}                            LEGACY single-class mode only (store.js:58)
```

`courseId` is server-generated: `c_` + 8 hex chars of `randomBytes`. `joinCode` is instructor-chosen, `[A-Z0-9-]{4,24}`, uppercased, uniqueness enforced by the `coursecodes/` write-if-absent check (same read-then-write dedupe pattern as `createPlayer`, `store.js:66-74` — the same benign race window, acceptable at this scale).

**Course document:**

```jsonc
// courses/c_7f3a9b2e
{
  "id": "c_7f3a9b2e",
  "joinCode": "CIS4400-FA26",
  "name": "CIS 4400 — Cyber Fundamentals",
  "term": "Fall 2026",
  "owner": "jwebb",
  "staff": ["ta_alex"],
  "joinPassword": "tuxcadet",
  "createdAt": "2026-08-20T15:00:00Z",
  "archived": false,
  "leaderboard": "course",                      // "course" | "hidden"
  "modules": [
    { "packId": "linux-fundamentals", "unlock": { "policy": "open" } },
    { "packId": "log-triage",         "unlock": { "policy": "threshold", "fraction": 0.7 } },
    { "packId": "forensics-cli-101",  "unlock": { "policy": "threshold", "fraction": 0.7 } },
    { "packId": "perm-audit",         "unlock": { "policy": "threshold", "fraction": 0.7 } }
  ]
}
```

`threshold` always measures the immediately previous unit (position order is the array), reusing the clamp from `submit-flag.js:20-21` so a student stuck on one challenge can never be deadlocked at a module boundary either.

On `joinPassword` being **plaintext**, deliberately: it is a classroom shared secret announced out loud to forty people and written on a slide; its only job is keeping drive-by internet strangers off the roster. The instructor must be able to *read it back* from Settings mid-semester ("what was the password again?" is the number-one predicted support question), which a hash forecloses. It gates enrollment only — never grades, never instructor auth (those are scrypt, §4.1). Compare-with `crypto.timingSafeEqual` anyway.

**Solve map** (the B1 + B2 fix):

```jsonc
// courses/c_7f3a9b2e/solves/rabbit_7
{
  "linux-fundamentals/l1-glob": {
    "points": 20, "hintPenalty": 0, "earnedPoints": 20,
    "solvedAt": "2026-09-14T18:22:31Z"
  },
  "log-triage/lt2-bruteforce-count": {
    "points": 25, "hintPenalty": 10, "earnedPoints": 15,
    "solvedAt": "2026-09-21T19:05:02Z"
  }
}
```

Keys are `"{packId}/{challengeId}"` — `packId` never contains `/` (enforced: add an id-format check to `packValidator.js`), so the split is unambiguous. Per-unit rollups (dashboard matrix, CSV columns, unit progress bars) are a prefix filter over one blob read per student. One record shape, written only by `addCourseSolve` (§4.6), which retires the mismatched positional signature at `store.js:78`.

**Scale check** (the "do we need Postgres" question, answered): a 60-student course = 60 player blobs + 60 solve blobs + 1 course doc. The dashboard's worst query is `listCoursePlayers` + one solve-blob read each = 61 strongly-consistent reads per refresh; the leaderboard the same, cached 30s as today (`leaderboard.js:85`). That is comfortably inside Functions limits for classes up to a few hundred. Postgres would buy cross-course analytics and atomic counters nobody has asked for, at the cost of exactly the "database we have to set up and remember to clear out" the owner removed. **Recommendation: stay on Blobs; revisit only if a single course exceeds ~500 students or someone wants deployment-wide research analytics.**

### 6.2 Flags

Today: `generateUserFlag(secret, handle, challengeId, packId)` HMACs `packId:handle:challengeId` (`crypto-utils.js:312-326`). Becomes:

```
scope = `${courseId}:${packId}:${handle.toLowerCase()}:${challengeId}`
flag  = FLAG{ first 12 base32 chars of HMAC-SHA256(SESSION_SECRET, scope) }
```

Implementation: add an options tail rather than another positional arg — `generateUserFlag(secret, handle, challengeId, packId, courseId = '')`, empty `courseId` reproducing today's scope bit-for-bit (legacy mode and the validator, which keeps using `TEST_SECRET`/`TEST_HANDLE` with no course, `packValidator.js:16-17`). What courseId-in-scope buys: a student enrolled in two courses (retake, or TA-ing) gets distinct flags per course, and last term's leaked answer key — including the generated instructor-guide PDFs, which embed real flag derivations — is arithmetically useless this term even when handle and store carry over. Anti-cheat replay in `submit-flag.js` is untouched in shape; `replayCommand` (line 35) just builds server flags with the course from the token.

### 6.3 Session token v2

The colon-joined format (`crypto-utils.js:328-357`) is already straining (a positional-overload `expiryOrPackId` parameter and a parts-length switch in the verifier). v2 is signed JSON:

```
payloadB64 = base64url(JSON.stringify({
  "v": 2,
  "role": "student" | "instructor",
  "handle": "rabbit_7",          // students
  "username": "jwebb",           // instructors
  "courseId": "c_7f3a9b2e",      // students; absent in legacy mode
  "exp": 1767225600000
}))
token = payloadB64 + "." + hmacSha256(SESSION_SECRET, payloadB64)
```

`verifySessionToken` gains a branch: token contains `.` → v2 path; otherwise the existing 3/4-part legacy path (`crypto-utils.js:360-385`) — live student sessions survive the deploy, and the rolling refresh in `session.js:57` upgrades them to v2 within one visit. The instructor/student split is a claim, not a separate secret; endpoint guards check `role` (§4.1).

### 6.4 URL routing

The SPA currently has zero URL routing — `viewState` in `App.jsx:41` — and `netlify.toml` lacks a SPA fallback. Additions:

```toml
# netlify.toml — after the /api/* redirect (must stay first)
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Routes (hand-rolled `window.location.pathname` switch in `main.jsx` — four routes do not justify a router dependency for a solo maintainer; revisit if `/teach` grows sub-navigation beyond two levels):

```
/                      student app: course home if enrolled token, else generic gate
                       (legacy env-password gate until §7 Step 4)
/join/{JOINCODE}       course join page (§5.1); after join → /
/teach                 instructor login/signup
/teach/courses         instructor home        } client-side views behind the
/teach/courses/{id}    dashboard + builder    } instructor token; deep-linkable
```

Students bookmark `/`; identity is the token, not the URL (a course URL that granted access by knowledge would be a secret in browser history). The join code appears in a URL exactly once, at enrollment, paired with the password.

---

## 7. Migration — each step ships, nothing breaks

Ordering principle: backend seams first behind flags, UI second, schema third, content last — and the legacy env-var single-class mode keeps working until the final step, so the currently-running Fall 2026 class is never at risk. Sizes use the UPLIFT scale (S ≈ 1 day, M ≈ 3–7 days).

**Step 0 — token v2 + solve-record hygiene (S).** Ship `verifySessionToken`'s v2 branch and the composite-key + single-shape `addCourseSolve` writer *for new writes in legacy mode too* (write `"{packId}/{challengeId}"`; read path accepts bare legacy keys by attributing them to the token's pack). Fixes B1/B2 forward. **No stored-data migration is performed**: per-term store rotation (`GAUNTLET_STORE`, `store.js:44`) means legacy-keyed data ages out with the semester — the migration is "the spring store starts clean," which is the platform's existing data-lifecycle story.

**Step 1 — instructors + courses, the first shippable slice (M, ~5 days).** `instructor-auth.js`, `courses.js`, `course-info.js`, the `store.js` course helpers, `/teach` screens (login, course list, builder with the three existing packs as the whole catalogue), `/join/{code}`, course-aware `register-handle`/`session`/`submit-flag`, course-scoped `admin-overview` + CSV. **Shipped state:** an instructor signs up with the deploy code, creates "CIS 4400" with a password and three ordered units, posts the join link; students enroll and play; the instructor watches the dashboard and exports grades — while any deployment *without* courses behaves exactly as today. This slice alone is the owner's sentence made real.

**Step 2 — the student course home (M, ~3 days).** Unit list with progress and locks (§5.2), module-unlock enforcement in `submit-flag.js`, course-scoped leaderboard (retiring B3), breadcrumb replacing the pack-switcher for enrolled students. Practice mode untouched.

**Step 3 — scaffold tiers + skill vocabulary (M, ~3 days, mostly content).** `packs/skills.json`; `scaffold` and `skills` fields written into all three packs (mechanical derivation + review, §3.3); lint gate moves from `FIRST_GATED_ACT` to `tierOf`; new objective-names-no-tool and first-teach-scaffold checks; builder warnings (§2.3) go live. Ships alone safely: v1 packs keep linting via the derivation fallback.

**Step 4 — retire the legacy path (S).** When the current term's class ends (per `memory`: this deployment serves a real Fall 2026 course), remove `ADMIN_HANDLES`/`CLASS_PASSWORD` reads, global `players/`–`solves/` helpers, and the parts-format token branch. One release note: "create a course."

**Step 5 — new module content (M–L per module, content not code).** `log-triage` first — zero engine work, highest instructor pull, and it exercises the whole modules pipeline end to end as the first pack *authored as* a module. Then `perm-audit` (plus the one-day `find -perm` engine flag), `win-incident`, `net-artifacts`. Each ships independently; the catalogue grows a card per release.

Total platform work before content: **~12–14 developer-days.** The content in Step 5 is the long pole (§8).

---

## 8. Risks, cuts, and the smallest honest version

**Where this design could over-build, and the pre-commitments against it:**

| Temptation | Call |
|---|---|
| Per-challenge selection in the builder (instructor hand-picks 30 of 92) | **Cut.** Module granularity is the product thesis; challenge-level curation re-creates the authoring problem in every course and breaks act math, flag chains, and the solvability proof. At most, later: a per-course "hide this challenge" escape hatch — and only when a real instructor hits a real broken challenge mid-term. |
| Skill-graph runtime gating / adaptive scaffolding | **Cut** (argued in §2.3, §3.2). Graph = author-time and build-time advice only. |
| Drag-and-drop ordering, due dates, calendars, module scheduling windows | **Cut.** Up/down buttons; the LMS owns time. A `visibleFrom` date per module is the only calendar feature worth even considering later. |
| LTI / SSO / Canvas grade passback | **Not now.** The CSV *is* the integration for the audiences this serves; LTI certification is weeks of work and a compliance surface. Reconsider on the second unprompted instructor request. |
| Password reset, email verification | **Cut** (no email channel; owner-deletes-and-reinvites, §4.1). |
| Cross-course meta-badges, deployment-global rankings | **Cut.** The course is the social boundary; global rankings across different unit sets are meaningless comparisons. |
| A visual course "map" | **Cut** (§5.2). |

**What instructors will actually never use, predicted:** the weekly leaderboard window toggle (already marginal), per-act analytics below the unit level, invite-code expiry tuning. Fine — none of these cost meaningful build time in this design; listed so nobody polishes them.

**Real risks:**

1. **Content is the long pole and the single failure mode that matters.** Platform Steps 0–4 are ~2.5 weeks; four good modules are 4–8 weeks of authoring, validation, and playtesting. If the catalogue at launch is just the three existing packs wearing module metadata, the feature reads as a re-skin. Mitigation: `log-triage` ships *with* Step 2 so the builder's catalogue is visibly richer than the old pack list on day one.
2. **Two auth systems, one secret.** Instructor and student tokens share `SESSION_SECRET`; the role claim is the only wall. The guards are simple and greppable (`role !== 'instructor'` → 403 at the top of every teach endpoint), and a lint-style test should assert every `/api/courses*` handler contains the guard — cheap insurance for a bug class whose blast radius is a gradebook.
3. **Blobs races on enrollment/joinCode.** Read-then-write dedupe has a benign race (two students claiming one handle in the same 100ms window get merged); identical to the existing `createPlayer` exposure (`store.js:66-74`), acceptable at classroom scale, documented in `store.js`'s existing concurrency note.
4. **Scaffold retrofit judgment calls.** The act→tier derivation is mechanical, but ~10 of 97 challenges (notably forensics act 6) deserve manual tier review, and mislabeling re-opens the pedagogy hole the review closed. The first-teach validator check catches the dangerous direction (objective-tier introduction); the lint catches the other (answers in guided briefs).
5. **The owner is one person.** Every element here — scrypt auth, prefix-scoped Blobs, a hand-rolled router, JSON schemas validated by the existing validator — was chosen to be maintainable by exactly one technical person with no new infrastructure. That constraint outranked elegance throughout; keep letting it.

**The smallest version that still delivers the owner's sentence:** Step 1 + Step 2 with the existing three packs plus `log-triage`. An instructor logs in, assembles ordered units behind a class password, students see a syllabus with locks and a course leaderboard, and grades export per unit. Everything else — the tier system, the skill vocabulary, three more modules — makes it *good*; that slice makes it *true*.

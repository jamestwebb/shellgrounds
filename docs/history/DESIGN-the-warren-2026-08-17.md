> **Superseded — kept as the project's origin record.**
>
> This is the original build plan, written on 2026-08-17 for one course
> (CIS 4400/5544) under the working title *The Warren*. Almost none of it
> describes the software today: the warren fiction was retired, the product
> became Shellgrounds, one hard-coded curriculum became three portable packs,
> and the Neon database it plans for was never built — storage is Netlify
> Blobs. Read it for why the project exists and which teaching decisions were
> deliberate, not for how anything works.
>
> Current documents: [`README.md`](../../README.md) to deploy,
> [`docs/PACK-FORMAT.md`](../PACK-FORMAT.md) to author a course.

---

# The Warren — CLI Challenge Site for CIS 4400/5544

**A standalone Netlify site. Students create a handle with a class password, then play a story-driven command-line challenge game with a live leaderboard.**

Status: design / build plan · Author: James Webb (with Claude) · Created 2026-08-17

---

## 1. What this is and why

CIS 4400/5544 (Cyber Forensics, Fall 2026) requires real CLI competence, and most students arrive
having never used a shell — on Linux *or* Windows — and without a working mental model of
directory parent/child relationships. The course's own labs escalate fast:

| Course week | Case | CLI demand |
|---|---|---|
| Wk 2 (Aug 24) | Case 001 Browser Forensics | `sudo apt-get`, `cd`/`ls`, **WSL path mapping** (`C:\Users\x` ⇄ `/mnt/c/Users/x`) — and the lab deliberately doesn't hand over the `/mnt/c` answer |
| Wk 3 | Case 002 The Wiped Slate | `md5sum`, being in the right directory |
| Wk 5 | Case 003 Operation Nightingale | Sleuth Kit: `mmls` → carry a sector offset into `fsstat -o <n>` → `fls -r -d -o <n>`; `man` pages |
| Wk 6 | Case 004 The Leaked Script | `exiftool`, first **pipe** (`exiftool -v x.pdf \| grep Author`) |
| Wk 11 | Case 005 The Deadbolt Intrusion | **Heaviest lab**: `>` redirection, `2>/dev/null`, `mactime`, `grep -i/-v`, `wc -l`, quoting |
| Wk 13 | Case 007 The Phantom Process | Volatility + three-stage pipelines (`strings x.vmem \| grep -i "password\|login" \| head -20`) |

The Warren is the fun, competitive on-ramp: a browser terminal game that drills exactly these
skills, themed to fit the White Rabbit universe, with a leaderboard to make practice social.
It is **complementary** to the Terminal Trainer already inside White Rabbit OS — the in-platform
trainer is solo lessons; the Warren is the game layer (story, scoring, competition) and covers
the trainer's gaps (pipes, redirection, `/mnt/c`, flag-value chaining).

**Grading hook (decide before launch):** the game has no slot in the current 1000-pt scheme.
Realistic options: fold into Participation (5×10 pts), make it a Week-1 ungraded prerequisite,
or pure bragging rights + small extra credit. Do not position it as a Lab.

---

## 2. Theme and story

**Working title: The Warren.** Tagline: *"Every analyst starts underground."*

Frame: The Warren is White Rabbit Forensics' legendary training server — an underground network
of tunnels (directories) dug by the agency's founder, known only as the White Rabbit. New Junior
Analysts are sent down before they touch a real case. The Rabbit has left a trail: tracks in log
files, hidden burrows (dotfiles), messages that only `grep` can find. Follow the trail, ring by
ring, and come back up an analyst.

Why this works:

- **The metaphor teaches the content.** A warren *is* a tree of parent/child tunnels. `cd ..`
  is "climb back toward the entrance." `pwd` is "where am I in the warren." Absolute path =
  directions from the entrance; relative path = directions from where you stand. `/mnt/c` is
  **The Crossing** — the tunnel that connects the underground (Linux) to the surface world
  (Windows `C:\`), which is precisely the WSL mental model students need for Case 001.
- **Continuity.** Students are already "Junior Analysts at White Rabbit Forensics" in the course
  fiction (Supplemental p. 2). Same cast can cameo: Reema Patel is the mentor voice in lesson
  text; Rex Vance writes the blunt failure messages; Kai "Ghost" Tanaka leaves cryptic hints.
- **Tone control ("cute but not too cute").** The rabbit is never drawn, never speaks, and never
  says "hop." It exists only as *evidence*: tracks, disturbed files, a `.rabbit` file here and
  there, log entries at odd hours. Noir-adjacent forensics voice carries the copy; the rabbit
  motif is the single whimsical element. One rule for all copy: **the joke is allowed one
  sentence, the instruction gets the rest.**

Structure — five Acts (rings of the warren) plus a surface side-quest:

| Act | Name | Skills (from the case-lab audit) | Ready before |
|---|---|---|---|
| I | **Down the Hatch** | prompt, `pwd`, `ls`/`-l`/`-a`, `cd`, `..`, `~`, absolute vs. relative paths, Tab, ↑ history | Wk 2 |
| II | **Reading the Signs** | `cat`, `head`, `tail`, `less` (+`q`), `file`, `md5sum`/`sha256sum`, hash-as-integrity | Wk 3 |
| III | **The Scent Trail** | `grep`/`-i`, `find -name`/`-type`, **The Crossing** (`/mnt/c` mapping), `man`/`--help`, simulated `sudo apt-get install` | Wk 4 |
| IV | **The Plumbing** | pipes `\|`, `>` redirection, `2>/dev/null`, `grep -v` + alternation, `wc -l`, `head -N` as limiter, quoting | Wk 6, drilled again Wk 10 |
| V | **The Long Chase** (capstone) | flag-with-value (`-o <n>`), **carrying output into the next command's argument**, multi-step investigation ending in one submitted answer | Wk 5 concept intro; full act by Wk 10 |
| — | **Topside** (optional side-quest) | Windows CMD parity: `dir /a`, `type`, `findstr /i`, `certutil -hashfile`, `attrib` | any time |

Acts unlock sequentially (finish ≥80% of an act's challenges to open the next). Time-gated
releases are optional; simpler to launch Acts I–III on day one and IV–V by Week 4.

---

## 3. What we lift from White Rabbit (verified against the codebase)

> Source survey: `the White Rabbit codebase dump` is a
> **stale Jan-2026 dump** — the terminal trainer is not in it. The real code is in the live tree.

**Lift essentially as-is:**

| Asset | Location | Notes |
|---|---|---|
| The entire CLI engine | `white-rabbit-os/src/components/apps/TerminalTrainer.jsx` (1,880 lines, live tree) | Simulated shell: controlled `<input>` + history div. No xterm.js, no server. Remove one dead `useGameStore()` call (~line 1134) and it has zero coupling to White Rabbit. |
| Linux executor | same file, `executeCommand()` ~line 884 | Pure `(cmd, cwd, fs) → {output, newCwd}`. 15 commands: `pwd ls cd cat head tail less grep find file strings md5sum sha256sum clear help`. |
| Windows executor | same file, `executeWindowsCommand()` ~line 665 | 8 commands, case-insensitive paths. |
| VFS factories | same file, lines ~600 & ~631 | Flat object keyed by absolute path; forensics-flavored content already written. |
| Tab completion | same file, `getTabCompletions()` ~line 264 | Pure function. |
| Help text | `LINUX_HELP` ~866, `WINDOWS_HELP` ~653 | Pure data. |
| Handle profanity/impersonation filter | `white-rabbit-os/netlify/functions/set-handle.js` | Best module in the repo: blocked words, repeated-char/all-digit patterns, impersonation words, 3–20 chars, `^[a-zA-Z0-9_-]+$`. Extract into ONE shared module imported by client and server (currently duplicated by hand). |
| Netlify config pattern | `netlify.toml` | `/api/* → /.netlify/functions/:splat` rewrite. |
| Theme tokens | marketing `index.html` tailwind block | `term-green #22c55e`, `term-black #050505`, `term-gray #0a0a0a`, `term-border #333333`, Courier-style mono, `blink` keyframe. |
| Boot sequence | `src/components/BootLoader.jsx` (~90 lines) | Typewriter BIOS log; reskin as `WARREN_BIOS`, swap store call for local `useState`. |
| Badge/confetti mechanics | `TerminalTrainer.jsx` `checkForBadges()` ~1178 + confetti overlay ~1455 | Keep the dopamine. |

**Must rewrite (nothing salvageable or pattern is unsafe):**

| Thing | Why |
|---|---|
| Leaderboard | `Leaderboard.jsx` in White Rabbit is four hardcoded fake rows. |
| Lesson data format | Trainer lessons use JS closures (`successCondition: (cmd) => regex.test(cmd)`) — not serializable. Convert to declarative JSON (§6). |
| Flag validation | White Rabbit's `validate_flag.js` trusts `userId` from the POST body — any client can award XP to anyone. Our version authenticates via signed session token. Also: never compile admin-authored regex server-side (ReDoS). |
| Auth | `netlify-identity-widget` is deprecated for new sites, and we don't want accounts anyway. Class password + handle + signed token (§7). |
| Shell parser | Current parser is `split(/\s+/)` + `switch` — **no pipes, no redirection, no quoting**. Acts IV–V require all three. This tokenizer/pipeline rewrite is the single largest engineering task (§5). |

**Known hazards from the survey (housekeeping, do regardless):**

1. The dump's `setup_db.js` contains a hardcoded Neon connection string (password `npg_cHoI9…`).
   **Rotate that credential** even though the live `seeds/schema.js` fixed the pattern.
2. `TerminalTrainer.jsx` carries a `Rational Mystic LLC` copyright header — James's own LLC, so
   reuse is fine, but keep the header consistent in the new repo and pick a license line for the
   Warren repo (probably same all-rights-reserved).
3. VFS flat-path model has no integrity enforcement — directory `contents` arrays and path keys
   are mirrored by hand. Fix with a builder (§5.2) before authoring content, or we will ship
   broken tunnels.

---

## 4. Architecture

Same proven stack as White Rabbit, minus the fake desktop OS:

```
Browser (static, Vite + React 19 + Tailwind)
│  terminal UI, VFS, command execution, story — ALL client-side
│  session token in localStorage
▼
Netlify Functions (/api/*)          Neon Postgres
├─ register-handle  ── INSERT ────► players
├─ session (token refresh)          solves
├─ get-manifest (per-user flags)    (2 tables, that's it)
├─ submit-flag      ── INSERT ────►
└─ leaderboard      ── SELECT ────►
```

- **New repo**, e.g. `~/Projects/warren/`, its own Netlify site (e.g. `warren-wrf.netlify.app`
  or a subdomain of the course domain). Do not graft onto the White Rabbit deploy — different
  release cadence, and students shouldn't need White Rabbit accounts to play.
- **Neon**: either a new database in the existing Neon project or a separate project. One
  `DATABASE_URL` env var, `@neondatabase/serverless` driver (already known-good).
- Desktop-only assumption is inherited from the course (Supplemental p. 2): keyboard-first,
  Tab and arrows are load-bearing. Show a polite "bring a keyboard" screen under 768px width.

### Environment variables (Netlify)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `CLASS_PASSWORD` | The password James announces in class; gates handle creation only. Rotate per semester. |
| `SESSION_SECRET` | HMAC key for session tokens and per-user flags. Long random string. |
| `ADMIN_HANDLES` | Comma-separated handles that see the admin view (e.g. `warden`) |

---

## 5. The engine: lift + extend

### 5.1 Port (Phase 1)

Extract from `TerminalTrainer.jsx` into modules (the survey confirmed these are already pure):

```
src/engine/
  fs-builder.js      NEW — see 5.2
  fs.warren.js       the Warren's VFS content (replaces createInitialFilesystem)
  fs.topside.js      Windows VFS (adapted from createWindowsFilesystem)
  exec.linux.js      ← executeCommand()
  exec.windows.js    ← executeWindowsCommand()
  tokenizer.js       NEW — see 5.3
  pipeline.js        NEW — see 5.3
  complete.js        ← getTabCompletions()
  help.js            ← LINUX_HELP / WINDOWS_HELP + man pages (5.4)
src/ui/
  Terminal.jsx       ← input/history/keybinding shell of TerminalTrainer
  Boot.jsx           ← BootLoader.jsx, reskinned
```

Write vitest unit tests for `exec.*` as they're extracted — they're pure `(cmd, cwd, fs)`
functions, this is cheap and pays for itself the moment the tokenizer lands.

### 5.2 VFS builder (fixes the fragility)

Author the filesystem as a nested literal; derive the flat map and `contents` arrays:

```js
buildFS({
  home: '/home/analyst',
  tree: {
    'home/analyst': {
      'welcome.txt': file('...'),
      '.rabbit':     file('You found a track. There are more.'),
      'tunnels': {
        'east': { 'droppings.log': file('...') },
      },
    },
    'mnt/c/Users/analyst': {           // The Crossing — WSL mapping, Act III
      'Desktop': { 'CASE_FILES': { ... } },
    },
  },
})
```

`file(content, {fileType, md5, sha256, hidden})` — but compute sha256 honestly at build time via
`crypto.subtle.digest` instead of storing fiction (MD5 stays a stored string or use a ~5 KB
js-md5 lib; decide during Phase 1 — honest hashes let challenges ask "what is the hash" safely).

### 5.3 Tokenizer + pipeline (the big new work — needed for Act IV)

Replace `split(/\s+/)` with a small tokenizer supporting, in scope order:

1. **Quoting**: `"…"` and `'…'`, minimal escapes. (Case 005 uses `fls -m "/" …`.)
2. **Pipes**: `cmd1 | cmd2 | cmd3`. Executor signature grows to
   `(argv, cwd, fs, stdin) → {stdout, stderr, newCwd}`; the pipeline runner threads stdout→stdin.
3. **Redirection**: `> f`, `>> f` (writes into the VFS — students can `cat` their own output,
   which is a great teaching beat), `2>/dev/null`, `2>&1`.
4. Explicitly **out of scope**: globbing beyond `find -name`, `&&`/`;`, subshells, env vars,
   background jobs. The error message for these says what the real shell would do —
   `bash: feature not simulated in the Warren — you'll meet it on the WorkBench VM`.

New commands required by the curriculum: `wc` (`-l`), `grep -v` + `"a\|b"` alternation,
`sort`, `cut -d -f` (light), `echo`, `man` (5.4), simulated `sudo apt-get install` (5.5).

### 5.4 `man` and `--help` (on-policy per the syllabus)

Case 003 literally instructs students to read `man mmls`, and the AI policy encourages
self-help. Add a `man <cmd>` command rendering short, real-format man pages (NAME/SYNOPSIS/
DESCRIPTION/EXAMPLES) for every simulated command, and an Act III challenge whose answer is only
findable inside a man page.

### 5.5 Simulated package install

`sudo apt-get update && sudo apt-get install tracker -y` → canned realistic apt output → the
`tracker` command now exists in this session. Directly rehearses Case 001 §1B and makes a fun
beat (the tool you install is what lets you read the Rabbit's tracks). `&&` is special-cased for
this one lesson (accept both the chained and split forms).

### 5.6 Challenge format (declarative, replaces JS closures)

```jsonc
{
  "id": "act3-crossing-2",
  "act": 3,
  "title": "The Crossing",
  "points": 40,
  "brief": "Surface files sit at C:\\Users\\analyst\\Desktop\\CASE_FILES on the machine upstairs. Find that folder from down here and read intake.txt.",
  "setup": { "fsPatch": { }, "cwd": "/home/analyst" },
  "success": {
    "kind": "flag",                    // "flag" | "command" | "state"
    "flagFile": "/mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt"
  },
  "hints": [
    { "cost": 0,  "text": "WSL mounts Windows drives under a directory in /. Try `ls /`." },
    { "cost": 10, "text": "`ls /mnt` — the surface world is mounted at /mnt/c." }
  ],
  "successMessage": "That's the WSL bridge: C:\\Users\\x on Windows is /mnt/c/Users/x in the shell. Case 001 will ask you to find it without help — now you can.",
  "teaches": ["wsl-paths"]
}
```

Three success kinds:
- **`flag`** — the challenge hides a per-user flag string (§7.2) in the VFS; student runs
  `submit WRF{...}` in the terminal. Server-validated, leaderboard-scoring. Most challenges.
- **`command`** — regex over the (clean-executing) command line, like today's trainer. Client-side
  only; used for zero-stakes warmups in Act I (worth few points; totals reconciled server-side
  by capping command-kind points per act).
- **`state`** — predicate on VFS/cwd (e.g. "your redirected file exists and has 4 lines"),
  which then reveals a flag. Used in Act IV where the *artifact* matters, not the command.

### 5.7 Content beats worth stealing outright

- The existing VFS fiction (`access.log` USB-exfil timeline, `hunter2`, mixed-case `ERROR` log
  for `grep -i`, ELF file with embedded `password=secret123`) — already written, already themed.
- `successMessage` pedagogy lines ("Always hash evidence before and after analysis").
- Boot log lines (`MOUNTING VIRTUAL FILESYSTEM... OK`) — reskin to Warren fiction
  (`LOWERING ANALYST INTO SHAFT 7... OK`).

---

## 6. Frontend

Single-page, three views, no router needed:

1. **Gate** — boot animation → handle claim (handle + class password) or "resume" (token in
   localStorage). Failure copy stays in-fiction: `ACCESS DENIED — the door only opens from the
   inside. Get the password in class.`
2. **The Warren** — 90% of screen is the terminal. Left rail: acts/challenges with
   locked/open/solved states, current brief, hint button (shows cost), XP. A `map` command in
   the terminal prints an ASCII tree of everywhere you've been — quietly the best
   parent/child-directories teaching tool in the game.
3. **Leaderboard** — top 20 + "your rank", semester and this-week tabs, badge chips.

Style: term-green on near-black, mono, scanline overlay at low opacity, sparse. The rabbit
appears only as `.·´¯\`·.` track glyphs in the act headers. No mascot art.

Accessibility: honest `<input>` (screen-reader friendly), `prefers-reduced-motion` kills the
typewriter/confetti, contrast-check the green-on-black pairs.

---

## 7. Backend

### 7.1 Schema

```sql
CREATE TABLE players (
  id          SERIAL PRIMARY KEY,
  handle      TEXT UNIQUE NOT NULL,        -- 3–20, [A-Za-z0-9_-], SFW-filtered
  created_at  TIMESTAMPTZ DEFAULT now(),
  last_seen   TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE solves (
  player_id     INTEGER REFERENCES players(id) ON DELETE CASCADE,
  challenge_id  TEXT NOT NULL,
  points        INTEGER NOT NULL,
  hint_penalty  INTEGER NOT NULL DEFAULT 0,
  solved_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (player_id, challenge_id)    -- the anti-refarm constraint
);
-- Leaderboard = SUM(points - hint_penalty) GROUP BY player_id; no stored XP column to drift.
```

No email, no names, no roster linkage — handles are pseudonymous, which sidesteps FERPA
concerns for a public leaderboard. If credit is attached later, students privately tell James
their handle (or an admin view maps them once).

### 7.2 Auth & anti-cheat model

- **`POST /api/register-handle`** `{handle, classPassword}` → constant-time compare against
  `CLASS_PASSWORD`, shared SFW filter, INSERT, return session token
  `base64(handle.expiry.HMAC-SHA256(SESSION_SECRET, handle+expiry))`. 5/min/IP rate limit.
  The class password is a *bouncer*, not a secret: it only gates handle creation.
- **Per-user flags** (the load-bearing anti-cheat): flag-kind challenges get
  `WRF{base32(HMAC(SESSION_SECRET, handle + ":" + challengeId))[0:12]}`.
  `GET /api/manifest` (authed) returns `{challengeId → flag}`; the client splices each flag into
  its designated VFS file at load. **Copying a friend's flag fails validation** — each student
  must actually run the commands. Server never trusts client-claimed identity: handle comes from
  the verified token, never the body (the exact hole White Rabbit's `validate_flag.js` has).
- **`POST /api/submit-flag`** `{challengeId, flag, hintsUsed}` → recompute HMAC, compare,
  upsert-once into `solves`. Repeat solve → `{correct: true, points: 0}`.
- Accepted residual risk: the VFS runs client-side, so a determined student can fish flags out
  of the manifest response via devtools instead of playing. For a forensics class, a student who
  finds them there has arguably demonstrated the learning objective. Optional Act V easter-egg
  challenge that says exactly that.

### 7.3 Remaining endpoints

- **`GET /api/leaderboard`** — public, cached 30 s. `?window=week` variant so late starters
  can still top a board.
- **`GET /api/admin/overview`** (token handle ∈ `ADMIN_HANDLES`) — per-challenge solve counts
  and stuck-points; this is James's dashboard for "what do I reteach Monday."

---

## 8. Scoring

- Base points by tier: Act I 10–15 · II 15–20 · III 25–40 · IV 40–60 · V capstone 100–150.
  Total ≈ 1,000 across ~40 challenges.
- **Hints**: first hint free, later hints cost 25–50% of base (recorded as `hint_penalty`).
  Free first hint keeps novices moving; cost keeps the board meaningful.
- **Badges** (reuse White Rabbit's badge+confetti mechanics): *Groundbreaker* (Act I),
  *Signal in the Noise* (first grep), *Plumber* (first 3-stage pipeline), *Crossed Over*
  (WSL mapping), *Topsider* (Windows quest), *Out of the Warren* (capstone).
- No first-blood bonuses and no timers — speed pressure punishes exactly the students this is
  for. The weekly leaderboard window provides freshness instead.

---

## 9. Build plan

Course reality: **today (Aug 17) is Week 1. Case 001 lands Week 2 (Aug 24).** Acts I–III with
handle+leaderboard must be live within ~1 week; the tokenizer can follow.

### Phase 0 — Repo & plumbing (half a day)
- New repo `~/Projects/warren/` (Vite + React + Tailwind), Netlify site + envs, Neon DB + schema,
  `netlify.toml` rewrites, deploy hello-world. Rotate the leaked Neon credential from the old dump.

### Phase 1 — Engine port (1–2 days)
- Extract executors/VFS/completion/help from `TerminalTrainer.jsx` into `src/engine/*` modules;
  delete the dead store call; vitest for both executors; `fs-builder.js`; `Terminal.jsx` +
  reskinned boot. **Exit criterion:** the lifted trainer runs on Netlify with Warren styling.

### Phase 2 — Accounts, flags, leaderboard (1–2 days)
- Shared handle-filter module (lifted); `register-handle`, `manifest`, `submit-flag`,
  `leaderboard` functions; session token; `submit` command in the terminal; Gate + Leaderboard
  views; rate limiting. **Exit:** two browsers, two handles, one flag each, both on the board;
  swapped flags rejected.

### Phase 3 — Acts I–III content (2–3 days, parallel with 2)
- Warren VFS with story content; ~24 challenges as JSON (Act I command-kind warmups, II–III
  flag-kind); The Crossing (`/mnt/c` subtree); `man` pages + man-page challenge; simulated
  `apt-get install`; hints; badges. **🚀 LAUNCH: announce in class Week 2 (Aug 24) with the
  password on the board.**

### Phase 4 — Tokenizer & Act IV (2–3 days, target Wk 4, hard deadline Wk 6/Case 004)
- `tokenizer.js` + `pipeline.js` (quoting → pipes → redirection); `wc`, `sort`, `cut`, `echo`,
  `grep -v`/alternation; VFS-write for `>`; state-kind validation; ~10 Act IV challenges.
  Heavy vitest here — this is the highest-defect-risk code.

### Phase 5 — Act V capstone + Topside (1–2 days, target Wk 6–8)
- Capstone: partition-table-flavored chain (read a `scan` tool's tabular output → feed the
  offset to the next tool's `-o` flag → chase through tunnels → one flag). Direct rehearsal for
  Case 003/005 without simulating real Sleuth Kit. Windows Topside quest from the lifted
  Windows executor. Admin overview endpoint + view.

### Phase 6 — Polish (ongoing)
- Weekly leaderboard window, reduced-motion/contrast pass, empty states, funny-but-instructive
  error messages, `?` in-terminal cheatsheet. Post-semester: export solve data → tune next year.

**Total: roughly 8–12 focused build days.** Longest pole is Phase 4; everything before launch is
mostly lifting proven code.

---

## 10. Risks & open questions

| Risk / question | Position |
|---|---|
| Timeline: launch in ~1 week | Feasible only because Phases 1–3 are mostly lifted code. If slipping, cut Act III's apt-install lesson and the Topside quest; never cut The Crossing. |
| Password sharing beyond the class | Accepted. Worst case an outsider plays a learning game. Rotate the password each semester. |
| Handle squatting/impersonation | SFW filter + first-come. James claims his own handle + `ADMIN_HANDLES` on day one. |
| Duplicate vs. in-platform Terminal Trainer | Positioned as complement; if it lands well, the Warren engine (with tokenizer) can be back-ported into White Rabbit later — same component shape. |
| Grading hook | **Open — James decides:** participation points, prerequisite, or extra credit. Affects only the announcement, not the build. |
| Site name/domain | **Open:** `warren-wrf.netlify.app`? Subdomain of course domain? |
| One class or both sections? | Nothing in the design is section-specific; share it with Christopher Taylor's Hickory section — a cross-campus leaderboard is free motivation. **Open: coordinate with Chris.** |

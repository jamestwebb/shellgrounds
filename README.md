# The Gauntlet — Forensics CLI 101

> A standalone CLI challenge site with a leaderboard — no story, just practice that feels like a game.

A standalone Netlify web application and simulated command-line training ground for **cyber forensics courses** (or any class that needs to teach the command line). Students claim a handle with a class password and complete forensic CLI challenges across five Acts and a Windows Topside side-quest, competing on a live leaderboard.

---

## Key Features

- **Simulated Forensic CLI Engine (`src/engine/`)**:
  - Full support for quotes (`"..."`, `'...'`), multi-stage pipelines (`cmd1 | cmd2 | cmd3`), stdout redirection (`>`, `>>`) directly writing into the Virtual Filesystem, and stderr redirection (`2>/dev/null`, `2>&1`).
  - 18+ Linux forensic commands: `pwd`, `ls -la`, `cd`, `cat`, `head -n`, `tail -n`, `less`, `grep -i -v`, `find`, `file`, `strings`, `md5sum`, `sha256sum`, `wc -l`, `sort`, `cut -d -f`, `echo`, `man`, `map`, `submit`, `tracker`, `scan`, `extract`.
  - Windows Command Prompt parity (Topside Quest): `cd`, `dir /a`, `type`, `find`, `findstr /i`, `certutil -hashfile`, `attrib`, `cls`.
  - Full tab auto-completion for commands, relative paths, and directory traversal.
  - Interactive manual pages (`man <command>`) and an ASCII filesystem map (`map`).

- **Deterministic Anti-Cheat & Per-User Flags**:
  - Every challenge flag is cryptographically derived per-student: `FLAG{base32(HMAC(SESSION_SECRET, handle + ":" + challengeId))[0:12]}`.
  - Flags are dynamically spliced into the virtual filesystem upon authenticated session start. Copying flags between students is impossible.
  - Server-authenticated session tokens (`base64(handle:expiry:HMAC)`).

- **5 Progressive Acts + Topside Quest**:
  - **Act I: First Steps** (Prompt, `pwd`, `ls`/`-l`/`-a`, `cd`, `..`, `~`, absolute vs relative paths, Tab, Up-arrow history)
  - **Act II: Reading the Evidence** (`cat`, `head`, `tail`, `less`, `file`, `md5sum`, `sha256sum`, chain of custody)
  - **Act III: Search & Discovery** (`grep -i`, `find`, the `/mnt/c` WSL bridge, `man` pages, simulated `sudo apt-get install tracker`)
  - **Act IV: The Plumbing** (Pipes `|`, `>` redirection, `2>/dev/null`, `grep -v`, `wc -l`, `cut -d -f`)
  - **Act V: The Capstone** (Partition table scanning → sector offset extraction → `extract -o <offset>` → Master Flag)
  - **Topside (Windows CMD Quest)** (Windows forensic command parity)

- **Scoring & Social Leaderboard**:
  - All-Time and Weekly (`?window=week`) rankings with badge unlock chips.
  - Multi-tier hints: first hint is free (0 XP penalty); subsequent hints deduct partial XP.
  - Achievement badges with confetti animation: *Groundbreaker*, *Signal in the Noise*, *Crossed Over*, *Master Plumber*, *Gauntlet Champion*, *Topsider*.
  - Instructor Oversight Dashboard (`/admin`) for tracking solve rates and identifying concepts to review in lecture.

---

## Local Development & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Unit Tests (Vitest)
```bash
npm test
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
npm run build
```

---

## Netlify Deployment

1. Deploy this repository to Netlify (or run `netlify deploy`).
2. Configure Environment Variables in the Netlify Dashboard — `CLASS_PASSWORD` and `SESSION_SECRET` are **required; the API fails closed (HTTP 500) if either is missing**:
   - `CLASS_PASSWORD`: Password announced in lecture. Rotate each semester.
   - `SESSION_SECRET`: Long random secret for HMAC signing (e.g. `openssl rand -hex 32`). Rotating it invalidates all sessions and regenerates all flags.
   - `ADMIN_HANDLES`: Comma-separated instructor handles. Empty means no admins. **Register these handles yourself before announcing the site** — handles are first-come, first-served and cannot be re-registered.
   - `GAUNTLET_STORE` (optional): Netlify Blobs store name, default `gauntlet-fall2026`. Change it next semester and the class starts fresh.

Notes:
- All data (players, solves) lives in **Netlify Blobs** — nothing external to provision, nothing to remember to clear. New semester: change `GAUNTLET_STORE`. Delete old data with `netlify blobs:delete <store>` or via the Netlify UI.
- Handles can only be claimed once. Returning students resume via the token stored in their browser; every visit rolls the token forward another 72 h. A student who loses the token (new machine, cleared storage) needs the instructor to delete their `players/<handle>` blob to free the handle.
- Local `netlify dev` serves a local blob sandbox automatically — no setup, data persists under `.netlify/`.

---

## License

Copyright (c) 2026 Rational Mystic LLC. All rights reserved.

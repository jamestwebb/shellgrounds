# Creative & Copy Plan

This is the creative half of the product plan. It covers fun, fiction, gamification, naming,
decoupling the forensics pack from the author's course, and a ready-to-paste copy deck.
The technical half lives in its own document. Everything here was written after reading
README.md, DESIGN.md, all three pack manifests, all 30 forensics briefs, the Gate / Boot /
Sidebar / Badge / Map components, and `tests/debranding.test.js`.

---

## 1. Is this fun? An honest review.

Short answer: the back half is a game. The front half is a worksheet with a scoreboard
bolted on. The machinery for fun is already built — it is the *briefs* that decide whether
a given five minutes feels like play or homework, and the briefs improve steadily from
Act III on.

### What already works — keep all of it

- **Per-student cryptographic flags.** This is the best mechanic in the product. It turns
  "run `cat`" into "recover *your* flag", makes answers unshareable, and gives every solve
  a tangible token to paste. Do not touch it.
- **The escalation pair `act3-crossing` → `act3-crossing-solo`.** First you get the map,
  then the map is taken away ("Nobody will translate the path for you"). That is real game
  design *and* real pedagogy in one move. Build more pairs like this.
- **The Act V chain (`act5-scan` → `act5-capstone`).** Carrying the sector offset from one
  tool's output into another tool's `-o` flag is the first moment the student feels like
  an investigator instead of a typist. The `extract` tool rejecting a wrong offset is a
  quiet masterstroke — failure teaches without a red X.
- **`act1-hidden` (`.stash`).** The first "there was a secret in plain sight" beat. It
  lands early and it lands well. This is what Act I should feel like throughout.
- **The theater**: BIOS boot, confetti, badges, sound, the `map` view. Cheap dopamine,
  correctly rationed, skippable. Keep.
- **Hint economics** (first hint free, later hints cost points) and the "skip one
  challenge per act" unlock rule. Both are kind to strugglers without flattening the
  leaderboard.
- **The "No flag needed — completes automatically" callout** in the sidebar. Small copy,
  kills a real confusion. More of this attentiveness.

### Where the interest curve sags — specific ids

- **`act1-pwd`, `act1-ls`, `act1-tab`, `act1-history`** — the brief *contains the answer*.
  "Use the `pwd` command to print the directory" is an instruction to transcribe, not a
  puzzle to solve. A 16-year-old forms their opinion of the whole game in these first 90
  seconds, and the opinion formed here is "this is Duolingo for the terminal". These four
  don't need new mechanics — they need briefs that state a *goal* ("record your position
  before you touch anything") and move the literal command into the free hint. The
  command-match predicate can stay.
- **`act2-cat`, `act2-head`, `act2-file`** — same disease, one act later. Nine challenges
  in, only three have felt like *finding* anything. `act2-head` in particular ("Show only
  its first 5 entries") is a fill-in-the-blank. Cheap fix: make the first five lines of
  `access.log` actually contain something worth noticing, and ask about *that*.
- **`act4-pipe-count`** is the most likely rage-quit in the pack. The success predicate is
  a regex over the exact pipeline. A student who writes the *smarter* `grep -vc ALLOW
  network_stream.log` — or who uses `cat file | grep`, or reverses the argument order —
  is told they are wrong while looking at the correct number on screen. Being marked
  wrong while being right is the one sin a learning game cannot commit. Either widen the
  accepted variants substantially or convert it to a state/flag check ("submit the
  count").
- **Act V is two challenges long.** The "capstone act" a student has been unlocking
  toward for the whole game is ten minutes of content. After the buildup, the 20-year-old
  says "that's it?" — and the 16-year-old never even notices there was supposed to be a
  finale. Act V needs at least 4–5 beats: a dead end, a decoy partition, one step that
  requires a pipe from Act IV. The engine already supports all of it.
- **The drill packs (`linux-fundamentals`, `windows-cmd-essentials`)** are, by their own
  manifests, skill drills — and their briefs open exactly like early Warren ("Run `pwd`
  to display..."). That is fine *if they are honestly positioned* as drill packs for
  teachers who want zero fiction. But they inherit all the CTF theater (badges named
  "Shell Master", boot screen, leaderboard) with none of the discovery, which is the
  worksheet-with-a-scoreboard failure mode at full scale. Lowest-cost improvement: seed
  each act with two or three "find the flag" discovery challenges among the drills, so
  the flag box is not decoration.
- **Repeated feedback copy goes stale.** "Incorrect flag. Try again." is the only wrong-
  answer message in the product (`ChallengeSidebar.jsx:107`, `App.jsx:398`). By the
  tenth read it is wallpaper; by the twentieth it reads as contempt. Variants are in the
  copy deck (§6).

### Predicted quit points, by player

- 16-year-old, never seen a terminal: quits by *indifference* in Act I–II if the briefs
  keep handing over the answer; quits by *frustration* at `act4-pipe-count` if the regex
  rejects a right answer.
- 20-year-old undergrad: skims Act I, engages at `act2-strings`, is fully in by
  `act3-crossing-solo`, and is mildly deflated by the two-challenge Act V.
- The anxious student in either group: survives, because hints are cheap, there are no
  timers, and the unlock rule forgives one skipped challenge per act. This population is
  already well served. Protect that.

---

## 2. Does it need a fictional frame? Decide.

### Option A — No fiction. A clean CTF.

Strip Warren/Topside, ship neutral packs like `linux-fundamentals` everywhere.

- **For:** Zero authoring burden. Maximum teacher trust — nothing to pre-read for tone,
  nothing that looks childish in a college syllabus. Trivial to translate. No risk of twee.
- **Against:** Section 1 shows what a fictionless pack looks like: the drill packs are the
  weakest content in the product. Fiction is what turns "run `tail`" into "the evidence is
  at the END of the log because the sensors went dark" — the existing forensics briefs
  demonstrate the difference on every page. Badges, boot screens, and confetti with no
  story to hang on read as arbitrary. The 14-year-old audience loses the most.

### Option B — A big engine-level fiction (aliens, or wizard spells).

"Defend Earth from aliens via CLI" or "become a wizard learning CLI spells", woven through
the UI itself.

- **For:** A strong single fiction is marketable and memorable. The wizard frame in
  particular maps beautifully for beginners (incantations, spellbooks = man pages,
  familiars = processes) and would delight a high-school club.
- **Against:** It bakes fiction into the ENGINE, which is exactly what
  `tests/debranding.test.js` exists to prevent. Every future pack must be aliens (or
  spells) or the frame breaks. The college security instructor now has to sell "wizard
  spells" to a dean — teacher buy-in collapses precisely where the serious-course market
  is. Aliens invite countdowns and urgency, which §3 refuses on principle. Age fit splits:
  what charms a 14-year-old reads as cosplay to a 20-year-old. Authoring burden becomes
  *mandatory* for every pack forever. And both frames age badly in translation.

### Option C — Fiction lives in the PACK. The engine stays neutral. *(Recommended)*

The engine ships no story. Each pack chooses its own frame via `pack.json` (name, host,
theme, titleBar, act names, badges) and its briefs. The forensics pack keeps a
case-investigation fiction (rewritten in §5 to belong to no particular course). The drill
packs stay plain for teachers who want plain. A wizard pack for a high-school club is
simply *a fourth pack somebody writes later* — the architecture already supports it.

- **For:** This is the only option that serves both named customers — "a serious pack for
  a college security course and a silly one for a high school club" — without forcing
  either. Fiction cost becomes bounded and per-pack (roughly: one pack.json, thirty
  briefs, a handful of VFS filenames — a weekend, not a rewrite). Twee risk is contained
  to packs that opt in. The debranding test already enforces the boundary mechanically.
- **Against:** The engine's own chrome (Gate, Boot, badges UI) must be written in a
  neutral voice, which is harder to make charming than a committed fiction. Some fiction
  strings currently hardcoded in `src/` components (Boot's "Analyst Workstation", the
  Gate's "Analyst Handle", WarrenMap's "Case 001 Dossier") must migrate into pack data —
  a real but small cost, and one the technical plan should schedule anyway.

### Recommendation: Option C.

The deciding fact is that the product already voted. The pack format has `theme`,
`messages`, act names, and badge definitions as *data*; the debranding test forbids
Warren vocabulary in the engine; the three packs already span the fiction spectrum from
noir-adjacent to none. Option C is not a redesign — it is finishing a decision the
codebase half-made and then exploiting it. It keeps the strongest existing asset (the
forensics fiction, whose "escalate, then remove the scaffold" briefs are genuinely good),
it lets the free-teacher audience choose tone the way they choose content, and it makes
"add a wizard pack" a community contribution instead of an engine fork. Adopt one editorial
rule from DESIGN.md as pack-authoring law, because it is the whole tone philosophy in one
line: **the joke is allowed one sentence; the instruction gets the rest.**

---

## 3. Gamification: what to add, what to refuse.

Ranked by (student joy) / (build cost), best ratio first.

### Add

1. **Feedback-copy variety.** Five wrong-answer and five solve variants (§6), rotated.
   Cost: an array and a modulo. Joy: prevents the single largest tone failure, staleness.
2. **Per-act boss challenges.** One `act5-scan`-style chained finale per act, in every
   pack. Pure content authoring — zero engine work, the predicates already exist. This
   single change fixes the Act V thinness *and* gives the drill packs their missing
   discovery beats. Highest content-side priority.
3. **Cosmetic terminal themes as badge rewards.** Each badge unlocks a terminal skin
   (amber phosphor, blue CRT, high-contrast paper-white — that one doubles as an
   accessibility win). Pure CSS tokens; the theme system already exists per-pack. No
   balance impact, no anxiety, and students demonstrably grind for cosmetics.
4. **Elegance achievements.** "Solved with a single command", "Used a pipe where two
   steps would do", "Zero hints on a boss". Awarded client-side from the command history
   the engine already records; shown as badge chips, worth zero points so they cannot
   distort the board. This is the rare mechanic that rewards *exactly* the habit the
   course wants to build.
5. **Story-fragment unlocks (fiction packs only).** Completing an act drops a new lore
   file into the VFS (`~/mail/from_the_chief.txt`) that the student must *use their new
   skills to read*. Story delivery that is also spaced repetition. Content cost only.
6. **Team / house play.** An optional team tag at handle creation; leaderboard gains a
   team tab that sums scores. One field, one query, big classroom energy — houses let a
   struggling student contribute to a winning team, which is the humane version of
   competition. Medium cost; first mechanic in this list that touches the backend.
7. **"Explain what you just did" reflection.** Pedagogically the most valuable item on
   the whole menu — and joy-negative if forced. Ship it as an *instructor toggle*, off by
   default: when on, boss challenges ask for one sentence ("What did the `-o` flag
   carry?") worth a small fixed bonus, visible to the instructor in AdminOverview. Never
   gate progression on it.

### Defer

- **Class-vs-class board.** Real appeal, but each teacher runs their own free Netlify
  deploy — there is no shared backend to aggregate, and building one breaks the
  zero-infrastructure promise that defines the product. Revisit only if a hosted hub ever
  exists. (House play, item 6, delivers most of the same joy inside one class.)
- **Speedruns as an opt-in personal lane.** Even opt-in, a visible speed culture leaks
  pressure onto everyone. If ever added, it must be a private personal-best, never a board.

### Refuse

- **Timers and countdowns.** Speed pressure punishes precisely the anxious students the
  hint system was built to protect. DESIGN.md already refused this once ("no timers");
  the refusal stands.
- **Daily streaks.** Streaks punish absence, and students do not control their absences —
  illness, custody schedules, jobs. A streak mechanic in a classroom quietly grades home
  life. No.
- **First-blood bonuses.** They reward prior experience, not learning. The kid who
  already had a Linux laptop wins every one.
- **Full-class ranked ladders.** The current board (top N + your own rank, pseudonymous
  handles) is the correct shape. Never render the *bottom* of the ladder; being 27th of
  27 by name is humiliation with a UI. Add an instructor toggle to hide the board
  entirely for classes where any ranking is wrong.
- **Lives, hearts, or attempt limits.** Terminal learning *is* trying things. A mechanic
  that punishes attempts teaches fear of the prompt — the exact thing this product exists
  to cure.
- **Random rewards / loot-box anything.** This is a classroom, not an app store.

---

## 4. The name.

The three current names (`the-gauntlet` repo, `the-warren` npm, "The Gauntlet" UI) must
collapse to one. "The Gauntlet" itself should not survive: it collides with a famous
arcade game, several CTFs, and an American Gladiators event, and it signals ordeal, not
welcome. "CLI-CTF" is the baseline: perfectly descriptive, legally safe, unsayable
("see-ell-eye-see-tee-eff"), unlovable, and un-Googleable. It can be beaten.

I could not verify name availability from here. **Every candidate below needs a
ten-minute GitHub / npm / trademark search before adoption.** Known or suspected
collisions are flagged.

| # | Name | Repo slug | Notes |
|---|------|-----------|-------|
| 1 | **Shellgrounds** | `shellgrounds` | Training grounds for the shell. Distinctive, spellable, warm. Low collision risk (unverified). |
| 2 | **Terminal Trials** | `terminal-trials` | Says exactly what it is; alliterative; serious enough for a syllabus. Unverified. |
| 3 | **Flagline** | `flagline` | Flags + the command line in one word. Short, ownable. Unverified; check nautical/printing products. |
| 4 | **ShellCamp** | `shellcamp` | Friendly, HS-club energy; may read young for college. Unverified. |
| 5 | **ShellQuest** | `shellquest` | Instantly legible. **Suspect collision** — quest-named shell games and tools exist; verify hard. |
| 6 | **Tilde** | `tilde` | The `~` of home. Elegant, but teachers will say "till-dee" and students will spell it "tilda"; also tilde.club exists. Flagged. |
| 7 | **Promptside** | `promptside` | "Meet me at the prompt." Modest risk of AI-prompt confusion in 2026. Unverified. |
| 8 | **Burrow** | `burrow` | Keeps Warren heritage. **Known collision**: LinkedIn's Kafka monitor is named Burrow. Drop unless renamed at pack level only. |
| 9 | **Caret** | `caret` | The blinking mark itself. Charming; will be spelled "carrot" forever; a Markdown editor named Caret exists. Flagged. |
| 10 | **Greenline** | `greenline` | The glowing prompt line. Sayable, neutral; transit-line collisions likely. Unverified. |
| 11 | **CLI-CTF** | `cli-ctf` | The baseline. Beaten by 1–3 above on memorability and warmth; unbeaten on clarity. |

### Top three, worked

**1. Shellgrounds** — *recommended.*
- Wordmark: `SHELLGROUNDS` in the existing mono caps style; the brandmark circle-dot reads
  as a top-down burrow entrance or a prompt cursor — it survives the rename untouched.
- Tagline: *"Learn the command line by capturing flags."*
- Prompt: `student@shellgrounds:~$` for neutral packs; fiction packs override the host, as
  they already can (`examiner@fieldlab:~$` for forensics).
- Packs read naturally as grounds: *Shellgrounds: Forensics* · *Shellgrounds: Linux
  Fundamentals* · *Shellgrounds: Windows CMD*.

**2. Terminal Trials**
- Wordmark: `TERMINAL TRIALS`, stacked two-line for the Gate screen.
- Tagline: *"Small challenges. Real command-line skill."*
- Prompt: `student@trials:~$`.
- Packs: *The Forensics Trial*, *The Linux Trial*, *The Windows Trial* — the singular
  "Trial" per pack is tidy.

**3. Flagline**
- Wordmark: `FLAGLINE` with the existing green cursor-dot as the "flag".
- Tagline: *"Every command gets you closer to the flag."*
- Prompt: `student@flagline:~$`.
- Packs: *Flagline: Forensics*, etc. Weakness: the name leans CTF-first, which
  undersells the courseware half to teachers.

Decision rule if all three survive the availability search: Shellgrounds for warmth and
ownability; Terminal Trials if the college market matters more than the club market;
Flagline if the CTF identity should lead.

---

## 5. Decoupling `forensics-cli-101` from one specific class.

The pack currently serves CIS 4400/5544 (DESIGN.md is explicit: acts are scheduled
against that course's case labs, `intake.txt` is labeled "Case 001 Dossier" in
WarrenMap.jsx, the README suggests a `gauntlet-fall2026` store name, and the Gate says
"Announced in Lecture"). The skills are universal; the wrapper is not.

### What stays — the skills are the product

Everything on the `teaches` axis survives untouched: `pwd`/`ls`/`cd` and path mechanics,
dotfiles, `cat`/`head`/`tail`, `file` and magic bytes, `strings`, `md5sum`/`sha256sum`
and chain-of-custody, `grep`/`-i`/`-v`, `find`, `man`, the simulated `apt-get`, **the
`/mnt/c` WSL bridge** (general WSL knowledge every Windows-lab classroom needs — this is
a feature for outside teachers, not course residue), pipes, redirection, `cut`, the
`scan`→`extract` offset chain, and the whole Windows parity act. The escalation
structure (assisted bridge → unassisted bridge) stays. The point values and hint
economics stay.

### What must be rewritten

- Any reference to a specific course, case number, week, semester, or lecture:
  "Case 001 Dossier" (WarrenMap), "Announced in Lecture" (Gate — becomes "your teacher
  announces this in class"), the `fall2026` default store name, and every DESIGN.md-era
  assumption that the player is also enrolled in CIS 4400.
- The pack's self-contained fiction gets its own named case so it belongs to *itself*,
  not to a syllabus. Proposed frame: the student is a junior examiner at **Fieldlab**, a
  small fictional digital-forensics lab, working **Case 1042: the Aurora exfiltration** —
  an insider walked out of Aurora Robotics with prototype files. Data theft, no violence,
  no real company or person: classroom-safe at 14 and credible at 20.
- Engine-level chrome that currently speaks Warren ("Analyst Workstation" in Boot,
  "Analyst Handle" in Gate, "THE GAUNTLET" everywhere) moves to neutral strings (§6) or
  into pack data.

### New pack naming

- Pack display name: **Forensics CLI 101: The Aurora Case** (id `forensics-cli-101`
  stays — it is neutral and ids must not churn).
- Host/prompt: `examiner@fieldlab`, home `/home/examiner`. Title bar: `FIELDLAB TTY1`.
- Acts:
  1. **Act I: First on Scene** — orientation and navigation
  2. **Act II: Reading the Evidence** — unchanged; already perfect
  3. **Act III: Following the Trail** — search, manuals, and the WSL bridge
  4. **Act IV: The Pipeline** — pipes, filters, redirection
  5. **Act V: Closing the Case** — the chained capstone investigation
  6. **The Windows Machine** (was Topside) — CMD parity on the seized laptop
- Badges: **First on Scene** (I) · **Signal in the Noise** (II — keep, it is the best
  badge name in the product) · **Crossed Over** (III — keep) · **Pipeline Examiner** (IV)
  · **Case Closed** (V, special) · **Dual Booter** (VI).

### Three rewritten sample briefs

The rewrite rule from §1 applies: the brief states the goal in the fiction; the literal
command moves down into the free hint. Current texts were read before rewriting.

**`act1-pwd` — "Where Am I?"** (was: "Use the `pwd` command to print the directory you
are standing in.")

> First rule at Fieldlab: before you touch any evidence, put your location on the
> record. Print the full path of the directory you are standing in — that line is the
> first entry in your case log.

*(Free hint, unchanged in spirit: "The command is `pwd` — print working directory. Type
it and press Enter.")*

**`act1-hidden` — "Hidden in Plain Sight"** (was: "...Use `ls -la` to find `.stash`,
then read it with `cat .stash`. Submit the captured flag.")

> The examiner who had this workstation before you left something behind, and a plain
> `ls` does not show it. On Linux, a filename that starts with `.` is invisible to a
> normal listing. Find the hidden file in your home directory, read it, and submit the
> flag inside.

*(Free hint: "`ls -a` lists everything, including dotfiles." Paid hint: "The file is
`.stash` — read it with `cat .stash`.")*

**`act5-capstone` — "Carve the Evidence"** (was: "...Submit the Master Capstone Flag it
decrypts.", addressed to "Analyst")

> This is the whole case in one exercise. The seized image `evidence/suspect_drive.raw`
> hides an encrypted vault partition — the prototype files walked out inside it. `extract`
> can carve that partition, but only if you hand it the exact sector offset where the
> vault begins, and it will refuse a wrong one. You recovered that number when you
> scanned the partition table; go back for it if you did not write it down. Carve the
> vault and submit the master flag it gives up. Close the case.

### Does the debranding word list need to change?

**No.** The test scans `packages/engine/` only. `warren`, `topside`, and `analyst`
disappear from the pack anyway under this rewrite; `suspect_drive`, `tracker`, and the
tool names remain in *pack* files, which the test deliberately does not scan — that is
the architecture working as designed. Two recommended *additions* to the forbidden list,
to lock in this decoupling: `fieldlab`/`aurora`/`examiner` (the new fiction must obey the
same engine boundary the old one did) and the old course markers (`CIS 4400`,
`fall2026`) so they can never leak back in. The hardcoded fiction currently living in
`src/` components (Boot labels, Gate labels, WarrenMap content) is outside the test's
reach — flag for the technical plan: either extend the scan to `src/` once those strings
move to pack data, or accept `src/` as themed shell.

---

## 6. Copy deck.

Voice rules applied throughout: plain, warm, never condescending, no hacker cosplay,
short sentences, one exclamation mark per screen at most, written for a student who is
a little afraid of the terminal. Product name strings assume **Shellgrounds**; substitute
mechanically if §4's search forces a different winner.

### index.html

```
<title>Shellgrounds — Learn the Command Line</title>

<meta name="description" content="A free, browser-based command-line game for
classrooms. Students learn bash and Windows CMD by capturing flags — no installs,
no servers. Teachers deploy it free in about 20 minutes." />
```

### Gate screen (`src/components/Gate.jsx`)

- Product name (h1): `SHELLGROUNDS`
- Tagline (replaces *"Prove it in the terminal."*): `Learn the command line by capturing flags.`
- Sub-line (replaces "Forensics CLI 101 · Command-Line Proving Ground"): pack name from
  pack.json, nothing else.
- Handle label (was "Analyst Handle"): `Handle (your leaderboard name)`
- Handle helper: `3–20 characters. Letters, numbers, hyphens, underscores. Pick something you are happy to see on a projector.`
- Class password label: `Class password`
- Class password helper: `Your teacher announces this in class. It is only needed once, to create your handle.`
- Wrong password error: `That password did not match. Check with your teacher — it may have changed since it was announced.`
- Handle already claimed: `Someone in this class already has that handle. Add a number or an underscore and try again.`
- Submit button: `ENTER` (loading state: `CHECKING...`)
- Resume card label (was "Previous Station Located"): `Welcome back`

### Boot screen check labels (`src/components/Boot.jsx`)

Replace the eight forensics-flavoured `WARREN_CHECKS` labels with engine-neutral ones
(pack fiction can override later via pack data):

```
Checking system integrity
Preparing your workstation
Mounting the practice filesystem
Loading challenge pack
Generating your personal flags
Verifying challenge integrity
Connecting the leaderboard
Terminal ready
```

Header line (was "THE GAUNTLET // BIOS v4.8"): `SHELLGROUNDS // BOOT` · sub-line: the
active pack name. Ready line: `All checks passed. Press ENTER when you are ready.`
Button: `START`.

### Empty states

- No solves yet (sidebar / progress): `No flags captured yet. Open Act I and run your first command — everyone on the leaderboard started exactly here.`
- Leaderboard, one player: `One name on the board so far. Plenty of room at the top.`
- Leaderboard, empty: `The board is empty. The first flag anyone captures will appear here.`
- Act locked (template, uses real numbers): `Locked. Solve {n} more in {previous act} and this act opens. You can skip one challenge per act — no challenge can block you alone.`

### Wrong-answer encouragement — 5 rotating variants

1. `Not that one. Look again at what the last command printed — the flag is usually in the output, not the filename.`
2. `That flag did not match. Check for copy-paste gaps: the whole thing, braces included.`
3. `Close, but no. Re-read the brief — it says exactly which file the flag lives in.`
4. `Not it. Try the free hint if you have not — that is what it is there for.`
5. `That one did not match. Wrong answers cost nothing, so keep poking at it.`

### Solve encouragement — 5 rotating variants

*(Shown alongside the challenge's own `successMessage`, which carries the teaching point.)*

1. `Flag accepted. That command is yours now.`
2. `Solved. You typed that like you meant it.`
3. `Captured. On to the next one.`
4. `That is a real skill, not a game skill. Logged and scored.`
5. `Flag accepted — and nobody could have handed you that one. It was yours alone.`

### README opening paragraph (aimed at a teacher, 20 minutes, no sysadmin skills)

> **Shellgrounds is a free command-line game you can run for your class.** Students open
> a web page, pick a handle, and learn real bash and Windows commands by solving small
> challenges and capturing flags — with a class leaderboard, badges, and hints for the
> ones who get stuck. There is nothing to install and no server to maintain: it is a
> static site you deploy to Netlify's free tier by clicking a button, setting three
> settings, and telling your class one password. If you can make a Google Form, you can
> run this. Every student gets flags generated just for them, so answers cannot be
> copied — the only way onto the leaderboard is through the terminal. Setup takes about
> twenty minutes; the deploy guide below walks through every step.

---

## OPEN QUESTIONS FOR THE USER

1. **Name availability.** None of the §4 candidates was checked against GitHub, npm,
   or trademark records from here. Shellgrounds / Terminal Trials / Flagline each need a
   ten-minute search before anything is renamed.
2. **How dead is Warren?** §5 retires the Warren/Topside fiction in favour of
   Fieldlab/Aurora. If you are attached to the rabbit, the alternative is to keep Warren
   as this pack's fiction and only strip the course-specific references — cheaper, but
   the White Rabbit heritage stays visible to outside teachers. I guessed you want a
   clean break.
3. **The fictional case details.** "Fieldlab", "Aurora Robotics", and "Case 1042" are my
   inventions. Any real-world name collision (a local company, a student's surname) is
   worth a two-minute search before authoring thirty briefs around them.
4. **Is insider data theft acceptable fiction for the youngest students?** I judged
   non-violent exfiltration as classroom-safe at 14. A district with strict rules might
   prefer an even softer frame (a lost archive, a puzzle left by a retiring examiner).
5. **Instructor toggles.** §3 assumes teachers get toggles for the reflection step and
   for hiding the leaderboard. Confirm that an instructor-settings surface is in scope
   for the technical plan.
6. **Drill-pack ambition.** I recommended seeding `linux-fundamentals` and
   `windows-cmd-essentials` with a few discovery challenges and per-act bosses, but not
   giving them fiction. If you would rather fully theme them too, that is two more
   weekends of authoring — say so and §2's math changes.
7. **License vs. "free resource".** The README says "All rights reserved" while the
   mission is a free resource teachers self-deploy. Teachers will ask. An explicit
   source-available-for-classroom-use license (or MIT) is a decision only you can make.
8. **Copy deck rollout.** The §6 strings assume the Boot/Gate fiction moves to neutral
   engine copy with pack-level overrides. If the technical plan keeps those strings
   hardcoded per-pack instead, the neutral set becomes the `linux-fundamentals` skin and
   the Fieldlab set needs writing too.

# The pack format — reference

A **pack** is one course: a simulated computer, a set of challenges, and the
rules for how a student moves through them. This document describes every field
you can write and every check the platform runs against it.

It is a reference, not a tutorial. If you are writing your first pack, start
with **`packs/AUTHORING.md`**, which builds one end to end, and come back here
when you need to know what a particular field does.

You do not need to know JavaScript to write a pack. Nothing in this document
asks you to.

**Contents**

1. [Two shapes: a directory or a single file](#1-two-shapes-a-directory-or-a-single-file)
2. [Comments](#2-comments)
3. [`pack.json` — the manifest](#3-packjson--the-manifest)
4. [Acts and unlocking](#4-acts-and-unlocking)
5. [Badges](#5-badges)
6. [`challenges.json` — the challenges](#6-challengesjson--the-challenges)
7. [Hints and their costs](#7-hints-and-their-costs)
8. [Success conditions: every predicate, with an example](#8-success-conditions-every-predicate-with-an-example)
9. [Flags versus command proofs](#9-flags-versus-command-proofs)
10. [The filesystem](#10-the-filesystem)
11. [Pack commands and help pages](#11-pack-commands-and-help-pages)
12. [The single-file format `.pack.json`](#12-the-single-file-format-packjson)
13. [What the validator checks](#13-what-the-validator-checks)
14. [Command-line reference](#14-command-line-reference)

---

## 1. Two shapes: a directory or a single file

The same pack can live in two shapes. They hold the same information and
convert into one another without loss.

**A pack directory** — one file per concern. This is how the three packs that
ship with the platform are stored, and it is the better shape while you are
writing, because each file is small and a version-control diff is readable.

```
packs/my-course/
  pack.json           the manifest: name, acts, badges, theme
  challenges.json     every challenge, in order
  fs.linux.json       the simulated Linux filesystem
  fs.linux.js         a generated four-line loader — do not edit
  fs.windows.json     the simulated Windows filesystem (only if you use one)
  help.json           optional: man pages for tools you invent
  commands.json       optional: tools you invent
```

**A single file, `my-course.pack.json`** — everything above in one JSON
document. This is the shape for **sharing**: emailing a pack to a colleague,
attaching it to a repository release, or uploading it to a pack exchange.

```bash
node bin/shellgrounds.js export my-course  my-course.pack.json   # directory -> file
node bin/shellgrounds.js import my-course.pack.json              # file -> directory
node bin/shellgrounds.js validate my-course.pack.json            # or use it as-is
```

### Why the single-file format contains no code

The three original packs build their filesystem with a JavaScript file,
`fs.linux.js`. That is fine for content this project wrote and reviewed. It is
not fine for a pack that arrives from someone you have never met, because
loading it would run their code inside every student's browser, with that
student's session. There is no sandbox around it and no review step in front of
it.

So the shareable format cannot contain code — not "should not", cannot. A
filesystem is a tree of nodes with content, a mode and an owner. A success
condition is a named check with arguments. A pack command prints fixed text.
The loader refuses a pack file that contains a function, an accessor, a
`__proto__` key, or the removed `js` predicate, and tells you where
it found it.

The cost of that rule is real and you should know it: **a pack command that
computes something cannot be shared.** See §11.

---

## 2. Comments

JSON has no comment syntax, so this format adds one: **any object key beginning
with `//` is a comment and is discarded when the pack loads.**

```jsonc
{
  "//": "The manifest. Everything here is about the course, not one challenge.",
  "id": "my-course",
  "// id": "Must match the directory name, and be unique across every pack."
}
```

`//` is safe as the marker because a file name can never contain a slash, so a
comment key can never be mistaken for a file in the filesystem tree. A file
named `_notes.txt` or `.hidden` is left alone.

`shellgrounds new` writes its scaffold full of these, so the explanation of a field
sits next to the field.

---

## 3. `pack.json` — the manifest

| Field | Type | Required | Default | What it does |
|---|---|---|---|---|
| `id` | string | **yes** | — | The pack's identity. Lower-case letters, digits and hyphens. Must match the directory name and be unique across every pack on the site. |
| `name` | string | **yes** | — | The title a student sees in the pack picker. |
| `version` | string | no | `"1.0.0"` | Your own version number. The platform does not interpret it. |
| `platforms` | array | **yes** | — | `["linux"]`, `["windows"]`, or both. Each one needs its own filesystem. The first is the default. |
| `description` | string | no, but write one | — | The paragraph a student reads when choosing between courses. 600 characters at most. §3.1. |
| `icon` | string | no, but write one | `📦` | One or two emoji. How your course is recognised in a list. §3.1. |
| `cover` | string | no | — | An image, embedded. Raster data URI only — never SVG, never a web address. §3.2. |
| `scene` | string | no | — | The wide establishing shot across the top of the briefing. Same image rules as `cover`. §3.2. |
| `glossary` | object | no | — | What your own commands and course vocabulary mean, keyed by `teaches` tag. The engine already defines the shell. §3.3. |
| `reveal` | string | no | — | The picture a class uncovers together, one square per find. Same image rules as `cover`. §3.2. |
| `revealCaption` | string | no | — | The one line printed under `reveal` when the last square turns over. Names what the class uncovered. Must not contain an answer. §3.2. |
| `briefing` | object | no, but write one | — | What a student reads once, before their first command. §3.1. |
| `linux` | object | if used | — | `{ home, user, host, shell }` — see below. |
| `windows` | object | if used | — | `{ home, user, shell }` — see below. |
| `theme` | object | no | platform default | `{ accent, titleBar, sidebarTone }`. |
| `messages` | object | no | built-in text | What the terminal says when it cannot do something. |
| `courseTools` | object | no | `{}` | Real tools you name but do not simulate. |
| `acts` | array | **yes** | — | §4. |
| `badges` | array | no | `[]` | §5. |

### 3.1 How your course introduces itself

Three fields decide what a student knows before they type anything. A pack works without
them and the validator only warns, but a course with none of them is a name in a list.

```json
{
  "icon": "🔭",
  "description": "You are the overnight operator at the Meridian Observatory. The day crew left the dome in a state, the night log needs reading, and nobody is coming to help until dawn. Starts at \"where am I?\" and ends with you writing a pipeline. No prior experience assumed.",
  "briefing": {
    "heading": "The Night Shift",
    "body": "It is 21:40 and the dome is yours until sunrise.\n\nThe day crew went home in a hurry...",
    "youWillLearn": [
      "Move around a filesystem and always know where you are",
      "Search text with grep, and count what you find"
    ]
  }
}
```

| Field | Limit | Where it appears |
|---|---|---|
| `description` | 600 characters | The card, when a site offers more than one course. Say what the scenario is and who it is for. |
| `briefing.heading` | short | The title of the briefing screen. Usually the scenario's name. |
| `briefing.body` | 1500 characters | The briefing screen. A blank line starts a new paragraph. |
| `briefing.youWillLearn` | 12 lines | Under "By the end you will be able to". Write **what a student will be able to do**, not which commands appear. "Count the lines that match a pattern" teaches more than "`grep -c`". |

A student sees the briefing **once per pack**. It is not a reference page, and anything a
student needs twice belongs in a challenge brief or a hint instead.

### 3.2 `cover`, `scene` and `reveal` — the fields that are not text

A pack may carry three images, under one set of rules. They are shown at different moments
and cropped to different shapes, so a pack that repeats one picture across all three wastes
two of them.

| Field | Where it appears | Shape it is cropped to |
|---|---|---|
| `cover` | a 56-pixel square beside the pack's name in a list of courses | square, tiny — detail turns to mud, so `icon` is usually better |
| `scene` | a wide banner across the top of the briefing, read once before the first command | wide banner; a 3:2 source is cropped top and bottom |
| `reveal` | the picture the class uncovers together, one square per find | **3:2 exactly** — the grid is 12 x 8 |

`scene` is the establishing shot: the place the story opens. `reveal` is the place it ends,
and `revealCaption` says what it turned out to be. Drawing them as **the same place, before
and after** is the intended use, and all three shipped packs do it — the same bench with the
case unopened and then with the recovered drawings on it, the same hills at 21:40 and then at
sunrise, the same desk after hours and then in daylight with the form filled in.

All three are optional. A pack with no `scene` opens its briefing on the heading. A pack with
no `reveal` falls back to its `cover`, and a pack with neither still works: the class uncovers
a wash of the pack's own accent colour instead.

Both have to be embedded, as a base64 `data:` URI:

```json
"cover": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg…"
```

| Rule | Why |
|---|---|
| PNG, JPEG, WebP or GIF | These are pixels. |
| **Never SVG** | SVG is a document that can carry `<script>`. Accepting one would let a pack author run code in every student's browser — the exact hole that was closed when the `js` predicate was removed. There is no safe subset worth the risk; export a PNG. |
| **Never a web address** | A remote image makes a student's browser call somebody else's server. That tells a third party who is studying and from where, breaks a site used offline or behind a school proxy, and lets the picture be swapped for something else after a teacher approved the pack. A reviewed pack must stay the pack that was reviewed. |
| 128 KB at most | A pack file is something teachers email each other. |

If you have no image, use `icon` instead. An emoji costs nothing and works everywhere.

#### `revealCaption` — what the picture turned out to be

`reveal` without `revealCaption` finishes a class on "you finished", which is a progress bar
talking. The caption is the line printed under the completed picture, and it is what makes the
picture the end of your scenario rather than decoration. 240 characters at most. The validator
warns if you ship either half without the other.

```json
"revealCaption": "Dawn over Meridian. The night log is read, the handover note is written and the dome is shut."
```

Two constraints, both of which come from how the picture reaches a student rather than from
taste:

| Constraint | Why |
|---|---|
| **Do not hide a find in the picture** | The pack ships inside the browser bundle, so every student holds the full image from the first second and can read it out of the page in about thirty seconds. A find drawn into the art is worth points, which makes leaking it worth doing, and one leak ends the finale for everybody. Make the picture *meaningful* only after the work, not *visible* only after it. |
| **Do not put an answer in the caption** | The picture is sized to the class roster, so a class completes it well before its slowest student completes the pack. A student still on Act II will read this caption. Name what was found; never name the offset, the event id, or the command. A test enforces this for shipped packs by rejecting any 3+ digit number that also appears in an answer. |

**On staying under the cap.** WebP at quality 80 fits a 1200-pixel-wide flat illustration
into about 20 KB, which is what the three shipped packs do. A photograph will not compress
nearly as well; flat art is both cheaper and better suited to being uncovered a square at
a time.

### `linux` / `windows`

| Field | Example (Linux) | Example (Windows) | What it does |
|---|---|---|---|
| `home` | `/home/student` | `C:\Users\Student` | The student's home directory. **It must exist in your filesystem.** It is also where a challenge starts when it does not say otherwise. |
| `user` | `student` | `Student` | Who the student is logged in as. File permissions are decided against this name, so a file owned by `root` with mode `0400` is unreadable to them — which is how you build a permissions lesson. |
| `host` | `sandbox` | — | The machine name in the prompt: `student@sandbox:~$`. |
| `shell` | `bash` | `cmd` | Which shell is being simulated. |

The home directory and the user should agree. If `home` is `/home/student` then
`user` should be `student`; otherwise the student cannot create files in their
own home directory and half your challenges fail for a reason nobody can see.

### `theme`

| Field | Example | What it does |
|---|---|---|
| `accent` | `"#22c55e"` | A CSS colour used for highlights. |
| `titleBar` | `"SANDBOX TTY1"` | The text across the top of the terminal window. |
| `sidebarTone` | `"green"` | A colour family for the challenge list: `emerald`, `green`, `sky`, `amber`, and so on. |

### `messages`

| Field | What it does |
|---|---|
| `unsimulated` | Shown when the student types a real command the simulator does not implement. |
| `unsupportedSyntax` | Shown when they use shell syntax the simulator does not parse. |

Write these in your course's voice. They are the two messages a struggling
student sees most.

### `courseTools`

A map of tool name to one-line description, for **real tools your subject uses
that this simulator does not implement**. When a student types one, the terminal
says what the tool is for and that it is not simulated here, instead of "command
not found". It is an honesty mechanism: it stops students believing the
simulation is the whole world.

```json
"courseTools": {
  "tcpdump": "a packet capture tool used to record network traffic",
  "nmap": "a port scanner used to map hosts and services"
}
```

---

## 4. Acts and unlocking

An act is a chapter. Every challenge belongs to exactly one.

| Field | Type | Required | Default | What it does |
|---|---|---|---|---|
| `id` | integer | **yes** | — | Act number. Challenges refer to it. Number them `1, 2, 3…`. |
| `name` | string | **yes** | — | Heading shown above the challenge list. |
| `tagline` | string | no | — | One line under the heading. |
| `icon` | string | no | — | An emoji for the act. |
| `glyph` | string | no | — | A small decorative string, e.g. `"─·─"`. |
| `unlockThreshold` | number 0–1 | no | open | The fraction of the **previous** act a student must finish before this one opens. |

### How `unlockThreshold` is actually applied

```
required = ceil(previousActChallengeCount * unlockThreshold)
required = min(required, previousActChallengeCount - 1)   # never all of them
required = max(required, 1)                                # never zero
```

The middle line matters. **A student is always allowed to skip one challenge in
the previous act.** Without that clamp, `0.8 × 4 challenges = 3.2 → 4`, which
means every single one — and a student stuck on one challenge is locked out of
the rest of the course with no way forward. That happened in production.

The clamp saves you, but the validator still warns when your threshold *would*
have demanded 100%, because a threshold that is silently rewritten is a
threshold you did not really choose. Rule of thumb: with a small act, use a
lower number. `0.5` on a 2-challenge act means "solve one".

Act 1 should always be open: `"unlockThreshold": 0.0`, or leave it out.

---

## 5. Badges

A badge is awarded when a student solves **every** challenge in its act.

| Field | Type | Required | What it does |
|---|---|---|---|
| `id` | string | **yes** | Unique within the pack. |
| `name` | string | **yes** | Shown on the leaderboard and in the award animation. |
| `description` | string | no | One sentence about what it took. |
| `icon` | string | no | An emoji. |
| `color` | string | no | A Tailwind gradient, e.g. `"from-emerald-500 to-green-600"`. |
| `act` | integer | **yes, in practice** | Which act earns it. A badge with no `act` is never awarded. |
| `special` | boolean | no | Marks the capstone badge for extra emphasis. |

Give each act exactly one badge, and make the last act's badge `special`.

---

## 6. `challenges.json` — the challenges

An array. Order in the array is the order the student sees.

| Field | Type | Required | Default | What it does |
|---|---|---|---|---|
| `id` | string | **yes** | — | **Must be unique across every pack on the site**, not just yours. The server works out which pack a submission belongs to from this id alone. Prefix every id with a short code for your pack: `nb-1-ping`, `nb-2-trace`. |
| `act` | integer | **yes** | — | Which act it belongs to. |
| `title` | string | **yes** | — | Shown in the challenge list. |
| `points` | number | **yes** | — | Score for solving it. 10–15 early, 20–30 in the middle, 40+ for a capstone. |
| `brief` | string | **yes** | — | What the student is asked to do. See `packs/AUTHORING.md` for how much to give away — it changes by act. |
| `setup.cwd` | string | no | the platform `home` | The directory the student starts in. **It must exist in the filesystem.** |
| `success` | object | **yes** | — | How the challenge is marked. §8. |
| `hints` | array | no | `[]` | §7. |
| `successMessage` | string | no | — | Shown after they solve it. Use it to teach the point, not to congratulate. |
| `teaches` | array of strings | no | `[]` | Free-text tags describing what this challenge teaches. Shown to instructors. |
| `acceptedVariants` | array of strings | no | — | Every command line you consider a correct answer. §6.1. |
| `platform` | `"linux"` \| `"windows"` | no | first platform | Only for a pack that covers both. |
| `commandCheckExempt` | boolean | no | `false` | Turns off the "commands quoted in the brief must run" check for this challenge. |
| `commandCheckExemptSnippets` | array of strings | no | `[]` | Exempts only the listed snippets. Prefer this to the blanket exemption. |
| `commandCheckExemptReason` | string | no | — | Why you exempted it. Write it; the next author will want to know. |

### 6.1 `acceptedVariants` — read this one twice

`acceptedVariants` lists the command lines you regard as correct answers. The
validator **replays every one of them** through the simulator and requires each
to satisfy this challenge's own success condition.

This is not decoration and it is not documentation. A variant that fails is your
course sanctioning an answer that does not work: a student types a line your
pack calls correct, is marked wrong, and has no way to tell which of you is
broken. `shellgrounds validate` reports these under **BROKEN ACCEPTED VARIANTS**
with a count.

Two habits keep the list honest:

- **List only what you have run.** `shellgrounds try` runs one in a second.
- **Do not list a variant to be generous.** If `ls ./` should be accepted, the
  fix is to widen the success condition, not to add a line the checker rejects.

If you write no `acceptedVariants`, the validator falls back to the first
backtick-quoted command in the brief, so solvability can still be proven. That
fallback is not held to the same bar — a command in a brief is an illustration,
not a promise.

---

## 7. Hints and their costs

```json
"hints": [
  { "cost": 0,  "text": "One `grep` flag counts matches instead of printing them." },
  { "cost": 8,  "text": "Run `grep -c ERROR notes/log.txt`." }
]
```

| Field | Type | Required | What it does |
|---|---|---|---|
| `cost` | number | **yes** | Points deducted from this challenge's score when the hint is revealed. `0` is free. |
| `text` | string | **yes** | The hint. Backticks render as code. |

Rules that come out of experience rather than the schema:

- **The first hint is free and conceptual.** A lost beginner should never be
  charged for a nudge. Name the idea, not the flag letter.
- **The exact command line goes behind a cost.** A stuck student gets unstuck in
  ten seconds; they just pay for it. That is what makes the points mean
  anything.
- **Suggested costs:** 5–10 in acts 2–3, 10–15 in act 4 and later, on challenges
  worth 20–45 points.
- **For a flag challenge, add a cheap last hint saying where in the output the
  flag appears.** Otherwise a student who ran exactly the right command stalls
  on the submit step and learns nothing from the delay.

Anything you write in backticks in a brief or a **free** hint is executed by
`tests/scaffolding.test.js` against that challenge's own success condition. If
the snippet solves the challenge, the test fails and names the file, the
challenge and the snippet. That is how the fading rule in `packs/AUTHORING.md`
is enforced rather than merely stated.

---

## 8. Success conditions: every predicate, with an example

`success` names one check. Every predicate below is available; anything else
fails every time.

The context a predicate sees is the state **after** the student's command line
ran: the filesystem, the working directory, standard output, the exit status,
and the text they typed.

### The choice that matters most

**Prefer a predicate that looks at what happened over one that looks at what was
typed.** `commandMatches` grades keystrokes. It marks a student wrong for a
smarter equivalent command, and marks them right when the simulation printed
something false. `shellgrounds validate` counts challenges that check nothing but
`commandMatches` and reports them under **GRADES KEYSTROKES ONLY**.

Use `commandMatches` when the command *is* the lesson and it produces no
observable effect — `pwd`, `history`, tab completion. Use it in an `allOf`
alongside an output check when you want both. Otherwise reach for one of the
output or filesystem predicates.

---

### Output predicates

These read what the terminal printed. They are the ones that make a challenge
check what the student *produced* rather than what they *typed*.

#### `outputContains`

Passes when the output contains a string.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `text` | string | — | The string to look for. Required. |
| `caseSensitive` | boolean | `false` | Match case exactly. |

```json
{ "predicate": "outputContains", "text": "welcome.txt" }
```
Passes for `ls`, `ls -l`, `ls -la`, `find . -name welcome.txt` — every command
that genuinely found the file. This is the workhorse. Reach for it first.

#### `outputEquals`

Passes when the output equals a string exactly, after trimming leading and
trailing blank space and normalising line endings.

| Argument | Type | Meaning |
|---|---|---|
| `text` | string | The expected output. |

```json
{ "predicate": "outputEquals", "text": "3" }
```
Use it when there is exactly one right answer and you want no partial credit —
a count, a single field, a computed value. Be careful: it is strict, and a
trailing detail you did not think about will fail a correct answer. Try it both
ways with `shellgrounds try` before you ship it.

#### `outputLineCountIs`

Passes when the output has exactly *n* non-blank lines.

| Argument | Type | Meaning |
|---|---|---|
| `n` | number | The required number of non-blank lines. |

```json
{ "predicate": "outputLineCountIs", "n": 4 }
```
"Show me only the four failed logins." It checks that the student filtered
correctly without demanding they format the result your way.

#### `outputMatches`

Passes when the output matches a regular expression.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `pattern` | string | — | A JavaScript regular expression, as a string. Backslashes must be doubled in JSON: `\\s`, `\\d`. |
| `flags` | string | `"i"` | Regular-expression flags. |

```json
{ "predicate": "outputMatches", "pattern": "^\\s*3\\s*$" }
```
Anchor it with `^` and `$` when you mean "just the number". Without the anchors
that pattern also passes for a listing that happens to contain a `3`.

#### `exitStatusIs`

Passes when the command's exit status is the given number.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `status` | number | `0` | The required exit status. |

```json
{ "predicate": "exitStatusIs", "status": 1 }
```
For teaching exit codes: "make `grep` tell you it found nothing." When you use
this predicate the validator stops treating a failed command as a broken
solution, because failing is the point.

---

### Filesystem predicates

These read the simulated filesystem after the command ran, so they prove the
student actually changed something.

#### `fileExists` / `dirExists`

| Argument | Type | Meaning |
|---|---|---|
| `path` | string | Absolute, or relative to the student's working directory. |

```json
{ "predicate": "fileExists", "path": "/tmp/errors.log" }
{ "predicate": "dirExists",  "path": "backups" }
```

#### `fileMatches`

Passes when a file's content matches a regular expression.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `path` | string | — | The file. |
| `pattern` | string | — | A regular expression. |
| `flags` | string | `"i"` | Regular-expression flags. |

```json
{ "predicate": "fileMatches", "path": "/tmp/errors.log", "pattern": "ERROR" }
```
The natural partner to a redirection challenge: it checks the student wrote the
*right* thing into the file, not merely that a file appeared.

#### `fileEquals`

Passes when a file's content equals a string, ignoring leading and trailing
blank space.

| Argument | Type | Meaning |
|---|---|---|
| `path` | string | The file. |
| `text` | string | The expected content. |

```json
{ "predicate": "fileEquals", "path": "answer.txt", "text": "42" }
```

#### `lineCountAtLeast`

Passes when a file has at least *n* non-blank lines.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `path` | string | — | The file. |
| `n` | number | `1` | Minimum non-blank lines. |

```json
{ "predicate": "lineCountAtLeast", "path": "/tmp/failures.txt", "n": 3 }
```

#### `fileHashEquals`

Passes when a file's hash equals a hex string.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `path` | string | — | The file. |
| `algo` | `"md5"` \| `"sha256"` | `"sha256"` | Which hash. |
| `hex` | string | — | The expected digest, lower case. |

```json
{ "predicate": "fileHashEquals", "path": "evidence.img", "algo": "md5",
  "hex": "9e107d9d372bb6826bd81d3542a419d6" }
```
For a forensics course: "copy the evidence without altering a byte."

#### `fileHasMode`

Passes when a file's permission bits match.

| Argument | Type | Meaning |
|---|---|---|
| `path` | string | The file. |
| `mode` | string or number | Octal, as a string: `"0600"`. |

```json
{ "predicate": "fileHasMode", "path": "Documents/notes.txt", "mode": "0600" }
```

#### `fileHasOwner`

| Argument | Type | Meaning |
|---|---|---|
| `path` | string | The file. |
| `owner` | string | The expected owner's name. |

```json
{ "predicate": "fileHasOwner", "path": "report.txt", "owner": "root" }
```

#### `cwdIs`

Passes when the student's working directory is a particular path.

| Argument | Type | Meaning |
|---|---|---|
| `path` | string | Absolute path. |

```json
{ "predicate": "cwdIs", "path": "/home/student/Documents" }
```
The right way to check navigation: it accepts `cd Documents`, `cd ./Documents`,
`cd ~/Documents` and the absolute path, because all four genuinely arrive.

---

### The keystroke predicate

#### `commandMatches`

Passes when the command line the student typed matches a regular expression.

| Argument | Type | Default | Meaning |
|---|---|---|---|
| `pattern` | string | — | A regular expression, tested against the trimmed command. |
| `flags` | string | `"i"` | Regular-expression flags. |

```json
{ "predicate": "commandMatches", "pattern": "^pwd\\s*$" }
```
Legitimate here: `pwd` prints a path the student already knows, so there is
nothing else to check. Not legitimate as your default — see the note at the top
of this section.

---

### Combining predicates

#### `allOf` — every one must pass

```json
{
  "predicate": "allOf",
  "predicates": [
    { "predicate": "fileExists", "path": "/tmp/errors.log" },
    { "predicate": "fileMatches", "path": "/tmp/errors.log", "pattern": "ERROR" }
  ]
}
```

#### `anyOf` — at least one must pass

```json
{
  "predicate": "anyOf",
  "predicates": [
    { "predicate": "outputContains", "text": "10.0.0.99" },
    { "predicate": "fileMatches", "path": "answer.txt", "pattern": "10\\.0\\.0\\.99" }
  ]
}
```
Use `anyOf` when a task can be finished on screen *or* into a file, and you do
not care which.

An empty `allOf` fails, deliberately: a check that cannot fail is worse than no
check, because it certifies broken content as valid.

---

### `js` — first-party packs only

Runs a JavaScript function. **It is refused for any pack loaded from a file**,
and a `.pack.json` containing it is rejected at load with an error naming the
challenge. It exists for the packs that ship with the platform. Do not plan
around it; `allOf` and `anyOf` cover almost every case it would have.

---

## 9. Flags versus command proofs

There are two ways to mark a challenge, and they teach different things.

### A command proof

The student types something; the platform inspects what happened; it is marked
immediately. Everything in §8 is a command proof. Use this for most challenges:
the feedback is instant and it grades the effect.

### A flag

The student finds a secret string of the form `FIND{…}` somewhere in the
simulated computer and pastes it into a submit box. The server checks it.

```json
{
  "id": "nb-2-keycode",
  "success": { "kind": "flag", "flagFile": "/home/student/notes/.keycode" }
}
```

| Field | Required | What it does |
|---|---|---|
| `kind` | **yes** | Must be the string `"flag"`. |
| `flagFile` | no, but write it | Where the flag lives. The validator then proves the file exists, contains the placeholder, and is **readable by the student's user**. Without it, you lose that proof. |
| `staticFlag` | no | A fixed flag string, the same for every student. Only for a demonstration; see below. |

**How the flag gets there.** You put a placeholder in a file:

```
RECOVERY KEYCODE
================
[[FLAG:nb-2-keycode]]
```

The text after `FLAG:` must be a challenge id, exactly. At run time the server
replaces the placeholder with a value derived from the student's own handle, so
**every student sees a different flag** and a leaked flag is useless to anyone
else. `[[FLAG:USER_HANDLE]]` is also substituted, with the student's handle, if
you want a file to address them by name.

A placeholder works anywhere the student can reach it: a file's content, a man
page in `help.json`, or the output of a pack command.

The validator checks this in both directions. A flag challenge with no
placeholder anywhere is unsolvable, and a placeholder naming a challenge that
does not exist means students see raw `[[FLAG:…]]` on screen. Both are errors.

**Avoid `staticFlag`.** The same string for every student is shareable, and the
first student to finish can hand it to the class.

**Which to use.** Flags suit search-and-discovery: something is hidden and the
lesson is finding it. Command proofs suit skill drills: the lesson is producing
a result. A pack of nothing but flags becomes a scavenger hunt; a pack with no
flags loses the moment of finding something.

---

## 10. The filesystem

The simulated computer's disk. In a pack directory it is `fs.linux.json` or
`fs.windows.json`; inside a `.pack.json` it is under `filesystems`.

```json
{
  "platform": "linux",
  "root": "/",
  "defaults": {
    "owner": "student", "group": "student",
    "fileMode": "0644", "dirMode": "0755",
    "mtime": "2026-08-17T09:30:00.000Z"
  },
  "tree": {
    "home": {
      "type": "dir",
      "children": {
        "student": {
          "type": "dir",
          "children": {
            "welcome.txt": { "type": "file", "content": "Hello.\n" },
            "notes": {
              "type": "dir",
              "children": {
                ".keycode": {
                  "type": "file",
                  "content": "[[FLAG:nb-2-keycode]]\n",
                  "hidden": true,
                  "mode": "0600"
                }
              }
            }
          }
        }
      }
    },
    "tmp": { "type": "dir", "mode": "1777", "owner": "root", "group": "root", "children": {} }
  }
}
```

### Top-level fields

| Field | Required | Default | What it does |
|---|---|---|---|
| `platform` | no | `"linux"` | `"linux"` or `"windows"`. Decides path separators and the root. |
| `root` | no | `/` or `C:` | The root path. |
| `defaults` | no | see below | Applied to every node that does not say otherwise. |
| `tree` | **yes** | — | The children of the root directory. |
| `rootOrder` | no | key order | The order of the root's own entries, if it matters. |
| `rootNode` | no | mode `0755`, owner `root` | Attributes of the root directory itself. |

### `defaults`

| Field | Default (Linux) | Default (Windows) |
|---|---|---|
| `owner` | `student` | `Student` |
| `group` | `student` | `Users` |
| `fileMode` | `"0644"` | `"0644"` |
| `dirMode` | `"0755"` | `"0755"` |
| `mtime` | `2026-08-17T09:30:00.000Z` | same |

Set `owner` to the same name as your `linux.user`. Then every ordinary file
belongs to the student and only the exceptions — a root-owned password file —
need to say so.

### A directory node

| Field | Required | Default | What it does |
|---|---|---|---|
| `type` | **yes** | — | `"dir"`. |
| `children` | **yes** | — | Object of name to node. Order is preserved, and is the order `ls` prints. |
| `mode` | no | `defaults.dirMode` | Octal string. A directory needs its execute bit (`x`) to be enterable: `0755`, not `0644`. |
| `owner` / `group` | no | defaults | Names. |
| `mtime` | no | default | ISO timestamp. |
| `order` | no | key order | Explicit entry order. Only needed when a name looks like a number (`2026`), because JSON objects reorder those. `shellgrounds export` adds it automatically when it is needed. |

### A file node

| Field | Required | Default | What it does |
|---|---|---|---|
| `type` | **yes** | — | `"file"`. |
| `content` | **yes** | — | The whole file, as a string. `\n` for a new line. Use `""` for an empty file. |
| `mode` | no | `defaults.fileMode` | Octal string: `"0644"`, `"0600"`, `"0400"`, `"0755"` for a script. |
| `owner` / `group` | no | defaults | Names. Permissions are decided against the logged-in user, so `owner: "root"` with `mode: "0400"` makes a file the student cannot read. |
| `hidden` | no | `false` | Hidden from a plain listing. On Linux a leading dot already does this; set the flag as well so `ls -a` and `attrib` agree. |
| `mtime` | no | default | ISO timestamp. |
| `fileType` | no | `"ASCII text"` | What the `file` command reports. Set it to `"data"` to make a file look binary. |
| `size`, `md5`, `sha256` | no | computed from `content` | **Leave these out.** They are computed on load, so editing `content` cannot leave a stale hash behind. Set one only when you deliberately want a file to lie about itself. |

### Rules

- **A name may not contain `/` or `\`.** Nest a directory instead. The loader
  rejects it.
- **The home directory must exist**, and so must every `setup.cwd`.
- **Include a `/tmp`** if any challenge redirects output there. Give it mode
  `1777` and owner `root`, as on a real system.
- **Windows paths** use `C:` as the root, and `\` between segments in a
  challenge's `setup.cwd`. Inside `children`, names are just names.

### Where does the size come from?

Files are stored inline, so a pack is as large as its text. That is a deliberate
limit: this is a teaching filesystem, not a disk image. The three shipped packs
export to 32–62 KiB each.

---

## 11. Pack commands and help pages

### `help.json` — man pages

Adds `man` pages for tools you invent, or extra pages for tools that exist.

```json
{
  "tracker": {
    "name": "tracker - forensic activity tracker",
    "synopsis": "tracker [options]",
    "description": "Tracks sensor activity.\n\nOverride keycode: [[FLAG:act3-man]]",
    "options": ["-a, --all   list all traces"],
    "examples": ["tracker", "tracker -a"]
  }
}
```

A man page is a legitimate hiding place for a flag placeholder — it teaches
students to read documentation, which is the actual skill.

### `commands.json` — tools that print fixed text

```json
{
  "sensorcheck": {
    "platforms": ["linux"],
    "usage": "sensorcheck [-v]",
    "stdout": "ALL SENSORS NOMINAL\n",
    "byArgs": [
      { "args": "-v", "stdout": "sensor 1: ok\nsensor 2: ok\n", "status": 0 }
    ],
    "man": { "name": "sensorcheck - check the sensors", "synopsis": "sensorcheck [-v]" }
  }
}
```

| Field | Required | What it does |
|---|---|---|
| `platforms` | no | Which platforms the command exists on. Default `["linux"]`. |
| `usage` | no | One-line usage string. |
| `stdout` | no | What it prints. May contain a `[[FLAG:…]]` placeholder. |
| `stderr` | no | What it prints to the error stream. |
| `status` | no | Exit status. Default `0`. |
| `byArgs` | no | Different output for particular arguments. The first entry whose `args` string equals the arguments, joined by spaces, wins. |
| `man` | no | A man page, same shape as `help.json`. |

### The honest limit

**A pack command in a shareable pack can only print fixed text.** A command that
computes something — that reads the filesystem, or takes a numeric offset and
does arithmetic with it — needs code, and code cannot cross the trust boundary.

`shellgrounds export` does not pretend otherwise. When a directory pack has a
JavaScript command, the export keeps the name and the man page, marks it
`"unconvertible": true`, and prints the list. The loader does not resurrect it
as a silent no-op; the command simply is not there.

If your course needs a tool that computes, either express it with `byArgs` (a
lookup table often suffices for a teaching tool), or ship a pack directory
rather than a pack file, or open an issue.

---

## 12. The single-file format `.pack.json`

```json
{
  "formatVersion": 1,
  "kind": "shellgrounds-pack",
  "id": "my-course",
  "manifest":    { "id": "my-course", "name": "My Course", "platforms": ["linux"], … },
  "acts":        [ … ],
  "badges":      [ … ],
  "challenges":  [ … ],
  "help":        { … },
  "commands":    { … },
  "filesystems": { "linux": { "platform": "linux", "root": "/", "tree": { … } } },
  "generator":   "shellgrounds export"
}
```

| Field | Required | What it is |
|---|---|---|
| `formatVersion` | **yes** | Integer. Currently `1`. |
| `kind` | no | Must be `"shellgrounds-pack"` if present. |
| `id` | **yes** | The pack id. |
| `manifest` | **yes** | Everything from `pack.json` except `acts` and `badges`, which are hoisted. |
| `acts` | **yes** | §4. |
| `badges` | no | §5. |
| `challenges` | **yes** | §6. |
| `help` | no | §11. |
| `commands` | no | §11. |
| `filesystems` | **yes** | One entry per platform. §10. |
| `generator` | no | Free text recording what wrote the file. |

### Version rules

- **A file with no `formatVersion` is rejected.** Every pack file must declare
  one.
- **A version from the future is rejected**, with an error naming both numbers:
  "declares formatVersion 3, but this platform reads up to 1." Upgrade the
  platform, or ask the author to export at the older version.
- **An older version loads**, with a warning suggesting a re-export.

`formatVersion` is bumped only when a change would stop an older loader reading
a newer file. Adding an optional field does not bump it.

### What is refused, and why

A pack file is rejected outright — not warned about — when it contains:

| What | Why |
|---|---|
| a function value | The format is data. A function is code, and code from a stranger runs in a student's browser. |
| a getter or setter | Same, one level less obvious. |
| an own key `__proto__`, `constructor` or `prototype` | `JSON.parse` really does create an own `__proto__` property, and merging that object elsewhere is a prototype-pollution primitive. |
| a `js` predicate | Removed. It was the one field that could run a pack author's own JavaScript. No pack, first-party or not, can execute code. |
| more than 64 levels of nesting | A stack-exhaustion shape, and nothing legitimate needs it. |

Each refusal names the path where the problem was found, e.g.
`$.challenges[3].success`.

---

## 13. What the validator checks

```bash
node bin/shellgrounds.js validate            # every registered pack
node bin/shellgrounds.js validate ./my-pack  # a directory, a .pack.json, or an id
node bin/shellgrounds.js validate --json     # machine-readable, for CI
```

### Errors — these fail the run

| Check | What it proves |
|---|---|
| **Globally unique challenge ids** | No two packs use the same challenge id. The server works out which pack a submission belongs to from the id alone, so a collision would score a challenge against the wrong pack's filesystem. `packs/index.js` throws on a duplicate at import time, which takes the whole site down; this catches it first and names both packs. |
| **Solvability** | Every challenge is actually solvable. Each declared solution is replayed through the real simulator against a fresh filesystem with real flags injected, and must satisfy the challenge's own success condition without erroring. |
| **Filesystem references** | Every `setup.cwd` and every `flagFile` exists. |
| **Flag reachability** | Every flag challenge's `[[FLAG:…]]` placeholder exists somewhere the student can reach, and its `flagFile` is readable by the student's user. |
| **Flag placeholder mapping** | Every placeholder names a real challenge, so no student sees a raw `[[FLAG:…]]`. |
| **Act progression** | A student who skipped one challenge in the previous act can still unlock the next one. This is the deadlock that reached production. |
| **Commands quoted in briefs** | Every backticked command in a brief or a hint actually runs from the challenge's starting directory. |
| **Pack file format** | For a `.pack.json`: version, structure, required fields, and the no-code guard. |

### Findings — reported with a count, but the run stays green

These are content problems that do not stop a pack working. They are printed
under their own heading with a count, because burying them in a warning stream
is how sixty of them went unnoticed.

| Heading | What it means | What to do |
|---|---|---|
| **BROKEN ACCEPTED VARIANTS** | A line in `acceptedVariants` does not pass the challenge's own check. The message says whether the command failed outright or ran and was rejected. | Either fix the command or widen the success condition. Do not delete the variant if students will type it. |
| **GRADES KEYSTROKES ONLY** | The challenge checks nothing but `commandMatches`. | Add an output or filesystem assertion, usually via `allOf`. See §8. |

### The validator's own tests

`tests/validator-catches.test.js` deliberately breaks a pack in each of the ways
above and asserts the validator rejects it. A check that cannot fail is worse
than no check, because it certifies broken content as valid.

---

## 14. Command-line reference

```
shellgrounds validate [target ...] [--json] [--verbose]
shellgrounds new <pack-id> [outDir] [--force]
shellgrounds try <challenge-id> "<command>" [--pack <target>] [--json]
shellgrounds export <target> [out.pack.json]
shellgrounds import <file.pack.json> [outDir] [--force]
```

A **target** is a registered pack id, a path to a `.pack.json`, or a path to a
pack directory. Every command accepts all three, so a pack works through the
whole cycle before anyone adds it to the registry.

| Command | What it does |
|---|---|
| `validate` | Runs every check in §13. Exit status 0 when all pass. `--json` for CI. `--verbose` lists every finding instead of the first six. |
| `new` | Scaffolds a pack that already passes validation, with a comment on every field. |
| `try` | Runs one command against one challenge and prints what the student would see, whether the checker accepts it, and exactly which clause passed or failed. Exit 0 if it passes. |
| `export` | Writes a pack out as one `.pack.json`, running a JavaScript filesystem builder once to turn it into data. |
| `import` | Turns a `.pack.json` back into a pack directory. Never writes JavaScript derived from pack data. |

### The one thing still done by hand

**A pack does not appear in the app until someone edits `packs/index.js`.** The
app is built with Vite, which needs static imports, so a pack cannot be
discovered at run time. `shellgrounds new` and `shellgrounds import` both write the
exact snippet to paste into the registry, into the pack's `README.md`. Until
that is pasted, everything else works: validate, try, export, import.

# Writing a pack

A **pack** is a course: a simulated computer, a set of challenges, and the rules
for how a student moves through them. Everything a student does happens inside
the simulation, so nothing they type can break anything.

You do not need to know JavaScript to write one. You need to be able to edit
JSON — the format is text files with braces in them — and you need to know your
subject.

This page walks you through building a small pack and shipping it. For the
detail of every field and every check, see **`docs/PACK-FORMAT.md`**.

**Contents**

- [Build one in ten minutes](#build-one-in-ten-minutes)
- [The loop you will actually spend your time in](#the-loop-you-will-actually-spend-your-time-in)
- [Adding a challenge of your own](#adding-a-challenge-of-your-own)
- [Adding a file to the computer](#adding-a-file-to-the-computer)
- [Hiding a flag](#hiding-a-flag)
- [Sharing the pack](#sharing-the-pack)
- [Fading scaffolding: do not give away the answer for free](#fading-scaffolding-do-not-give-away-the-answer-for-free)
- [Writing the brief](#writing-the-brief)
- [Writing hints](#writing-hints)
- [Two findings the validator will report at you](#two-findings-the-validator-will-report-at-you)
- [What is still hard](#what-is-still-hard)

---

## Build one in ten minutes

### 1. Make a pack

```bash
node bin/gauntlet.js new log-triage
```

```
Created packs/log-triage
  pack.json
  challenges.json
  fs.linux.json
  fs.linux.js
  README.md
```

That is a complete, working four-challenge course. Every file is full of
comments explaining what each part does — in this format any key beginning with
`//` is a comment, so the explanations live next to the thing they explain.

### 2. Check it

```bash
node bin/gauntlet.js validate packs/log-triage
```

```
Challenge ids: 101 across 4 packs [✅ all unique]
--------------------------------------------------------------------------------

Pack: Log Triage (log-triage) [✅ PASS]
- Solvability:      4/4 challenges proven (8 variants tested)
- VFS Integrity:    5 nodes validated
- Flags:            1 placeholders mapped to challenges
- Total Points:     65 pts across 2 acts
- Concepts Taught:  8 distinct skills
--------------------------------------------------------------------------------

✨ All content packs validated successfully! Solvability machine-proven.
```

It passes before you have touched it. That is deliberate: your first run should
be green, so that every red after it is something you just did.

"Solvability proven" is not a figure of speech. The validator took each answer
you listed, typed it into the real simulator against a fresh copy of your
filesystem, and checked the result against your own success condition. A
challenge that cannot be solved does not get out of this directory.

### 3. Try a command the way a student would

```bash
node bin/gauntlet.js try lt-1-look "ls" --pack packs/log-triage
```

```
--- what the student sees ------------------------------------------------------
student@sandbox:/home/student$ ls
notes  welcome.txt
--------------------------------------------------------------------------------
exit status 0

VERDICT: ✅ the checker ACCEPTS this command
Why:
  [PASS] outputContains: wants the output to contain "welcome.txt"; the output was "notes  welcome.txt\n"

acceptedVariants: "ls", "ls -l", "ls -la"
```

Now try a wrong one, and watch it say why:

```bash
node bin/gauntlet.js try lt-2-count "grep ERROR notes/log.txt" --pack packs/log-triage
```

```
VERDICT: ❌ the checker REJECTS this command
Why:
  [FAIL] outputMatches: wants the output to match /^\s*3\s*$/i; the output was "2026-08-17 09:04 ERROR database refused the connection\n2026-08-17 09:05 ERROR data…"
```

### 4. Share it

```bash
node bin/gauntlet.js export packs/log-triage log-triage.pack.json
```

One file. Email it, attach it to a release, hand it to a colleague. They run
`node bin/gauntlet.js import log-triage.pack.json` and have your course.

---

## The loop you will actually spend your time in

```bash
# edit challenges.json or fs.linux.json in your editor, then:
node bin/gauntlet.js try <challenge-id> "<a command a student might type>" --pack packs/log-triage
```

That is the whole inner loop. It runs one command against one challenge's
starting filesystem and shows you three things: what the student would see, what
the checker decided, and which clause of your success condition decided it.

Run `validate` when you have finished a batch. Run `try` constantly.

Two habits worth forming early:

- **Try the wrong answers too.** A challenge that accepts everything is not a
  challenge. Type the plausible near-miss and check it is rejected.
- **Try the smarter answer.** If a student could reach the goal a better way
  than you had in mind, and your checker rejects them for it, the checker is
  wrong, not the student.

---

## Adding a challenge of your own

Open `challenges.json` and add an entry to the array.

```json
{
  "id": "lt-2-topsource",
  "act": 2,
  "title": "Who Keeps Failing?",
  "points": 25,
  "brief": "One address in `notes/log.txt` is responsible for most of the failures. Which is it?",
  "setup": { "cwd": "/home/student" },
  "success": { "predicate": "outputContains", "text": "10.0.0.99" },
  "hints": [
    { "cost": 0,  "text": "You can send the output of one command into another with `|`." },
    { "cost": 10, "text": "Run `grep ERROR notes/log.txt | sort | uniq -c | sort -rn`." }
  ],
  "successMessage": "Sorting and counting turns a log into a ranking.",
  "teaches": ["pipes", "sort-uniq"],
  "acceptedVariants": [
    "grep ERROR notes/log.txt | sort | uniq -c | sort -rn",
    "grep ERROR notes/log.txt"
  ]
}
```

Five things to get right, in order of how often they go wrong:

1. **`id` must be unique across every pack on the site**, not only yours. The
   server works out which course a submission belongs to from this id alone, so
   a collision would score a student's answer against someone else's course.
   Prefix every id with a short code for your pack — `lt-` here. The validator
   checks this against every registered pack and refuses a clash.

2. **`acceptedVariants` is a promise, not a note.** Every line is replayed and
   must pass. A variant that fails means your course sanctions an answer that
   does not work: a student types a line you called correct and is marked wrong.
   Run each one through `try` before you list it.

3. **`success` should check what happened, not what was typed.** See below.

4. **`setup.cwd` must exist** in `fs.linux.json`.

5. **Anything you put in backticks in the brief will be executed** by the
   validator, from the challenge's starting directory. That catches a brief that
   tells a student to run something impossible.

---

## Adding a file to the computer

Open `fs.linux.json`. A directory has `children`; a file has `content`.

```json
"notes": {
  "type": "dir",
  "children": {
    "log.txt":   { "type": "file", "content": "…" },
    "roster.csv":{ "type": "file", "content": "name,shift\nAlice,night\nBo,day\n" },
    "keys.pem":  { "type": "file", "content": "-----BEGIN KEY-----\n", "mode": "0600" },
    "shadow":    { "type": "file", "content": "root:!:19500:\n", "mode": "0400", "owner": "root" }
  }
}
```

`mode` and `owner` are how you build a permissions lesson. A file owned by
`root` with mode `0400` genuinely cannot be read by the student — `cat` will
report permission denied, exactly as it would on a real machine — so a challenge
about `sudo` has something real to be about.

You never write `size`, `md5` or `sha256`. They are computed from `content` when
the pack loads, so editing a file cannot leave a stale hash behind it.

Full field list: `docs/PACK-FORMAT.md` §10.

---

## Hiding a flag

A flag is a secret string the student finds and submits, rather than a command
they run. Put a placeholder in a file:

```json
".keycode": {
  "type": "file",
  "content": "RECOVERY KEYCODE\n================\n[[FLAG:lt-2-keycode]]\n",
  "hidden": true,
  "mode": "0600"
}
```

and mark the challenge:

```json
"success": { "kind": "flag", "flagFile": "/home/student/notes/.keycode" }
```

The name after `FLAG:` must be a challenge id, exactly. At run time it is
replaced with a value derived from the student's own handle, so **every student
sees a different flag** and one leaked to the group chat is useless.

`gauntlet try` shows you where it lands:

```bash
node bin/gauntlet.js try lt-2-keycode "cat notes/.keycode" --pack packs/log-triage
```

```
--- what the student sees ------------------------------------------------------
student@sandbox:/home/student$ cat notes/.keycode
RECOVERY KEYCODE
================
FLAG{XN4WFHQKKQUF}
--------------------------------------------------------------------------------
exit status 0

VERDICT: ✅ this command REVEALS the flag
  A flag challenge is scored on what the student SUBMITS, not on what they type, so
  there is no command to check. The question is whether the flag reached the screen.
```

Flags suit search-and-discovery, where the lesson is finding something. Command
proofs suit skill drills, where the lesson is producing a result. Most packs
want both.

---

## Sharing the pack

```bash
node bin/gauntlet.js export packs/log-triage log-triage.pack.json
node bin/gauntlet.js validate log-triage.pack.json     # works on the file directly
node bin/gauntlet.js import log-triage.pack.json       # back to a directory
```

The single file contains **no code**, and that is the point of it. Its
filesystem is a tree of data; its checks are named conditions with arguments.
Loading a pack file never runs anything the author wrote, so a teacher can
accept a course from a stranger without accepting their JavaScript. The loader
refuses a pack file that tries to smuggle in a function and tells you where it
found it.

The cost is in `docs/PACK-FORMAT.md` §11: a pack command that *computes*
something cannot be shared, only one that prints fixed text. `export` tells you
plainly when it had to drop one rather than quietly producing a pack that does
less than the original.

---

## Fading scaffolding: do not give away the answer for free

A third-party review of the first three packs found that **60 of 60** command
challenges printed the required command line inside the brief. A student could
finish an entire pack by copying the line above the terminal, so nothing was
being learned after the first act, and the hint economy was decorative because
the free hint restated the same line.

The rule now, by act:

| Act | The brief | The free (cost 0) hint | A costed hint |
|---|---|---|---|
| 1 | may show the whole command line | may show the whole command line | not needed |
| 2–3 | names the tool, never its flags or arguments | nudges toward the flag or argument | gives the exact line |
| 4+ | states the objective only | names the tool | gives the exact line |

Scaffolding must **fade**. A student who is still being handed the answer in the
last act was never asked to recall anything.

Two things follow from this:

- **State the goal, not the keystrokes.** "Find every line in `logs/app.log`
  that is not an INFO line" beats "Run `grep -v INFO logs/app.log`". The first
  makes the student choose a tool; the second makes them a typist.
- **Put the exact line behind a cost.** A student who is stuck still gets
  unstuck in ten seconds. They just pay for it, which is what makes the XP
  mean something.

Suggested hint costs: 5–10 XP in acts 2–3, 10–15 XP in act 4 and later, on
challenges worth 20–45 points. Keep the first hint free and conceptual so a lost
beginner is never charged for a nudge.

### It is checked

`tests/scaffolding.test.js` executes every backticked snippet in an act-2+ brief
and in every free hint, then tests the result against that challenge's own
success condition. If a snippet solves the challenge, the test fails and names
the file, the challenge, and the snippet.

Because the check runs the snippet rather than pattern-matching it, quoting a
command that is *meant* to fail is fine. A challenge that tells the student
`cat /etc/shadow` will be denied keeps the lint quiet, because that line does
not satisfy the success condition.

---

## Writing the brief

- Address the student directly and say what outcome you want.
- Name the file or directory involved. Making them guess the target is not
  difficulty, it is a maze.
- Say what the tool is for when a tool is genuinely new. Recall works only for
  something the student has met before; `awk` in act 4 needs its purpose named
  even when its syntax does not.
- Keep it to two or three sentences. Long briefs get skimmed, and a skimmed
  brief is a student who types blind.

## Writing hints

- Hint 0, free: the concept or the shape of the answer. "One flag inverts a
  `grep` match" — not the flag letter.
- Hint 1, costed: the exact command, ready to type.
- For a flag challenge, a cheap final hint that says where the flag appears in
  the output prevents a student who ran the right command from stalling on the
  submit step.

---

## Two findings the validator will report at you

These do not stop your pack working. They are printed under their own heading
with a count, because both of them quietly damage a course.

### BROKEN ACCEPTED VARIANTS

```
BROKEN ACCEPTED VARIANTS: 5 of 81 listed answers do not work
  ✗ l1-pwd (act 1) — "/bin/pwd"
      the command itself failed: /bin/pwd: command not found.
  ✗ l1-ls (act 1) — "ls ./"
      the command ran, but the challenge's success condition did not accept it
```

The message tells you which of two problems you have. "The command itself
failed" means the simulator does not do that — drop the variant, or ask for the
command to be implemented. "The success condition did not accept it" means your
checker is too narrow — widen it, because a student who types that line is
right and is being told they are wrong.

The three packs that ship today have twelve of these between them. They are not
hypothetical.

### GRADES KEYSTROKES ONLY

```
GRADES KEYSTROKES ONLY: 28 of 40 challenges (70%) check the typed command and nothing else
```

A challenge whose only check is `commandMatches` is grading typing. It has two
failure modes and both are bad:

- A student who reaches the goal a smarter way is marked **wrong**.
- A student whose command printed nothing useful — or printed something the
  simulation got wrong — is marked **right**.

The fix is usually one line. Instead of:

```json
{ "predicate": "commandMatches", "pattern": "^ls\\s+-[al]+" }
```

write what the student is actually meant to have found:

```json
{ "predicate": "outputContains", "text": ".keycode" }
```

Now `ls -a`, `ls -la`, `ls -al` and `find . -name '.keycode'` all pass, because
all four genuinely found it. If you need both — the command *is* the lesson and
it has to work — combine them:

```json
{
  "predicate": "allOf",
  "predicates": [
    { "predicate": "commandMatches", "pattern": "^ls\\s+-[al]+" },
    { "predicate": "outputContains", "text": ".keycode" }
  ]
}
```

`commandMatches` alone is right when the command produces no observable effect —
`pwd`, `history`, tab completion. That is a short list.

Every predicate, with a worked example: `docs/PACK-FORMAT.md` §8.

---

## What is still hard

Written down plainly, so the next person is not surprised.

**Your pack does not appear in the app until someone edits `packs/index.js`.**
This is the sharpest remaining edge. The app is built with a bundler that needs
its imports written out ahead of time, so a pack cannot be discovered at run
time. `gauntlet new` and `gauntlet import` both write the exact snippet to paste
into the registry, into your pack's `README.md`, but somebody still has to paste
it and redeploy. Everything else — validate, try, export, import — works without
it.

**You cannot see your pack in a browser without running the app.** The inner
loop is `gauntlet try`, which is fast and precise but is a terminal, not the
student's screen. You cannot check that your act names fit the sidebar, or that
a long brief reads well, without `npm run dev`.

**There is no editor.** Everything here is hand-edited JSON. A missing comma is
a parse error naming a line number, which is a poor experience for someone who
does not write code, and it is the single biggest reason a teacher gives up.
This format was designed so an editor can be built on top of it — the filesystem
is data, the checks are named conditions with arguments, and nothing needs to be
executed to be read — but the editor does not exist yet.

**A pack command that computes something cannot be shared.** A shareable pack
holds only commands that print fixed text, because anything else would be code
from a stranger running in a student's browser. `byArgs` covers a lookup table.
Beyond that, ship a pack directory rather than a pack file.

**The simulator does not implement every command or every flag.** You will find
out by writing a challenge and watching it fail validation. There is no single
list yet; `help` inside the terminal is the closest thing. When a real tool your
subject needs is missing, add it to `courseTools` in `pack.json` with a one-line
description, so a student who types it is told what it is for rather than
"command not found".

**Nothing checks your pedagogy except the scaffolding lint.** The validator can
prove a challenge is solvable. It cannot tell you the challenge is boring, or
that act 3 is a cliff, or that you taught `awk` before you taught pipes. Get a
colleague to play it start to finish before you give it to a class.

---

Reference for every field and every check: **`docs/PACK-FORMAT.md`**.

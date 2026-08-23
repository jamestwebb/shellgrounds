# Windows CMD Essentials: Lost & Found

**Curriculum type:** Windows Command Prompt (cmd.exe)
**Audience:** first-time CMD users, from a high-school club to a university first year
**Platform:** Windows (`C:\Users\Student>`)

## The frame

An unclaimed laptop, asset tag **LF-2291**, arrives at a lost-property desk with no name on
it. The student has a Command Prompt and one shift to work out whose machine it is, tidy it
up, and fill in the property form. Each act is one part of that job: search the disk, tidy
it, then fill in the record.

The fiction is deliberately thin. It lives in `pack.json` (act names, badges, title bar), in
`fs.windows.js` (the hidden `lostfound.tag`, the readme), and in at most one sentence per
brief. A student who ignores the story loses nothing, and the pack still reads as a
straight CMD drill to a teacher who wants one.

Nothing in the frame is violent, no real company or person appears in it, and it reads the
same to a fourteen-year-old and to an undergraduate.

## Learning objectives

1. **Act I — Whose Machine Is This?** `cd` / `chdir`, `dir` with `/a`, `/b` and `/s`, `type`,
   `tree`, `where`.
2. **Act II — Tidy It Up:** `copy`, `move`, `ren`, `del` / `erase`, `md` / `mkdir`,
   `rd` / `rmdir`, `attrib`, `%VAR%` expansion, `set`, `cls`, and `&` command chaining.
3. **Act III — Fill In the Form:** `findstr` with `/i` and `/c:`, `type ... | find /c /v ""`,
   `tasklist`, `ipconfig`, `systeminfo`, `certutil -hashfile`.

## Boss challenges

Each act ends with a boss worth roughly double a drill. A boss combines the act's skills
instead of exercising one command, and it is graded on what the terminal printed.

| Id | Act | What it asks |
|---|---|---|
| `w1-boss` | I | Search the disk for the file that lists the four servers, then print it |
| `w2-boss` | II | Build a `Return` folder, copy the notes into it and list it, on one line |
| `w3-boss` | III | Pull the single event-4624 line naming the account that logged on |

## How challenges are marked

Every challenge asserts on **what the terminal produced**, not only on what was typed. This
pack is where that mattered most: `w2-env-var` used to pass on the typed text `echo
%USERPROFILE%` while the terminal printed the literal `%USERPROFILE%`. It now requires the
screen to read `C:\Users\Student`.

Where the result is the point, the check is an output assertion and any command producing
the right answer scores. Where the specific command is the lesson (`dir /a`, `findstr /i`),
the command pattern is kept, widened to accept every reasonable equivalent, and paired with
an output assertion.

A note on two engine limits worth knowing while authoring here: `dir /a` takes its attribute
letters as a separate word, so `dir /ah` is rejected and `dir /a Documents` reads the
current directory instead of `Documents`; and `where cmd.exe` reports
`C:\Windows\System32\cmd.exe.exe`.

Run `node bin/shellgrounds.js validate windows-cmd-essentials` to re-prove every accepted answer
against the real engine.

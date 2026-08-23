# Linux Fundamentals: The Night Shift

**Curriculum type:** core Linux command line
**Audience:** first-time terminal users, from a high-school club to a university first year
**Platform:** Linux (`student@meridian`)

## The frame

The pack is set at **Meridian Observatory**, a small mountaintop observatory whose dome,
weather feed and public website all run on one Linux machine. The student is the overnight
operator: the day crew has gone home, nothing is on fire, and the logs need reading before
dawn.

The fiction is deliberately thin. It lives in `pack.json` (act names, badges, title bar),
in the filenames and file contents of `fs.linux.js`, and in at most one sentence per brief.
A student who does not care about the observatory is never slowed down by it, and a teacher
who wants a plain drill pack can ignore every word of it.

Nothing in the frame is violent, no real company or person appears in it, and it reads the
same to a fourteen-year-old and to an undergraduate.

## Learning objectives

1. **Act I — Opening the Dome:** `pwd`, `ls`, `ls -la` and dotfiles, `cd` and `..`, `cat`,
   `head`, `tail`, wildcard globbing (`*`).
2. **Act II — Reading the Night Log:** `grep` with `-i` and `-v`, `wc -l`, `sort -t -k -n`,
   `cut`, pipes (`|`), redirection (`>`, `>>`), `tee`.
3. **Act III — Keys to the Dome:** `touch`, `mkdir -p`, `cp`, `cp -r`, `mv`, `rm`, octal and
   symbolic `chmod`, `stat`, `sudo`.
4. **Act IV — Handover at Dawn:** `find -name` and `-type f`, `sed s///`, `awk`, quoting and
   variable expansion, `$?`, `&&` and `||`, `diff -u`, `history`.

## Boss challenges

Each act ends with a boss worth roughly double a drill. A boss combines the act's skills
instead of exercising one command, and it is graded on what the terminal printed.

| Id | Act | What it asks |
|---|---|---|
| `l1-boss` | I | Find the hidden `.handover` note and recover the flag inside it |
| `l2-boss` | II | Count the distinct client addresses in the website access log |
| `l3-boss` | III | Copy a log into a new directory, restrict it to its owner, and prove it with a listing |
| `l4-boss` | IV | Name the person with the most logged hours, using sort, head and cut in one line |

## How challenges are marked

Every challenge asserts on **what the terminal produced**, not only on what was typed.
Where the result is the point (count these lines, print this file), the check is an output
assertion and any command producing the right answer scores. Where a specific command is
the lesson (`find`, `sudo`, globbing), the command pattern is kept, widened to accept every
reasonable equivalent, and paired with an output assertion so a broken simulation cannot
pass silently.

Run `node bin/shellgrounds.js validate linux-fundamentals` to re-prove every accepted answer
against the real engine.

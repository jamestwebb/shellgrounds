# Command Accuracy Audit — Third-Party Leg

Companion to `docs/research/command-accuracy-audit.md` (the first-party audit).
This document reports **only** what the independent reviewer added, contradicted,
or confirmed. It does not restate the first-party findings.

Every claim below was re-executed against the live engine
(`packages/engine/shell/exec.js`) in a Node harness. Real-tool output was
captured by running the actual binaries on this machine (GNU coreutils 9.7,
bash, `LANG=en_US.UTF-8`). Windows claims are reasoned from documented
`cmd.exe` behaviour and are marked where verification was not possible.

**This run is assessment only. No fix has been applied.**

---

## Gate status: the third-party leg DID RUN

Plainly: yes, it ran this time.

- `agy models` returned the model list, exit 0. No authentication prompt.
- `~/.claude/skills/gemini-audit/gemini-audit.sh` ran to completion, exit 0.
- Model: **Gemini 3.1 Pro (High)** — non-Anthropic, as the gate requires.
- Sandbox: throwaway source-only `git worktree` at `HEAD` (9c643e7), **133
  tracked files**, deleted after the run. Deny-list pre-flight passed.
- Scope file: `docs/research/command-accuracy-scope.md` (unchanged from the
  attempt that could not run).
- Raw reviewer output: `docs/research/gemini-command-accuracy-findings.md`
  (109 lines, 15 findings). `.err` file empty.

The previous attempt failed at OAuth (`Error: authentication timed out`), which
is why the first-party report carries the heading "the third-party leg DID NOT
RUN". That heading is now superseded.

The reviewer's file:line citations were spot-checked against the source and are
accurate or within a few lines. It genuinely read the code.

---

## Counts

| | |
|---|---|
| Third-party findings returned | 15 |
| Confirmed by execution, as stated | 14 |
| Partially rejected (claim true, evidence false, severity wrong) | 1 |
| Rejected outright | 0 |
| **NEW — missed by the first-party audit** | **7** |
| — of which the reviewer found | 3 |
| — of which surfaced during verification of the reviewer's claims | 4 |
| Agreements with the first-party audit | 12 |
| **Revised confirmed divergence total** | **59** (52 + 7) |

---

## NEW findings the first-party audit missed

Ranked by student harm.

### N1. Any `-N` numeric short option is silently treated as a filename — and three challenges advertise the broken form

*(Surfaced during verification. Highest-harm finding in this document.)*

**Cause:** `packages/engine/commands/registry.js:103`

```js
if (!isWindows && arg.startsWith('-') && arg.length > 1 && !/^\d+$/.test(arg.slice(1))) {
```

An argument that is a dash followed by digits only is **excluded from flag
parsing entirely** and falls through to the positional-operand branch. One line
breaks `head -N`, `tail -N`, `ls -1`, `grep -N`, and every idiom built on them.

**Executed against the shipping `linux-fundamentals` pack filesystem:**

```
$ head -3 Documents/data.csv
status=1
stderr: head: cannot open '-3' for reading: No such file or directory: /home/student/-3
stdout: ==> Documents/data.csv <==
        id,name,department,salary,status
        101,Alice Smith,Engineering,95000,active
        102,Bob Jones,Finance,82000,active
        103,Charlie Brown,Engineering,105000,active
        104,Diana Prince,Security,115000,active
        105,Evan Wright,Marketing,78000,inactive
        106,Fiona Gallagher,Security,120000,active
```

**Real GNU head:** `head -3 a.txt` prints exactly three lines, no header,
status 0.

Two defects compound. The phantom `-3` operand makes `head` believe it has two
file arguments, so it switches on the `==> file <==` multi-file header **and**
prints the whole file. The student asked for 3 lines, got 7 lines, a header
that should not exist, and an error naming a file they never typed.

Same for `tail -2 Documents/data.csv` (status 1, whole file, `tail: cannot open
'-2'`), `ls -1` (`ls: cannot access '-1': No such file or directory`, status 2),
and `sort b.txt | head -1`, which prints **nothing at all** — the fake operand
makes `head` read a file instead of stdin, so the canonical "show me the top
result" pipeline silently produces empty output.

**Affected challenges — the form is advertised, not merely tolerated:**

| Challenge | Pack | Advertised variant that fails |
|---|---|---|
| `act2-head` | forensics-cli-101 | `head -5 Documents/access.log` |
| `l1-head` | linux-fundamentals | `head -3 Documents/data.csv` |
| `l1-tail` | linux-fundamentals | `tail -2 Documents/data.csv` |

All three list the `-N` form in `acceptedVariants`, and each `success` regex
explicitly permits it — e.g. `l1-head`'s pattern is
`^head\s+(?:-n\s*3|-3)\s+…`. The `-n N` form works correctly; only the
short numeric form is broken.

**Worse: the challenge still scores as correct.** `commandMatches`
(`packages/engine/validate/predicates.js:95-99`) tests only the typed command
text — it ignores `status` and `stdout` entirely. So a student who types the
variant the challenge itself recommends sees an error message and the wrong
output, is told they are right, and moves on having learned that `head -3`
prints the whole file.

This is exactly the failure the first-party report predicted its
"highest-value single test" would catch — but it was not among the 52 findings.

---

### N2. `ls` prints a `path:` header for every file operand, breaking the glob lesson

*(Surfaced during verification. Extends first-party D28, which reported only the
basename half of this code path.)*

**Executed against the shipping `linux-fundamentals` pack filesystem — this is
the exact command `l1-glob-doc` teaches:**

```
$ ls Documents/*.txt
Documents/notes.txt:
notes.txt
Documents/todo.txt:
todo.txt
```

**Real ls:**

```
Documents/notes.txt
Documents/todo.txt
```

Real `ls` prints a `name:` header only when an operand is a **directory**, and
only when there is more than one operand. It lists all file operands first, in
one block, with no headers. This code emits a header for every operand
including plain files, and interleaves them.

Also wrong for two plain files:

```
$ ls a.txt b.txt          →  a.txt:\na.txt\nb.txt:\nb.txt
  real                    →  a.txt\nb.txt
```

And the ordering when a file and a directory are mixed:

```
$ ls a.txt sub            →  a.txt:\na.txt\nsub:\ndeep.txt  n.log
  real                    →  a.txt\n\nsub:\ndeep.txt\nn.log
```

**Affected challenges:** `l1-glob-doc` (`ls Documents/*.txt` — the glob matches
two files, so the headers appear), `l1-glob` (`ls projects/web/*.js` — matches
one file, so it escapes by luck), and `l2-grep-i`. The harm is sharpest on
`l1-glob-doc`: it is the student's first lesson in wildcard expansion, and the
output invents structure that does not exist.

First-party D28 reported that `ls docs/*.txt` prints `a.txt` instead of
`docs/a.txt` — the same code path, but it did not report the header lines,
which are the more visible half.

---

### N3. Redirections are applied AFTER the command has already run

*(Reviewer-found. Not present in the first-party audit — D29 and D30 cover
redirection **syntax** and **ordering between fds**, not ordering against
execution.)*

```
$ echo x > important.txt        (file created, status 0)
$ rm important.txt > /nodir/out.txt
status=1
stderr: "No such file or directory: /nodir"       (no trailing newline)
$ ls -l important.txt
status=2
stderr: ls: cannot access 'important.txt': No such file or directory
```

**The file was deleted.** Real bash opens every redirection target *before*
forking the command; a target it cannot create aborts the whole thing:

```
$ rm important.txt > /nodir/out.txt
bash: /nodir/out.txt: No such file or directory
$ ls important.txt
important.txt                    ← still there
```

`cmdDef.run()` is called at `shell/exec.js:173`; `applyRedirections` runs
afterwards at `:203-226`. Two divergences in one: the destructive command
executes when it should not, and the error text lacks bash's `bash: <target>: `
prefix and its trailing newline.

No challenge redirects into a non-existent directory today, so student harm is
latent rather than active — but it teaches the opposite of the fd-open-first
model that makes `>` behaviour predictable.

---

### N4. `sed`'s `p` flag is parsed and does not double-print

*(Reviewer-found. First-party D17 covers scripts `sed` does **not** recognise;
`s/…/…/p` is on D17's explicitly-supported path, so this sub-case was missed.)*

```
$ echo foo | sed s/foo/bar/p
bar

  real GNU sed:
bar
bar
```

Real `sed` prints the pattern space once at end-of-cycle (unless `-n`) and the
`p` flag prints it again, so a substituted line appears twice. The code uses an
`else` branch (`commands/linux/index.js:1113`), so `p` becomes a no-op.
Verified on the real tool above. `sed -n s/foo/bar/p` happens to be correct.

No challenge uses `p` as a substitution flag. Severity LOW, but it is a
silently-dropped flag, which is the class the project's promise forbids.

---

### N5. Unquoted variable expansion does not word-split

*(Reviewer-found, and rated CRITICAL. The claim is true; see the Rejected
section for why its evidence is false and its severity is wrong.)*

With `FOO='-l -a'` supplied through the engine's `env` context:

```
$ ls $FOO
status=2
stderr: ls: invalid option -- ' '
```

Real bash splits the unquoted expansion on `$IFS` into `-l` and `-a` and
produces a long listing including dotfiles. Here the expansion stays one token
containing a literal space, which `parseCommandArgs` then tries to read as
bundled short flags.

```
$ FOO='a.txt b.txt'; wc -l $FOO
this code: wc: a.txt b.txt: No such file or directory: /home/student/a.txt b.txt
real:      5 a.txt / 3 b.txt / 8 total
$ FOO='a  b'; echo $FOO
this code: "a  b"        real bash: "a b"     (split then rejoined)
```

**Severity is LOW, not CRITICAL, and it is unreachable today.** A student cannot
set a variable at all — `FOO=bar` is not an assignment, it is a command name
(`FOO=bar: command not found`), which the first-party audit covers as D5. No
pack supplies an `env` (grep over `packs/*/pack.json`, `packs/*/challenges.json`
and `packs/*/commands.js` returns nothing), and the six built-in variables
(`HOME`, `USER`, `SHELL`, `PATH`, `PWD`, `?`) contain no whitespace on either
platform. There is no input a student can type today that reaches this bug.

---

### N6. `$PWD` is stale after `cd` within the same command line

*(Surfaced during verification.)*

```
$ cd sub && echo $PWD          →  /home/student          real: /home/student/sub
$ cd sub; echo $PWD            →  /home/student          real: /home/student/sub
$ cd sub && pwd                →  /home/student/sub      (correct)
```

`currentEnv` is built once at the top of `runPipeline` (`shell/exec.js:47-55`)
and `PWD` is never refreshed as list elements change the working directory. The
`pwd` builtin reads the live cwd and is correct, so the builtin and the variable
disagree within one command line. No challenge uses `$PWD`. Severity LOW.

---

### N7. `ls`'s own man page advertises `-1` and `-h`, neither of which works

*(Surfaced during verification. The first-party audit flagged this
documentation-contradiction pattern for `test`, `set` and `find -size`, and
flagged `ls -h` as a dropped flag (D8), but did not connect `lsCmd.man` to it or
note `-1`.)*

`man ls` in the simulator prints, verbatim:

```
    -1               list one file per line
    -h               with -l, print sizes like 1K 234M 2G etc.
```

Executed: `ls -h` is accepted and does nothing (first-party D8); `ls -1` is
rejected outright with `ls: cannot access '-1': No such file or directory`
(N1 above). The built-in manual is teaching two flags the engine cannot honour.

Related loop: `ls --help` returns `ls: unrecognized option '--help'` followed by
`Try 'ls --help' for more information.` — the error tells the student to run the
command that produced it.

---

## Third-party claims REJECTED

No finding was rejected outright — all 15 describe a real divergence. But two
carry **false reproductions**, and one carries a **false severity**. Reported
here because acting on the reviewer's text as written would send a fixer down
the wrong path.

### R1. F1's reproduction does not run, and its stated output is invented

The reviewer wrote:

> **Concrete Scenario**: A student types `FOO="-l -a"; ls $FOO`.
> **Simulator Output**: `ls: cannot access '-l -a': No such file or directory`.

Executed:

```
$ FOO="-l -a"; ls $FOO
stderr: FOO=: command not found. Type `help` to see available commands.
stdout: a.txt  b.txt  big.bin  c.csv  sub
```

Neither half holds. The assignment never happens — the simulator has no variable
assignment, so `FOO="-l -a"` is dispatched as a command named `FOO=` and fails.
`$FOO` then expands to empty and `ls` lists the directory normally. The claimed
error string `ls: cannot access '-l -a'` is never produced by any input.

The underlying claim survives on corrected evidence (N5 above), but its severity
falls from CRITICAL to LOW because the bug is unreachable.

### R2. F4's reproduction uses a command the engine does not simulate

The reviewer wrote:

> **Concrete Scenario**: `echo -e "a 1\nb 1" | sort -u -k2`

Executed:

```
$ printf "x\ny\n"
status=127
stderr: printf: a real Linux command, but not simulated here.
```

`printf` exits 127. The reviewer's own `echo -e` form also cannot produce two
lines, because `echo -e` does not interpret `\n` here (`echo -e "a\tb"` returns
the literal `a\tb`). The scenario as written cannot be run.

The finding is nonetheless **CONFIRMED** on a re-derived reproduction:

```
$ echo "a 1" > d.txt ; echo "b 1" >> d.txt ; sort -u -k2 d.txt
this code: a 1
           b 1
real sort: a 1
```

`commands/linux/index.js:822` does `Array.from(new Set(allLines))`, deduping
whole lines with no reference to the `-k` key. The reviewer's diagnosis and fix
direction are both correct.

### R3. F5's stated behaviour is right, but only by coincidence of my first test

The reviewer claimed `ls /nonexistent 2>&1 >f` writes the error into `f`. That
is correct — confirmed once the returned `fs` is threaded between calls:

```
$ ls /nonexistent 2>&1 > f ; cat f
ls: cannot access '/nonexistent': No such file or directory

  real bash: f is empty; the error goes to the terminal
```

Noted here only because an initial run appeared to refute it. It does not. The
finding stands, and it agrees with first-party D30.

---

## Agreements between both audits

Independent agreement is the strongest signal in this document: two reviewers
from different vendors, neither seeing the other's output, landing on the same
divergence. All twelve were re-executed and hold.

| Third-party | First-party | Divergence |
|---|---|---|
| F2 (CRITICAL) | D20 | A pipeline swallows the stderr of every non-final stage. `ls /nonexistent \| cat` produces **nothing at all** — no output, no error, status 0. Real bash prints the `ls` error to the terminal. |
| F4 (HIGH) | D51 | `sort -u` dedupes whole lines and ignores the `-k` key. |
| F5 (HIGH) | D30 | `>f 2>&1` and `2>&1 >f` are indistinguishable. |
| F6 (MEDIUM) | D8 | `ls -h` parsed and silently dropped. `ls -lh big.bin` → `5000`; real → `4.9K`, and `total 20` → `total 20K`. |
| F7 (MEDIUM) | flag inventory | `rm -i` parsed and silently dropped; the file is deleted with no prompt. |
| F8 (MEDIUM) | D46 | `findstr "Meeting AM" notes.txt` → no match, status 1. Real `findstr` ORs space-separated terms without `/c:`, so it matches. (`/c:` itself works.) |
| F9 (MEDIUM) | D7 | `ls -l`'s date is the string literal `Aug 17 09:30` at `commands/linux/index.js:150`. Files built with mtimes of 2020-01-05, 2026-01-02 and 2026-08-20 **all display `Aug 17 09:30`**, while `ls -lt` sorts them correctly by the real mtime — so the order and the dates contradict each other on screen. `touch` never changes it. |
| F10 (MEDIUM) | flag inventory | `head -v` parsed and silently dropped; no `==> file <==` header. |
| F12 (MEDIUM) | D15 | `echo.` → `'echo.' is not recognized…`, status 127. Real cmd.exe prints a blank line. |
| F13 (LOW) | D23 | `cat -n` separates with two spaces; real GNU uses a TAB (`     1\thi`). |
| F14 (LOW) | D43 | `cat` appends a newline the real `cat` never adds: `echo -n hi \| cat` → `hi\n`, real → `hi`. |
| F15 (LOW) | D9 | `wc` pads counts to width 4. `echo hi \| wc -l` → `   1`; real → `1`. `wc -l a.txt` → `   5 a.txt`; real → `5 a.txt`. |

Beyond the reviewer's list, verification independently re-confirmed nine more
first-party findings by execution — D6 (`diff` always emits a unified diff;
real default is the ed-style `1,5c1,3` form), D13 (`where notes.txt` invents
`C:\Windows\System32\notes.txt.exe`), D14 (`rd Docs` succeeds silently on a
non-empty directory), D19 (`grep 'a|b'` matches — real BRE does not, status 1;
`-E` is a no-op), D22 (`false && echo A || echo B` prints nothing, status 1;
real prints `B` — root cause is the `break` at `shell/exec.js:241-246`), D34
(`du -sh sub` → `5K`; real → `8.0K`, and `-s`/`-a` change nothing), D40
(`md5sum -c a.txt` prints a hash instead of verifying; real errors with `no
properly formatted checksum lines found`, status 1), D41 (bare `ps` prints the
full `aux` format; real prints the four-column `PID TTY TIME CMD` form), and
D52 (`/mnt/c` shows `drwxr-xr-x analyst analyst`; a real WSL DrvFs mount shows
mode 777, and `/mnt/c/users/...` in lowercase fails where a default DrvFs mount
is case-insensitive — the latter needs verification against a live WSL install).

---

## Revised total

| | |
|---|---|
| First-party confirmed divergences | 52 |
| New from this leg | +7 (N1–N7) |
| **Revised total** | **59** |
| First-party rejected candidates | 10 (unchanged — none was re-raised) |

The independent leg did not overturn any first-party conclusion. Its value was
additive: three findings the first-party missed, plus four more that surfaced
while reproducing its claims — including N1, which is the only finding in either
document where a challenge **recommends a command the engine cannot execute**
and then **marks the student correct for typing it**.

### Suggested priority, assessment only

1. **N1** — one-line cause, three challenges actively teaching broken forms.
2. **N2** — the glob lesson (`l1-glob-doc`) shows invented structure.
3. **F2 / D20** — a failing pipeline stage is completely silent; this defeats
   the debugging habit the whole course is meant to build.
4. **N3** — a destructive command runs when bash would refuse.
5. Everything else in the agreements table, already prioritised by the
   first-party report.

The first-party report's proposed table-driven test — run every
`acceptedVariants` entry of all 97 challenges through `runPipeline` and assert
no throw, status 0, and that the challenge's own `success` predicate passes —
would have caught N1 outright. That test remains the single highest-value
addition, and this leg is direct evidence for it.

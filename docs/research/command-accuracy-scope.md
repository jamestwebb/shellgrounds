# Audit target: COMMAND ACCURACY of a simulated shell

## Correction to the boilerplate above
This repo is **NOT** Tauri/Rust/SQLite. It is a **JavaScript (ES modules) + React +
Vite** teaching app. There is no database, no network server, no user data. Ignore
the Rust/Tauri/SQLite wording in the framing above; everything else in the
guardrail still applies (source-only, stay in-tree, repo-relative file:line).

## What this program is
It is a **browser-based simulator of a real command line**, used to teach students
Linux bash + GNU coreutils and Windows `cmd.exe`. The student types a command, the
simulator executes it against an in-memory virtual filesystem, and prints output
that is supposed to be **indistinguishable from the real tool**.

The project's stated design promise is **SIMULATION HONESTY**: the simulator must
never silently accept a flag it does not implement, never print output in a format
the real tool would not print, and never return an exit status the real tool would
not return. If the simulation is wrong, students learn wrong habits that break on a
real machine, and they paste wrong output into graded reports.

## Files in scope (audit these, in this order of importance)
- `packages/engine/commands/linux/index.js`  (~2635 lines -- the bash / coreutils simulation)
- `packages/engine/commands/windows/index.js` (~901 lines -- the Windows `cmd.exe` simulation)
- `packages/engine/shell/exec.js`      (pipeline construction and command dispatch)
- `packages/engine/shell/expand.js`    (globbing, variable expansion, quote removal)
- `packages/engine/shell/tokenizer.js` (word splitting, quoting, operators)
- `packages/engine/shell/streams.js`   (stdout/stderr/redirection plumbing)
- `packages/engine/validate/predicates.js` (how a challenge decides the student was right)

Supporting context you may read but need not audit: `packages/engine/vfs/*.js`
(the virtual filesystem), `packages/engine/commands/registry.js`,
`packs/*/challenges.json` (the 97 exercises students actually do),
`tests/*.test.js`.

NOTE: there is a **legacy, dead** copy of an older engine under `src/engine/`
(`exec.linux.js`, `exec.windows.js`, `pipeline.js`, `tokenizer.js`). It is NOT the
live engine -- `src/App.jsx` imports from `packages/engine/`. **Do not report bugs
in `src/engine/`**; they are not shipped. Report only `packages/engine/`.

## THE QUESTION YOU MUST ANSWER
**Where does this simulation diverge from real GNU/Linux bash + coreutils, and from
real Windows cmd.exe?**

You are the domain expert on what the real tools do. Read this code as a person who
knows exactly what `ls -la`, `grep -rn`, `sort -nr`, `cut -d, -f2,4`, `dir /b /s`
and `findstr` really print, byte for byte, and find every place this code differs.

## For EVERY finding, give a CONCRETE DIVERGENCE -- all four parts, no exceptions
1. **The exact input** a student would type (a real command line, e.g. `ls -lh /var/log`).
2. **What this code produces** -- traced from the source, with `file.js:line` for the
   lines that produce it.
3. **What the real tool produces** -- the real GNU coreutils / bash / cmd.exe output
   or error text or exit status.
4. **Why it matters to a student** -- what wrong habit or wrong report it causes.

A finding without a concrete input and a concrete real-tool contrast is worthless
here. Do not report "this looks fragile". Report "type X, get Y, real bash gives Z".

## The defect classes to hunt (prioritise in this order)

### 1. Silently ignored flags (HIGHEST PRIORITY -- violates the stated design promise)
Find **every** place where a flag is parsed into a variable and then never used, or
matched by a regex and discarded, or swallowed by a catch-all like
`if (arg.startsWith('-')) continue`. The promise is that an unimplemented flag
produces a real error, not silence. Enumerate them exhaustively: command name, flag,
source line.

### 2. Wrong flag behaviour
A flag that is accepted but does something different from the real tool. Pay
attention to flag *combinations* and *bundling*: `ls -la`, `ls -lh`, `ls -lt`,
`ls -R`, `grep -rn`, `grep -ic`, `grep -v -c`, `sort -nr`, `sort -k2 -t,`,
`cut -d, -f2,4`, `cut -c3-7`, `find . -type f -name '*.log'`, `head -c 20`,
`tail -n +5`, `tail -f`, `wc -l` vs `wc -lw`, `du -sh`, `df -h`, `chmod` symbolic
vs octal modes, `ps aux`, `awk -F`, `sed -n` with `p`, `sed s///g` vs `s///`.
Also: does a flag work only when written separately (`-l -a`) but break when bundled
(`-la`), or vice versa? Does a flag work only *before* the operand?

### 3. Wrong output format
Students copy this text into reports, so bytes matter.
- `ls -l` column layout: permission string (`-rw-r--r--`), link count, owner, group,
  size, the *two different* date formats coreutils uses (recent files vs files >6
  months old), and the column alignment/padding rules.
- `ls` multi-column output vs one-per-line when piped (real `ls` prints one per line
  when stdout is not a TTY -- does this simulator?).
- `ls -h` size suffixes (`4.0K`, `1.5M`) and coreutils' round-half-up rule.
- Sort order: real `ls` sorts by locale collation, `sort` without `-n` is
  byte/locale ordering, dotfile handling.
- Trailing newline presence/absence, tab vs space separators (`wc`, `du`, `df`,
  `cut -f`), leading whitespace padding (`wc -l` right-aligns its count).
- Windows `dir` header/footer lines, byte-count formatting with thousands
  separators, free-space footer, `<DIR>` marker column.

### 4. Wrong error text and wrong exit status
Real bash/coreutils error strings are exact and students learn to recognise them:
- `ls: cannot access 'x': No such file or directory` (status 2)
- `bash: cd: x: No such file or directory` / `bash: cd: x: Not a directory` (status 1)
- `cat: x: Is a directory` (status 1)
- `grep` returns 1 when there are no matches, 2 on error -- NOT 0.
- `rm: cannot remove 'd': Is a directory`, `rmdir: failed to remove 'd': Directory not empty`
- `mkdir: cannot create directory 'x': File exists`
- command not found -> status 127; permission denied on exec -> 126.
Check the exact quoting style (coreutils uses `'x'` single quotes), the exact
capitalisation, the program-name prefix, and whether the message goes to **stderr**
not stdout. Wrong status codes break `&&`, `||`, and `$?` in the student's next
lesson.

### 5. Quoting, globbing, and expansion (`shell/expand.js`, `shell/tokenizer.js`)
- Single vs double quotes: `$VAR` must expand in `"..."` and must NOT in `'...'`.
- `*` must not match a leading dot (dotfiles) and must not cross `/`.
- `?` matches exactly one character; character classes `[abc]`, `[a-z]`, `[!a]`.
- A glob that matches nothing: bash passes the pattern through literally (default,
  no `nullglob`). Does this?
- Word splitting: unquoted expansion splits on whitespace; quoted does not.
- Backslash escapes, `\ ` in a filename, `"` inside `'`, `'` inside `"`.
- `$?`, `$HOME`, `$PWD`, `${VAR}`, undefined var -> empty string.
- Tilde `~` expansion, and where it does NOT apply (quoted, mid-word).

### 6. Pipeline and redirection semantics (`shell/exec.js`, `shell/streams.js`)
- `|` -- does the exit status of the pipeline equal the status of the LAST command
  (bash default)? Does stderr stay out of the pipe?
- `>` truncate, `>>` append, `>` creating the file even when the command fails,
  `2>`, `2>&1` and the order-sensitivity of `>f 2>&1` vs `2>&1 >f`.
- `tee`, and commands that read **stdin** when given no file operand (`cat`, `grep`,
  `wc`, `sort`, `head`, `tail`, `cut`) -- does each actually consume piped stdin?
- `;`, `&&`, `||` sequencing and short-circuit on the real exit status.

### 7. Windows `cmd.exe` specifics (`commands/windows/index.js`)
- Case-insensitive path and command matching; backslash vs forward slash acceptance.
- `dir` output format, and its `/a` `/b` `/s` `/o` `/w` switches -- especially that
  `/b` is bare format (no header, no footer, no sizes) and `/s` recurses with full
  paths.
- `findstr` vs `find`: different syntax, different quoting, `find` needs quoted
  string and is case-sensitive without `/i`; `findstr` supports regex.
- `%VAR%` expansion, `set`, `echo %PATH%`, undefined var -> literal `%VAR%`.
- `copy` vs `xcopy` vs `move` semantics and their prompts/output lines
  (`        1 file(s) copied.`).
- Drive-relative paths (`C:file`), `cd` without `/d` NOT changing drive, `cd` with no
  argument printing the cwd (unlike Unix `cd`).
- `type`, `del` vs `erase`, `rd /s /q`, `cls`, `ver`, `echo.` vs `echo `.
- `ERRORLEVEL` values.

### 8. Cross-platform parity claims
The `forensics-cli-101` pack bridges Linux and Windows through a `/mnt/c` WSL-style
mount. Check whether that bridge behaves the way WSL really does: path translation,
case sensitivity of a Windows volume seen from Linux, permission bits shown by
`ls -l` on a DrvFs mount, and whether the same file is reachable and identical from
both sides.

## Output requirements
Rank by **student harm**: a divergence that a challenge actively teaches is far
worse than one nothing touches. Where you can, name the affected challenge id from
`packs/*/challenges.json`.

Prefer 15-30 high-confidence, concretely-demonstrated divergences over a long
speculative list. If you are unsure what the real tool does, say "needs
verification" explicitly rather than guessing -- a confident wrong claim about real
coreutils behaviour wastes more time than saying nothing.

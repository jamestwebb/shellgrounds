# Command Accuracy Audit — Simulated Shell Engine

Date: 2026-08-22 · Ref: `9c643e7` · Scope: `packages/engine/`

---

## Gate status: the third-party leg DID NOT RUN

The `gemini-audit` skill was invoked as instructed. The privacy pre-flight passed
(133 tracked files, source-only throwaway worktree, no deny-list hits), but `agy`
is **not authenticated**: it printed a Google OAuth URL and timed out after 60 s
waiting for a browser login that cannot be completed headlessly. Output file is
0 bytes; the error is in
`docs/research/gemini-command-accuracy-findings.md.err`.

**To restore the independent gate the user must re-authenticate `agy` once**
(`agy models` should list models without prompting). Until then this audit has
no non-Anthropic reviewer, and everything below is first-party work.

Because the reviewer never returned, there are no third-party claims to filter.
Every finding below was instead derived from the source and then **verified by
executing the real engine** through a harness that imports
`packages/engine/shell/exec.js` directly. Inputs and outputs quoted below are
actual engine output, not inferred.

---

## Verdict

**FAIL.** The simulation diverges from real bash/coreutils and real cmd.exe in
52 confirmed ways, including one input that throws an uncaught exception, two
core teaching commands (`sudo` with flags, `test`/`[`) that are entirely broken,
and 26 flags that are parsed and silently dropped — a direct violation of the
project's stated SIMULATION HONESTY promise.

Confirmed: 52. Rejected: 10.

**Important framing:** every one of the 97 challenges validates with
`commandMatches`, `cwdIs`, `fileExists`, `dirExists`, `fileHasMode`, or a flag
file. **No challenge validates command output.** So none of these divergences
blocks progress. The harm is entirely pedagogical: the student types the right
command, is told they are correct, and reads output that a real machine would
never print.

---

## Confirmed divergences, ranked by student harm

### Tier 0 — Breaks the engine or a core command outright

#### D1. An unmatched `[` in an unquoted word throws an uncaught exception
- **Input:** `echo [` — also `ls [abc`, `[ -f notes.txt ]`
- **This code:** `SyntaxError: Invalid regular expression: /^[$/: Unterminated character class`, thrown out of `globToRegex` (`packages/engine/shell/expand.js:91`) through `expandGlob:124` → `expandWord:198` → `runPipeline:98`. `src/App.jsx:236` calls `runPipeline` with **no try/catch**, so the throw escapes into the React event handler.
- **Real bash:** `echo [` prints `[`. `[ -f notes.txt ]` is the `test` builtin.
- **Affected challenges:** none directly, but `[` is a character a student will type.
- **Test coverage:** none. No test in the four named files feeds an unbalanced bracket.

#### D2. `sudo` discards the wrapped command's flags
- **Input:** `sudo ls -l /var/log`
- **This code:** `stderr: ls: cannot access '-l': No such file or directory`, then a plain (non-long) listing of `/var/log`; status 2. `sudoCmd.run` (`commands/linux/index.js`, sudo section) calls `cmdImpl.run({ flags: {}, operands: subArgs.slice(1) })` — it never runs `parseCommandArgs`, so `-l` arrives as a path operand. `xargs` has the identical defect.
- **Real bash:** long listing of `/var/log`, status 0.
- **Affected challenges:** `l3-sudo-shadow` (`sudo cat /etc/shadow`) survives only because it uses no flags. `act3-apt` survives via the special-cased apt branch.
- **Test coverage:** F12 in `tests/fidelity.test.js` tests `sudo cat /etc/shadow` — the one shape that works. The flag case is untested.

#### D3. `test` and `[` always fail with an invalid-option error
- **Input:** `test -f notes.txt`
- **This code:** `test: invalid option -- 'f'` / `Try 'test --help' for more information.`, status 2.
- **Real bash:** no output, status 0.
- **Cause:** `testCmd` declares `flags: {}` and does not set `passthroughArgs`, so `parseCommandArgs` (`commands/registry.js:103-141`) rejects `-f` before `run()` is ever reached. `testCmd.run` reads `argv` and would have handled it correctly.
- **Note:** the command's own man page example is `test -f access.log && echo "found"` — the documentation ships a command that cannot work.
- **Affected challenges:** none use `test`.
- **Test coverage:** none.

### Tier 1 — A challenge teaches the wrong thing

#### D4. `%VAR%` never expands on Windows
- **Input:** `echo %USERPROFILE%`
- **This code:** `%USERPROFILE%`
- **Real cmd.exe:** `C:\Users\Student`
- **Cause:** `runPipeline` builds `currentEnv` with only `HOME/USER/SHELL/PATH/PWD/?` (`shell/exec.js:47-55`). The Windows variable set (`USERPROFILE`, `USERNAME`, `COMPUTERNAME`, …) exists **only inside `setWinCmd.run`'s local `fullEnv`** and is never visible to `expandVariables`.
- **Affected challenges:** **`w2-env-var`** — the challenge is literally `echo %USERPROFILE%`. It is marked correct while printing the literal token.
- **Test coverage:** none. `tests/exec.windows.test.js` never tests `%VAR%`.

#### D5. `set` and `export` never persist a variable
- **Input:** `set MY_VAR=123 & echo %MY_VAR%` (win) / `export FOO=bar` then `echo $FOO` (linux)
- **This code:** `%MY_VAR%` and an empty line.
- **Real shells:** `123` and `bar`.
- **Cause:** both `setWinCmd.run` and `exportCmd.run` return `{ env: updatedEnv }`, but `runPipeline` never reads `cmdRes.env` — it only propagates `newCwd`, `fs`, `clear`, `installedPackage`, `submitFlag`, `uiNote` (`shell/exec.js:195-200`).
- **Affected challenges:** **`w2-set`** (`set MY_VAR=123`) — passes on `commandMatches` while doing nothing.
- **Test coverage:** none.

#### D6. `diff` fabricates a unified diff and dumps both files whole
- **Input:** `diff notes.txt data.csv`
- **This code:**
  ```
  --- notes.txt	2026-08-17 09:30:00.000000000 +0000
  +++ data.csv	2026-08-17 09:30:00.000000000 +0000
  @@ -1,4 +1,3 @@
  -alpha
  -beta
  -gamma
  -
  +a,b,c,d
  +1,2,3,4
  +
  ```
- **Real diff:** without `-u`, normal format (`1,3c1,2` / `< alpha` / `---` / `> a,b,c,d`). With `-u`, only differing hunks with three lines of context and correct `@@` counts. There is no `-` or `+` line for the phantom trailing empty element, and no LCS is computed here at all.
- Also: `flags.u` is **never read** — `-u` and no-`-u` produce identical output.
- **Affected challenges:** **`l4-diff`** (`diff -u projects/web/index.html projects/web/style.css`). The challenge teaches reading a unified diff; the student reads a fabricated one.
- **Test coverage:** none. `diff` appears in no test.

#### D7. `ls -l` timestamps, link counts, `total`, and column alignment are all wrong
- **Input:** `ls -la`
- **This code:**
  ```
  total 32
  drwxr-xr-x 1 student student  4096 Aug 17 09:30 .
  drwxr-xr-x 1 root root  4096 Aug 17 09:30 ..
  -rw-r--r-- 1 student student    39 Aug 17 09:30 access.log
  ```
- **Real ls:** the mtime of each file (two formats: `Mon DD HH:MM` for files under six months old, `Mon DD  YYYY` otherwise); a link count of 2+ for directories; `total` = the sum of allocated blocks; and owner/group columns padded to a common width so they line up.
- **Cause:** the date string `Aug 17 09:30` is hardcoded in two places in `lsCmd.run`; the link count is the literal `1`; `total` is `Math.ceil(entries.length * 4)`; owner and group are interpolated with no padding, so `root root` and `student student` misalign.
- **Affected challenges:** **`l1-ls-la`**, **`act1-hidden`**. `l3-stat` also tells the student "`ls -l` does not show all of that" while teaching timestamps.
- **Test coverage:** F1 asserts only that four names appear in `ls` output. No test asserts a single column of long format.

#### D8. `ls -h` is parsed and silently ignored
- **Input:** `ls -lh` on a 3 MiB file
- **This code:** `-rw-r--r-- 1 student student 3145728 Aug 17 09:30 big.bin`
- **Real ls:** `-rw-r--r-- 1 student student 3.0M Aug 17 09:30 big.bin`
- **Cause:** `h` is declared `{ type: 'bool', status: 'implemented' }` in `lsCmd.flags`, and `flags.h` is never referenced anywhere in `lsCmd.run`. `total` is likewise not humanised.
- **Affected challenges:** none use `-h`.
- **Test coverage:** none.

#### D9. `wc` pads every count to width 4
- **Input:** `ls | wc -l`, `wc -l notes.txt`
- **This code:** `   5` and `   3 notes.txt`
- **Real GNU wc:** `5` and `3 notes.txt`. Modern coreutils uses width 1 for a single input and widens only when several files force a common column.
- **Cause:** `String(lines).padStart(4, ' ')` in `wcCmd.run`, unconditional.
- **Affected challenges:** **`l2-wc-l`**, **`l2-pipe-wc`**, **`act4-pipe-count`**. These are exactly the "count the lines and write the number in your report" exercises.
- **Test coverage:** F3 asserts `stdout` *contains* `5 a.txt` — the substring survives the padding, so the test passes on wrong output. `tests/pipeline.test.js` asserts `res.output.trim() === '7'`, which the trim hides.

#### D10. `dir` never sorts
- **Input:** `dir /b` in `C:\Users\Analyst`
- **This code:** `Documents`, `Desktop`, `evidence`, `Downloads` — VFS insertion order.
- **Real cmd.exe:** sorted by name (`Desktop`, `Documents`, `Downloads`, `evidence`) unless `/o` says otherwise.
- **Affected challenges:** **`w1-dir`**, **`w1-dir-b`**, **`w1-dir-s`**, **`w1-dir-a`**, **`topside-nav`** — every Windows navigation challenge.
- **Test coverage:** none asserts order.

#### D11. `dir /a`'s attribute value is discarded; `dir /ah` is rejected outright
- **Input:** `dir /a:h` and `dir /ah`
- **This code:** `/a:h` lists **all** files, hidden and not (`showAll = flags.a !== undefined`). `/ah` returns `Invalid switch - "/ah".` status 1.
- **Real cmd.exe:** both forms list **only** hidden entries.
- **Affected challenges:** **`w1-dir-a`** lists `dir /a:h` and `dir /ah` as accepted variants. One shows the wrong set; the other errors.
- **Test coverage:** F16 tests `dir /a` only, and asserts both a hidden and a visible file are present — which is what `/a` should do, so `/a:h` is untested.

#### D12. `ipconfig /all` is identical to `ipconfig`
- **Input:** `ipconfig /all`
- **This code:** byte-identical to bare `ipconfig` — `ipconfigWinCmd.run({ flags })` never reads `flags`.
- **Real cmd.exe:** `/all` adds host name, physical (MAC) address, DHCP status and lease times, and DNS servers.
- **Affected challenges:** **`w3-ipconfig`** accepts both variants.
- **Test coverage:** none.

#### D13. `where` invents a path for anything
- **Input:** `where nosuchtool`, `where cmd.exe`
- **This code:** `C:\Windows\System32\nosuchtool.exe` (status 0) and `C:\Windows\System32\cmd.exe.exe`.
- **Real cmd.exe:** `INFO: Could not find files for the given pattern(s).` (ERRORLEVEL 1); and `C:\Windows\System32\cmd.exe` for the `.exe` form.
- **Affected challenges:** **`w1-where`** accepts `where cmd.exe`, which yields the double extension.
- **Test coverage:** none.

#### D14. `rd /s /q` is a silent no-op that reports success
- **Input:** `rd /s /q Documents` on a non-empty directory
- **This code:** status 0, no output, **directory still present**. `rdWinCmd.run` parses `/s` and `/q` into `flags` and then calls `rmdir(workingFs, …)` with no options; the failure result is discarded by `if (res.ok)`. `mdWinCmd` swallows errors the same way and always returns 0.
- **Real cmd.exe:** the tree is deleted. Without `/s`, `The directory is not empty.` and ERRORLEVEL 145. `md existing` gives `A subdirectory or file existing already exists.`
- **Affected challenges:** `w2-rd` only removes an empty directory, so it survives.
- **Test coverage:** none.

#### D15. `echo.` is not recognised
- **Input:** `echo.`
- **This code:** `'echo.' is not recognized as an internal or external command,` status 127.
- **Real cmd.exe:** prints an empty line. `echo.` is the standard cmd idiom for a blank line, and `echoWinCmd.man` documents it (`'echo. (prints empty line)'`).
- **Affected challenges:** none.
- **Test coverage:** none.

#### D16. `set` with no arguments prints Unix variables
- **Input:** `set`
- **This code:** the Windows block, then `HOME=C:\Users\Analyst`, `USER=Analyst`, `SHELL=cmd.exe`, `PWD=C:\Users\Analyst` — four variables that do not exist in cmd.exe. `USERNAME=Student` and `USERPROFILE=C:\Users\Student` also contradict the actual logged-in user. The list is not sorted.
- **Real cmd.exe:** no `HOME`/`USER`/`SHELL`/`PWD`; output sorted alphabetically.
- **Input:** `set USERNAME` → **this code:** nothing, status 1 (it searches the shell env, not `fullEnv`). **Real:** `USERNAME=Student`. The man page's own example is `set USERNAME`.
- **Test coverage:** none.

#### D17. `sed` silently degrades to `cat` for every script it does not recognise
- **Input:** `sed -n '/error/p' access.log`
- **This code:** the **entire file**, all four lines.
- **Real sed:** only the two lines containing `error`.
- **Cause:** `sedCmd.run` matches exactly two script shapes — `s/…/…/[gipd]*` and `^(\d+)?(,(\d+))?[pd]$`. Anything else falls to `stdout += lines.join('\n')` at the bottom, which does not even check `flags.n`. Address-regex scripts, `$p`, `2i\`, `s///2`, and multiple `-e` all silently become `cat`.
- Also: `&` in the replacement is literal — `sed 's/error/[&]/'` gives `[&] one`, real sed gives `[error] one`. BRE `\(…\)` groups and `\1` backreferences do not work because the script is compiled as a JavaScript RegExp.
- **Affected challenges:** `l4-sed-replace` uses `s/Engineering/Tech/g`, which is on the supported path — it survives.
- **Test coverage:** none. `sed` appears in no test.

#### D18. `awk` silently prints nothing for every program it does not recognise
- **Input:** `awk '/error/' access.log`
- **This code:** empty output, status 0.
- **Real awk:** the two matching lines.
- **Input:** `awk '{print $NF}' notes.txt` → **this code:** three empty lines (`parseInt('NF')` is `NaN`). **Real awk:** the last field of each line.
- **Cause:** `awkCmd.run` only handles `{print …}` and `/pat/{print …}`. `BEGIN`/`END`, bare patterns, and arithmetic produce silence.
- **Affected challenges:** `l4-awk-column` uses `awk -F: '{print $1, $6}'`, which is supported — it survives.
- **Test coverage:** none.

#### D19. `grep` uses JavaScript regex for both BRE and ERE
- **Input:** `grep "error|warn" access.log`
- **This code:** matches three lines (alternation applied), status 0.
- **Real grep:** without `-E`, POSIX BRE treats `|`, `+`, `?`, `(`, `)` as **literal** — zero matches, status 1. `grep -E "error|warn"` is the form that alternates. The whole `-E` lesson is invisible here because `grep` and `grep -E` behave identically.
- **Affected challenges:** none of the 15 grep challenges uses a metacharacter, so none breaks — but `grep` is the most-taught command in the course and the BRE/ERE distinction is the thing students most need.
- **Test coverage:** none tests a metacharacter.

#### D20. A pipeline drops the stderr of every non-final stage
- **Input:** `ls /nope | wc -l`
- **This code:** stdout `   0`, **stderr empty** — the `ls` error vanishes.
- **Real bash:** `ls: cannot access '/nope': No such file or directory` on the terminal, and `0` on stdout.
- **Cause:** `stageStderr` is overwritten by each stage (`shell/exec.js:203`) and only the final stage's value is appended after the loop (`:237`).
- **Affected challenges:** all six piped challenges (`l2-pipe-wc`, `l2-tee`, `act4-pipe-count`, `act4-pipe-csv`, `w3-find-count`, plus `topside`/`l2` variants) rely on the happy path, so none breaks.
- **Test coverage:** none. `tests/pipeline.test.js` never pipes a failing command.

#### D21. A quoted segment glued to an unquoted one becomes two arguments
- **Input:** `echo "$HOME"/docs`
- **This code:** `/home/student /docs` — note the space.
- **Real bash:** `/home/student/docs`.
- **Cause:** `parseSingleStage` correctly builds one word from several parts, but `runPipeline` then pushes **each part separately** into `expandedArgv` (`shell/exec.js:96-101`) instead of concatenating the parts of a word. `echo "hello"world` → `hello world`.
- **Related:** `cut -d"," -f2,4` argv-splits to `['-d', ',', …]` and survives only because `parseCommandArgs` consumes the next argv entry as the flag's value. But **`l2-cut` lists `cut -d"," -f2,4 Documents/data.csv` as an accepted variant and its own success regex `^cut\s+-d,?\s+-f2,4\s+…` does not match it** — the challenge rejects a command it advertises.
- **Affected challenges:** `l2-cut` (validator mismatch). `l4-var-quotes` uses bare `echo "$HOME"` and survives.
- **Test coverage:** F9 tests `echo "$USER"` standalone — the shape that works.

### Tier 2 — Wrong, no challenge touches it

#### D22. `&&`/`||` chains of three or more elements abort instead of skipping
`false && echo A || echo B` → **this code:** nothing, status 1. **Real bash:** `B`.
`true || echo A ; echo C` → **this code:** nothing. **Real bash:** `C`.
`shell/exec.js:241-246` calls `break` on a short-circuit, terminating the whole list rather than skipping one element. Two-element lists (`l4-list-or`, `l4-exit-status`) work, so no challenge breaks. Covered partially by F10, which tests only the two-element forms.

#### D23. `cat -n` separates with two spaces, not a TAB
`     1  alpha` vs real GNU `     1\talpha` (`%6d\t`). Nothing tests it.

#### D24. `grep -o` prints only the first match on each line
`echo "aa bb aa" | grep -o "a."` → `aa` once. Real grep prints `aa` twice, one per line. `lineText.match(regex)` is called without the `g` flag.

#### D25. `grep` returns 0 when one file matched and another was missing
`grep error nosuch.txt access.log` → status **0**. Real grep returns **2** when any file could not be read. Breaks `&&` chains built on grep.

#### D26. `grep -r`'s reported paths omit the `./` prefix
`grep -r x .` reports `logs/a.log`; real grep reports `./logs/a.log`. Also, with a single file under the directory, `showFilename` is false, whereas real `grep -r` always prefixes the filename.

#### D27. `grep -A/-B/-C` omits the `--` group separator between non-contiguous hunks.

#### D28. `ls FILE` prints the basename, not the operand
`ls /var/log/sys.log` → `sys.log`. Real ls echoes the operand as typed: `/var/log/sys.log`. Same for `ls docs/*.txt` → `a.txt` instead of `docs/a.txt`.

#### D29. `1>`, `>&2`, and `&>` are not recognised
`echo hi 1> o2.txt` writes the file **`hi 1`** — the `1` becomes an argument, and `>` is treated as a bare stdout redirect. `echo x >&2` creates a file literally named `&2`. `cmd &> f` passes `&` as an argument. `parseSingleStage` special-cases only `2>` and only at the start of a stage.

#### D30. `>f 2>&1` and `2>&1 >f` are indistinguishable
The tokenizer stores `redirectOut` and `redirectErr` as unordered fields, and `applyRedirections` always processes stderr first (`shell/streams.js:71` before `:95`). Real bash gives different results for the two orders.

#### D31. Brace ranges are not expanded
`echo a{1..3}` → `a{1..3}`. Real bash: `a1 a2 a3`. `expandBraces` only splits on commas. `mkdir dir{1..5}` is a standard teaching command.

#### D32. Multi-level globs do not expand
`ls */*.txt` and `cat logs/*/access.log` return the pattern literally: `expandGlob` splits at the **last** separator and requires the directory part to exist verbatim.

#### D33. Negated character classes match literally
`ls [!a]*` → `[!a]` is emitted as a regex class containing `!` and `a`. `[^a]` is worse: `^` is escaped by the punctuation branch (`expand.js:83`), producing `[\^a]`. Both bash negation forms are inverted into literal matches.

#### D34. `du` never reaches M or G, and `-s` makes no difference
`du -h big.bin` → `3072K`. Real: `3.0M`. `du -sh docs` → `5K`; real coreutils prints `4.0K`-style one-decimal values. `du` without `-s` behaves exactly like `du -s` — real `du` lists every subdirectory. `-a` is parsed and never read.

#### D35. `%VAR%` expands on Linux and `$VAR` expands on Windows
`expandVariables` (`shell/expand.js:47-59`) applies both syntaxes on both platforms. On Linux `echo %PATH%` expands; real bash prints `%PATH%`. On Windows `echo $HOME` expands; real cmd prints `$HOME`.

#### D36. `tr` does not understand POSIX character classes
`tr '[:lower:]' '[:upper:]'` is a **no-op** (the bracket characters are mapped to themselves). Real tr uppercases. `tr -s SET1 SET2` silently ignores `-s`.

#### D37. `find`'s `-size`/`-mtime`/`-exec`/`-delete` are declared implemented, then treated as paths
`find . -size +1M` → `find: '+1M': No such file or directory` **and it still lists every file**, status 1. `findCmd.run` re-parses `argv` itself and only handles `-name`, `-iname`, `-type`, `-maxdepth`; `-size` is skipped and its value `+1M` falls into `startPaths`. `-type l` is also unhandled, so it filters nothing. The man page advertises `-size`.

#### D38. `xargs` cannot pass flags, ignores `-n`, and misuses `-I`
`find . -name "*.txt" | xargs grep -n secret` searches for the literal string `-n` (same `flags: {}` defect as `sudo`). `-n` is parsed and never read. `-I {}` substitutes **all** items joined by spaces and runs the command **once**; real xargs runs once per item.

#### D39. `tar` and `gzip` are silent no-ops that report success
`tar -czf backup.tar.gz docs` → status 0, no output, and `ls` shows no `backup.tar.gz`. `tarCmd.run` only handles `-t` (returning a fixed three-line listing). `-c`, `-x`, `-z`, `-f`, `-v` are parsed and dropped.

#### D40. `md5sum -c` / `sha256sum -c` hash the checksum file instead of verifying it
`md5sum -c sums.txt` prints the MD5 of `sums.txt`. Real coreutils reads it and prints `file: OK` / `FAILED`. `flags.c` is declared implemented and never read.

#### D41. `ps` ignores `a`, `u`, `x`, and always prints the `aux` format
Bare `ps` prints the full `USER PID %CPU %MEM …` table. Real `ps` with no arguments prints `  PID TTY          TIME CMD` with only the caller's processes. The USER column is also mis-padded (`padEnd(8)` under a 13-wide header), so `student   1024` does not line up with `root           1`.

#### D42. `echo` parses flags anywhere in its argument list
`echo hello -n` suppresses the newline; real bash prints `hello -n`. `echo Use -l to list` → `echo: invalid option -- 'l'`, status 2; real bash prints the sentence. Real `echo` stops treating words as options after the first non-option.

#### D43. `cat` appends a trailing newline the real `cat` never adds
A file with no final newline gains one. Also `sed`, `less`, and `type` do the same.

#### D44. `strings` returns whole text files as a single blob
Its character class includes `\s`, so newlines are "printable" and the match spans the file. Real `strings` breaks runs at any non-printable byte including `\n`.

#### D45. Windows `dir` omits thousands separators from file sizes
`08/17/2026  09:30 AM               549 readme.txt` and `4 File(s)          1212 bytes`. Real cmd prints `549` and `1,212` — and the "bytes free" footer in this code *is* comma-formatted, so the output is internally inconsistent.

#### D46. `findstr` uses JavaScript regex, ignores `/r` and `/s`, and mishandles multi-word patterns
`findstr "error warn" f` compiles one regex `error warn`; real findstr treats a space-separated unquoted list as **alternatives** (match either word) — the classic findstr gotcha. `/r` and `/s` are parsed and never read, so `/s` does not recurse. Affects `w3-findstr` (`findstr "EVENT ID" logs\eventlog.txt`), which in real cmd would match lines containing *either* `EVENT` or `ID`.

#### D47. `tree` always draws `/a`-style ASCII and ignores `/a`
Output uses `+---`; real `tree` without `/a` draws `├───` and `└───`. `flags.a` is parsed and never read. Affects `w1-tree` cosmetically.

#### D48. `attrib` output columns are wrong
`A  H       C:\path` — real attrib places each attribute letter in a fixed column (`A    H       R    …`).

#### D49. `del` and `copy`/`move` drop their switches
`copy /y`, `copy /b`, `move /y`, `del /q` are all parsed and never read. `del` on a directory fails where real cmd deletes its contents. `del` errors report the operand as typed rather than the full path.

#### D50. Heredoc bodies are always empty
`parseSingleStage` sets `redirectIn = { type: 'heredoc', content: '' }` unconditionally, so `cat << EOF` yields nothing. A single-line terminal cannot do better, but the command should say so rather than return silently.

#### D51. `sort -u` dedupes whole lines, and `-k` modifiers are dropped
Real `sort -u` removes lines that compare equal **under the sort key**. `sort -k2n` parses the key as `parseInt('2n') === 2` and silently discards the `n`, so it sorts lexically when the student asked for numeric.

#### D52. The `/mnt/c` WSL bridge is not a bridge
The Linux and Windows filesystems are **disjoint objects**. `C:\Users\Analyst\Documents\readme.txt` exists on the Windows side; `/mnt/c/Users/analyst/Documents/` on the Linux side contains only `surface_notes.txt`. The same file is not reachable from both sides.
- `ls /mnt/c/Users/Analyst` → `No such file or directory` (the Linux side has lowercase `analyst`). Real WSL DrvFs is **case-insensitive**, so this would succeed.
- `ls -l /mnt/c` → `drwxr-xr-x 1 analyst analyst`. Real WSL DrvFs shows `drwxrwxrwx 1 root root` by default.
- **Affected challenges:** `act3-crossing`, `act3-crossing-solo`. `act3-crossing`'s `successMessage` states "`C:\Users\x` on Windows maps to `/mnt/c/Users/x` in Linux" — a mapping the simulator does not implement.
- **Test coverage:** none. No test touches `/mnt/c`.

### The silently-ignored flag inventory

The design promise is that an unimplemented flag produces a real error, never
silence. These 26 flags are parsed into `flags` and never read. All are declared
`status: 'implemented'`.

| Command | Flags dropped |
|---|---|
| `ls` | `-h` |
| `head` | `-v` |
| `touch` | `-a`, `-m` |
| `cp` | `-f`, `-i` |
| `mv` | `-f`, `-i` |
| `rm` | `-i` |
| `rmdir` | `-p` |
| `du` | `-a` |
| `strings` | `-a` |
| `diff` | `-u` |
| `xargs` | `-n` |
| `md5sum`, `sha256sum` | `-c` |
| `find` | `-size`, `-mtime`, `-delete`, `-exec` |
| `tar` | `-c`, `-x`, `-z`, `-f`, `-v` |
| `gzip` | `-d` |
| `ps` | `a`, `u`, `x` |
| `sort` | `-k` modifiers (`n`, `r`, `.N`) |
| `tr` | `-s` when two sets are given |
| `pwd` | `-L`, `-P` (benign — no symlinks exist) |
| win `cd` | `/d` |
| win `dir` | `/o`, `/w`, `/p`, `/q`, and `/a`'s attribute value |
| win `findstr` | `/r`, `/s` |
| win `copy` | `/y`, `/b` |
| win `move` | `/y` |
| win `del` | `/q` |
| win `rd` | `/s`, `/q` |
| win `tree` | `/a` |
| win `tasklist` | `/svc`, `/v` |
| win `ipconfig` | `/all` |

The `notSimulated` mechanism works correctly where it is used (`ls -R`, `cat -E`,
`tail -f`, `grep -P` all produce an honest error — see F5). The defect is that
the flags above were labelled `implemented` without an implementation.

---

## Rejected findings

Candidate divergences I tested and could **not** reproduce. Each is correct
behaviour and should not be "fixed".

1. **`cut -d',' -f2,4` broken by quote-splitting.** It works. The argv split into
   `['-d', ',']` is repaired by `parseCommandArgs`, which consumes the next argv
   entry as a string flag's value. Only the challenge's own success regex is wrong.
2. **A non-matching glob should error.** `ls *.md` → `ls: cannot access '*.md'` is
   exactly what bash does with default `nullglob` off. Correct.
3. **`ls` should be one-per-line when piped.** Already correct — `isTTY` is
   threaded through `runPipeline` and `forceOneLine` honours it.
4. **`false || echo X` is broken.** It is not. Two-element lists work; only chains
   of three or more break (D22).
5. **`cmd ; echo $?` is broken.** It works. `currentEnv['?']` is refreshed after
   each list element (`shell/exec.js:235`).
6. **`grep` returns the wrong status on no match.** Correct: 0 on match, 1 on none.
7. **`awk -F: '{print $1, $6}'` is broken.** Works — `-F:` bundles correctly and
   the `{print …}` path is implemented. `l4-awk-column` is safe.
8. **`sed 's/A/B/g' f` is broken.** Works. `l4-sed-replace` is safe.
9. **`sudo cat /etc/shadow` is broken.** Works — only `sudo` **with flags** breaks.
   `l3-sudo-shadow` is safe.
10. **Assorted formats I checked and found correct:** `uniq -c` (`%7d ` then the
    line), `md5sum`'s two-space separator, `head`/`tail`'s `==> file <==` headers,
    `tail -n +N`, `head -c N`, `cat -s`, `sort`'s error text and status 2, `ls`'s
    status 2 on a missing operand, `cd`'s `bash: cd: x: No such file or directory`
    and `Not a directory` strings, `wc`'s `total` line, `history`'s `%5d  ` format,
    Windows `copy`'s `        1 file(s) copied.`, `find /c /v ""`, and the Windows
    `cd` error strings.

---

## Coverage gaps in the test suite

The four named files hold **37 tests** (17 fidelity, 10 exec.linux, 6
exec.windows, 4 pipeline). Two structural problems make that number misleading.

**1. Two of the four files test dead code.** `tests/exec.linux.test.js` and
`tests/exec.windows.test.js` import from `src/engine/exec.linux.js` and
`src/engine/exec.windows.js`. `src/App.jsx:24` imports `runPipeline` from
`packages/engine/shell/exec.js`. **16 of the 37 tests exercise an engine the
application does not ship.** They cannot catch any regression in the live code.

**2. Most assertions are substring containment, so they pass on wrong output.**
F3 asserts `stdout` *contains* `5 a.txt` and passes despite the width-4 padding
of D9. F1 is titled "sorts lexicographically and ignores case" and asserts only
that four filenames are present — it would pass on any ordering.

Behaviour with **zero coverage** in the four files:

- Every Tier-0 finding: unbalanced-bracket input, `sudo` with flags, `test`/`[`.
- Long-format output. No test asserts a permission string, link count, owner
  column, size column, date column, or the `total` line.
- `%VAR%` expansion, `set`, `export` — the entire environment-variable surface.
- `sed`, `awk`, `diff`, `sort`, `tr`, `xargs`, `du`, `df`, `tar`, `gzip`, `ps`,
  `stat`, `chmod`, `touch`, `cp`, `mv`, `rm`, `tee`, `find -type`.
- Exit statuses beyond F4/F5's `=== 2`. Nothing asserts a pipeline's status, a
  short-circuit's status, or `$?`.
- `2>`, `2>&1`, `1>`, `&>`, `>&2`, redirection ordering. F11 is titled
  "Redirection" and tests only `>` and `>>`.
- Stderr routing in a pipeline (D20).
- `;` lists and three-element `&&`/`||` chains (D22). F10 tests only the two
  two-element happy paths.
- Windows: `dir /b`, `dir /s`, `dir /a:h`, `tree`, `where`, `copy`, `move`, `ren`,
  `del`, `md`, `rd`, `cls`, `tasklist`, `ipconfig`, `systeminfo`, `cd` into a
  directory, `cd /d`, `find /c /v ""`, Windows pipelines.
- `/mnt/c` path translation and the cross-platform parity claim.
- Any evaluation of a `challenges.json` `success` predicate against its own
  `acceptedVariants` — which is why `l2-cut` can advertise a variant its own
  regex rejects (D21).

**The highest-value single test to add** is a table-driven one that runs every
`acceptedVariants` entry of all 97 challenges through `runPipeline` and asserts
(a) it does not throw, (b) status is 0, and (c) its own `success` predicate
evaluates true. That one test catches D2, D3, D4, D5, D11, D13, and D21 at once.

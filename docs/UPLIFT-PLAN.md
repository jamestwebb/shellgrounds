# The Gauntlet — Uplift Plan to a Leading CLI CTF Platform

**Status:** proposal · **Created:** 2026-08-17 · **Target:** the definitive zero-infrastructure, self-hosted, multi-curriculum CLI training and CTF platform for Linux and Windows.

---

## 0. Thesis, moat, and non-goals

### The claim we are trying to own

> **The only CLI trainer that an instructor can deploy in an afternoon, that gives every student a different flag, that proves its own challenges are solvable, and that never teaches you something false about a real shell.**

Each clause is a defensible differentiator, and no surveyed competitor holds more than one (see `docs/research/priorart-cli-training-tools.md`):

| Clause | Who else has it | Our state |
|---|---|---|
| Zero-infrastructure self-host (static + functions + blobs; no DB, no containers, no VMs) | cmdchallenge needs Docker+Terraform; picoCTF needs CMU's backend; TryHackMe is $25/seat/mo with a $2,000 minimum | **Have it** |
| Per-student cryptographic flags (sharing is arithmetically useless) | Nobody in the survey | **Have it** |
| Server-side replay validation on a static site | Nobody | **Have it** |
| Machine-proved challenge solvability | Nobody, in any category | **Have the seed** (`tests/solvability.test.js`) — must become a product |
| Simulation honesty (never claims a real command does not exist) | Terminus and cmdchallenge both lie here | **Have the principle**, incompletely applied |
| Fidelity: never teaches a false shell model | Real-shell tools win by default | **Currently losing** — see §2 |
| Bring-your-own-curriculum | cmdchallenge (code-level), nobody at pack level | **Not yet** |

**The strategy is therefore not "add more commands."** It is: *make the four differentiators we already have into product surface, and remove every place the simulation lies.* Breadth is third priority, not first.

### Non-goals (declare these in the UI, not just in a doc)

1. **Not a real shell.** Competing on fidelity against a container is unwinnable by definition. The simulation boundary becomes a *feature*: a "what this does not simulate" page, plus honest per-command errors.
2. **Not a general CTF platform.** No binary exploitation, no crypto, no web, no reverse engineering. The VFS has no execution model and must not grow one. Flags are anti-cheat plumbing, not a genre claim.
3. **Not a sysadmin/DevOps simulator.** No processes, no network, no services, no real package resolution.
4. **Not multi-user.** No cross-user permissions, no sudoers, no SSH between hosts.
5. **Not a half-built PowerShell.** A text-faked object pipeline is worse than none.

---

## 1. Architecture target

### 1.1 Current layering (as built)

```
src/engine/         mixed: general engine + ~1,100 lines of curriculum
src/data/           challenges.js — one hardcoded curriculum, contains a JS closure
src/components/     UI, with hardcoded prompt/title/act-count assumptions
netlify/functions/  general, but statically imports the one curriculum
```

### 1.2 Target layering

```
packages/
  engine/                    ← pure, domain-free, unit-tested, publishable
    shell/
      tokenizer.js           lexer → AST (words, operators, redirections)
      expand.js              NEW: glob + variable + tilde expansion
      exec.js                pipeline/list execution, exit codes, streams
      streams.js             NEW: stdout/stderr/stdin as first-class objects
    vfs/
      builder.js             nested tree → flat map (+ mode/owner/mtime)
      ops.js                 NEW: read/write/mkdir/unlink/stat/chmod primitives
      path.js                NEW: single source of truth for resolution
    commands/
      linux/*.js             one file per command, uniform signature
      windows/cmd/*.js
      windows/pwsh/*.js      (Phase 5)
      registry.js            NEW: name → {impl, help, platforms, flags}
    validate/
      predicates.js          NEW: declarative success predicates
      packValidator.js       NEW: proves a pack's challenges are solvable
  app/                       React UI (theme-driven, no hardcoded curriculum)
  server/                    Netlify functions (pack-aware)
packs/
  forensics-cli-101/         ← today's curriculum, extracted verbatim
  linux-fundamentals/        ← new flagship general pack
  windows-cmd-essentials/    ← new
  <author packs>/
```

**Hard rule going forward:** `packages/engine/` must contain **zero** strings naming a course, a case, a tool that is not a real shell command, or a flag placeholder. Enforced by a lint test (§7.3).

---

## 2. Fidelity work — stop teaching false things

**This is priority one.** Every item below was empirically verified against the current engine. Each entry gives the defect, the evidence, the fix, and an acceptance test.

### 2.1 Severity 1 — silently wrong answers (student believes the output)

#### F1. `ls` output is one space-joined line and is unsorted
- **Evidence:** `exec.linux.js:125` joins entries with two spaces; `:98-105` preserves insertion order. Verified: `ls | wc -l` → **1** for a 5-entry directory; `ls | grep Doc` → every entry.
- **Real behavior:** `ls` sorts with the current collation and emits **one entry per line whenever stdout is not a TTY**; columns only when interactive.
- **Fix:** commands receive an `isTTY` flag from the pipeline (false for any non-final stage or when redirected). `ls` sorts entries (dotfiles first per LC_COLLATE=C, or plain lexicographic — pick one and document it) and joins with `\n` when `!isTTY`, columns when TTY.
- **Acceptance:** `ls | wc -l` equals the visible entry count; `ls > f && cat f` shows one per line; interactive `ls` still shows columns.

#### F2. Windows pipes and redirections are silently discarded ⚠️ **exists in production today**
- **Evidence:** `pipeline.js:65-78` routes Windows through `splitArgsRespectingQuotes` straight to the executor, never touching the tokenizer. Verified: `type logs.txt | findstr Event` prints the **whole file**; `type logs.txt > out.txt` prints to screen and creates **no file**.
- **Fix:** route Windows through the same tokenizer/executor path as Linux, with a cmd-flavored operator table (`|`, `>`, `>>`, `2>`, `&`, `&&`, `||`) and `nul` as the null device.
- **Acceptance:** `type f | findstr x` filters; `type f > out.txt` creates `out.txt` and prints nothing; `dir | find /c /v ""` counts lines.
- **Priority: do this first, out of phase order.** ~1 day, and it removes the worst defect in the shipped product.

#### F3. Only one file argument is honored
- **Evidence:** `head`, `tail`, `grep`, `wc`, `sort`, `cut`, `md5sum`, `strings`, `file` all assign `targetFile = arg` in a loop. Verified: `grep error a.log b.log` searches **a.log only**; `head -n 3 f1 f2` prints **f2 only** (last wins); `md5sum f1 f2` hashes **f1 only**.
- **Fix:** every file-consuming command accepts `string[]`. Implement the real multi-file conventions: `grep` prefixes `file:` when >1 file (and `-h`/`-H` override); `head`/`tail` print `==> file <==` headers when >1; `wc` prints a `total` line; `md5sum` prints one line per file.
- **Acceptance:** a table-driven test per command comparing against recorded GNU output for 1 and 2 files.

#### F4. Unknown flags silently become the pattern or the filename
- **Evidence:** `exec.linux.js:250-266` — `grep` has no unknown-option branch. Verified: `grep -r error Documents` sets pattern=`-r`, file=`error` → "No such file or directory: error".
- **Fix:** central option parser per command with a declared flag table; anything undeclared → `grep: invalid option -- 'r'` plus the usage line, exit 2.
- **Acceptance:** every simulated command errors on an undeclared flag; no undeclared flag is ever consumed as an operand.

#### F5. Declared-but-unimplemented flags are silently ignored
- **Evidence:** verified — `ls -R` does not recurse, `sort -k2` ignores the key, `cut -f2,3` returns **field 2 only** (`:503` uses `parseInt`), `dir /b` and `dir /s` do nothing.
- **Fix:** three-state flag registry per command: `implemented` | `notSimulated` | `unknown`. `notSimulated` prints `ls: -R is not simulated here (see the Reference tab)` and exits nonzero. Extends the existing honesty principle from commands to flags.
- **Acceptance:** no flag can be accepted and ignored; a test asserts every flag in every man page is `implemented` or explicitly `notSimulated`.

#### F6. `tail -n +2` does the opposite of the real thing
- **Evidence:** `exec.linux.js:203-207` — `parseInt('+2')` = 2 → prints the **last** 2 lines. The man page at `help.js:76` documents the correct `+NUM` semantics, so the docs and the simulator disagree.
- **Fix:** implement `+NUM` as "from line NUM onward" for `tail`; implement `-NUM` for `head` as "all but the last NUM".
- **Acceptance:** `tail -n +2 f` on a 10-line file returns 9 lines starting at line 2.

#### F7. `less` pollutes pipelines
- **Evidence:** `exec.linux.js:236` appends a synthetic `(END of output…)` footer to stdout. Verified: `less f | wc -l` → **13** for a 10-line file.
- **Fix:** the pager footer is a UI affordance, not stdout. Return it as `uiNote`, rendered by the terminal component, absent from the stream. When `!isTTY`, `less` behaves as `cat`.
- **Acceptance:** `less f | wc -l` equals `cat f | wc -l`.

### 2.2 Severity 2 — missing concepts that produce a wrong mental model

#### F8. Globbing does not exist
- **Evidence:** verified — `ls *.txt` → "cannot access '*.txt'". No expansion stage exists in `tokenizer.js`.
- **Why it matters most:** the student learns wildcards are a per-command feature. The actual lesson — **the shell expands before the program runs** — is unavailable, and it is the lesson that explains why `find -name "*.txt"` needs quotes.
- **Fix:** new `packages/engine/shell/expand.js`, run between tokenize and execute. Support `*`, `?`, `[abc]`, `[a-z]`, `{a,b}` brace expansion; no-match leaves the word literal (bash default, `nullglob` off); expansion never crosses `/`; hidden files require an explicit leading dot.
- **Acceptance:** `ls *.txt` lists matches; `echo *.nomatch` prints the literal pattern; `find . -name "*.txt"` still works and a new challenge teaches why the quotes matter.

#### F9. Single and double quotes are interchangeable
- **Evidence:** `tokenizer.js:199-209` strips both identically. Verified: `echo "$HOME"` and `echo '$HOME'` both print `$HOME`.
- **Fix:** implement variable expansion (`$VAR`, `${VAR}`) with a session environment (`HOME`, `USER`, `PWD`, `SHELL`, `PATH`, `?`). Double quotes expand, single quotes do not, backslash escapes inside double quotes.
- **Acceptance:** `echo "$HOME"` → `/home/student`; `echo '$HOME'` → `$HOME`; `echo "a b"` is one argument; a challenge demonstrates the difference.

#### F10. No exit status
- **Evidence:** `pipeline.js:183` — `hasError = !!finalStderr`, which is not a status. `grep` that matches nothing "succeeds". `;`, `&&`, `||` are blocked at `tokenizer.js:34-36`.
- **Fix:** every command returns `{stdout, stderr, status}`. Pipeline status = last stage. `$?` expands. Implement `;`, `&&`, `||` lists. `grep` returns 1 on no match, 2 on error; `test`/`[` implemented.
- **Acceptance:** `grep zzz f; echo $?` → 1; `false && echo no` prints nothing; `true || echo no` prints nothing; `cmd1 && cmd2` runs cmd2 only on success.

#### F11. Stderr is not a stream
- **Evidence:** `pipeline.js:155-157,167-174` accumulates stderr across all stages and appends it once at the end. Real shells write stderr per-stage, immediately, interleaved. `2>&1 | cmd` is inexpressible.
- **Fix:** `streams.js` — per-stage stdout/stderr objects; the pipeline connects stage N stdout to stage N+1 stdin; stderr goes to the terminal unless redirected. Support `2>&1 |`.
- **Acceptance:** `cat missing good 2>/dev/null` prints only good's content; `cmd 2>&1 | grep error` filters the error text.

#### F12. Permissions are cosmetic
- **Evidence:** `exec.linux.js:117-120` prints a constant `-rw-r--r--`, a fake size and a constant date for every entry. Nodes carry no mode/owner (`fs-builder.js:9-21`). Nothing is ever denied. `sudo` is theater handling only `apt-get` (`:599-615`).
- **Why it matters:** "Permission denied" is the first wall every beginner hits on a real machine, and it cannot happen here. The `ls -l` challenge teaches students to read a permission string that never varies.
- **Fix:** nodes gain `mode` (octal), `owner`, `group`, `mtime`, real `size`. `ls -l` renders truthfully. `chmod` (symbolic and octal), `chown` for root-owned demos. Reads/writes check the effective user. `sudo` elevates for one command. Add a `/etc/shadow`-style denial target.
- **Acceptance:** `cat /etc/shadow` → "Permission denied", `sudo cat /etc/shadow` works, `chmod 600 f` then `ls -l f` shows `-rw-------`.

#### F13–F15. Newline and concatenation model
- `echo -n` is parsed and discarded (`:531-543`, `noNewline` unused). Stdout strings carry no trailing newline; redirection adds one (`pipeline.js:151`). `cat` inserts `\n` between files (`:165`) — real `cat` inserts nothing. `2>` on empty stderr writes a newline (`pipeline.js:144`) — real bash creates a zero-byte file.
- **Fix:** streams carry exact bytes. Commands emit their own trailing newlines. `wc -c` then matches a real machine.
- **Acceptance:** `echo -n hi | wc -c` → 2; `echo hi | wc -c` → 3; `cat a b | wc -c` equals `size(a)+size(b)`.

#### F16. Windows honesty gap
- **Evidence:** `unknown-command.js:85-91` has `REAL_LINUX` but no Windows equivalent, so `echo`, `copy`, `del`, `more`, `tree` return the genuine "not recognized" error — teaching students those commands do not exist on Windows. Contradicts the module's own stated principle at lines 4-6.
- **Fix:** add `REAL_WINDOWS` and `REAL_POWERSHELL` sets with the same message treatment.
- **Acceptance:** `copy` on the Windows side says it is real but unsimulated.

### 2.3 Severity 3 — man pages that document unimplemented features

`man` is a **graded challenge** (`challenges.js:438-453`), so the game asserts the man page is authoritative. These entries are currently false: `cat -n/-b` (`help.js:51-52`), `head -n -NUM` (`:64`), `tail -f` (`:77`), `find -maxdepth` (`:122`), `file -b/-i` (`:135-136`), `strings -n/-a` (`:148-149`), `md5sum -c` (`:161`), `sha256sum -c` (`:173`), `echo -e` (`:226`), the `ls` sorting claim (`:20`), and `sort`'s implied GNU semantics (`:196`).

**Rule for a general release:** implement it, or mark it `notSimulated` in the man page (rendered dimmed with a "not simulated" tag). Enforced by the §7.3 lint.

---

## 3. Coverage — what a credible general tool must teach

Ranked. Tier 0 is "not credible without."

### 3.1 Linux Tier 0
1. **Globbing** (F8)
2. **Exit status + `;` `&&` `||` + `$?`** (F10)
3. **Variable expansion and real quoting** (F9)
4. **File manipulation** — `mkdir`, `rmdir`, `touch`, `cp` (`-r`), `mv`, `rm` (`-r`, `-i`, and the `-f` conversation). *A CLI course where a student never creates or deletes a file is incomplete.* The VFS is already writable (`pipeline.js:13-47`); only redirection can currently create a file.
5. **`<` stdin redirection** and heredocs (`<<`). Verified: `<` is not a token; `cat < file` errors *and* prints the file.
6. **Permissions** (F12)

### 3.2 Linux Tier 1
7. `sed 's///'` (with `-n`, `p`, `d`, `g`) and `awk '{print $N}'` (with `-F`, `NR`, `NF`, simple patterns) — the two most-cited text tools in existence.
8. `uniq` (`-c`, `-d`), enabling the canonical `sort | uniq -c | sort -rn`. Plus `tr`, `tee`, `xargs`.
9. **`grep` completeness:** `-r`, `-l`, `-o`, `-w`, `-c`, `-n`, `-A/-B/-C`, multi-file prefixes, and a real BRE/ERE distinction (everything is JS RegExp today, so `grep 'a\+'` wrongly behaves as ERE).
10. **`find` completeness:** `-maxdepth`, `-size`, `-mtime`, `-type`, `-exec … \;`, `-delete`.
11. **Shell-vs-program concepts:** `history` (**note: the current history challenge is fake** — `challenges.js:218-233` validates by running `pwd`, so it never tests history), `alias`, `export`, `env`, `PATH`, `which`, `type`.
12. **Process model:** `ps`, `kill`, `jobs`, `&`, Ctrl-C, Ctrl-D. Hard in a synchronous simulator; at minimum teach `ps` and the two key-chords.
13. `stat`, `du`, `df`, `ln` + symlinks (`resolvePath` has no link concept).
14. **An editor.** Students must learn `vim` needs `:q!` and `nano` needs `Ctrl+X`. A minimal modal editor is worth more than five more filters.
15. `tar`, `gzip`, `zip` — archive concepts.
16. **Networking — declare out of scope** rather than fake it.

### 3.3 Windows cmd.exe
- **Route through the tokenizer first** (F2), then:
- **Missing builtins:** `echo`, `set` + `%VAR%`, `copy`, `move`, `del`, `ren`, `md`/`rd`, `more`, `tree`, `ver`, `where`, `whoami`, `pushd`/`popd`, `tasklist`, `ipconfig`, `systeminfo`.
- **Flags currently ignored:** `dir /b /s /o /w /p`, `findstr /r /s /c: /v /n /m`.
- **Concepts:** `%VAR%` vs `!VAR!`, `nul`, `&`/`&&`/`||`, `errorlevel`.

### 3.4 PowerShell — separate track, own engine
**Necessary for a credible general Windows tool** (PowerShell is the Windows Terminal default and what current Microsoft docs assume; cmd.exe is legacy), **but it is a second engine, not a flag on the first.**

Cost drivers: an **object pipeline** (`Get-ChildItem | Where-Object {$_.Length -gt 1kb}` passes .NET objects, requiring a typed object model plus a default table formatter); a different tokenizer (parameter binding, `$_`, `$()`); **aliases as a teaching trap** (`ls` and `dir` both alias `Get-ChildItem`, but `ls -l` fails — a genuinely valuable lesson requiring the alias layer); and providers (`Env:`, `HKLM:`).

Minimum credible cmdlet set (~20): `Get-ChildItem`, `Set-Location`, `Get-Content`, `Set-Content`, `Select-String`, `Get-FileHash`, `Where-Object`, `Select-Object`, `Sort-Object`, `Measure-Object`, `ForEach-Object`, `Test-Path`, `Copy-Item`, `Move-Item`, `Remove-Item`, `New-Item`, `Get-Help`, `Get-Command`, `Format-Table`, `Format-List`.

**Decision:** either build the object model or declare PowerShell out of scope in the UI. A text-faked object pipeline teaches students to write `Get-Process | grep chrome`, which fails on a real box.

---

## 4. Content-pack architecture

### 4.1 The blocker

`challenges.js:538` defines success as a JS closure that `submit-flag.js:126` calls server-side:

```js
check: (fs) => fs['/tmp/errors.log'] && fs['/tmp/errors.log'].content.length > 20
```

JSON cannot carry a closure; evaluating author JS on the server is a code-execution risk.

### 4.2 Declarative predicates (replaces closures)

`packages/engine/validate/predicates.js`:

| Predicate | Args | Meaning |
|---|---|---|
| `fileExists` | `path` | node exists and is a file |
| `dirExists` | `path` | node exists and is a directory |
| `fileMatches` | `path`, `pattern`, `flags?` | file content matches regex |
| `fileEquals` | `path`, `text` | exact content |
| `lineCountAtLeast` | `path`, `n` | ≥ n lines |
| `fileHashEquals` | `path`, `algo`, `hex` | integrity checks |
| `cwdIs` | `path` | ending working directory |
| `commandMatches` | `pattern` | regex over the typed line (today's `command` kind) |
| `outputMatches` | `pattern` | regex over stdout — **new**, enables "produce this result any way you like" |
| `exitStatusIs` | `n` | requires §2 F10 |
| `allOf` / `anyOf` | `[predicate]` | composition |

**Author escape hatch:** a `js` predicate remains available for *first-party* packs only, gated by a `trusted: true` flag in the pack registry, never for community packs.

### 4.3 Pack layout

```
packs/linux-fundamentals/
  pack.json            identity, theme, platforms, home dirs, prompt, acts, badges
  fs.linux.js          nested tree → buildFS()
  fs.windows.js        optional
  challenges.json      declarative, no closures
  commands.js          OPTIONAL pack-supplied virtual commands (the tracker/scan slot)
  help.json            OPTIONAL man pages for those commands
  README.md            author notes, learning objectives, mapping to a syllabus
```

```jsonc
// pack.json
{
  "id": "linux-fundamentals",
  "name": "Linux Fundamentals",
  "version": "1.0.0",
  "platforms": ["linux", "windows"],
  "linux":   { "home": "/home/student", "user": "student", "host": "sandbox", "shell": "bash" },
  "windows": { "home": "C:\\Users\\Student", "shell": "cmd" },
  "theme":   { "accent": "#22c55e", "titleBar": "SANDBOX TTY1", "sidebarTone": "neutral" },
  "messages": {
    "unsimulated": "That is a real command. It is not simulated here.",
    "unsupportedSyntax": "That shell feature is not simulated here."
  },
  "acts": [
    { "id": 1, "name": "First Steps", "tagline": "…", "unlockPolicy": "open" },
    { "id": 2, "name": "Text and Files", "unlockPolicy": "allButOne" }
  ],
  "badges": [ { "id": "…", "name": "…", "requires": { "act": 1, "fraction": 0.8 } } ]
}
```

```jsonc
// challenges.json — one entry
{
  "id": "l1-glob",
  "act": 1,
  "title": "Wildcards",
  "points": 20,
  "brief": "List every .txt file in Documents with a single command.",
  "setup": { "cwd": "/home/student" },
  "success": { "predicate": "commandMatches", "pattern": "^ls\\s+Documents/\\*\\.txt\\s*$" },
  "hints": [
    { "cost": 0, "text": "The shell expands `*` before `ls` ever runs." },
    { "cost": 10, "text": "Try `ls Documents/*.txt`." }
  ],
  "successMessage": "The shell expanded the wildcard — `ls` never saw the star.",
  "teaches": ["globbing"],
  "acceptedVariants": ["ls -1 Documents/*.txt", "ls ./Documents/*.txt"]
}
```

`acceptedVariants` is **not decoration** — the pack validator (§7) executes each one and requires it to satisfy the predicate. This is how authors get a machine-checked guarantee.

### 4.4 Decoupling work items

| # | Change | Files today | Size |
|---|---|---|---|
| D1 | Move `map`/`tracker`/`scan`/`extract` out of the executor into pack-supplied commands. Generate `map` from the live VFS, not ASCII art. | `exec.linux.js:554-694`, `WarrenMap.jsx:139-165` | M |
| D2 | Remove `[[FLAG:…]]` from engine code — flags may appear only in pack files. | `exec.linux.js:631,688`; `help.js:254` | S |
| D3 | Home/user/host/prompt become configuration threaded through `context`. | `exec.linux.js:20-21`; `Terminal.jsx:273,307`; `App.jsx:145,253,511,536`; `submit-flag.js:44` | M |
| D4 | Move `COURSE_TOOLS` into the pack; add `REAL_WINDOWS`. | `unknown-command.js:35-58,82,86` | S |
| D5 | Unsupported-syntax strings become pack config. | `tokenizer.js:33-40` | S |
| D6 | **One command registry.** Three sources of truth exist today: `complete.js:4-12` (completion list), `exec.linux.js:699-725` (hand-written help block), `help.js` (`LINUX_HELP` + `MAN_PAGES`). Derive all three from `commands/registry.js`. | 3 files | M |
| D7 | Replace `state` closures with predicates. | `challenges.js`, `submit-flag.js:123-127` | M |
| D8 | Act count/platform mapping become data. | `App.jsx:325` (`solved.act < 5`), `:508-513`, `:143-146` | S |
| D9 | **Server-side pack loading.** `submit-flag.js:5-9` and `manifest.js:5` statically import the curriculum. Add a pack registry keyed by id, and **bind the pack id into the session token** so a student cannot request replay against a different pack. Packs stay build-time modules (never runtime uploads) to keep arbitrary code off the server. | `netlify/functions/*` | M |
| D10 | De-duplicate `ERROR_MARKERS`, copied in `App.jsx:31`, `submit-flag.js:13`, `solvability.test.js:20`. | 3 files | S |

---

## 5. Product features that create the lead

Beyond parity. These are the things that make it *the* tool rather than *a* tool.

### 5.1 Pack Validator CLI — **the signature feature**

`npx gauntlet validate packs/my-pack`

No competitor has anything comparable. It should:
1. Load the pack, build both filesystems, and assert every referenced path exists.
2. Execute every challenge's canonical solution and every `acceptedVariant`; assert the predicate passes and no error marker fires.
3. Assert every `[[FLAG:id]]` placeholder maps to a flag-kind challenge, and every flag-kind challenge has exactly one reachable placeholder.
4. Assert act math: with one challenge skipped per act, every later act is still reachable (the **exact defect** found in production — Act V demanded 100% of a 4-challenge Act IV).
5. Assert every command named in a brief or hint executes cleanly from that challenge's starting directory (the "instructions that betray whoever follows them" class).
6. Assert every man-page flag is `implemented` or `notSimulated`.
7. Emit a coverage report: which commands and concepts the pack teaches, which challenges teach nothing new, and the points curve per act.

**Output:** human-readable table plus `--json` for CI. **Ship a GitHub Action.**

### 5.2 Instructor console
- Per-challenge solve counts, median hint usage, **median time-to-solve**, and a "class is stuck here" flag.
- Per-student view: solved, in-progress, last-seen, hint spend.
- **CSV export** for the gradebook (picoCTF has this; it is table stakes for classroom adoption).
- **Cohort management:** rotate the join password, archive a cohort, reset a handle (currently a manual blob delete), and per-cohort blob namespaces (`store.js:45` is already env-driven — generalize it).
- Rename `CLASS_PASSWORD` → `COHORT_PASSWORD`.

### 5.3 Simulation Boundary page (in-app)
A first-class, linked-from-the-terminal page: what is simulated, what is not, and what differs from a real shell. Auto-generated from the command registry so it cannot drift. **This converts our biggest weakness into a trust signal.**

### 5.4 Practice mode / free play
A no-challenge sandbox with the pack's filesystem, for exploration and for instructors demoing live. Currently every interaction is challenge-shaped.

### 5.5 Replay and share
Record a student's command sequence for a challenge; let them share a read-only replay. Instructors can watch where a student went wrong without shoulder-surfing.

### 5.6 Accessibility and inclusivity
- Screen-reader pass on the terminal (live region for output, proper roles).
- Configurable font size and a high-contrast theme.
- `prefers-reduced-motion` already respected — extend to the boot sequence.
- **Keyboard-only path verified end to end.**

### 5.7 Content: three flagship packs
1. **Linux Fundamentals** (~40 challenges) — the general-audience flagship.
2. **Windows CMD Essentials** (~25) — genuinely rare; almost nothing teaches cmd.exe well.
3. **Forensics CLI 101** (~30) — today's pack, extracted, as the worked example for domain authors.

---

## 6. Phasing

Sizes: **S** ≈ 1 day · **M** ≈ 3–7 days · **L** ≈ 2–4 weeks. One competent developer.

| Phase | Contents | Size |
|---|---|---|
| **P-1 — Emergency** | F2 Windows tokenizer routing. Do this **now**, out of order: ~1 day, fixes silently-wrong answers in the shipped product. | **S** |
| **P0 — De-brand** | Strip course strings from the engine (`tokenizer.js:34-39`, `unknown-command.js`, `Terminal.jsx`, `App.jsx`, `Boot.jsx`, `Gate.jsx`, `WarrenMap.jsx`, README). Risk-free, and it makes the pack boundary obvious. | **S** |
| **P1 — Packs** | D1–D10. Extract the curriculum, add predicates, unify the registry, pack-aware server. | **M** (5d) |
| **P2 — Fidelity core** | F1, F3, F4, F5, F7, F8, F9, F10, F11, F13–F15. Globbing, expansion+quoting, exit codes and lists, `<`, per-stage streams, TTY-aware `ls`, multi-file args, unknown-flag errors, byte-exact newlines. **This is where it stops teaching wrong things.** | **M-L** (8–10d) |
| **P3 — Linux breadth** | File manipulation (`mkdir`/`touch`/`cp`/`mv`/`rm`), permissions + `chmod` + meaningful `sudo` (F12), `tee`/`uniq`/`tr`/`sed`/`awk`/`diff`/`nl`, flag completeness for `grep`/`find`/`sort`/`cut`/`wc`, `stat`/`du`/`df`. | **M-L** (7–10d) |
| **P4 — cmd.exe parity** | ~15 builtins, `%VAR%`, `dir`/`findstr` flags, `REAL_WINDOWS` honesty set. (Tokenizer routing already done in P-1.) | **M** (5d) |
| **P5 — Authoring & instructor** | Pack Validator CLI + GitHub Action (5.1), instructor console + CSV + cohorts (5.2), Simulation Boundary page (5.3), practice mode (5.4). | **M** (5–7d) |
| **P6 — Flagship content** | Linux Fundamentals (40), Windows CMD Essentials (25), Forensics extracted (30). Content, not code. | **M-L** (7–10d) |
| **P7 — PowerShell** | Object model, formatter, tokenizer, ~20 cmdlets, aliases, providers. Fully separable. | **L** (2–4w) |
| **P8 — Polish** | Accessibility (5.6), replay/share (5.5), editor (`vi`/`nano` minimal), archives. | **M** |

### Milestones

**M1 — "Stops lying" (P-1 + P0 + P2 core four: globbing, exit codes, quoting/expansion, `ls` piping).** ≈ **2 weeks.** The tool no longer teaches anything false about the four most-used shell constructs.

**M2 — "Multi-curriculum" (M1 + P1 + P5 validator).** ≈ **3.5 weeks.** Others can author packs with a machine-checked solvability guarantee. **This is the minimum viable public release.**

**M3 — "Credible general Linux + Windows" (M2 + rest of P2 + P3 + P4 + P6).** ≈ **7–9 weeks.**

**M4 — "Complete" (M3 + P7 + P8).** ≈ **11–13 weeks.**

### Sequencing rules
1. **P-1 before everything** — it is a live defect.
2. **P0 before P1** — string removal is risk-free and reveals the pack seam.
3. **P2 before P3** — breadth on a wrong foundation multiplies the wrongness.
4. **P5 validator before P6 content** — author the flagship packs *with* the tool that proves them.

---

## 7. Engineering standards for the uplift

### 7.1 Command implementation contract
```js
// packages/engine/commands/linux/grep.js
export default {
  name: 'grep',
  platforms: ['linux'],
  flags: {
    i: { type: 'bool', status: 'implemented' },
    v: { type: 'bool', status: 'implemented' },
    r: { type: 'bool', status: 'implemented' },
    P: { type: 'bool', status: 'notSimulated' }   // surfaces honestly, never ignored
  },
  usage: 'grep [OPTION]... PATTERNS [FILE]...',
  man: { /* NAME/SYNOPSIS/DESCRIPTION/OPTIONS/EXAMPLES */ },
  run({ argv, flags, operands, stdin, cwd, vfs, env, user, isTTY }) {
    return { stdout, stderr, status, newCwd, vfs, uiNote };
  }
};
```
Uniform, testable in isolation, and the single source for completion, help, and the boundary page.

### 7.2 Differential testing against real shells
Record real `bash` and `cmd.exe` output for a corpus of ~300 commands into fixtures; assert the simulator matches, or that the divergence is **declared** in the boundary registry. This is how fidelity stops regressing. Run in CI on Linux and Windows runners.

### 7.3 Lint tests (fail the build)
- No string in `packages/engine/` matches a curriculum vocabulary list (case names, course tools, `[[FLAG:`).
- Every man-page flag is `implemented` or `notSimulated`.
- Every command in the registry appears in completion and in the boundary page.
- `ERROR_MARKERS` is defined exactly once.

### 7.4 Keep and extend
- **Server-side replay validation** (`submit-flag.js:35-50`) — the anti-cheat crown jewel. Extend to per-pack.
- **Per-user HMAC flags** (`manifest.js:33-41`).
- **Solvability testing** — promote from a test file to a shipped product (§5.1).
- **Honest-failure pedagogy** (`unknown-command.js:4-6`) — extend to Windows and to flags.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Fidelity work is a bottomless pit | The boundary registry is the contract. Anything not implemented must be *declared*, not silently approximated. "Declared and honest" is a shipping state. |
| PowerShell half-built | Gate it: object model or nothing. Ship with it declared out of scope until the model exists. |
| Pack format churns after authors adopt it | Version `pack.json` (`"schemaVersion"`), and ship the validator with the format so breakage is detected, not discovered. |
| Server-side pack loading becomes a code-execution surface | Packs are build-time modules; no runtime upload; `js` predicates only for `trusted` first-party packs. |
| Scope creep into a general CTF platform | §0 non-goals are binding. Flags are anti-cheat plumbing, not a genre. |
| Solo maintainer bus factor | The validator + differential tests are what let contributors land changes safely. Build them early (P5), not last. |

---

## 9. Immediate next actions

1. **P-1 now:** route Windows through the tokenizer (F2). ~1 day. Fixes a live defect.
2. Decide the scope target: **M2 (public multi-curriculum release, ~3.5 weeks)** is the recommended first commitment.
3. Split the repo into `packages/engine` + `packages/app` + `packs/` before any fidelity work, so P2 lands in a clean seam.
4. Stand up differential-test fixtures (7.2) at the start of P2, not after.

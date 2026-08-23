Here is the full pre-release fidelity and code-quality report for the simulation engine. Based on the requirements for the `/plan` command, I have also attached a technical plan outlining the necessary structural changes to fix these bugs; please review the `plan.md` artifact and let me know if you approve moving forward with those fixes.

### Audit Report: Simulation Honesty Defect Log

**CRITICAL** -- Unquoted variable expansion fails to split on whitespace -- [packages/engine/shell/expand.js:190](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/shell/expand.js#L190-L195)
- **Concrete Scenario**: A student types `FOO="-l -a"; ls $FOO`.
- **Simulator Output**: Tries to list a literal directory named `"-l -a"` and outputs `ls: cannot access '-l -a': No such file or directory`.
- **Real Tool Output**: Lists the current directory using long format (`-l`) and includes hidden files (`-a`).
- **Student Harm**: Misrepresents one of the most fundamental shell mechanics—word splitting on unquoted variables—destroying the student's understanding of quoting logic.
- **Fix Direction**: In `expand.js`, variables resulting from unquoted expansion must be split by `$IFS` (or default spaces), emitting separate token fragments rather than returning a single, consolidated string.

**CRITICAL** -- Pipeline swallows intermediate `stderr` output -- [packages/engine/shell/exec.js:203](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/shell/exec.js#L203-L237)
- **Concrete Scenario**: A student types `ls /nonexistent | cat`.
- **Simulator Output**: Silently produces `""` (no output, no error).
- **Real Tool Output**: `ls: cannot access '/nonexistent': No such file or directory` printed to the terminal.
- **Student Harm**: Completely breaks pipeline debugging for students. If an early command in a pipeline fails, they receive no visual feedback as to why.
- **Fix Direction**: `stageStderr` is being locally overwritten in every pipeline stage iteration. It must be appended to `finalStderr` per stage, rather than only saving the output of the final stage.

**HIGH** -- Redirections are evaluated after command execution -- [packages/engine/shell/exec.js:173](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/shell/exec.js#L173-L226)
- **Concrete Scenario**: A student types `rm important.txt > /non_existent_dir/out.txt`.
- **Simulator Output**: Silently deletes `important.txt`, *then* fails the redirection step.
- **Real Tool Output**: `bash: /non_existent_dir/out.txt: No such file or directory` and `important.txt` is NOT deleted.
- **Student Harm**: Teaches dangerous timing mechanisms; in reality, shell redirections must safely open file descriptors *before* the command evaluates or executes. 
- **Fix Direction**: Move the call to `applyRedirections` so it precedes `cmdDef.run()`, failing early if a redirection target cannot be opened.

**HIGH** -- `sort -u` uses strict line equality instead of key equality -- [packages/engine/commands/linux/index.js:822](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L822)
- **Concrete Scenario**: A student types `echo -e "a 1\nb 1" | sort -u -k2`.
- **Simulator Output**: `a 1\nb 1`
- **Real Tool Output**: `a 1`
- **Student Harm**: Corrupts sorting data; students think `-u` just means "remove identical full lines" rather than "remove lines sharing an identical key".
- **Fix Direction**: Refactor `flags.u` logic to store keys in a `Set` during the array traversal instead of passing `allLines` to `new Set()`, omitting lines if their parsed key was already seen.

**HIGH** -- Order-sensitivity of redirections (`2>&1 >f` vs `>f 2>&1`) is lost -- [packages/engine/shell/tokenizer.js:195](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/shell/tokenizer.js#L195-L197)
- **Concrete Scenario**: A student types `ls /nonexistent 2>&1 >f`.
- **Simulator Output**: Writes the error text into the file `f`.
- **Real Tool Output**: Writes the error text to the terminal and leaves `f` empty.
- **Student Harm**: Re-enforces incorrect redirection semantics. The order of bash FD duping is critical to advanced shell usage.
- **Fix Direction**: The tokenizer currently stores a single scalar `redirectOut` and `redirectErr` object. It must be refactored to emit an ordered array of `redirections: []` to preserve evaluation order in `exec.js`.

**MEDIUM** -- `ls -h` is parsed but silently ignored -- [packages/engine/commands/linux/index.js:121](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L121)
- **Concrete Scenario**: A student types `ls -lh`.
- **Simulator Output**: `... student student 123456 Aug 17 09:30 file`
- **Real Tool Output**: `... student student 121K Aug 17 09:30 file`
- **Student Harm**: The simulator accepts `-h` but fails to transform sizes, causing students to believe `-h` does nothing or producing mismatched report output.
- **Fix Direction**: Check `flags.h` when rendering the size string and implement round-half-up human-readable formatting.

**MEDIUM** -- `rm -i` is parsed but silently ignores the prompt -- [packages/engine/commands/linux/index.js:1840](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L1840-L1844)
- **Concrete Scenario**: A student types `rm -i file.txt`.
- **Simulator Output**: Silently deletes `file.txt`.
- **Real Tool Output**: Halts and prompts `rm: remove regular file 'file.txt'?`.
- **Student Harm**: Violates "simulation honesty" heavily on a destructive command, making students think `-i` isn't required to force a prompt.
- **Fix Direction**: Hook `flags.i` into the VFS unlink arguments, or trigger an interactive terminal question if supported by the engine.

**MEDIUM** -- Windows `findstr` ignores implicit OR behavior for spaces -- [packages/engine/commands/windows/index.js:276](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/windows/index.js#L276)
- **Concrete Scenario**: A student types `findstr "foo bar" file.txt`.
- **Simulator Output**: Only matches lines containing exactly `"foo bar"`.
- **Real Tool Output**: Matches lines containing `"foo"` OR `"bar"`.
- **Student Harm**: Fails to teach how space-separated literals in `findstr` implicitly behave as multiple search terms unless `/C:` is used.
- **Fix Direction**: When `flags.c` is omitted, split `pattern` by whitespace and join with `|` when constructing the regex.

**MEDIUM** -- `ls -l` outputs a hardcoded timestamp -- [packages/engine/commands/linux/index.js:150](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L150)
- **Concrete Scenario**: A student runs `touch foo; ls -l foo`.
- **Simulator Output**: `... Aug 17 09:30 foo`
- **Real Tool Output**: Shows the current date and time the file was created (or touched).
- **Student Harm**: Instantly breaks immersion and ruins timestamp-based forensics challenges.
- **Fix Direction**: Format the actual `st.mtime` into the two GNU coreutils format styles (recent vs >6 months).

**MEDIUM** -- `head -v` is parsed but silently ignored -- [packages/engine/commands/linux/index.js:326](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L326)
- **Concrete Scenario**: A student types `head -v file.txt`.
- **Simulator Output**: Prints lines with no header.
- **Real Tool Output**: `==> file.txt <==` followed by the lines.
- **Student Harm**: Silently dropping flags violates the simulation promise and causes students to miss required report headers.
- **Fix Direction**: Include `|| flags.v` in the `showHeaders` boolean logic.

**MEDIUM** -- `sed` print (`p`) flag incorrectly suppresses standard printing -- [packages/engine/commands/linux/index.js:1113](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L1113-L1115)
- **Concrete Scenario**: A student types `echo foo | sed s/foo/bar/p`.
- **Simulator Output**: Prints `bar` once.
- **Real Tool Output**: Prints `bar` twice.
- **Student Harm**: `sed`'s default behavior is to print the pattern space at the end of the script unless `-n` is used. A `p` flag prints it explicitly. The simulator uses an `else` block, destroying this interaction.
- **Fix Direction**: Remove the `else` block; evaluate the `p` print command separately from the default pattern space dump.

**MEDIUM** -- Windows `echo.` is completely unhandled -- [packages/engine/commands/windows/index.js:410](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/windows/index.js#L410)
- **Concrete Scenario**: A student types `echo.` in a Windows prompt.
- **Simulator Output**: `'echo.' is not recognized.`
- **Real Tool Output**: Prints an empty newline.
- **Student Harm**: Breaks nearly all real-world batch scripts the student might be reading. 
- **Fix Direction**: Alias `echo.` to `echo` in the registry or add a specific `echo.` parser handler in `tokenizer.js`.

**LOW** -- `cat -n` formatting diverges via space instead of a tab -- [packages/engine/commands/linux/index.js:270](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L270)
- **Concrete Scenario**: A student types `echo hi | cat -n`.
- **Simulator Output**: `     1  hi` (two spaces).
- **Real Tool Output**: `     1\thi` (a tab).
- **Student Harm**: Breaks downstream data extraction tasks relying on `cut -f` or `awk` tab separation.
- **Fix Direction**: Replace the trailing spaces with `\t`.

**LOW** -- `cat` artificially appends a trailing newline -- [packages/engine/commands/linux/index.js:275](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L275)
- **Concrete Scenario**: A student types `echo -n hi | cat`.
- **Simulator Output**: `hi\n`
- **Real Tool Output**: `hi`
- **Student Harm**: Fails byte-for-byte comparisons and breaks chained outputs.
- **Fix Direction**: Remove `if (content && !content.endsWith('\n')) stdout += '\n';`.

**LOW** -- `wc -l` uses static padding which diverges from real GNU `wc` -- [packages/engine/commands/linux/index.js:725](file:///home/remnant/.cache/agy-audit.X3xDvg/tree/packages/engine/commands/linux/index.js#L725)
- **Concrete Scenario**: A student types `echo hi | wc -l`.
- **Simulator Output**: `   1` (padded to 4).
- **Real Tool Output**: `1`
- **Student Harm**: Aesthetic divergence. 
- **Fix Direction**: Omit the `.padStart(4, ' ')` entirely for single files to match coreutils default behavior.

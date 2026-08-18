**FINAL REPORT: PRE-RELEASE CODE-QUALITY & RELIABILITY AUDIT**

CRITICAL — Client/server replay state mismatch discards student's previous commands — netlify/functions/submit-flag.js:33
Scenario: A challenge requires two steps: `mkdir evidence && cd evidence` then `echo "data" > log.txt`. The student does this successfully in the browser. When the final command is submitted, the server evaluates `echo "data" > log.txt` against a freshly instantiated filesystem (`pack.createFs()`). The `/home/student/evidence` directory does not exist on the server, so the replay fails with "No such file or directory" and rejects a correct answer.
Fix: The client must submit the full command history leading to the state, and the server must replay the sequence. Alternatively, send a cryptographic hash of the expected state or evaluate predicates exclusively client-side in a trusted manner.

CRITICAL — Hardcoded execution user on server causes permission denied — netlify/functions/submit-flag.js:60
Scenario: In the `forensics-cli-101` pack, the home directory is `/home/analyst` and is owned by `analyst` with `0o755` permissions. The student runs a valid command like `echo "test" > /home/analyst/notes.txt`. On the server, `runPipeline` is hardcoded to execute as `user: 'student'`. The `student` user lacks write permissions to the `analyst` directory, causing the server to reject the valid command with a Permission Denied error.
Fix: Extract the user dynamically from the pack manifest: `user: isWindows ? (pack.manifest.windows?.user || 'Student') : (pack.manifest.linux?.user || 'student')` to match `App.jsx`.

HIGH — In-memory VFS contains literal flag placeholders, breaking filters — src/App.jsx:248
Scenario: A file in the pack contains a flag placeholder like `[[FLAG:act2-tail]]`. `App.jsx` only replaces this placeholder in `res.output` right before printing to the terminal history. If a student runs `grep "FLAG{" file.txt`, `grep` scans the literal VFS content, finds `[[FLAG:act2-tail]]`, fails to match the pattern, and outputs nothing. The student's correct filter produces no feedback and they become permanently stuck.
Fix: Traverse and inject the real flags (or the "FLAG{...}" strings) into the `activeFs` file contents immediately upon loading the pack in the browser (similar to `submit-flag.js:38`), rather than intercepting terminal output.

HIGH — Output redirection failures are silently ignored and output leaks — packages/engine/shell/streams.js:108
Scenario: A student runs `echo "secret" > /readonly_file`. The `writeFile` operation fails with Permission Denied. `applyRedirections` appends the error to `finalStderr`, but fails to clear `finalStdout` and does not propagate an error status. The shell pipeline evaluates the stage as successful (status 0) and prints "secret" to the terminal alongside the error, or passes the leaked output down the pipe to the next command.
Fix: In the `else` block when `writeRes.ok` is false, set `finalStdout = '';` and return an error status (e.g. `status: 1`) so `runPipeline` correctly registers the stage failure.

HIGH — Act progression logic completely ignores configured unlock thresholds — netlify/functions/submit-flag.js:16
Scenario: A pack author sets `unlockThreshold: 1.0` (100%) for Act II. Act I has 7 challenges. The server evaluates `const required = Math.max(1, prior.length - 1);` which evaluates to 6. The student completes 6 challenges and skips the 7th. The server incorrectly unlocks Act II, violating the author's strict 100% threshold policy. If an author set it to `0.5`, it would still demand all-but-one.
Fix: Calculate the required challenges using the configured float threshold: `const required = Math.ceil(prior.length * act.unlockThreshold);`.

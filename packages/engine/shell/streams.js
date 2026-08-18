// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Streams and Redirection Management for Shell Pipelines

import { writeFile, readFile } from '../vfs/ops.js';
import { resolvePath } from '../vfs/path.js';

export class StreamBuffer {
  constructor(initial = '') {
    this.buffer = initial;
  }

  write(chunk) {
    if (chunk !== undefined && chunk !== null) {
      this.buffer += String(chunk);
    }
  }

  read() {
    return this.buffer;
  }

  clear() {
    this.buffer = '';
  }

  isEmpty() {
    return this.buffer.length === 0;
  }
}

/**
 * Handles input/output stream redirection for a command stage against VFS
 */
export function applyRedirections({
  stage,
  cwd,
  fs,
  isWindows,
  user = 'student',
  stdinText = '',
  stdoutText = '',
  stderrText = ''
}) {
  let workingFs = { ...fs };
  let finalStdout = stdoutText;
  let finalStderr = stderrText;
  let finalStdin = stdinText;
  let redirectFailed = false;

  // Stdin Redirection (< file or << heredoc)
  if (stage.redirectIn) {
    if (stage.redirectIn.type === 'heredoc') {
      finalStdin = stage.redirectIn.content;
    } else if (stage.redirectIn.file) {
      const inPath = resolvePath(cwd, stage.redirectIn.file, isWindows);
      const readRes = readFile(workingFs, inPath, isWindows, { user });
      if (!readRes.ok) {
        return {
          error: readRes.error,
          fs: workingFs,
          stdout: '',
          stderr: readRes.error,
          status: 1
        };
      }
      finalStdin = readRes.content;
    }
  }

  // Stderr Redirection (2>, 2>>, 2>&1, 2>/dev/null, 2>nul)
  if (stage.redirectErr) {
    if (stage.redirectErr === 'null' || stage.redirectErr.file === '/dev/null' || stage.redirectErr.file?.toLowerCase() === 'nul') {
      finalStderr = '';
    } else if (stage.redirectErr === 'stdout') {
      finalStdout = finalStdout ? `${finalStdout}${finalStderr}` : finalStderr;
      finalStderr = '';
    } else if (typeof stage.redirectErr === 'object' && stage.redirectErr.file) {
      const errTarget = resolvePath(cwd, stage.redirectErr.file, isWindows);
      const append = !!stage.redirectErr.append;
      // Note: exact bash behavior creates a 0-byte file if stderr is empty
      const writeRes = writeFile(workingFs, errTarget, finalStderr, isWindows, {
        append,
        user
      });
      if (writeRes.ok) {
        workingFs = writeRes.fs;
        finalStderr = '';
      } else {
        finalStderr = writeRes.error;
      }
    }
  }

  // Stdout Redirection (>, >>, >/dev/null, >nul)
  if (stage.redirectOut) {
    if (stage.redirectOut.file === '/dev/null' || stage.redirectOut.file?.toLowerCase() === 'nul') {
      finalStdout = '';
    } else if (stage.redirectOut.file) {
      const outTarget = resolvePath(cwd, stage.redirectOut.file, isWindows);
      const append = !!stage.redirectOut.append;
      const writeRes = writeFile(workingFs, outTarget, finalStdout, isWindows, {
        append,
        user
      });
      if (writeRes.ok) {
        workingFs = writeRes.fs;
        finalStdout = ''; // suppressed from downstream pipeline and terminal
      } else {
        // A failed redirection must not leak the payload. Real shells open the
        // target BEFORE running the command: on failure nothing is printed,
        // nothing flows downstream, and the status is non-zero.
        finalStderr = writeRes.error;
        finalStdout = '';
        redirectFailed = true;
      }
    }
  }

  return {
    fs: workingFs,
    stdout: finalStdout,
    stderr: finalStderr,
    stdin: finalStdin,
    redirectFailed
  };
}

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// TEST HELPER, not shipped code.
//
// It lived in src/engine/ and looked like part of the app, but nothing in the
// product ever imported it: the browser calls runPipeline directly. Two of its
// neighbours in that folder turned out to be whole duplicate engine modules
// that had silently drifted, so this one moved to where it is honest about
// what it is -- a wrapper the older tests were written against.
//
// Adapter routing legacy executeWindowsCommand to new modular core engine

import { runPipeline } from '../../packages/engine/shell/exec.js';
import { FORENSICS_PACK_COMMANDS } from '../../packs/forensics-cli-101/commands.js';
import forensicsHelp from '../../packs/forensics-cli-101/help.json' with { type: 'json' };

export function executeWindowsCommand(argv, cwd, fs, stdin = '', context = {}) {
  if (!argv || argv.length === 0) {
    return { stdout: '', stderr: '', newCwd: cwd, fs };
  }

  const commandLine = argv.map(a => a.includes(' ') ? `"${a}"` : a).join(' ');

  const res = runPipeline(commandLine, cwd, fs, 'windows', {
    ...context,
    packCommands: { ...FORENSICS_PACK_COMMANDS, ...(context.packCommands || {}) },
    packHelp: { ...forensicsHelp, ...(context.packHelp || {}) },
    stdin
  });

  return {
    stdout: res.stdout,
    stderr: res.stderr,
    output: res.output,
    newCwd: res.newCwd || cwd,
    fs: res.fs,
    status: res.status,
    hasError: res.hasError,
    clear: res.clear
  };
}

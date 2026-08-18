// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
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

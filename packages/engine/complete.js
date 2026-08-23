// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Tab completion engine for Linux and Windows, derived directly from registry and VFS

import { registry } from './commands/registry.js';
import { resolvePath, findVfsKey, dirname, basename } from './vfs/path.js';

/**
 * Computes tab completion results for current input line
 */
export function getTabCompletions(input, cwd, fs, isWindows = false, context = {}) {
  if (!input) {
    return { type: 'none', matches: [], partial: '' };
  }

  const parts = input.trim().split(/\s+/);
  const command = parts[0] || '';
  const lastArg = /\s$/.test(input) ? '' : (parts[parts.length - 1] || '');

  // 1. Command completion (first word being typed)
  if (parts.length === 1 && !input.endsWith(' ')) {
    const platform = isWindows ? 'windows' : 'linux';
    const regCompletions = registry.getCompletions(command, platform);
    const packCmds = Object.keys(context.packCommands || {});
    const combined = Array.from(new Set([...regCompletions, ...packCmds]))
      .filter(cmd => cmd.toLowerCase().startsWith(command.toLowerCase()))
      .sort();

    return { type: 'command', matches: combined, partial: command };
  }

  // 2. File / Directory Path Completion
  const sep = isWindows ? '\\' : '/';
  const cleanArg = lastArg.replace(isWindows ? /\//g : /\\/g, sep);

  let searchDir = cwd;
  let partial = cleanArg;

  const lastSlash = cleanArg.lastIndexOf(sep);
  if (lastSlash !== -1) {
    const dirPart = cleanArg.slice(0, lastSlash) || (isWindows ? 'C:' : '/');
    partial = cleanArg.slice(lastSlash + 1);
    searchDir = resolvePath(cwd, dirPart, isWindows);
  }

  const dirKey = findVfsKey(fs, searchDir, isWindows);
  if (!dirKey || !fs[dirKey] || fs[dirKey].type !== 'dir') {
    return { type: 'none', matches: [], partial: lastArg };
  }

  const entries = fs[dirKey].contents || [];
  const matches = entries
    .filter(entry => entry.toLowerCase().startsWith(partial.toLowerCase()))
    .map(entry => {
      const childKey = isWindows
        ? `${dirKey}\\${entry}`
        : (dirKey === '/' ? `/${entry}` : `${dirKey}/${entry}`);
      const isDir = fs[childKey]?.type === 'dir';

      if (isWindows) {
        // cmd.exe completes to the bare name — no trailing separator and no
        // trailing space — and wraps anything containing a space in quotes,
        // because `cd Program Files` would otherwise parse as two arguments.
        return entry.includes(' ') ? `"${entry}"` : entry;
      }
      // bash/readline: a directory gets a trailing '/' so you can keep typing;
      // a completed FILE gets a trailing space, which is how the shell tells
      // you the completion was unique and finished.
      return isDir ? `${entry}/` : `${entry} `;
    })
    .sort();

  return { type: 'path', matches, partial };
}

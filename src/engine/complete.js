// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Tab completion engine for The Gauntlet (Linux & Windows)

export const LINUX_COMMANDS = [
  'pwd', 'ls', 'cd', 'cat', 'head', 'tail', 'less', 'grep', 'find',
  'file', 'strings', 'md5sum', 'sha256sum', 'wc', 'sort', 'cut', 'echo',
  'man', 'map', 'submit', 'tracker', 'scan', 'extract', 'sudo', 'clear', 'help'
];

export const WINDOWS_COMMANDS = [
  'cd', 'dir', 'type', 'find', 'findstr', 'certutil', 'attrib', 'cls', 'submit', 'help'
];

/**
 * Computes tab completion results for current input
 */
export function getTabCompletions(input, cwd, fs, isWindows = false) {
  if (!input) {
    return { type: 'none', matches: [], partial: '' };
  }

  const parts = input.trim().split(/\s+/);
  const command = parts[0] || '';
  // A trailing space means the student is starting a NEW argument: complete
  // against everything in the directory, not against the previous word.
  const lastArg = /\s$/.test(input) ? '' : (parts[parts.length - 1] || '');
  const availableCommands = isWindows ? WINDOWS_COMMANDS : LINUX_COMMANDS;

  // 1. Command completion (first word being typed)
  if (parts.length === 1 && !input.endsWith(' ')) {
    const matches = availableCommands.filter(cmd => cmd.toLowerCase().startsWith(command.toLowerCase()));
    return { type: 'command', matches, partial: command };
  }

  // 2. File / Directory Path Completion
  let searchDir = cwd;
  let partial = lastArg;

  if (isWindows) {
    if (lastArg.includes('\\')) {
      const lastSlash = lastArg.lastIndexOf('\\');
      const dirPart = lastArg.substring(0, lastSlash);
      partial = lastArg.substring(lastSlash + 1);

      if (/^[A-Za-z]:/.test(dirPart)) {
        searchDir = dirPart;
      } else if (dirPart === '..') {
        const pathParts = cwd.split('\\');
        searchDir = pathParts.slice(0, -1).join('\\') || 'C:';
      } else {
        searchDir = `${cwd}\\${dirPart}`;
      }
    }

    const findDir = (targetPath) => {
      if (fs[targetPath]) return targetPath;
      const targetLower = targetPath.toLowerCase();
      for (const key of Object.keys(fs)) {
        if (key.toLowerCase() === targetLower) return key;
      }
      return null;
    };

    const actualDir = findDir(searchDir);
    if (!actualDir || !fs[actualDir] || fs[actualDir].type !== 'dir') {
      return { type: 'path', matches: [], partial };
    }

    const contents = fs[actualDir].contents || [];
    const matches = contents.filter(item =>
      item.toLowerCase().startsWith(partial.toLowerCase())
    );

    return { type: 'path', matches, partial, searchDir: actualDir, isWindows: true };
  } else {
    // Linux path completion
    if (lastArg.includes('/')) {
      const lastSlash = lastArg.lastIndexOf('/');
      const dirPart = lastArg.substring(0, lastSlash) || '/';
      partial = lastArg.substring(lastSlash + 1);

      if (dirPart.startsWith('/')) {
        searchDir = dirPart;
      } else if (dirPart === '..') {
        const pathParts = cwd.split('/');
        searchDir = pathParts.slice(0, -1).join('/') || '/';
      } else {
        searchDir = cwd === '/' ? `/${dirPart}` : `${cwd}/${dirPart}`;
      }
    }

    if (!fs[searchDir] || fs[searchDir].type !== 'dir') {
      return { type: 'path', matches: [], partial };
    }

    const contents = fs[searchDir].contents || [];
    const matches = contents.filter(item => item.startsWith(partial));

    return { type: 'path', matches, partial, searchDir, isWindows: false };
  }
}

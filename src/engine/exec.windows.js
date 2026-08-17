// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Windows Command Executor for Topside (Windows CMD Environment)

import { WINDOWS_HELP } from './help.js';
import { unknownCommandMessage } from './unknown-command.js';
import { md5, sha256Sync } from './crypto-utils.js';

export function executeWindowsCommand(argv, cwd, fs, stdin = '', context = {}) {
  if (!argv || argv.length === 0) {
    return { stdout: '', stderr: '', newCwd: cwd };
  }

  const command = argv[0].toLowerCase();
  const args = argv.slice(1);

  // Handle /?
  if (args.includes('/?')) {
    const helpText = WINDOWS_HELP[command] || `${command}: no help available`;
    return { stdout: helpText, stderr: '', newCwd: cwd };
  }

  const findPath = (targetPath) => {
    if (fs[targetPath]) return targetPath;
    const targetLower = targetPath.toLowerCase();
    for (const key of Object.keys(fs)) {
      if (key.toLowerCase() === targetLower) return key;
    }
    return null;
  };

  const resolvePath = (rawPath) => {
    if (!rawPath || rawPath === '.') return cwd;
    // Accept forward slashes: students arriving from the Linux side type them
    // constantly, and real Windows tools tolerate them too.
    const path = rawPath.replace(/\//g, '\\');
    if (/^[A-Za-z]:/.test(path)) {
      return findPath(path) || path;
    }
    if (path === '..') {
      const parts = cwd.split('\\');
      if (parts.length <= 1) return cwd;
      return parts.slice(0, -1).join('\\') || 'C:';
    }
    const full = `${cwd}\\${path}`.replace(/\\\\+/g, '\\');
    return findPath(full) || full;
  };

  switch (command) {
    case 'cd': {
      if (args.length === 0) {
        return { stdout: cwd, stderr: '', newCwd: cwd };
      }
      const target = args[0];
      const resolved = resolvePath(target);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: 'The system cannot find the path specified.', newCwd: cwd };
      }
      if (node.type !== 'dir') {
        return { stdout: '', stderr: 'The directory name is invalid.', newCwd: cwd };
      }

      return { stdout: '', stderr: '', newCwd: resolved };
    }

    case 'dir': {
      const showAll = args.some(a => /^\/a/i.test(a));
      const targetPath = args.find(a => !/^\//.test(a)) || cwd;
      const resolved = resolvePath(targetPath);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: 'File Not Found', newCwd: cwd };
      }
      if (node.type !== 'dir') {
        return { stdout: targetPath, stderr: '', newCwd: cwd };
      }

      const items = node.contents || [];
      const lines = [
        ` Volume in drive C has no label.`,
        ` Volume Serial Number is WRF0-2026`,
        ``,
        ` Directory of ${resolved}`,
        ``
      ];

      items.forEach(item => {
        const itemPath = `${resolved}\\${item}`;
        const itemNode = fs[itemPath];
        const isDir = itemNode?.type === 'dir';
        const hidden = itemNode?.attrib?.includes('H');

        if (!showAll && hidden) return;

        const date = '08/17/2026  09:30 AM';
        if (isDir) {
          lines.push(`${date}    <DIR>          ${item}`);
        } else {
          lines.push(`${date}             1,024 ${item}`);
        }
      });

      lines.push(`               ${items.length} File(s)          4,096 bytes`);
      lines.push(`               ${items.filter(i => fs[`${resolved}\\${i}`]?.type === 'dir').length} Dir(s)  50,000,000,000 bytes free`);

      return { stdout: lines.join('\r\n'), stderr: '', newCwd: cwd };
    }

    case 'type': {
      if (!args[0]) {
        return { stdout: '', stderr: 'The syntax of the command is incorrect.', newCwd: cwd };
      }
      const resolved = resolvePath(args[0]);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: 'The system cannot find the file specified.', newCwd: cwd };
      }
      if (node.type === 'dir') {
        return { stdout: '', stderr: 'Access is denied.', newCwd: cwd };
      }

      return { stdout: node.content, stderr: '', newCwd: cwd };
    }

    case 'find': {
      if (args.length < 2) {
        return { stdout: '', stderr: 'FIND: Parameter format not correct', newCwd: cwd };
      }

      const pattern = args[0].replace(/['"]/g, '');
      const file = args[1];
      const resolved = resolvePath(file);
      const node = fs[resolved];

      if (!node || node.type === 'dir') {
        return { stdout: '', stderr: `File not found - ${file}`, newCwd: cwd };
      }

      const matches = (node.content || '').split(/\r?\n/).filter(line =>
        line.toLowerCase().includes(pattern.toLowerCase())
      );

      const output = [
        `---------- ${file.toUpperCase()}`,
        ...matches
      ];

      return { stdout: output.join('\r\n'), stderr: '', newCwd: cwd };
    }

    case 'findstr': {
      const caseInsensitive = args.some(a => /^\/i$/i.test(a));
      const otherArgs = args.filter(a => !/^\//.test(a));

      if (otherArgs.length < 2) {
        return { stdout: '', stderr: 'FINDSTR: Bad command line', newCwd: cwd };
      }

      const pattern = otherArgs[0].replace(/['"]/g, '');
      const file = otherArgs[1];
      const resolved = resolvePath(file);
      const node = fs[resolved];

      if (!node || node.type === 'dir') {
        return { stdout: '', stderr: `File not found - ${file}`, newCwd: cwd };
      }

      let regex;
      try {
        regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
      } catch (err) {
        return { stdout: '', stderr: `FINDSTR: Invalid search expression: ${pattern}`, newCwd: cwd };
      }
      const matches = (node.content || '').split(/\r?\n/).filter(line => regex.test(line));

      return { stdout: matches.join('\r\n'), stderr: '', newCwd: cwd };
    }

    case 'certutil': {
      if (!args.includes('-hashfile')) {
        return { stdout: '', stderr: 'CertUtil: Unknown command', newCwd: cwd };
      }

      const hashIdx = args.indexOf('-hashfile');
      const file = args[hashIdx + 1];
      const algorithm = (args[hashIdx + 2] || 'SHA1').toUpperCase();
      const resolved = resolvePath(file);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: 'CertUtil: -hashfile -- Error reading file.', newCwd: cwd };
      }

      let hash;
      if (algorithm === 'MD5') {
        hash = node.md5 || md5(node.content || '');
      } else if (algorithm === 'SHA256') {
        hash = node.sha256 || sha256Sync(node.content || '');
      } else {
        hash = node.md5 || 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      }

      return {
        stdout: `${algorithm} hash of ${file}:\r\n${hash}\r\nCertUtil: -hashfile command completed successfully.`,
        stderr: '',
        newCwd: cwd
      };
    }

    case 'attrib': {
      if (!args[0]) {
        return { stdout: '', stderr: 'The syntax of the command is incorrect.', newCwd: cwd };
      }
      const resolved = resolvePath(args[0]);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: `File not found - ${args[0]}`, newCwd: cwd };
      }

      const attrs = node.attrib || 'A';
      return { stdout: `${attrs.padEnd(10)} ${resolved}`, stderr: '', newCwd: cwd };
    }

    case 'cls':
      return { stdout: '__CLEAR__', stderr: '', newCwd: cwd, clear: true };

    case 'submit': {
      const flag = args[0];
      if (!flag) {
        return { stdout: '', stderr: 'Usage: submit <FLAG_STRING> (e.g. submit FLAG{...})', newCwd: cwd };
      }
      return {
        stdout: `Submitting flag '${flag}' for validation...`,
        stderr: '',
        newCwd: cwd,
        submitFlag: flag
      };
    }

    case 'help':
      return {
        stdout: `Available commands:\r\n  cd [dir]       - Display/change current directory\r\n  dir [/a]       - List directory contents\r\n  type <file>    - Display file contents\r\n  find "text" <file> - Search for text\r\n  findstr [/i] "text" <file> - Advanced search\r\n  certutil -hashfile <file> <alg> - Calculate hash\r\n  attrib <file>  - Show file attributes\r\n  cls            - Clear screen\r\n  help           - Show this help`,
        stderr: '',
        newCwd: cwd
      };

    default:
      return { stdout: '', stderr: unknownCommandMessage(command, 'windows'), newCwd: cwd };
  }
}

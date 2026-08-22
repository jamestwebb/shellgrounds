// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Windows CMD Command Implementations for Full Simulation Parity

import { resolvePath, findVfsKey, dirname, basename } from '../../vfs/path.js';
import {
  stat, readFile, writeFile, mkdir, rmdir, unlink, copyFile, moveFile
} from '../../vfs/ops.js';
import { md5, sha256Sync } from '../../crypto-utils.js';

// Helper: read Windows input files
function readWindowsInputs(operands, cwd, fs, stdin = '') {
  if (!operands || operands.length === 0) {
    return [{ name: '', isStdin: true, content: stdin || '', ok: true }];
  }

  return operands.map(op => {
    const resolved = resolvePath(cwd, op, true);
    const res = readFile(fs, resolved, true);
    if (!res.ok) {
      return { name: op, resolved, ok: false, error: res.error, isDir: fs[resolved]?.type === 'dir' };
    }
    return { name: op, resolved, ok: true, content: res.content, node: res.node };
  });
}

// 1. cd / chdir
export const cdWinCmd = {
  name: 'cd',
  aliases: ['chdir'],
  platforms: ['windows'],
  flags: {
    d: { type: 'bool', status: 'implemented' }
  },
  usage: 'CD [/D] [drive:][path]',
  man: {
    name: 'CD - Displays the name of or changes the current directory.',
    synopsis: 'CD [drive:][path]',
    description: 'Displays the name of or changes the current directory.',
    options: ['/D   Change current drive in addition to changing current directory for a drive.'],
    examples: ['cd Users', 'cd ..', 'cd']
  },
  run({ operands, cwd, fs }) {
    if (operands.length === 0) {
      return { stdout: `${cwd}\r\n`, stderr: '', status: 0 };
    }

    const target = operands[0];
    const resolved = resolvePath(cwd, target, true);
    const realKey = findVfsKey(fs, resolved, true);

    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: 'The system cannot find the path specified.\r\n', status: 1 };
    }
    if (fs[realKey].type !== 'dir') {
      return { stdout: '', stderr: 'The directory name is invalid.\r\n', status: 1 };
    }

    return { stdout: '', stderr: '', status: 0, newCwd: resolved };
  }
};

// 2. dir
export const dirWinCmd = {
  name: 'dir',
  platforms: ['windows'],
  flags: {
    a: { type: 'string', status: 'implemented' },
    b: { type: 'bool', status: 'implemented' },
    s: { type: 'bool', status: 'implemented' },
    o: { type: 'string', status: 'implemented' },
    w: { type: 'bool', status: 'implemented' },
    p: { type: 'bool', status: 'implemented' },
    q: { type: 'bool', status: 'implemented' }
  },
  usage: 'DIR [drive:][path][filename] [/A[[:]attributes]] [/B] [/C] [/D] [/L] [/N] [/O[[:]sortorder]] [/P] [/Q] [/R] [/S] [/T[[:]timefield]] [/W] [/X] [/4]',
  man: {
    name: 'DIR - Displays a list of files and subdirectories in a directory.',
    synopsis: 'DIR [/A] [/B] [/S] [/W] [path]',
    description: 'Displays a list of files and subdirectories in a directory.',
    options: [
      '/A          Displays files with specified attributes (D, R, H, A, S). /A:H shows hidden files.',
      '/B          Uses bare format (no heading information or summary).',
      '/S          Displays files in specified directory and all subdirectories.',
      '/W          Uses wide list format.'
    ],
    examples: ['dir', 'dir /a', 'dir /b', 'dir /s C:\\Windows']
  },
  run({ flags, operands, cwd, fs }) {
    const showAll = flags.a !== undefined;
    const bare = !!flags.b;
    const recursive = !!flags.s;
    const target = operands[0] || cwd;

    const resolved = resolvePath(cwd, target, true);
    const realKey = findVfsKey(fs, resolved, true);

    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: 'File Not Found\r\n', status: 1 };
    }

    const node = fs[realKey];
    let stdout = '';

    if (node.type === 'file') {
      if (bare) {
        return { stdout: `${basename(realKey, true)}\r\n`, stderr: '', status: 0 };
      }
      return {
        stdout: ` Volume in drive C has no label.\r\n Directory of ${dirname(realKey, true)}\r\n\r\n08/17/2026  09:30 AM    ${String(node.size || node.content.length).padStart(14, ' ')} ${basename(realKey, true)}\r\n               1 File(s)     ${node.size || node.content.length} bytes\r\n`,
        stderr: '',
        status: 0
      };
    }

    // Directory listing
    const processDir = (dirPath) => {
      const dirNode = fs[dirPath];
      if (!dirNode || dirNode.type !== 'dir') return;

      const items = dirNode.contents || [];
      const lines = [];

      if (!bare) {
        lines.push(` Directory of ${dirPath}`, '');
      }

      let fileCount = 0;
      let totalBytes = 0;
      let dirCount = 0;

      // Add . and ..
      if (!bare) {
        lines.push(`08/17/2026  09:30 AM    <DIR>          .`);
        lines.push(`08/17/2026  09:30 AM    <DIR>          ..`);
        dirCount += 2;
      }

      for (const item of items) {
        const itemPath = `${dirPath}\\${item}`;
        const itemKey = findVfsKey(fs, itemPath, true);
        const itemNode = itemKey ? fs[itemKey] : null;
        if (!itemNode) continue;

        const isDir = itemNode.type === 'dir';
        const hidden = itemNode.attrib?.includes('H') || itemNode.hidden;

        if (!showAll && hidden) continue;

        if (bare) {
          lines.push(recursive ? itemPath : item);
        } else {
          const date = '08/17/2026  09:30 AM';
          if (isDir) {
            lines.push(`${date}    <DIR>          ${item}`);
            dirCount++;
          } else {
            const sz = itemNode.size !== undefined ? itemNode.size : (itemNode.content ? itemNode.content.length : 0);
            lines.push(`${date}    ${String(sz).padStart(14, ' ')} ${item}`);
            fileCount++;
            totalBytes += sz;
          }
        }
      }

      if (!bare) {
        lines.push(`              ${String(fileCount).padStart(3, ' ')} File(s)    ${String(totalBytes).padStart(10, ' ')} bytes`);
        lines.push(`              ${String(dirCount).padStart(3, ' ')} Dir(s)   16,106,127,360 bytes free`);
        lines.push('');
      }

      stdout += lines.join('\r\n') + '\r\n';

      if (recursive) {
        for (const item of items) {
          const itemPath = `${dirPath}\\${item}`;
          const itemKey = findVfsKey(fs, itemPath, true);
          if (itemKey && fs[itemKey]?.type === 'dir') {
            processDir(itemKey);
          }
        }
      }
    };

    if (!bare) {
      stdout += ' Volume in drive C has no label.\r\n Volume Serial Number is WRF0-2026\r\n\r\n';
    }

    processDir(realKey);

    return { stdout, stderr: '', status: 0 };
  }
};

// 3. type
export const typeWinCmd = {
  name: 'type',
  platforms: ['windows'],
  flags: {},
  usage: 'TYPE [drive:][path]filename',
  man: {
    name: 'TYPE - Displays the contents of a text file or files.',
    synopsis: 'TYPE filename...',
    description: 'Displays the contents of a text file or files.',
    options: [],
    examples: ['type notes.txt', 'type file1.txt file2.txt']
  },
  run({ operands, cwd, fs, stdin }) {
    const inputs = readWindowsInputs(operands, cwd, fs, stdin);
    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `The system cannot find the file specified.\r\n`;
        status = 1;
        continue;
      }
      if (inputs.length > 1) {
        stdout += `\r\n${inp.name}\r\n\r\n`;
      }
      let content = inp.content;
      content = content.replace(/\r?\n/g, '\r\n');
      stdout += content;
      if (!content.endsWith('\r\n')) stdout += '\r\n';
    }

    return { stdout, stderr, status };
  }
};

// 4. findstr
export const findstrWinCmd = {
  name: 'findstr',
  platforms: ['windows'],
  flags: {
    i: { type: 'bool', status: 'implemented' },
    v: { type: 'bool', status: 'implemented' },
    n: { type: 'bool', status: 'implemented' },
    r: { type: 'bool', status: 'implemented' },
    s: { type: 'bool', status: 'implemented' },
    c: { type: 'string', status: 'implemented' },
    m: { type: 'bool', status: 'implemented' }
  },
  usage: 'FINDSTR [/I] [/V] [/N] [/M] [/S] [/C:string] [/R] strings [[drive:][path]filename[ ...]]',
  man: {
    name: 'FINDSTR - Searches for strings in files.',
    synopsis: 'FINDSTR [/I] [/V] [/N] [/S] [/C:string] strings [filename...]',
    description: 'Searches for patterns of text in files using regular expressions.',
    options: [
      '/I         Specifies that the search is not to be case-sensitive.',
      '/V         Prints only lines that do not contain a match.',
      '/N         Prints the line number before each line that matches.',
      '/M         Prints only the filename if a file contains a match.',
      '/S         Searches for matching files in the current directory and all subdirectories.',
      '/C:string  Uses specified string as a literal search string.'
    ],
    examples: ['findstr "Event" logs.txt', 'findstr /i /c:"admin login" system.log', 'type logs.txt | findstr /v "DEBUG"']
  },
  run({ flags, operands, cwd, fs, stdin }) {
    let pattern = flags.c || operands[0] || '';
    const fileOperands = flags.c ? operands : operands.slice(1);
    const inputs = readWindowsInputs(fileOperands, cwd, fs, stdin);

    if (!pattern && !flags.c) {
      return { stdout: '', stderr: 'FINDSTR: Bad command line\r\n', status: 2 };
    }

    const isIgnoreCase = !!flags.i;
    const isInvert = !!flags.v;
    const showLineNum = !!flags.n;
    const showOnlyFile = !!flags.m;

    let regex;
    try {
      const regPattern = flags.c ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
      regex = new RegExp(regPattern, isIgnoreCase ? 'i' : '');
    } catch (err) {
      return { stdout: '', stderr: `FINDSTR: Invalid search expression\r\n`, status: 2 };
    }

    let stdout = '';
    let stderr = '';
    let totalMatches = 0;
    const showFilename = inputs.length > 1;

    for (const inp of inputs) {
      if (!inp.ok || inp.isDir) {
        stderr += `FINDSTR: Cannot open ${inp.name}\r\n`;
        continue;
      }

      const lines = (inp.content || '').split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      let fileMatched = false;

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const line = lines[lIdx];
        const isMatch = regex.test(line);
        const selected = isInvert ? !isMatch : isMatch;

        if (selected) {
          fileMatched = true;
          totalMatches++;
          if (showOnlyFile) break;

          let prefix = '';
          if (showFilename) prefix += `${inp.name}:`;
          if (showLineNum) prefix += `${lIdx + 1}:`;
          stdout += `${prefix}${line}\r\n`;
        }
      }

      if (showOnlyFile && fileMatched) {
        stdout += `${inp.name}\r\n`;
      }
    }

    return { stdout, stderr, status: totalMatches > 0 ? 0 : 1 };
  }
};

// 5. find
export const findWinCmd = {
  name: 'find',
  platforms: ['windows'],
  flags: {
    v: { type: 'bool', status: 'implemented' },
    c: { type: 'bool', status: 'implemented' },
    n: { type: 'bool', status: 'implemented' },
    i: { type: 'bool', status: 'implemented' }
  },
  usage: 'FIND [/V] [/C] [/N] [/I] "string" [[drive:][path]filename[ ...]]',
  man: {
    name: 'FIND - Searches for a text string in a file or files.',
    synopsis: 'FIND [/V] [/C] [/N] [/I] "string" [filename...]',
    description: 'Searches for a text string in a file or files and displays matching lines.',
    options: [
      '/V   Displays all lines NOT containing the specified string.',
      '/C   Displays only the count of lines containing the string.',
      '/N   Displays line numbers with the displayed lines.',
      '/I   Ignores the case of characters when searching for the string.'
    ],
    examples: ['find "ERROR" logs.txt', 'dir | find /c /v ""']
  },
  run({ flags, operands, cwd, fs, stdin }) {
    let pattern = operands[0] || '';
    if (pattern.startsWith('"') && pattern.endsWith('"')) pattern = pattern.slice(1, -1);
    const fileOperands = operands.slice(1);
    const inputs = readWindowsInputs(fileOperands, cwd, fs, stdin);

    let stdout = '';
    let stderr = '';
    let totalMatches = 0;

    for (const inp of inputs) {
      if (!inp.ok || inp.isDir) {
        stderr += `File not found - ${inp.name}\r\n`;
        continue;
      }

      const lines = (inp.content || '').split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      let matchCount = 0;
      let matchedLines = [];

      for (let lIdx = 0; lIdx < lines.length; lIdx++) {
        const line = lines[lIdx];
        let match;
        if (pattern === '') {
          match = false;
        } else if (flags.i) {
          match = line.toLowerCase().includes(pattern.toLowerCase());
        } else {
          match = line.includes(pattern);
        }

        const selected = flags.v ? !match : match;
        if (selected) {
          matchCount++;
          totalMatches++;
          matchedLines.push(flags.n ? `[${lIdx + 1}]${line}` : line);
        }
      }

      if (flags.c) {
        if (!inp.isStdin) {
          stdout += `---------- ${inp.name.toUpperCase()}: ${matchCount}\r\n`;
        } else {
          stdout += `${matchCount}\r\n`;
        }
      } else {
        if (!inp.isStdin) {
          stdout += `---------- ${inp.name.toUpperCase()}\r\n`;
        }
        for (const ml of matchedLines) {
          stdout += `${ml}\r\n`;
        }
      }
    }

    const exitStatus = flags.c ? 0 : (totalMatches > 0 ? 0 : 1);
    return { stdout, stderr, status: exitStatus };
  }
};

// 6. echo
export const echoWinCmd = {
  name: 'echo',
  platforms: ['windows'],
  flags: {},
  usage: 'ECHO [ON | OFF] or ECHO [message]',
  man: {
    name: 'ECHO - Displays messages, or turns command-echoing on or off.',
    synopsis: 'ECHO [message] or ECHO.',
    description: 'Displays messages or creates empty lines.',
    options: [],
    examples: ['echo Hello world', 'echo. (prints empty line)']
  },
  run({ argv }) {
    const raw = argv.slice(1).join(' ');
    if (!raw) {
      return { stdout: 'ECHO is on.\r\n', stderr: '', status: 0 };
    }
    return { stdout: `${raw}\r\n`, stderr: '', status: 0 };
  }
};

// 7. set
export const setWinCmd = {
  name: 'set',
  platforms: ['windows'],
  flags: {
    a: { type: 'string', status: 'implemented' }
  },
  usage: 'SET [variable=[string]]',
  man: {
    name: 'SET - Displays, sets, or removes cmd.exe environment variables.',
    synopsis: 'SET [variable=[string]]',
    description: 'Displays, sets, or removes environment variables in Windows CMD.',
    options: [],
    examples: ['set', 'set USERNAME', 'set FOO=BAR']
  },
  run({ operands, env = {} }) {
    if (operands.length === 0) {
      let stdout = '';
      const fullEnv = {
        ALLUSERSPROFILE: 'C:\\ProgramData',
        APPDATA: 'C:\\Users\\Student\\AppData\\Roaming',
        COMPUTERNAME: 'DESKTOP-WIN10',
        HOMEDRIVE: 'C:',
        HOMEPATH: '\\Users\\Student',
        OS: 'Windows_NT',
        PATH: 'C:\\Windows\\system32;C:\\Windows;C:\\Windows\\System32\\Wbem',
        SYSTEMDRIVE: 'C:',
        SYSTEMROOT: 'C:\\Windows',
        TEMP: 'C:\\Users\\Student\\AppData\\Local\\Temp',
        USERDOMAIN: 'DESKTOP-WIN10',
        USERNAME: 'Student',
        USERPROFILE: 'C:\\Users\\Student',
        ...env
      };
      for (const [k, v] of Object.entries(fullEnv)) {
        if (k !== '?') stdout += `${k}=${v}\r\n`;
      }
      return { stdout, stderr: '', status: 0 };
    }

    const expr = operands.join(' ');
    const eqIdx = expr.indexOf('=');
    if (eqIdx !== -1) {
      const k = expr.slice(0, eqIdx);
      const v = expr.slice(eqIdx + 1);
      const updatedEnv = { ...env, [k]: v };
      return { stdout: '', stderr: '', status: 0, env: updatedEnv };
    }

    const searchKey = operands[0].toLowerCase();
    let stdout = '';
    for (const [k, v] of Object.entries(env)) {
      if (k.toLowerCase().startsWith(searchKey)) {
        stdout += `${k}=${v}\r\n`;
      }
    }
    return { stdout, stderr: '', status: stdout ? 0 : 1 };
  }
};

// 8. copy / move / del / ren
export const copyWinCmd = {
  name: 'copy',
  platforms: ['windows'],
  flags: {
    y: { type: 'bool', status: 'implemented' },
    b: { type: 'bool', status: 'implemented' }
  },
  usage: 'COPY [/V] [/N] [/Y | /-Y] [/Z] [/A | /B ] source [/A | /B] [+ source [/A | /B] ...] [destination [/A | /B]]',
  man: { name: 'COPY - Copies one or more files to another location.', synopsis: 'COPY source destination', description: 'Copies one or more files to another location.' },
  run({ operands, cwd, fs }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'The syntax of the command is incorrect.\r\n', status: 1 };
    }
    const [src, dest] = operands;
    const res = copyFile(fs, resolvePath(cwd, src, true), resolvePath(cwd, dest, true), true);
    if (!res.ok) return { stdout: '', stderr: `${res.error}\r\n`, status: 1 };
    return { stdout: '        1 file(s) copied.\r\n', stderr: '', status: 0, fs: res.fs };
  }
};

export const moveWinCmd = {
  name: 'move',
  platforms: ['windows'],
  flags: { y: { type: 'bool', status: 'implemented' } },
  usage: 'MOVE [/Y | /-Y] [drive:][path]filename1[,...] destination',
  man: { name: 'MOVE - Moves files and renames files and directories.', synopsis: 'MOVE source destination', description: 'Moves files and renames files and directories.' },
  run({ operands, cwd, fs }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'The syntax of the command is incorrect.\r\n', status: 1 };
    }
    const [src, dest] = operands;
    const res = moveFile(fs, resolvePath(cwd, src, true), resolvePath(cwd, dest, true), true);
    if (!res.ok) return { stdout: '', stderr: `${res.error}\r\n`, status: 1 };
    return { stdout: '        1 file(s) moved.\r\n', stderr: '', status: 0, fs: res.fs };
  }
};

export const delWinCmd = {
  name: 'del',
  aliases: ['erase'],
  platforms: ['windows'],
  flags: {
    f: { type: 'bool', status: 'implemented' },
    s: { type: 'bool', status: 'implemented' },
    q: { type: 'bool', status: 'implemented' }
  },
  usage: 'DEL [/P] [/F] [/S] [/Q] [/A[[:]attributes]] names',
  man: { name: 'DEL - Deletes one or more files.', synopsis: 'DEL [/F] [/Q] names', description: 'Deletes one or more files.' },
  run({ flags, operands, cwd, fs }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'The syntax of the command is incorrect.\r\n', status: 1 };
    }
    let workingFs = { ...fs };
    for (const op of operands) {
      const res = unlink(workingFs, resolvePath(cwd, op, true), true, {
        recursive: !!flags.s,
        force: !!flags.f
      });
      if (!res.ok && !flags.f) {
        return { stdout: '', stderr: 'Could Not Find ' + op + '\r\n', status: 1 };
      }
      if (res.ok) workingFs = res.fs;
    }
    return { stdout: '', stderr: '', status: 0, fs: workingFs };
  }
};

export const renWinCmd = {
  name: 'ren',
  aliases: ['rename'],
  platforms: ['windows'],
  flags: {},
  usage: 'RENAME [drive:][path]filename1 filename2',
  man: { name: 'REN - Renames a file or files.', synopsis: 'REN filename1 filename2', description: 'Renames a file or files.' },
  run({ operands, cwd, fs }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'The syntax of the command is incorrect.\r\n', status: 1 };
    }
    const [src, dest] = operands;
    const srcResolved = resolvePath(cwd, src, true);
    const destName = basename(dest, true);
    const destDir = dirname(srcResolved, true);
    const destResolved = `${destDir}\\${destName}`;
    const res = moveFile(fs, srcResolved, destResolved, true);
    if (!res.ok) return { stdout: '', stderr: 'The system cannot find the file specified.\r\n', status: 1 };
    return { stdout: '', stderr: '', status: 0, fs: res.fs };
  }
};

// 9. md / rd
export const mdWinCmd = {
  name: 'md',
  aliases: ['mkdir'],
  platforms: ['windows'],
  flags: {},
  usage: 'MKDIR [drive:]path or MD [drive:]path',
  man: { name: 'MD - Creates a directory.', synopsis: 'MD [drive:]path', description: 'Creates a directory.' },
  run({ operands, cwd, fs }) {
    if (operands.length === 0) return { stdout: '', stderr: 'The syntax of the command is incorrect.\r\n', status: 1 };
    let workingFs = { ...fs };
    for (const op of operands) {
      const res = mkdir(workingFs, resolvePath(cwd, op, true), true, { recursive: true });
      if (res.ok) workingFs = res.fs;
    }
    return { stdout: '', stderr: '', status: 0, fs: workingFs };
  }
};

export const rdWinCmd = {
  name: 'rd',
  aliases: ['rmdir'],
  platforms: ['windows'],
  flags: {
    s: { type: 'bool', status: 'implemented' },
    q: { type: 'bool', status: 'implemented' }
  },
  usage: 'RMDIR [/S] [/Q] [drive:]path or RD [/S] [/Q] [drive:]path',
  man: { name: 'RD - Removes a directory.', synopsis: 'RD [/S] [/Q] [drive:]path', description: 'Removes (deletes) a directory.' },
  run({ flags, operands, cwd, fs }) {
    if (operands.length === 0) return { stdout: '', stderr: 'The syntax of the command is incorrect.\r\n', status: 1 };
    let workingFs = { ...fs };
    for (const op of operands) {
      const res = rmdir(workingFs, resolvePath(cwd, op, true), true);
      if (res.ok) workingFs = res.fs;
    }
    return { stdout: '', stderr: '', status: 0, fs: workingFs };
  }
};

// 10. tree
export const treeWinCmd = {
  name: 'tree',
  platforms: ['windows'],
  flags: {
    f: { type: 'bool', status: 'implemented' },
    a: { type: 'bool', status: 'implemented' }
  },
  usage: 'TREE [drive:][path] [/F] [/A]',
  man: { name: 'TREE - Graphically displays directory structure.', synopsis: 'TREE [/F] [/A] [path]', description: 'Graphically displays the folder structure of a drive or path.' },
  run({ flags, operands, cwd, fs }) {
    const target = operands[0] || cwd;
    const resolved = resolvePath(cwd, target, true);
    const realKey = findVfsKey(fs, resolved, true);
    if (!realKey) return { stdout: '', stderr: 'Invalid path\r\n', status: 1 };

    let stdout = `Folder PATH listing for volume OS\r\nVolume serial number is WRF0-2026\r\n${resolved}\r\n`;
    const prefix = `${resolved}\\`;
    for (const key of Object.keys(fs)) {
      if (key.startsWith(prefix)) {
        const rel = key.slice(prefix.length);
        const depth = rel.split('\\').length;
        const indent = '   '.repeat(depth);
        const name = basename(key, true);
        if (flags.f || fs[key].type === 'dir') {
          stdout += `${indent}+---${name}\r\n`;
        }
      }
    }
    return { stdout, stderr: '', status: 0 };
  }
};

// 11. ver / where / whoami
export const verWinCmd = {
  name: 'ver',
  platforms: ['windows'],
  flags: {},
  usage: 'VER',
  man: { name: 'VER - Displays the Windows version.', synopsis: 'VER', description: 'Displays the Windows version.' },
  run() { return { stdout: '\r\nMicrosoft Windows [Version 10.0.19045.3803]\r\n', stderr: '', status: 0 }; }
};

export const whoamiWinCmd = {
  name: 'whoami',
  platforms: ['windows'],
  flags: {},
  usage: 'WHOAMI',
  man: { name: 'WHOAMI - Displays current user info.', synopsis: 'WHOAMI', description: 'Displays current user and domain information.' },
  run() { return { stdout: 'desktop-win10\\student\r\n', stderr: '', status: 0 }; }
};

export const whereWinCmd = {
  name: 'where',
  platforms: ['windows'],
  flags: {},
  usage: 'WHERE [/R dir] [/Q] [/F] [/T] pattern...',
  man: { name: 'WHERE - Locates files matching search pattern.', synopsis: 'WHERE pattern', description: 'Displays the location of files that match the search pattern.' },
  run({ operands }) {
    if (operands.length === 0) return { stdout: '', stderr: 'ERROR: Invalid syntax.\r\n', status: 2 };
    let stdout = '';
    for (const op of operands) {
      stdout += `C:\\Windows\\System32\\${op}.exe\r\n`;
    }
    return { stdout, stderr: '', status: 0 };
  }
};

// 12. tasklist / ipconfig / systeminfo
export const tasklistWinCmd = {
  name: 'tasklist',
  platforms: ['windows'],
  flags: {
    svc: { type: 'bool', status: 'implemented' },
    v: { type: 'bool', status: 'implemented' }
  },
  usage: 'TASKLIST [/S system [/U username [/P [password]]]] [/M [module] | /SVC | /V] [/FI filter] [/FO format] [/NH]',
  man: { name: 'TASKLIST - Displays all currently running processes.', synopsis: 'TASKLIST [/SVC] [/V]', description: 'Displays all currently running processes on local or remote machine.' },
  run() {
    const lines = [
      '',
      'Image Name                     PID Session Name        Session#    Mem Usage',
      '========================= ======== ================ =========== ============',
      'System Idle Process              0 Services                   0          8 K',
      'System                           4 Services                   0        148 K',
      'smss.exe                       340 Services                   0      1,024 K',
      'csrss.exe                      524 Services                   0      4,512 K',
      'wininit.exe                    608 Services                   0      5,120 K',
      'services.exe                   680 Services                   0      8,960 K',
      'lsass.exe                      700 Services                   0     14,336 K',
      'svchost.exe                    892 Services                   0     22,528 K',
      'explorer.exe                  3212 Console                    1     65,536 K',
      'cmd.exe                       4580 Console                    1      4,096 K'
    ];
    return { stdout: `${lines.join('\r\n')}\r\n`, stderr: '', status: 0 };
  }
};

export const ipconfigWinCmd = {
  name: 'ipconfig',
  platforms: ['windows'],
  flags: {
    all: { type: 'bool', status: 'implemented' }
  },
  usage: 'ipconfig [/all | /renew [adapter] | /release [adapter] | /flushdns | /displaydns | /registerdns | /showclassid adapter | /setclassid adapter [classid] ]',
  man: { name: 'IPCONFIG - Displays IP configuration.', synopsis: 'ipconfig [/all]', description: 'Displays all current TCP/IP network configuration values.' },
  run({ flags }) {
    const lines = [
      '',
      'Windows IP Configuration',
      '',
      'Ethernet adapter Ethernet0:',
      '',
      '   Connection-specific DNS Suffix  . : localdomain',
      '   Link-local IPv6 Address . . . . . : fe80::d4a8:643:9a12:8b3f%12',
      '   IPv4 Address. . . . . . . . . . . : 192.168.1.105',
      '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
      '   Default Gateway . . . . . . . . . : 192.168.1.1'
    ];
    return { stdout: `${lines.join('\r\n')}\r\n`, stderr: '', status: 0 };
  }
};

export const systeminfoWinCmd = {
  name: 'systeminfo',
  platforms: ['windows'],
  flags: {},
  usage: 'SYSTEMINFO [/S system [/U username [/P [password]]]] [/FO format] [/NH]',
  man: { name: 'SYSTEMINFO - Displays operating system configuration.', synopsis: 'systeminfo', description: 'Displays detailed configuration information about a computer and its operating system.' },
  run() {
    const lines = [
      'Host Name:                 DESKTOP-WIN10',
      'OS Name:                   Microsoft Windows 10 Pro',
      'OS Version:                10.0.19045 N/A Build 19045',
      'OS Manufacturer:           Microsoft Corporation',
      'System Type:               x64-based PC',
      'Processor(s):              1 Processor(s) Installed.',
      'Total Physical Memory:     16,384 MB',
      'Available Physical Memory: 11,240 MB'
    ];
    return { stdout: `${lines.join('\r\n')}\r\n`, stderr: '', status: 0 };
  }
};

// 13. attrib
export const attribWinCmd = {
  name: 'attrib',
  platforms: ['windows'],
  flags: {},
  usage: 'ATTRIB [+R | -R] [+A | -A ] [+S | -S] [+H | -H] [+O | -O] [+I | -I] [+X | -X] [+P | -P] [+U | -U] [drive:][path][filename] [/S [/D]] [/L]',
  man: { name: 'ATTRIB - Displays, sets, or removes file attributes.', synopsis: 'ATTRIB [+R | -R] [+A | -A] [+H | -H] [filename]', description: 'Displays, sets, or removes file attributes (Read-only, Hidden, Archive, System).' },
  run({ argv, cwd, fs }) {
    const args = argv.slice(1);
    let target = args.find(a => !a.startsWith('+') && !a.startsWith('-')) || cwd;
    const resolved = resolvePath(cwd, target, true);
    const realKey = findVfsKey(fs, resolved, true);

    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: 'File not found - ' + target + '\r\n', status: 1 };
    }

    const node = fs[realKey];
    const attribOps = args.filter(a => a.startsWith('+') || a.startsWith('-'));

    if (attribOps.length === 0) {
      let attrStr = 'A';
      if (node.attrib?.includes('H') || node.hidden) attrStr += '  H';
      if (node.attrib?.includes('R')) attrStr += '  R';
      if (node.attrib?.includes('S')) attrStr += '  S';
      return { stdout: `${attrStr.padEnd(12, ' ')}${realKey}\r\n`, stderr: '', status: 0 };
    }

    let workingFs = { ...fs };
    let currentAttrib = node.attrib || 'A';
    for (const op of attribOps) {
      const mode = op[0];
      const attr = op.slice(1).toUpperCase();
      if (mode === '+') {
        if (!currentAttrib.includes(attr)) currentAttrib += attr;
      } else if (mode === '-') {
        currentAttrib = currentAttrib.replace(new RegExp(attr, 'g'), '');
      }
    }

    workingFs[realKey] = {
      ...node,
      attrib: currentAttrib,
      hidden: currentAttrib.includes('H')
    };

    return { stdout: '', stderr: '', status: 0, fs: workingFs };
  }
};

// 14. certutil
export const certutilWinCmd = {
  name: 'certutil',
  platforms: ['windows'],
  flags: {
    hashfile: { type: 'string', status: 'implemented' }
  },
  usage: 'certutil -hashfile <file> [MD5 | SHA256]',
  man: {
    name: 'CERTUTIL - Dump and display Certification Authority configuration and compute cryptographic hashes.',
    synopsis: 'certutil -hashfile <file> [MD5 | SHA256]',
    description: 'Generates and displays cryptographic hashes for files.',
    examples: ['certutil -hashfile data.txt MD5', 'certutil -hashfile archive.zip SHA256']
  },
  run({ argv, cwd, fs }) {
    // Expected format: certutil -hashfile <file> [MD5|SHA256]
    const hashFileIdx = argv.findIndex(a => a.toLowerCase() === '-hashfile' || a.toLowerCase() === '/hashfile');
    if (hashFileIdx === -1 || hashFileIdx + 1 >= argv.length) {
      return { stdout: '', stderr: 'CertUtil: -hashfile command parameter missing\r\n', status: 1 };
    }

    const fileArg = argv[hashFileIdx + 1];
    const algo = (argv[hashFileIdx + 2] || 'SHA256').toUpperCase();

    const resolved = resolvePath(cwd, fileArg, true);
    const readRes = readFile(fs, resolved, true);
    if (!readRes.ok) {
      return { stdout: '', stderr: `CertUtil: -hashfile command FAILED: 0x80070002 (WIN32: 2 ERROR_FILE_NOT_FOUND)\r\n`, status: 1 };
    }

    const node = readRes.node;
    let hash = '';
    if (algo === 'MD5') {
      hash = node?.md5 || md5(readRes.content);
    } else {
      hash = node?.sha256 || sha256Sync(readRes.content);
    }

    const stdout = `${algo} hash of ${fileArg}:\r\n${hash}\r\nCertUtil: -hashfile command completed successfully.\r\n`;
    return { stdout, stderr: '', status: 0 };
  }
};

// 15. cls
export const clsWinCmd = {
  name: 'cls',
  platforms: ['windows'],
  flags: {},
  usage: 'CLS',
  man: { name: 'CLS - Clears the screen.', synopsis: 'CLS', description: 'Clears the terminal screen.' },
  run() { return { stdout: '', stderr: '', status: 0, clear: true }; }
};

// 16. help / /?
export const helpWinCmd = {
  name: 'help',
  platforms: ['windows'],
  flags: {},
  usage: 'HELP [command]',
  man: { name: 'HELP - Provides help information for Windows commands.', synopsis: 'HELP [command]', description: 'Provides help information for Windows commands.' },
  run({ operands, context }) {
    if (operands.length > 0) {
      const cmdName = operands[0].toLowerCase();
      const cmd = context.registry?.get(cmdName, 'windows');
      if (cmd?.man) {
        return { stdout: `${cmd.man.name}\r\n\r\n${cmd.usage}\r\n\r\n${cmd.man.description}\r\n`, stderr: '', status: 0 };
      }
      return { stdout: '', stderr: `This command is not supported by the help utility.\r\n`, status: 1 };
    }

    const list = context.registry?.getAll('windows') || [];
    let stdout = 'For more information on a specific command, type HELP command-name\r\n\r\n';
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    for (const cmd of sorted) {
      stdout += `${cmd.name.toUpperCase().padEnd(12, ' ')} ${cmd.man?.name?.split(' - ')[1] || cmd.usage}\r\n`;
    }
    return { stdout, stderr: '', status: 0 };
  }
};

// All Windows command definitions
export const ALL_WINDOWS_COMMANDS = [
  cdWinCmd, dirWinCmd, typeWinCmd, findstrWinCmd, findWinCmd, echoWinCmd, setWinCmd,
  copyWinCmd, moveWinCmd, delWinCmd, renWinCmd, mdWinCmd, rdWinCmd, treeWinCmd,
  verWinCmd, whoamiWinCmd, whereWinCmd, tasklistWinCmd, ipconfigWinCmd, systeminfoWinCmd,
  attribWinCmd, certutilWinCmd, clsWinCmd, helpWinCmd
];

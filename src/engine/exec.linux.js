// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Linux Command Executor for The Gauntlet

import { LINUX_HELP, formatManPage } from './help.js';
import { md5, sha256Sync } from './crypto-utils.js';

export function executeLinuxCommand(argv, cwd, fs, stdin = '', context = {}) {
  if (!argv || argv.length === 0) {
    return { stdout: '', stderr: '', newCwd: cwd };
  }

  const command = argv[0];
  const args = argv.slice(1);
  const installedPackages = context.installedPackages || new Set();

  // Helper: path resolution
  const resolvePath = (path) => {
    if (!path || path === '.') return cwd;
    if (path === '~' || path === '/home/analyst') return '/home/analyst';
    if (path.startsWith('~/')) path = `/home/analyst/${path.slice(2)}`;
    if (path.startsWith('/')) {
      const parts = path.split('/').filter(Boolean);
      const stack = [];
      for (const p of parts) {
        if (p === '..') stack.pop();
        else if (p !== '.') stack.push(p);
      }
      return '/' + stack.join('/');
    }
    if (path === '..') {
      const parent = cwd.split('/').slice(0, -1).join('/');
      return parent || '/';
    }
    
    // Relative path resolution with multi-level ../
    const combined = (cwd === '/' ? `/${path}` : `${cwd}/${path}`).split('/').filter(Boolean);
    const stack = [];
    for (const p of combined) {
      if (p === '..') stack.pop();
      else if (p !== '.') stack.push(p);
    }
    return '/' + stack.join('/');
  };

  // Helper: get text input from file or stdin
  const getFileOrStdin = (targetFile) => {
    if (!targetFile || targetFile === '-') {
      return { content: stdin || '', error: null, filename: '(standard input)' };
    }
    const resolved = resolvePath(targetFile);
    const node = fs[resolved];
    if (!node) {
      return { content: '', error: `No such file or directory: ${targetFile}`, filename: targetFile };
    }
    if (node.type === 'dir') {
      return { content: '', error: `Is a directory: ${targetFile}`, filename: targetFile };
    }
    return { content: node.content || '', error: null, filename: targetFile, node };
  };

  // Handle --help / -h
  if (args.includes('--help') || (args.includes('-h') && command !== 'ls' && command !== 'head' && command !== 'tail')) {
    const helpText = LINUX_HELP[command] || `${command}: no help available`;
    return { stdout: helpText, stderr: '', newCwd: cwd };
  }

  switch (command) {
    case 'pwd':
      return { stdout: cwd, stderr: '', newCwd: cwd };

    case 'ls': {
      let showHidden = false;
      let showLong = false;
      const targetPaths = [];

      for (const arg of args) {
        if (arg.startsWith('-')) {
          if (arg.includes('a')) showHidden = true;
          if (arg.includes('l')) showLong = true;
        } else {
          targetPaths.push(arg);
        }
      }

      const targetPath = targetPaths[0] || cwd;
      const resolved = resolvePath(targetPath);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: `ls: cannot access '${targetPath}': No such file or directory`, newCwd: cwd };
      }

      if (node.type !== 'dir') {
        return { stdout: targetPath, stderr: '', newCwd: cwd };
      }

      let items = [...(node.contents || [])];
      if (!showHidden) {
        items = items.filter(i => !i.startsWith('.'));
      } else {
        // In Linux ls -a, . and .. are included
        items = ['.', '..', ...items];
      }

      if (showLong) {
        const lines = items.map(item => {
          let isDir = false;
          let size = '1024';
          if (item === '.' || item === '..') {
            isDir = true;
            size = '4096';
          } else {
            const itemPath = resolved === '/' ? `/${item}` : `${resolved}/${item}`;
            const itemNode = fs[itemPath];
            isDir = itemNode?.type === 'dir';
            size = isDir ? '4096' : String((itemNode?.content?.length || 1024));
          }
          const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
          return `${perms}  1 analyst analyst  ${size.padStart(5, ' ')} Aug 17 04:00 ${item}`;
        });
        return { stdout: lines.join('\n'), stderr: '', newCwd: cwd };
      }

      return { stdout: items.join('  '), stderr: '', newCwd: cwd };
    }

    case 'cd': {
      const target = args[0] || '/home/analyst';
      const resolved = resolvePath(target);
      const node = fs[resolved];

      if (!node) {
        return { stdout: '', stderr: `cd: ${target}: No such file or directory`, newCwd: cwd };
      }
      if (node.type !== 'dir') {
        return { stdout: '', stderr: `cd: ${target}: Not a directory`, newCwd: cwd };
      }

      return { stdout: '', stderr: '', newCwd: resolved };
    }

    case 'cat': {
      const fileArgs = args.filter(a => !a.startsWith('-'));
      if (fileArgs.length === 0) {
        if (stdin) {
          return { stdout: stdin, stderr: '', newCwd: cwd };
        }
        return { stdout: '', stderr: 'cat: missing operand', newCwd: cwd };
      }

      const outputs = [];
      const errs = [];

      for (const f of fileArgs) {
        const result = getFileOrStdin(f);
        if (result.error) {
          errs.push(`cat: ${result.error}`);
        } else {
          outputs.push(result.content);
        }
      }

      return {
        stdout: outputs.join('\n'),
        stderr: errs.join('\n'),
        newCwd: cwd
      };
    }

    case 'head': {
      let linesCount = 10;
      let targetFile = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-n' && args[i + 1]) {
          linesCount = parseInt(args[i + 1], 10) || 10;
          i++;
        } else if (arg.startsWith('-n')) {
          linesCount = parseInt(arg.slice(2), 10) || 10;
        } else if (/^-\d+$/.test(arg)) {
          linesCount = parseInt(arg.slice(1), 10) || 10;
        } else if (!arg.startsWith('-')) {
          targetFile = arg;
        }
      }

      const { content, error } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `head: ${error}`, newCwd: cwd };
      }

      const lines = content.split('\n').slice(0, linesCount);
      return { stdout: lines.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'tail': {
      let linesCount = 10;
      let targetFile = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-n' && args[i + 1]) {
          linesCount = parseInt(args[i + 1], 10) || 10;
          i++;
        } else if (arg.startsWith('-n')) {
          linesCount = parseInt(arg.slice(2), 10) || 10;
        } else if (/^-\d+$/.test(arg)) {
          linesCount = parseInt(arg.slice(1), 10) || 10;
        } else if (!arg.startsWith('-')) {
          targetFile = arg;
        }
      }

      const { content, error } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `tail: ${error}`, newCwd: cwd };
      }

      const allLines = content.split('\n');
      const lines = allLines.slice(Math.max(0, allLines.length - linesCount));
      return { stdout: lines.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'less': {
      const targetFile = args.find(a => !a.startsWith('-'));
      if (!targetFile && !stdin) {
        return { stdout: '', stderr: 'less: missing filename ("less --help" for help)', newCwd: cwd };
      }
      const { content, error } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `less: ${error}`, newCwd: cwd };
      }
      return {
        stdout: `${content}\n\n(END of output — in real less, you scroll with Space and press q to quit)`,
        stderr: '',
        newCwd: cwd
      };
    }

    case 'grep': {
      let caseInsensitive = false;
      let invertMatch = false;
      let countOnly = false;
      let showLineNumbers = false;
      let pattern = null;
      let targetFile = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-i' || arg === '--ignore-case') caseInsensitive = true;
        else if (arg === '-v' || arg === '--invert-match') invertMatch = true;
        else if (arg === '-c' || arg === '--count') countOnly = true;
        else if (arg === '-n' || arg === '--line-number') showLineNumbers = true;
        else if (arg === '-E' || arg === '-e') {
          if (args[i + 1] && !pattern) {
            pattern = args[i + 1];
            i++;
          }
        } else if (!pattern) {
          pattern = arg;
        } else if (!targetFile) {
          targetFile = arg;
        }
      }

      if (!pattern) {
        return { stdout: '', stderr: 'grep: missing pattern', newCwd: cwd };
      }

      const { content, error } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `grep: ${error}`, newCwd: cwd };
      }

      // Convert escaped pipe \| to | for extended regex alternation
      const normalizedPattern = pattern.replace(/\\\|/g, '|');
      let regex;
      try {
        regex = new RegExp(normalizedPattern, caseInsensitive ? 'i' : '');
      } catch (err) {
        return { stdout: '', stderr: `grep: invalid regular expression: ${pattern}`, newCwd: cwd };
      }

      const lines = content.split('\n');
      const matchingLines = [];

      lines.forEach((line, idx) => {
        const matches = regex.test(line);
        if ((matches && !invertMatch) || (!matches && invertMatch)) {
          if (showLineNumbers) {
            matchingLines.push(`${idx + 1}:${line}`);
          } else {
            matchingLines.push(line);
          }
        }
      });

      if (countOnly) {
        return { stdout: String(matchingLines.length), stderr: '', newCwd: cwd };
      }

      return { stdout: matchingLines.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'find': {
      const results = [];
      let startPath = '.';
      let namePattern = null;
      let typeFilter = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-name' && args[i + 1]) {
          namePattern = args[i + 1].replace(/['"]/g, '');
          i++;
        } else if (arg === '-type' && args[i + 1]) {
          typeFilter = args[i + 1];
          i++;
        } else if (!arg.startsWith('-') && i === 0) {
          startPath = arg;
        }
      }

      const resolved = resolvePath(startPath);
      if (!fs[resolved]) {
        return { stdout: '', stderr: `find: '${startPath}': No such file or directory`, newCwd: cwd };
      }

      const search = (currentPath) => {
        const node = fs[currentPath];
        if (!node) return;

        const baseName = currentPath.split('/').pop() || currentPath;
        let match = true;

        if (typeFilter === 'd' && node.type !== 'dir') match = false;
        if (typeFilter === 'f' && node.type !== 'file') match = false;

        if (namePattern) {
          const globRegex = new RegExp('^' + namePattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          if (!globRegex.test(baseName)) match = false;
        }

        if (match) {
          const displayPath = currentPath.startsWith(resolved)
            ? (startPath === '.' ? (currentPath === resolved ? '.' : './' + currentPath.slice(resolved.length).replace(/^\//, '')) : currentPath)
            : currentPath;
          results.push(displayPath);
        }

        if (node.type === 'dir' && node.contents) {
          node.contents.forEach(child => {
            const nextPath = currentPath === '/' ? `/${child}` : `${currentPath}/${child}`;
            search(nextPath);
          });
        }
      };

      search(resolved);
      return { stdout: results.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'file': {
      const target = args[0];
      if (!target) {
        return { stdout: '', stderr: 'file: missing operand', newCwd: cwd };
      }
      const resolved = resolvePath(target);
      const node = fs[resolved];
      if (!node) {
        return { stdout: '', stderr: `file: cannot open '${target}' (No such file or directory)`, newCwd: cwd };
      }
      if (node.type === 'dir') {
        return { stdout: `${target}: directory`, stderr: '', newCwd: cwd };
      }
      const typeDesc = node.fileType || (node.content.includes('\x00') ? 'data' : 'ASCII text');
      return { stdout: `${target}: ${typeDesc}`, stderr: '', newCwd: cwd };
    }

    case 'strings': {
      const target = args.find(a => !a.startsWith('-'));
      const { content, error } = getFileOrStdin(target);
      if (error) {
        return { stdout: '', stderr: `strings: ${error}`, newCwd: cwd };
      }
      const matches = content.match(/[\x20-\x7E]{4,}/g) || [];
      return { stdout: matches.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'md5sum': {
      const target = args.find(a => !a.startsWith('-'));
      const { content, error, filename, node } = getFileOrStdin(target);
      if (error) {
        return { stdout: '', stderr: `md5sum: ${error}`, newCwd: cwd };
      }
      const hash = node?.md5 || md5(content);
      return { stdout: `${hash}  ${filename}`, stderr: '', newCwd: cwd };
    }

    case 'sha256sum': {
      const target = args.find(a => !a.startsWith('-'));
      const { content, error, filename, node } = getFileOrStdin(target);
      if (error) {
        return { stdout: '', stderr: `sha256sum: ${error}`, newCwd: cwd };
      }
      const hash = node?.sha256 || sha256Sync(content);
      return { stdout: `${hash}  ${filename}`, stderr: '', newCwd: cwd };
    }

    case 'wc': {
      let countLines = false;
      let countWords = false;
      let countChars = false;
      let targetFile = null;

      for (const arg of args) {
        if (arg === '-l' || arg === '--lines') countLines = true;
        else if (arg === '-w' || arg === '--words') countWords = true;
        else if (arg === '-c' || arg === '--bytes') countChars = true;
        else if (!arg.startsWith('-')) targetFile = arg;
      }

      if (!countLines && !countWords && !countChars) {
        countLines = true;
        countWords = true;
        countChars = true;
      }

      const { content, error, filename } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `wc: ${error}`, newCwd: cwd };
      }

      const lines = content.length > 0 ? (content.endsWith('\n') ? content.slice(0, -1).split('\n').length : content.split('\n').length) : 0;
      const words = content.trim().length > 0 ? content.trim().split(/\s+/).length : 0;
      const chars = content.length;

      const outParts = [];
      if (countLines) outParts.push(String(lines).padStart(4, ' '));
      if (countWords) outParts.push(String(words).padStart(4, ' '));
      if (countChars) outParts.push(String(chars).padStart(4, ' '));
      if (targetFile) outParts.push(targetFile);

      return { stdout: outParts.join(' '), stderr: '', newCwd: cwd };
    }

    case 'sort': {
      let reverse = false;
      let numeric = false;
      let unique = false;
      let targetFile = null;

      for (const arg of args) {
        if (arg === '-r') reverse = true;
        else if (arg === '-n') numeric = true;
        else if (arg === '-u') unique = true;
        else if (!arg.startsWith('-')) targetFile = arg;
      }

      const { content, error } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `sort: ${error}`, newCwd: cwd };
      }

      let lines = content.split('\n').filter(Boolean);

      if (numeric) {
        lines.sort((a, b) => {
          const numA = parseFloat(a.match(/-?\d+(\.\d+)?/)?.[0] || '0');
          const numB = parseFloat(b.match(/-?\d+(\.\d+)?/)?.[0] || '0');
          return numA - numB;
        });
      } else {
        lines.sort();
      }

      if (unique) {
        lines = [...new Set(lines)];
      }

      if (reverse) {
        lines.reverse();
      }

      return { stdout: lines.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'cut': {
      let delim = '\t';
      let fieldIdx = null;
      let targetFile = null;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-d' && args[i + 1]) {
          delim = args[i + 1].replace(/['"]/g, '');
          i++;
        } else if (arg.startsWith('-d')) {
          delim = arg.slice(2).replace(/['"]/g, '');
        } else if (arg === '-f' && args[i + 1]) {
          fieldIdx = parseInt(args[i + 1], 10);
          i++;
        } else if (arg.startsWith('-f')) {
          fieldIdx = parseInt(arg.slice(2), 10);
        } else if (!arg.startsWith('-')) {
          targetFile = arg;
        }
      }

      if (fieldIdx === null) {
        return { stdout: '', stderr: 'cut: you must specify a list of fields with -f', newCwd: cwd };
      }

      const { content, error } = getFileOrStdin(targetFile);
      if (error) {
        return { stdout: '', stderr: `cut: ${error}`, newCwd: cwd };
      }

      const resultLines = content.split('\n').map(line => {
        const parts = line.split(delim);
        if (parts.length < fieldIdx) return line;
        return parts[fieldIdx - 1];
      });

      return { stdout: resultLines.join('\n'), stderr: '', newCwd: cwd };
    }

    case 'echo': {
      let noNewline = false;
      const words = [];

      for (const arg of args) {
        if (arg === '-n') noNewline = true;
        else words.push(arg);
      }

      return {
        stdout: words.join(' '),
        stderr: '',
        newCwd: cwd
      };
    }

    case 'man': {
      const target = args[0];
      if (!target) {
        return { stdout: '', stderr: 'What manual page do you want?\nFor example, try "man grep"', newCwd: cwd };
      }
      return { stdout: formatManPage(target), stderr: '', newCwd: cwd };
    }

    case 'map': {
      const asciiMap = `
================================================================================
              FILESYSTEM MAP — THE GAUNTLET · FORENSICS CLI 101
================================================================================

  [WINDOWS SIDE: C:\\Users\\analyst]
                  │
                  ▼  (WSL bridge: /mnt/c/Users/analyst)
  ═══════════════════════════════ LINUX ════════════════════════════════════════
                  │
        [HOME: /home/analyst]  ( ~ )
             │          │              │
    ┌────────┴─────┐    │              └────────────────┐
    │              │    │                               │
[training/]        │ [Documents/]                  [evidence/]
    ├─ level_1     │    ├─ case_notes.txt              ├─ mystery_file
    ├─ level_2     │    ├─ access.log                  ├─ binary_data
    │    └─ deeper │    ├─ secrets.txt                 ├─ evidence.img
    └─ archive     │    ├─ logs.txt                    └─ suspect_drive.raw
                   │    └─ security_events.csv
                   │
              [/var/log/]
                   ├─ syslog
                   └─ sensor_audit.log

================================================================================
Legend: / = root  ·  ~ = /home/analyst  ·  cd <dir> = enter  ·  cd .. = back up
================================================================================`;
      return { stdout: asciiMap.trim(), stderr: '', newCwd: cwd };
    }

    case 'submit': {
      const flagInput = args[0];
      if (!flagInput) {
        return { stdout: '', stderr: 'Usage: submit <FLAG_STRING> (e.g. submit FLAG{...})', newCwd: cwd };
      }
      return {
        stdout: `Submitting flag '${flagInput}' for validation...`,
        stderr: '',
        newCwd: cwd,
        submitFlag: flagInput
      };
    }

    case 'sudo': {
      if (args[0] === 'apt-get' || args[0] === 'apt') {
        const aptArgs = args.slice(1);
        if (aptArgs.includes('update')) {
          const output = `Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nGet:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nFetched 126 kB in 0s (410 kB/s)\nReading package lists... Done\nBuilding dependency tree... Done`;
          return { stdout: output, stderr: '', newCwd: cwd };
        }
        if (aptArgs.includes('install')) {
          const pkg = aptArgs.find(a => !a.startsWith('-') && a !== 'install') || 'tracker';
          const newPkgSet = new Set(installedPackages);
          newPkgSet.add(pkg);
          const output = `Reading package lists... Done\nBuilding dependency tree... Done\nThe following NEW packages will be installed:\n  ${pkg}\n0 upgraded, 1 newly installed, 0 to remove.\nNeed to get 4,208 kB of archives.\nUnpacking ${pkg} (1.4.0-wrf) ...\nSetting up ${pkg} (1.4.0-wrf) ...\nProcessing triggers for man-db (2.12.0) ...\n[OK] Package '${pkg}' installed successfully.`;
          return { stdout: output, stderr: '', newCwd: cwd, installedPackage: pkg };
        }
      }
      return { stdout: '', stderr: `sudo: ${args.join(' ')}: simulated command execution completed.`, newCwd: cwd };
    }

    case 'tracker': {
      if (!installedPackages.has('tracker')) {
        return { stdout: '', stderr: "tracker: command not found. Install it first using: sudo apt-get update && sudo apt-get install tracker -y", newCwd: cwd };
      }
      const telemetry = `
[TRACKER SENSOR SUITE v1.4.0]
SWEEPING FILESYSTEM FOR SENSOR SIGNATURES...
================================================================================
Node 0 (/home/analyst):  Signal: Analyst (Active)
Node 1 (training/):      Signal: Checkpoints Verified
Node 2 (evidence/):      Signature Match: 98.4%
Node 3 (/mnt/c):         WSL Bridge Active
================================================================================
ANOMALY LOCATED AT NODE 2:
Sensor Flag: [[FLAG:act3-apt]]
`;
      return { stdout: telemetry.trim(), stderr: '', newCwd: cwd };
    }

    case 'scan': {
      const target = args[0] || 'suspect_drive.raw';
      const resolved = resolvePath(target);
      const node = fs[resolved];
      if (!node) {
        return { stdout: '', stderr: `scan: cannot open '${target}': No such file or directory`, newCwd: cwd };
      }
      const output = `
Partition Table Scan for container: ${target}
Sector Size: 512 bytes | Total Sectors: 1048576

#   Slot   Start Sector   End Sector    Sectors   Type   Volume Name
1   p1             2048       206847     204800   0x83   Linux System
2   p2           206848       616447     409600   0x83   Evidence Vault [BOOT]
3   p3           616448      1048575     432128   0x07   NTFS Data

HINT: The forensic volume begins at sector offset 206848.
Use 'extract -o 206848 ${target}' to carve the evidence partition.
`;
      return { stdout: output.trim(), stderr: '', newCwd: cwd };
    }

    case 'extract': {
      let offset = null;
      let target = null;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-o' && args[i + 1]) {
          offset = args[i + 1];
          i++;
        } else if (!args[i].startsWith('-')) {
          target = args[i];
        }
      }

      if (!offset) {
        return { stdout: '', stderr: 'extract: missing sector offset flag -o <n>', newCwd: cwd };
      }
      if (!target) {
        return { stdout: '', stderr: 'extract: missing disk image file argument', newCwd: cwd };
      }

      if (offset === '206848' || offset === '0x32800') {
        const output = `
[EXTRACT] Carving partition at sector offset ${offset}...
[EXTRACT] Filesystem magic detected: EXT4 / Evidence Vault Superblock
[EXTRACT] Recovering root inode metadata...
[EXTRACT] Carving complete. 1 volume extracted.

================================================================================
CAPSTONE EVIDENCE DECRYPTED:
"Five acts. One clean extraction. Nice work, Analyst."

MASTER FORENSIC FLAG: [[FLAG:act5-capstone]]
================================================================================`;
        return { stdout: output.trim(), stderr: '', newCwd: cwd };
      } else {
        return { stdout: '', stderr: `extract: invalid superblock or unknown filesystem at sector offset ${offset}. Check scan output.`, newCwd: cwd };
      }
    }

    case 'clear':
      return { stdout: '__CLEAR__', stderr: '', newCwd: cwd, clear: true };

    case 'help':
      return {
        stdout: `Available commands:
  pwd          - Print current working directory
  ls [-la]     - List directory contents
  cd <dir>     - Change directory (use "cd .." to ascend, "cd ~" for home)
  cat <file>   - Display file contents
  head [-n N]  - Output first N lines of file or stdin
  tail [-n N]  - Output last N lines of file or stdin
  less <file>  - Interactive text reader
  grep [-i -v] - Search for patterns (supports alternation "a|b" and pipes)
  find <path>  - Search for files and directories
  file <file>  - Determine true file type by header bytes
  strings <f>  - Extract printable text from binaries
  md5sum <f>   - Calculate MD5 integrity checksum
  sha256sum <f>- Calculate SHA-256 cryptographic digest
  wc [-l]      - Count lines, words, and bytes
  sort [-r -n] - Sort text lines
  cut -d, -fN  - Extract columns from CSV/delimited text
  echo "text"  - Print text (supports redirection > and >>)
  map          - ASCII map of this filesystem
  man <cmd>    - Display manual page
  submit <flag>- Submit a captured flag for points
  clear        - Clear terminal screen`,
        stderr: '',
        newCwd: cwd
      };

    default:
      return { stdout: '', stderr: `${command}: command not found`, newCwd: cwd };
  }
}

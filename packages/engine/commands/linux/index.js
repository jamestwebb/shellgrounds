// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Linux Command Implementations with Full Simulation Fidelity

import { resolvePath, findVfsKey, dirname, basename } from '../../vfs/path.js';
import {
  stat, readFile, writeFile, mkdir, rmdir, unlink, chmod, chown, copyFile, moveFile, touch, formatMode, hasPermission
} from '../../vfs/ops.js';
import { md5, sha256Sync } from '../../crypto-utils.js';
import { parseCommandArgs } from '../registry.js';

// Helper: read file or stdin with multi-file support
export function readInputs(operands, cwd, fs, stdin = '', user = 'student') {
  if (!operands || operands.length === 0 || (operands.length === 1 && operands[0] === '-')) {
    return [{ name: '(standard input)', isStdin: true, content: stdin || '', ok: true }];
  }

  return operands.map(op => {
    if (op === '-') {
      return { name: '(standard input)', isStdin: true, content: stdin || '', ok: true };
    }
    const resolved = resolvePath(cwd, op, false);
    const res = readFile(fs, resolved, false, { user });
    if (!res.ok) {
      return { name: op, resolved, ok: false, error: res.error, isDir: fs[resolved]?.type === 'dir' };
    }
    return { name: op, resolved, ok: true, content: res.content, node: res.node };
  });
}

/**
 * GNU tools let the LAST of two opposing options win (`head -q -v` prints
 * headers, `echo -e -E` does not interpret escapes). The parsed flags object
 * has no ordering, so this rescans argv. `map` maps a short letter or a long
 * name to the token this function should return.
 */
export function lastOptionWins(argv, map) {
  let winner = null;
  for (const arg of argv.slice(1)) {
    if (arg === '--') break;
    if (arg.startsWith('--') && arg.length > 2) {
      const name = arg.slice(2).split('=')[0];
      if (map[name]) winner = map[name];
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      for (const ch of arg.slice(1)) {
        if (map[ch]) winner = map[ch];
      }
    }
  }
  return winner;
}

/**
 * Translates a POSIX Basic Regular Expression into JavaScript's (ERE-shaped)
 * RegExp syntax. In a BRE — which is what `grep` uses without -E — the
 * characters ? + { } | ( ) are LITERAL and their backslashed forms are the
 * operators; ERE is the other way round. Without this, `grep 'a|b'` matched
 * alternation, which real grep only does under -E.
 */
export function breToJs(pattern) {
  const SWAPPED = '?+{}|()';
  let out = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      out += SWAPPED.includes(next) ? next : `\\${next}`;
      i += 2;
      continue;
    }

    if (ch === '[') {
      // A bracket expression is copied verbatim; ] first inside is a literal.
      let j = i + 1;
      if (pattern[j] === '^') j++;
      if (pattern[j] === ']') j++;
      while (j < pattern.length && pattern[j] !== ']') j++;
      out += pattern.slice(i, Math.min(j + 1, pattern.length));
      i = j + 1;
      continue;
    }

    out += SWAPPED.includes(ch) ? `\\${ch}` : ch;
    i++;
  }

  return out;
}

// Helper: GNU `ls -h` / `du -h` size abbreviation (1024-based, one decimal
// below 10 units, e.g. 1023, 1.5K, 12K, 2.0G).
export function humanSize(bytes = 0) {
  const units = ['', 'K', 'M', 'G', 'T'];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  if (unit === 0) return String(Math.round(value));
  return value < 10 ? `${value.toFixed(1)}${units[unit]}` : `${Math.round(value)}${units[unit]}`;
}

/**
 * Runs a wrapped command the way the shell would have run it directly.
 *
 * sudo and xargs both build a command line and hand it to another command.
 * Passing `flags: {}` (as they used to) threw every option away, so
 * `sudo ls -l` reached ls with '-l' as a FILE operand. Parsing the wrapped
 * argv against the wrapped command's own flag spec — including its
 * passthroughArgs opt-out and the same error formatting the shell uses —
 * makes the wrapped command behave exactly as if it had been typed alone.
 */
export function runWrappedCommand(cmdImpl, name, args, ctx) {
  const parsed = cmdImpl.passthroughArgs
    ? { flags: {}, operands: args }
    : parseCommandArgs(args, cmdImpl.flags || {}, false, cmdImpl.name || name);

  if (parsed.error) {
    return {
      stdout: '',
      stderr: `${name}: ${parsed.error}\nTry '${name} --help' for more information.\n`,
      status: parsed.status || 2
    };
  }

  return cmdImpl.run({
    argv: [name, ...args],
    flags: parsed.flags,
    operands: parsed.operands,
    ...ctx
  });
}

// 1. pwd
export const pwdCmd = {
  name: 'pwd',
  platforms: ['linux'],
  flags: {
    L: { type: 'bool', status: 'implemented' },
    P: { type: 'bool', status: 'implemented' }
  },
  usage: 'pwd [-L | -P]',
  man: {
    name: 'pwd - print name of current/working directory',
    synopsis: 'pwd [-L | -P]',
    description: 'Print the full filename of the current working directory.',
    options: ['-L   use PWD from environment', '-P   avoid all symlinks'],
    examples: ['pwd']
  },
  run({ cwd }) {
    // -L prints the logical path (what the shell believes) and -P the physical
    // one (symlinks resolved). This filesystem has no symlink nodes, so the two
    // are provably the same string; neither flag is being quietly discarded.
    return { stdout: `${cwd}\n`, stderr: '', status: 0 };
  }
};

// 2. cd
export const cdCmd = {
  name: 'cd',
  platforms: ['linux'],
  flags: {},
  usage: 'cd [dir]',
  man: {
    name: 'cd - change the shell working directory',
    synopsis: 'cd [dir]',
    description: 'Change the shell working directory to dir (default is $HOME).',
    options: [],
    examples: ['cd Documents', 'cd ..', 'cd ~', 'cd -']
  },
  run({ argv, cwd, fs, env = {}, user }) {
    const target = argv[1];
    const home = env.HOME || (user ? `/home/${user}` : (cwd.startsWith('/home/') ? '/' + cwd.split('/').slice(1, 3).join('/') : '/home/student'));

    if (!target || target === '~' || target === home) {
      return { stdout: '', stderr: '', status: 0, newCwd: home };
    }

    if (target === '-') {
      const prev = env.OLDPWD || home;
      return { stdout: `${prev}\n`, stderr: '', status: 0, newCwd: prev };
    }

    const resolved = resolvePath(cwd, target, false, home);
    const realKey = findVfsKey(fs, resolved, false);

    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: `bash: cd: ${target}: No such file or directory\n`, status: 1 };
    }
    if (fs[realKey].type !== 'dir') {
      return { stdout: '', stderr: `bash: cd: ${target}: Not a directory\n`, status: 1 };
    }

    return { stdout: '', stderr: '', status: 0, newCwd: resolved };
  }
};

// 3. ls
export const lsCmd = {
  name: 'ls',
  platforms: ['linux'],
  flags: {
    a: { type: 'bool', status: 'implemented', long: 'all' },
    l: { type: 'bool', status: 'implemented' },
    h: { type: 'bool', status: 'implemented', long: 'human-readable' },
    1: { type: 'bool', status: 'implemented' },
    r: { type: 'bool', status: 'implemented', long: 'reverse' },
    t: { type: 'bool', status: 'implemented' },
    S: { type: 'bool', status: 'implemented' },
    R: { type: 'bool', status: 'notSimulated' }
  },
  usage: 'ls [OPTION]... [FILE]...',
  man: {
    name: 'ls - list directory contents',
    synopsis: 'ls [OPTION]... [FILE]...',
    description: 'List information about the FILEs (the current directory by default). Sorted lexicographically with dotfiles first.',
    options: [
      '-a, --all        do not ignore entries starting with .',
      '-l               use a long listing format',
      '-1               list one file per line',
      '-h, --human-readable  with -l, print sizes like 1K 234M 2G etc.',
      '-r, --reverse    reverse order while sorting',
      '-t               sort by modification time, newest first',
      '-S               sort by file size, largest first'
    ],
    examples: ['ls', 'ls -la', 'ls -l Documents']
  },
  run({ flags, operands, cwd, fs, isTTY }) {
    const showHidden = !!(flags.a || flags.all);
    const showLong = !!flags.l;
    const human = !!(flags.h || flags['human-readable']);
    const forceOneLine = !!flags['1'] || !isTTY;

    const targets = operands.length > 0 ? operands : ['.'];
    let stderr = '';
    let status = 0;

    // Shared comparator so operands and directory entries sort the same way.
    const compare = (aName, aPath, bName, bPath) => {
      let cmp;
      if (flags.t) {
        const mtimeA = fs[aPath]?.mtime || 0;
        const mtimeB = fs[bPath]?.mtime || 0;
        cmp = mtimeB > mtimeA ? 1 : (mtimeB < mtimeA ? -1 : 0);
      } else if (flags.S) {
        cmp = (fs[bPath]?.size || 0) - (fs[aPath]?.size || 0);
      } else {
        cmp = aName.localeCompare(bName);
      }
      return flags.r ? -cmp : cmp;
    };

    // Real ls prints a `name:` header only for DIRECTORY operands, and only
    // when more than one operand was given. A plain file operand prints as the
    // path the user typed, one per line, with no header and no `total` line.
    // Non-directory operands form a single first block; each directory then
    // gets its own block, separated by a blank line.
    const fileTargets = [];
    const dirTargets = [];

    for (const target of targets) {
      const resolved = resolvePath(cwd, target, false);
      const realKey = findVfsKey(fs, resolved, false);

      if (!realKey || !fs[realKey]) {
        stderr += `ls: cannot access '${target}': No such file or directory\n`;
        status = 2;
        continue;
      }

      (fs[realKey].type === 'dir' ? dirTargets : fileTargets).push({ target, realKey });
    }

    fileTargets.sort((a, b) => compare(a.target, a.realKey, b.target, b.realKey));
    dirTargets.sort((a, b) => compare(a.target, a.realKey, b.target, b.realKey));

    const longLine = (st, displayName, isDir) => {
      const modeStr = formatMode(st.mode, isDir);
      const owner = st.owner || 'student';
      const group = st.group || 'student';
      const sizeStr = (human ? humanSize(st.size) : String(st.size)).padStart(5, ' ');
      return `${modeStr} 1 ${owner} ${group} ${sizeStr} Aug 17 09:30 ${displayName}\n`;
    };

    const blocks = [];

    // Block 1: every non-directory operand, printed as the given path.
    if (fileTargets.length > 0) {
      let body = '';
      for (const ft of fileTargets) {
        if (showLong) {
          body += longLine(stat(fs, ft.realKey, false), ft.target, false);
        } else {
          body += `${ft.target}\n`;
        }
      }
      blocks.push(body);
    }

    // One block per directory operand.
    const wantHeaders = targets.length > 1;
    for (const dt of dirTargets) {
      const resolved = dt.realKey;
      const node = fs[resolved];
      let body = wantHeaders ? `${dt.target}:\n` : '';

      let entries = [...(node.contents || [])];
      if (showHidden) {
        entries.unshift('.', '..');
      } else {
        entries = entries.filter(e => !e.startsWith('.'));
      }

      const childPathOf = (entry) => (
        entry === '.' ? resolved
          : (entry === '..' ? dirname(resolved, false) : resolvePath(resolved, entry, false))
      );

      // '.' and '..' are already in position; only the real entries sort.
      const dots = entries.filter(e => e === '.' || e === '..');
      const rest = entries.filter(e => e !== '.' && e !== '..');
      rest.sort((a, b) => compare(a, childPathOf(a), b, childPathOf(b)));
      entries = [...dots, ...rest];

      if (showLong) {
        const totalBlocks = Math.ceil(entries.length * 4);
        body += `total ${totalBlocks}\n`;
        for (const entry of entries) {
          const st = stat(fs, childPathOf(entry), false);
          const isDir = entry === '.' || entry === '..' || st.isDir;
          body += longLine(st, entry, isDir);
        }
      } else if (forceOneLine) {
        for (const entry of entries) {
          body += `${entry}\n`;
        }
      } else if (entries.length > 0) {
        // TTY interactive column view
        body += `${entries.join('  ')}\n`;
      }

      blocks.push(body);
    }

    return { stdout: blocks.join('\n'), stderr, status };
  }
};

// 4. cat
export const catCmd = {
  name: 'cat',
  platforms: ['linux'],
  flags: {
    n: { type: 'bool', status: 'implemented', long: 'number' },
    b: { type: 'bool', status: 'implemented', long: 'number-nonblank' },
    s: { type: 'bool', status: 'implemented', long: 'squeeze-blank' },
    E: { type: 'bool', status: 'notSimulated' }
  },
  usage: 'cat [OPTION]... [FILE]...',
  man: {
    name: 'cat - concatenate files and print on the standard output',
    synopsis: 'cat [OPTION]... [FILE]...',
    description: 'Concatenate FILE(s) to standard output. With no FILE, or when FILE is -, read standard input.',
    options: [
      '-n, --number             number all output lines',
      '-b, --number-nonblank    number nonempty output lines, overrides -n',
      '-s, --squeeze-blank      suppress repeated empty output lines'
    ],
    examples: ['cat welcome.txt', 'cat notes.txt access.log', 'cat -n file.txt']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;
    let lineNumber = 1;

    for (const inp of inputs) {
      if (!inp.ok) {
        if (inp.isDir) {
          stderr += `cat: ${inp.name}: Is a directory\n`;
        } else {
          stderr += `cat: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        }
        status = 1;
        continue;
      }

      let content = inp.content;
      if (flags.s) {
        content = content.replace(/\n{3,}/g, '\n\n');
      }

      if (flags.n || flags.b) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (i === lines.length - 1 && line === '') break;
          if (flags.b && line.trim() === '') {
            stdout += `${line}\n`;
          } else {
            stdout += `${String(lineNumber++).padStart(6, ' ')}  ${line}\n`;
          }
        }
      } else {
        stdout += content;
        if (content && !content.endsWith('\n')) {
          stdout += '\n';
        }
      }
    }

    return { stdout, stderr, status };
  }
};

// 5. head
export const headCmd = {
  name: 'head',
  platforms: ['linux'],
  flags: {
    n: { type: 'string', status: 'implemented', long: 'lines' },
    c: { type: 'number', status: 'implemented', long: 'bytes' },
    q: { type: 'bool', status: 'implemented', long: 'quiet' },
    v: { type: 'bool', status: 'implemented', long: 'verbose' }
  },
  usage: 'head [OPTION]... [FILE]...',
  man: {
    name: 'head - output the first part of files',
    synopsis: 'head [OPTION]... [FILE]...',
    description: 'Print the first 10 lines of each FILE to standard output. With more than one FILE, precede each with a header giving the file name.',
    options: [
      '-n, --lines=[-]NUM   print the first NUM lines; with \'-\', print all but the last NUM lines of each file',
      '-c, --bytes=[-]NUM   print the first NUM bytes of each file',
      '-q, --quiet          never print headers giving file names',
      '-v, --verbose        always print headers giving file names'
    ],
    examples: ['head access.log', 'head -n 5 system.log', 'head -n -2 file.txt']
  },
  run({ argv, flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    let lineCount = 10;
    let allButLast = false;

    if (flags.n !== undefined) {
      const rawN = String(flags.n);
      if (rawN.startsWith('-')) {
        allButLast = true;
        lineCount = parseInt(rawN.slice(1), 10) || 0;
      } else {
        lineCount = parseInt(rawN, 10) || 10;
      }
    }

    // -v always prints headers, -q never does; the later option wins.
    const headerChoice = lastOptionWins(argv, { q: 'q', v: 'v', quiet: 'q', verbose: 'v', silent: 'q' });
    const showHeaders = headerChoice === 'v' ? true : (headerChoice === 'q' ? false : inputs.length > 1);

    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (!inp.ok) {
        stderr += `head: cannot open '${inp.name}' for reading: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }

      if (showHeaders) {
        if (stdout.length > 0) stdout += '\n';
        stdout += `==> ${inp.name} <==\n`;
      }

      if (flags.c !== undefined) {
        stdout += inp.content.slice(0, Number(flags.c));
        continue;
      }

      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      const selected = allButLast
        ? lines.slice(0, Math.max(0, lines.length - lineCount))
        : lines.slice(0, lineCount);

      if (selected.length > 0) {
        stdout += `${selected.join('\n')}\n`;
      }
    }

    return { stdout, stderr, status };
  }
};

// 6. tail
export const tailCmd = {
  name: 'tail',
  platforms: ['linux'],
  flags: {
    n: { type: 'string', status: 'implemented', long: 'lines' },
    c: { type: 'number', status: 'implemented', long: 'bytes' },
    q: { type: 'bool', status: 'implemented', long: 'quiet' },
    f: { type: 'bool', status: 'notSimulated', long: 'follow' }
  },
  usage: 'tail [OPTION]... [FILE]...',
  man: {
    name: 'tail - output the last part of files',
    synopsis: 'tail [OPTION]... [FILE]...',
    description: 'Print the last 10 lines of each FILE to standard output. With more than one FILE, precede each with a header giving the file name.',
    options: [
      '-n, --lines=[+]NUM   output the last NUM lines, or use -n +NUM to output starting with line NUM',
      '-c, --bytes=[+]NUM   output the last NUM bytes',
      '-q, --quiet          never output headers giving file names'
    ],
    examples: ['tail access.log', 'tail -n 3 alerts.log', 'tail -n +2 data.csv']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    let lineCount = 10;
    let fromLineOnward = false;

    if (flags.n !== undefined) {
      const rawN = String(flags.n);
      if (rawN.startsWith('+')) {
        fromLineOnward = true;
        lineCount = parseInt(rawN.slice(1), 10) || 1;
      } else {
        lineCount = parseInt(rawN.replace(/^-/, ''), 10) || 10;
      }
    }

    const showHeaders = inputs.length > 1 && !flags.q;

    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (!inp.ok) {
        stderr += `tail: cannot open '${inp.name}' for reading: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }

      if (showHeaders) {
        if (stdout.length > 0) stdout += '\n';
        stdout += `==> ${inp.name} <==\n`;
      }

      if (flags.c !== undefined) {
        const byteCount = Number(flags.c);
        stdout += inp.content.slice(Math.max(0, inp.content.length - byteCount));
        continue;
      }

      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      const selected = fromLineOnward
        ? lines.slice(Math.max(0, lineCount - 1))
        : lines.slice(Math.max(0, lines.length - lineCount));

      if (selected.length > 0) {
        stdout += `${selected.join('\n')}\n`;
      }
    }

    return { stdout, stderr, status };
  }
};

// 7. less
export const lessCmd = {
  name: 'less',
  aliases: ['more'],
  platforms: ['linux'],
  flags: {},
  usage: 'less [FILE]...',
  man: {
    name: 'less - opposite of more; page through text files',
    synopsis: 'less [FILE]...',
    description: 'less is a pager program allowing interactive scrolling through files.',
    options: ['q   quit less', '/pattern   search forward'],
    examples: ['less access.log']
  },
  run({ operands, cwd, fs, stdin, user, isTTY }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `less: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }
      stdout += inp.content;
      if (!inp.content.endsWith('\n')) stdout += '\n';
    }

    return {
      stdout,
      stderr,
      status,
      uiNote: isTTY ? '(END of output — press q to return to prompt)' : undefined
    };
  }
};

// 8. grep
export const grepCmd = {
  name: 'grep',
  platforms: ['linux'],
  flags: {
    // -e is how POSIX names a pattern explicitly, and the only way to search
    // for one that begins with a dash. A student who has met real grep reaches
    // for it, and used to be told "invalid option".
    e: { type: 'string', status: 'implemented', long: 'regexp' },
    i: { type: 'bool', status: 'implemented', long: 'ignore-case' },
    v: { type: 'bool', status: 'implemented', long: 'invert-match' },
    r: { type: 'bool', status: 'implemented', long: 'recursive' },
    R: { type: 'bool', status: 'implemented', long: 'dereference-recursive' },
    n: { type: 'bool', status: 'implemented', long: 'line-number' },
    c: { type: 'bool', status: 'implemented', long: 'count' },
    l: { type: 'bool', status: 'implemented', long: 'files-with-matches' },
    L: { type: 'bool', status: 'implemented', long: 'files-without-match' },
    o: { type: 'bool', status: 'implemented', long: 'only-matching' },
    w: { type: 'bool', status: 'implemented', long: 'word-regexp' },
    h: { type: 'bool', status: 'implemented', long: 'no-filename' },
    H: { type: 'bool', status: 'implemented', long: 'with-filename' },
    E: { type: 'bool', status: 'implemented', long: 'extended-regexp' },
    F: { type: 'bool', status: 'implemented', long: 'fixed-strings' },
    A: { type: 'number', status: 'implemented', long: 'after-context' },
    B: { type: 'number', status: 'implemented', long: 'before-context' },
    C: { type: 'number', status: 'implemented', long: 'context' },
    P: { type: 'bool', status: 'notSimulated' }
  },
  usage: 'grep [OPTION]... PATTERNS [FILE]...\n       grep [OPTION]... -e PATTERNS [FILE]...',
  man: {
    name: 'grep - print lines matching a pattern',
    synopsis: 'grep [OPTION]... PATTERNS [FILE]...',
    description: 'Search for PATTERNS in each FILE or standard input.',
    options: [
      '-i, --ignore-case         ignore case distinctions',
      '-v, --invert-match        select non-matching lines',
      '-r, -R, --recursive       search subdirectories recursively',
      '-n, --line-number         print line number with output lines',
      '-c, --count               print only a count of selected lines per FILE',
      '-l, --files-with-matches  print only names of FILEs with selected lines',
      '-w, --word-regexp         force PATTERNS to match only whole words',
      '-o, --only-matching       show only nonempty parts of lines matching PATTERNS',
      '-E, --extended-regexp     PATTERNS are extended regular expressions',
      '-F, --fixed-strings       PATTERNS are literal strings',
      '-A NUM                    print NUM lines of trailing context',
      '-B NUM                    print NUM lines of leading context',
      '-C NUM                    print NUM lines of output context'
    ],
    examples: ['grep error access.log', 'grep -i "vault" secrets.txt', 'grep -r "admin" /var/log']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    if (operands.length === 0 && !(typeof flags.e === 'string' && flags.e.length > 0)) {
      return { stdout: '', stderr: 'Usage: grep [OPTION]... PATTERNS [FILE]...\nTry \'grep --help\' for more information.\n', status: 2 };
    }

    // With -e the pattern is the flag's value, so every operand is a file.
    // Without it the first operand is the pattern, as usual.
    const usingE = typeof flags.e === 'string' && flags.e.length > 0;
    const patternStr = usingE ? flags.e : operands[0];
    const fileArgs = usingE ? operands : operands.slice(1);

    const isRecursive = !!(flags.r || flags.R);
    let inputs = [];

    if (fileArgs.length === 0) {
      inputs = [{ name: '(standard input)', isStdin: true, content: stdin || '', ok: true }];
    } else {
      for (const fArg of fileArgs) {
        const resolved = resolvePath(cwd, fArg, false);
        const st = stat(fs, resolved, false);
        if (!st.exists) {
          inputs.push({ name: fArg, ok: false, error: 'No such file or directory' });
          continue;
        }

        if (st.isDir) {
          if (isRecursive) {
            const prefix = resolved === '/' ? '/' : `${resolved}/`;
            for (const key of Object.keys(fs)) {
              if (key.startsWith(prefix) && fs[key].type === 'file') {
                const rel = key.slice(prefix.length);
                const relName = fArg === '.' ? rel : `${fArg}/${rel}`;
                inputs.push({ name: relName, resolved: key, content: fs[key].content || '', ok: true });
              }
            }
          } else {
            inputs.push({ name: fArg, ok: false, error: 'Is a directory', isDir: true });
          }
        } else {
          inputs.push({ name: fArg, resolved, content: st.node.content || '', ok: true });
        }
      }
    }

    // Build regex pattern
    let regex;
    try {
      // -F: every character literal. -E: extended regexp, which is what
      // JavaScript's RegExp already is. Neither: POSIX basic regexp, so the
      // pattern has to be translated or grep would silently accept ERE syntax.
      let regPattern = flags.F
        ? patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : (flags.E ? patternStr : breToJs(patternStr));
      if (flags.w) {
        regPattern = `\\b(?:${regPattern})\\b`;
      }
      const regFlags = flags.i ? 'i' : '';
      regex = new RegExp(regPattern, regFlags);
    } catch (err) {
      return { stdout: '', stderr: `grep: invalid regular expression: ${err.message}\n`, status: 2 };
    }

    let stdout = '';
    let stderr = '';
    let totalMatchedLines = 0;
    const showFilename = (flags.H || inputs.length > 1) && !flags.h;

    const afterContext = Number(flags.C || flags.A || 0);
    const beforeContext = Number(flags.C || flags.B || 0);

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `grep: ${inp.name}: ${inp.error}\n`;
        continue;
      }

      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      const matchedIndices = [];
      for (let idx = 0; idx < lines.length; idx++) {
        const matches = regex.test(lines[idx]);
        if (flags.v ? !matches : matches) {
          matchedIndices.push(idx);
        }
      }

      if (flags.c) {
        if (showFilename) {
          stdout += `${inp.name}:${matchedIndices.length}\n`;
        } else {
          stdout += `${matchedIndices.length}\n`;
        }
        if (matchedIndices.length > 0) totalMatchedLines += matchedIndices.length;
        continue;
      }

      if (flags.l) {
        if (matchedIndices.length > 0) {
          stdout += `${inp.name}\n`;
          totalMatchedLines++;
        }
        continue;
      }

      if (flags.L) {
        if (matchedIndices.length === 0) {
          stdout += `${inp.name}\n`;
          totalMatchedLines++;
        }
        continue;
      }

      // Collect lines to output with context
      const linesToOutput = new Set();
      for (const mIdx of matchedIndices) {
        const start = Math.max(0, mIdx - beforeContext);
        const end = Math.min(lines.length - 1, mIdx + afterContext);
        for (let k = start; k <= end; k++) {
          linesToOutput.add(k);
        }
      }

      const sortedIndices = Array.from(linesToOutput).sort((a, b) => a - b);
      for (const lIdx of sortedIndices) {
        const lineText = lines[lIdx];
        let prefix = '';
        if (showFilename) prefix += `${inp.name}:`;
        if (flags.n) prefix += `${lIdx + 1}:`;

        if (flags.o && !flags.v) {
          const matchResult = lineText.match(regex);
          if (matchResult) {
            stdout += `${prefix}${matchResult[0]}\n`;
            totalMatchedLines++;
          }
        } else {
          stdout += `${prefix}${lineText}\n`;
          totalMatchedLines++;
        }
      }
    }

    const exitStatus = totalMatchedLines > 0 ? 0 : (stderr ? 2 : 1);
    return { stdout, stderr, status: exitStatus };
  }
};

// 9. wc
export const wcCmd = {
  name: 'wc',
  platforms: ['linux'],
  flags: {
    l: { type: 'bool', status: 'implemented', long: 'lines' },
    w: { type: 'bool', status: 'implemented', long: 'words' },
    c: { type: 'bool', status: 'implemented', long: 'bytes' },
    m: { type: 'bool', status: 'implemented', long: 'chars' },
    L: { type: 'bool', status: 'implemented', long: 'max-line-length' }
  },
  usage: 'wc [OPTION]... [FILE]...',
  man: {
    name: 'wc - print newline, word, and byte counts for each file',
    synopsis: 'wc [OPTION]... [FILE]...',
    description: 'Print newline, word, and byte counts for each FILE, and a total line if more than one FILE is specified.',
    options: [
      '-l, --lines            print the newline counts',
      '-w, --words            print the word counts',
      '-c, --bytes            print the byte counts',
      '-m, --chars            print the character counts',
      '-L, --max-line-length  print the maximum display width'
    ],
    examples: ['wc access.log', 'wc -l access.log', 'ls | wc -l']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    const showAll = !flags.l && !flags.w && !flags.c && !flags.m && !flags.L;
    const showL = showAll || flags.l;
    const showW = showAll || flags.w;
    const showC = showAll || flags.c || flags.m;
    const showMax = flags.L;

    let totalLines = 0;
    let totalWords = 0;
    let totalBytes = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `wc: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }

      const content = inp.content;
      const lines = content.length > 0 ? (content.endsWith('\n') ? content.slice(0, -1).split('\n').length : content.split('\n').length - 1) : 0;
      const words = (content.trim().match(/\S+/g) || []).length;
      const bytes = content.length;

      totalLines += lines;
      totalWords += words;
      totalBytes += bytes;

      let parts = [];
      if (showL) parts.push(String(lines).padStart(4, ' '));
      if (showW) parts.push(String(words).padStart(4, ' '));
      if (showC) parts.push(String(bytes).padStart(4, ' '));
      if (showMax) {
        const maxLen = Math.max(...content.split('\n').map(l => l.length), 0);
        parts.push(String(maxLen).padStart(4, ' '));
      }

      if (!inp.isStdin) {
        parts.push(inp.name);
      }

      stdout += `${parts.join(' ')}\n`;
    }

    if (inputs.length > 1) {
      let totalParts = [];
      if (showL) totalParts.push(String(totalLines).padStart(4, ' '));
      if (showW) totalParts.push(String(totalWords).padStart(4, ' '));
      if (showC) totalParts.push(String(totalBytes).padStart(4, ' '));
      totalParts.push('total');
      stdout += `${totalParts.join(' ')}\n`;
    }

    return { stdout, stderr, status };
  }
};

// 10. sort
export const sortCmd = {
  name: 'sort',
  platforms: ['linux'],
  flags: {
    r: { type: 'bool', status: 'implemented', long: 'reverse' },
    n: { type: 'bool', status: 'implemented', long: 'numeric-sort' },
    u: { type: 'bool', status: 'implemented', long: 'unique' },
    k: { type: 'string', status: 'implemented', long: 'key' },
    t: { type: 'string', status: 'implemented', long: 'field-separator' }
  },
  usage: 'sort [OPTION]... [FILE]...',
  man: {
    name: 'sort - sort lines of text files',
    synopsis: 'sort [OPTION]... [FILE]...',
    description: 'Write sorted concatenation of all FILE(s) to standard output.',
    options: [
      '-r, --reverse          reverse the result of comparisons',
      '-n, --numeric-sort     compare according to string numerical value',
      '-u, --unique           output only the first of an equal run',
      '-k, --key=KEYDEF       sort via a key; KEYDEF gives location and type',
      '-t, --field-separator  use SEP instead of non-blank to blank transition'
    ],
    examples: ['sort users.txt', 'sort -n -k2 scores.txt', 'cat logs.txt | sort | uniq']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let allLines = [];
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `sort: cannot read: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        status = 2;
        continue;
      }
      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      allLines.push(...lines);
    }

    const keyIndex = flags.k ? (parseInt(flags.k, 10) - 1) : null;
    const sep = flags.t || null;

    allLines.sort((a, b) => {
      let valA = a;
      let valB = b;

      if (keyIndex !== null) {
        const partsA = sep ? a.split(sep) : a.trim().split(/\s+/);
        const partsB = sep ? b.split(sep) : b.trim().split(/\s+/);
        valA = partsA[keyIndex] || '';
        valB = partsB[keyIndex] || '';
      }

      let cmp = 0;
      if (flags.n) {
        const numA = parseFloat(valA) || 0;
        const numB = parseFloat(valB) || 0;
        cmp = numA - numB;
      } else {
        cmp = valA.localeCompare(valB);
      }

      return flags.r ? -cmp : cmp;
    });

    if (flags.u) {
      allLines = Array.from(new Set(allLines));
    }

    const stdout = allLines.length > 0 ? `${allLines.join('\n')}\n` : '';
    return { stdout, stderr, status };
  }
};

// 11. cut
export const cutCmd = {
  name: 'cut',
  platforms: ['linux'],
  flags: {
    d: { type: 'string', status: 'implemented', long: 'delimiter' },
    f: { type: 'string', status: 'implemented', long: 'fields' },
    c: { type: 'string', status: 'implemented', long: 'characters' },
    s: { type: 'bool', status: 'implemented', long: 'only-delimited' }
  },
  usage: 'cut OPTION... [FILE]...',
  man: {
    name: 'cut - remove sections from each line of files',
    synopsis: 'cut OPTION... [FILE]...',
    description: 'Print selected parts of lines from each FILE to standard output.',
    options: [
      '-d, --delimiter=DELIM  use DELIM instead of TAB for field delimiter',
      '-f, --fields=LIST      select only these fields (e.g. 1, 2-4, 3,5)',
      '-c, --characters=LIST  select only these characters',
      '-s, --only-delimited   do not print lines not containing delimiters'
    ],
    examples: ['cut -d: -f1 /etc/passwd', 'cut -d"," -f2,3 data.csv']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    if (!flags.f && !flags.c) {
      return { stdout: '', stderr: 'cut: you must specify a list of bytes, characters, or fields\n', status: 1 };
    }

    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    const delim = flags.d !== undefined ? flags.d : '\t';

    // Parse field / char list e.g. "1,2", "1-3", "2"
    const parseList = (listStr) => {
      const selected = new Set();
      const parts = String(listStr).split(',');
      for (const p of parts) {
        if (p.includes('-')) {
          const [start, end] = p.split('-').map(n => parseInt(n, 10));
          const s = isNaN(start) ? 1 : start;
          const e = isNaN(end) ? 100 : end;
          for (let k = s; k <= e; k++) selected.add(k);
        } else {
          selected.add(parseInt(p, 10));
        }
      }
      return selected;
    };

    const fieldIndices = flags.f ? parseList(flags.f) : null;
    const charIndices = flags.c ? parseList(flags.c) : null;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `cut: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }

      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      for (const line of lines) {
        if (fieldIndices) {
          if (!line.includes(delim)) {
            if (!flags.s) stdout += `${line}\n`;
            continue;
          }
          const fields = line.split(delim);
          const extracted = [];
          for (let fIdx = 1; fIdx <= fields.length; fIdx++) {
            if (fieldIndices.has(fIdx)) {
              extracted.push(fields[fIdx - 1]);
            }
          }
          stdout += `${extracted.join(delim)}\n`;
        } else if (charIndices) {
          let extracted = '';
          for (let cIdx = 1; cIdx <= line.length; cIdx++) {
            if (charIndices.has(cIdx)) {
              extracted += line[cIdx - 1];
            }
          }
          stdout += `${extracted}\n`;
        }
      }
    }

    return { stdout, stderr, status };
  }
};

// 12. uniq
export const uniqCmd = {
  name: 'uniq',
  platforms: ['linux'],
  flags: {
    c: { type: 'bool', status: 'implemented', long: 'count' },
    d: { type: 'bool', status: 'implemented', long: 'repeated' },
    u: { type: 'bool', status: 'implemented', long: 'unique' },
    i: { type: 'bool', status: 'implemented', long: 'ignore-case' }
  },
  usage: 'uniq [OPTION]... [INPUT [OUTPUT]]',
  man: {
    name: 'uniq - report or omit repeated lines',
    synopsis: 'uniq [OPTION]... [INPUT [OUTPUT]]',
    description: 'Filter adjacent matching lines from INPUT (or standard input), writing to OUTPUT (or standard output).',
    options: [
      '-c, --count     prefix lines by the number of occurrences',
      '-d, --repeated  only print duplicate lines, one for each group',
      '-u, --unique    only print unique lines',
      '-i, --ignore-case ignore differences in case when comparing'
    ],
    examples: ['sort access.log | uniq -c', 'sort list.txt | uniq -d']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands.slice(0, 1), cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    const inp = inputs[0];
    if (!inp.ok) {
      return { stdout: '', stderr: `uniq: ${inp.name}: ${inp.error}\n`, status: 1 };
    }

    const lines = inp.content.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    const groups = [];
    for (const line of lines) {
      const cmpLine = flags.i ? line.toLowerCase() : line;
      if (groups.length > 0) {
        const lastGroup = groups[groups.length - 1];
        const lastCmp = flags.i ? lastGroup.line.toLowerCase() : lastGroup.line;
        if (cmpLine === lastCmp) {
          lastGroup.count++;
          continue;
        }
      }
      groups.push({ line, count: 1 });
    }

    for (const grp of groups) {
      if (flags.d && grp.count === 1) continue;
      if (flags.u && grp.count > 1) continue;

      if (flags.c) {
        stdout += `${String(grp.count).padStart(7, ' ')} ${grp.line}\n`;
      } else {
        stdout += `${grp.line}\n`;
      }
    }

    return { stdout, stderr, status };
  }
};

// 13. tr
export const trCmd = {
  name: 'tr',
  platforms: ['linux'],
  flags: {
    d: { type: 'bool', status: 'implemented', long: 'delete' },
    s: { type: 'bool', status: 'implemented', long: 'squeeze-repeats' }
  },
  usage: 'tr [OPTION]... SET1 [SET2]',
  man: {
    name: 'tr - translate or delete characters',
    synopsis: 'tr [OPTION]... SET1 [SET2]',
    description: 'Translate, squeeze, and/or delete characters from standard input, writing to standard output.',
    options: [
      '-d, --delete          delete characters in SET1',
      '-s, --squeeze-repeats replace each sequence of repeated characters in SET1 with a single occurrence'
    ],
    examples: ['tr a-z A-Z', 'tr -d "\r"', 'echo "hello   world" | tr -s " "']
  },
  run({ flags, operands, stdin }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'tr: missing operand\n', status: 1 };
    }

    const expandSet = (s) => {
      let res = '';
      let i = 0;
      while (i < s.length) {
        if (s[i + 1] === '-' && i + 2 < s.length) {
          const startCode = s.charCodeAt(i);
          const endCode = s.charCodeAt(i + 2);
          for (let c = startCode; c <= endCode; c++) {
            res += String.fromCharCode(c);
          }
          i += 3;
        } else {
          res += s[i++];
        }
      }
      return res;
    };

    const set1 = expandSet(operands[0]);
    let text = stdin || '';

    if (flags.d) {
      const set1Chars = new Set(set1);
      text = text.split('').filter(c => !set1Chars.has(c)).join('');
    } else if (flags.s && operands.length === 1) {
      const set1Chars = new Set(set1);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        if (set1Chars.has(text[i]) && text[i] === text[i - 1]) continue;
        out += text[i];
      }
      text = out;
    } else if (operands.length >= 2) {
      const set2 = expandSet(operands[1]);
      const map = {};
      for (let i = 0; i < set1.length; i++) {
        map[set1[i]] = set2[Math.min(i, set2.length - 1)];
      }
      text = text.split('').map(c => map[c] !== undefined ? map[c] : c).join('');
    }

    return { stdout: text, stderr: '', status: 0 };
  }
};

// 14. sed
export const sedCmd = {
  name: 'sed',
  platforms: ['linux'],
  flags: {
    n: { type: 'bool', status: 'implemented', long: 'quiet' },
    e: { type: 'string', status: 'implemented', long: 'expression' }
  },
  usage: 'sed [OPTION]... {script} [input-file]...',
  man: {
    name: 'sed - stream editor for filtering and transforming text',
    synopsis: 'sed [OPTION]... {script} [input-file]...',
    description: 'sed is a stream editor that performs basic text transformations on an input stream.',
    options: ['-n, --quiet   suppress automatic printing of pattern space', '-e script     add the script to the commands to be executed'],
    examples: ['sed "s/root/admin/g" users.txt', 'sed -n "1,5p" data.txt']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    let script = flags.e || (operands.length > 0 ? operands[0] : '');
    const fileOperands = flags.e ? operands : operands.slice(1);
    const inputs = readInputs(fileOperands, cwd, fs, stdin, user);

    if (!script) {
      return { stdout: '', stderr: 'sed: no input script provided\n', status: 1 };
    }

    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `sed: ${inp.name}: ${inp.error}\n`;
        status = 1;
        continue;
      }

      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      // Check for s/pattern/replacement/flags
      const sMatch = script.match(/^s([\/|#])(.*?)\1(.*?)\1([gipd]*)$/);
      if (sMatch) {
        const [, , pattern, replacement, sedFlags] = sMatch;
        const isGlobal = sedFlags.includes('g');
        const isIgnoreCase = sedFlags.includes('i');
        const isPrint = sedFlags.includes('p');
        // A student's expression can be malformed — `sed 's/(/x/'` is a normal
        // typo. Real sed answers with a message and exits 1; this used to throw
        // an uncaught SyntaxError out of the engine, and the terminal simply
        // ate the command with no output at all.
        let regex;
        try {
          regex = new RegExp(pattern, `${isGlobal ? 'g' : ''}${isIgnoreCase ? 'i' : ''}`);
        } catch {
          return {
            stdout: '',
            stderr: `sed: -e expression #1, char ${script.length}: unterminated or invalid regex\n`,
            status: 1
          };
        }

        for (const line of lines) {
          const matched = regex.test(line);
          const transformed = line.replace(regex, replacement);
          if (flags.n) {
            if (isPrint && matched) stdout += `${transformed}\n`;
          } else {
            stdout += `${transformed}\n`;
          }
        }
        continue;
      }

      // Check for line range print: e.g. "1,5p" or "3d"
      const rangeMatch = script.match(/^(\d+)?(?:,(\d+))?([pd])$/);
      if (rangeMatch) {
        const [, startStr, endStr, action] = rangeMatch;
        const start = startStr ? parseInt(startStr, 10) : 1;
        const end = endStr ? parseInt(endStr, 10) : (startStr ? start : lines.length);

        for (let lIdx = 1; lIdx <= lines.length; lIdx++) {
          const line = lines[lIdx - 1];
          const inRange = lIdx >= start && lIdx <= end;

          if (action === 'p') {
            if (inRange) stdout += `${line}\n`;
            else if (!flags.n) stdout += `${line}\n`;
          } else if (action === 'd') {
            if (!inRange) stdout += `${line}\n`;
          }
        }
        continue;
      }

      // Default passthrough
      stdout += `${lines.join('\n')}\n`;
    }

    return { stdout, stderr, status };
  }
};

// 15. awk
export const awkCmd = {
  name: 'awk',
  platforms: ['linux'],
  flags: {
    F: { type: 'string', status: 'implemented', long: 'field-separator' }
  },
  usage: 'awk [options] \'program\' [file ...]',
  man: {
    name: 'awk - pattern scanning and text processing language',
    synopsis: 'awk [options] \'program\' [file ...]',
    description: 'awk scans each input file for lines that match any of a set of patterns and executes specified actions.',
    options: ['-F fs   define input field separator'],
    examples: ['awk \'{print $1}\' access.log', 'awk -F: \'{print $1, $3}\' /etc/passwd']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'awk: missing program argument\n', status: 1 };
    }

    const script = operands[0];
    const fileOperands = operands.slice(1);
    const inputs = readInputs(fileOperands, cwd, fs, stdin, user);
    const delim = flags.F || null;

    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `awk: ${inp.name}: ${inp.error}\n`;
        status = 1;
        continue;
      }

      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      for (let nr = 1; nr <= lines.length; nr++) {
        const line = lines[nr - 1];
        const fields = delim ? line.split(delim) : line.trim().split(/\s+/);
        const nf = fields.length;

        // Check for pattern condition e.g. /pattern/{print ...} or just {print ...}
        let action = script;
        const patMatch = script.match(/^\/(.*?)\/\s*\{(.*)\}$/);
        if (patMatch) {
          const pat = new RegExp(patMatch[1]);
          if (!pat.test(line)) continue;
          action = `{${patMatch[2]}}`;
        }

        // Evaluate print statement: e.g. {print $1, $3} or {print $0} or {print NR, $0}
        const printMatch = action.match(/\{print\s*(.*?)\}/);
        if (printMatch) {
          const expr = printMatch[1].trim();
          if (!expr || expr === '$0') {
            stdout += `${line}\n`;
            continue;
          }

          // Split the argument list on commas that are NOT inside a quoted
          // string. Splitting on every comma broke `print $2 "," $4`, which is
          // the ordinary way to build a CSV line: the quoted comma tore the
          // expression in half and `$4` was printed literally.
          const args = [];
          let buf = '';
          let quote = null;
          for (const ch of expr) {
            if (quote) {
              buf += ch;
              if (ch === quote) quote = null;
            } else if (ch === '"' || ch === "'") {
              quote = ch;
              buf += ch;
            } else if (ch === ',') {
              args.push(buf.trim());
              buf = '';
            } else {
              buf += ch;
            }
          }
          if (buf.trim() !== '') args.push(buf.trim());

          // Within one argument, awk CONCATENATES juxtaposed terms with no
          // separator: `$1 "-" $2` is one string.
          const renderTerm = (term) => {
            if (term === 'NR') return String(nr);
            if (term === 'NF') return String(nf);
            if (term === '$0') return line;
            if (/^\$\d+$/.test(term)) {
              const fNum = parseInt(term.slice(1), 10);
              return (fNum >= 1 && fNum <= fields.length) ? fields[fNum - 1] : '';
            }
            if (/^".*"$|^'.*'$/.test(term)) return term.slice(1, -1);
            return term;
          };

          const renderArg = (arg) => {
            // Terms are quoted strings, $N, NR, NF, or bare words, in sequence.
            const parts = arg.match(/"[^"]*"|'[^']*'|\$\d+|\$0|NR|NF|[^\s]+/g) || [];
            return parts.map(renderTerm).join('');
          };

          stdout += `${args.map(renderArg).join(' ')}\n`;
        }
      }
    }

    return { stdout, stderr, status };
  }
};

// 16. tee
export const teeCmd = {
  name: 'tee',
  platforms: ['linux'],
  flags: {
    a: { type: 'bool', status: 'implemented', long: 'append' }
  },
  usage: 'tee [OPTION]... [FILE]...',
  man: {
    name: 'tee - read from standard input and write to standard output and files',
    synopsis: 'tee [OPTION]... [FILE]...',
    description: 'Copy standard input to each FILE, and also to standard output.',
    options: ['-a, --append   append to the given FILEs, do not overwrite'],
    examples: ['echo "data" | tee out.txt', 'cat file.txt | tee -a log.txt']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    let workingFs = { ...fs };
    const append = !!flags.a;
    const text = stdin || '';

    for (const op of operands) {
      const resolved = resolvePath(cwd, op, false);
      const writeRes = writeFile(workingFs, resolved, text, false, { append, user });
      if (writeRes.ok) {
        workingFs = writeRes.fs;
      }
    }

    return { stdout: text, stderr: '', status: 0, fs: workingFs };
  }
};

// 17. xargs
export const xargsCmd = {
  name: 'xargs',
  platforms: ['linux'],
  flags: {
    n: { type: 'number', status: 'implemented', long: 'max-args' },
    I: { type: 'string', status: 'implemented', long: 'replace' }
  },
  // Everything after the options belongs to the command being built, so the
  // generic parser must not try to claim `-n` in `xargs grep -n pattern`.
  passthroughArgs: true,
  usage: 'xargs [options] [command [initial-arguments]]',
  man: {
    name: 'xargs - build and execute command lines from standard input',
    synopsis: 'xargs [options] [command [initial-arguments]]',
    description: 'xargs reads items from standard input and executes the specified command with those items as arguments. The command keeps its own options.',
    options: ['-n MAX-ARGS   use at most MAX-ARGS arguments per command line', '-I REPLACE    replace occurrences of REPLACE with input items'],
    examples: ['find . -name "*.txt" | xargs grep "secret"', 'cat files.txt | xargs -n 1 md5sum', 'echo notes.txt | xargs grep -n TODO']
  },
  run({ argv, cwd, fs, stdin, isTTY, context }) {
    // xargs' own options stop at the command name; anything after it belongs
    // to that command (`xargs grep -n pattern` passes -n to grep, not xargs).
    let rest = argv.slice(1);
    let maxArgs = null;
    let replaceStr = null;

    while (rest.length > 0 && rest[0].startsWith('-') && rest[0].length > 1) {
      const opt = rest[0];
      const takeValue = (inline) => {
        if (inline !== '') return [inline, 1];
        if (rest.length < 2) return [null, 1];
        return [rest[1], 2];
      };

      if (opt === '-n' || opt === '--max-args' || /^-n./.test(opt) || opt.startsWith('--max-args=')) {
        const inline = opt.startsWith('--max-args=') ? opt.slice(11) : (opt.startsWith('-n') ? opt.slice(2) : '');
        const [val, consumed] = takeValue(inline);
        if (val === null || !/^\d+$/.test(val) || Number(val) < 1) {
          return { stdout: '', stderr: `xargs: invalid number for -n option\n`, status: 1 };
        }
        maxArgs = Number(val);
        rest = rest.slice(consumed);
        continue;
      }
      if (opt === '-I' || opt === '--replace' || /^-I./.test(opt) || opt.startsWith('--replace=')) {
        const inline = opt.startsWith('--replace=') ? opt.slice(10) : (opt.startsWith('-I') ? opt.slice(2) : '');
        const [val, consumed] = takeValue(inline);
        if (val === null) {
          return { stdout: '', stderr: `xargs: option requires an argument -- 'I'\n`, status: 1 };
        }
        replaceStr = val;
        rest = rest.slice(consumed);
        continue;
      }
      return {
        stdout: '',
        stderr: `xargs: invalid option -- '${opt.replace(/^-+/, '').charAt(0)}'\nUsage: xargs [OPTION]... COMMAND [INITIAL-ARGS]...\n`,
        status: 1
      };
    }

    const rawItems = (stdin || '').trim().split(/\s+/).filter(Boolean);
    const targetCmd = rest.length > 0 ? rest[0] : 'echo';
    const initialArgs = rest.slice(1);

    const { registry } = context;
    const cmdImpl = registry?.get(targetCmd, 'linux');
    if (!cmdImpl) {
      return { stdout: '', stderr: `xargs: ${targetCmd}: No such file or directory\n`, status: 127 };
    }

    const childCtx = { cwd, fs, stdin: '', env: context.env, user: context.user, isTTY, context };

    // -I runs the command once per input item, substituting the placeholder.
    if (replaceStr !== null) {
      let stdout = '';
      let stderr = '';
      let status = 0;
      let workingFs = fs;
      for (const item of rawItems) {
        const args = initialArgs.map(arg => arg.replaceAll(replaceStr, item));
        const res = runWrappedCommand(cmdImpl, targetCmd, args, { ...childCtx, fs: workingFs });
        stdout += res.stdout || '';
        stderr += res.stderr || '';
        if (res.fs) workingFs = res.fs;
        if (res.status) status = res.status;
      }
      return { stdout, stderr, status, fs: workingFs };
    }

    // -n batches the items; without it every item goes on one command line.
    const batchSize = maxArgs || Math.max(rawItems.length, 1);
    const batches = [];
    for (let i = 0; i < rawItems.length; i += batchSize) {
      batches.push(rawItems.slice(i, i + batchSize));
    }
    if (batches.length === 0) batches.push([]);

    let stdout = '';
    let stderr = '';
    let status = 0;
    let workingFs = fs;
    for (const batch of batches) {
      const res = runWrappedCommand(cmdImpl, targetCmd, [...initialArgs, ...batch], { ...childCtx, fs: workingFs });
      stdout += res.stdout || '';
      stderr += res.stderr || '';
      if (res.fs) workingFs = res.fs;
      if (res.status) status = res.status;
    }

    return { stdout, stderr, status, fs: workingFs };
  }
};

// 18. diff
/**
 * Whole-line diff by longest common subsequence. Files in this simulator are
 * small, so the O(n*m) table is fine. `keyA`/`keyB` are what gets COMPARED
 * (so -w can compare whitespace-insensitively) while `a`/`b` are what gets
 * PRINTED.
 */
function diffOps(a, b, keyA = a, keyB = b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = keyA[i] === keyB[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (keyA[i] === keyB[j]) {
      ops.push({ op: ' ', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ op: '-', text: a[i] });
      i++;
    } else {
      ops.push({ op: '+', text: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ op: '-', text: a[i++] });
  while (j < m) ops.push({ op: '+', text: b[j++] });
  return ops;
}

const diffRange = (start, end) => (start === end ? String(start) : `${start},${end}`);

// diff's default output: "3c3" / "2a3" / "4d3" headers with < and > bodies.
function normalDiff(ops) {
  let out = '';
  let lineA = 1;
  let lineB = 1;
  let k = 0;

  while (k < ops.length) {
    if (ops[k].op === ' ') {
      lineA++;
      lineB++;
      k++;
      continue;
    }

    const dels = [];
    const adds = [];
    const startA = lineA;
    const startB = lineB;
    while (k < ops.length && ops[k].op !== ' ') {
      if (ops[k].op === '-') {
        dels.push(ops[k].text);
        lineA++;
      } else {
        adds.push(ops[k].text);
        lineB++;
      }
      k++;
    }

    if (dels.length > 0 && adds.length > 0) {
      out += `${diffRange(startA, lineA - 1)}c${diffRange(startB, lineB - 1)}\n`;
      for (const line of dels) out += `< ${line}\n`;
      out += '---\n';
      for (const line of adds) out += `> ${line}\n`;
    } else if (dels.length > 0) {
      out += `${diffRange(startA, lineA - 1)}d${lineB - 1}\n`;
      for (const line of dels) out += `< ${line}\n`;
    } else {
      out += `${startA - 1}a${diffRange(startB, lineB - 1)}\n`;
      for (const line of adds) out += `> ${line}\n`;
    }
  }

  return out;
}

// diff -u output: @@ hunks with three lines of surrounding context.
function unifiedDiff(ops, nameA, nameB, context = 3) {
  const changed = ops.map(o => o.op !== ' ');
  const keep = new Array(ops.length).fill(false);
  for (let i = 0; i < ops.length; i++) {
    if (!changed[i]) continue;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) {
      keep[j] = true;
    }
  }

  const stamp = '2026-08-17 09:30:00.000000000 +0000';
  let out = `--- ${nameA}\t${stamp}\n+++ ${nameB}\t${stamp}\n`;
  let lineA = 1;
  let lineB = 1;
  let i = 0;

  while (i < ops.length) {
    if (!keep[i]) {
      if (ops[i].op !== '+') lineA++;
      if (ops[i].op !== '-') lineB++;
      i++;
      continue;
    }

    const startA = lineA;
    const startB = lineB;
    let countA = 0;
    let countB = 0;
    let body = '';
    while (i < ops.length && keep[i]) {
      const { op, text } = ops[i];
      body += `${op}${text}\n`;
      if (op !== '+') { countA++; lineA++; }
      if (op !== '-') { countB++; lineB++; }
      i++;
    }

    out += `@@ -${countA === 0 ? startA - 1 : startA},${countA} +${countB === 0 ? startB - 1 : startB},${countB} @@\n`;
    out += body;
  }

  return out;
}

// 18. diff
export const diffCmd = {
  name: 'diff',
  platforms: ['linux'],
  flags: {
    u: { type: 'bool', status: 'implemented', long: 'unified' },
    q: { type: 'bool', status: 'implemented', long: 'brief' },
    w: { type: 'bool', status: 'implemented', long: 'ignore-all-space' }
  },
  usage: 'diff [OPTION]... FILES',
  man: {
    name: 'diff - compare files line by line',
    synopsis: 'diff [OPTION]... FILE1 FILE2',
    description: 'Compare FILE1 and FILE2 line by line. The default output uses < and > with NcN headers; -u asks for the unified format instead.',
    options: [
      '-u, --unified   output unified diff format (3 lines of context)',
      '-q, --brief     report only when files differ',
      '-w, --ignore-all-space  ignore all white space'
    ],
    examples: ['diff old.txt new.txt', 'diff -u file1.conf file2.conf', 'diff -q a.txt b.txt']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'diff: missing operand after \'' + (operands[0] || '') + '\'\n', status: 2 };
    }

    const res1 = readFile(fs, resolvePath(cwd, operands[0], false), false, { user });
    const res2 = readFile(fs, resolvePath(cwd, operands[1], false), false, { user });

    if (!res1.ok) return { stdout: '', stderr: `diff: ${operands[0]}: ${res1.error}\n`, status: 2 };
    if (!res2.ok) return { stdout: '', stderr: `diff: ${operands[1]}: ${res2.error}\n`, status: 2 };

    const splitLines = (text) => {
      const lines = text.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      return lines;
    };

    const lines1 = splitLines(res1.content);
    const lines2 = splitLines(res2.content);
    const normalize = (line) => line.replace(/\s+/g, ' ').trim();
    const keys1 = flags.w ? lines1.map(normalize) : lines1;
    const keys2 = flags.w ? lines2.map(normalize) : lines2;

    const ops = diffOps(lines1, lines2, keys1, keys2);
    if (!ops.some(o => o.op !== ' ')) {
      return { stdout: '', stderr: '', status: 0 };
    }

    if (flags.q) {
      return { stdout: `Files ${operands[0]} and ${operands[1]} differ\n`, stderr: '', status: 1 };
    }

    const stdout = flags.u
      ? unifiedDiff(ops, operands[0], operands[1])
      : normalDiff(ops);

    return { stdout, stderr: '', status: 1 };
  }
};

// 19. nl
export const nlCmd = {
  name: 'nl',
  platforms: ['linux'],
  flags: {
    b: { type: 'string', status: 'implemented', long: 'body-numbering' },
    w: { type: 'number', status: 'implemented', long: 'number-width' }
  },
  usage: 'nl [OPTION]... [FILE]...',
  man: {
    name: 'nl - number lines of files',
    synopsis: 'nl [OPTION]... [FILE]...',
    description: 'Write each FILE to standard output, with line numbers added.',
    options: ['-ba   number all lines', '-bt   number only non-empty lines (default)', '-w N  use N characters for line numbers'],
    examples: ['nl access.log', 'nl -ba notes.txt']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;
    const width = Number(flags.w || 6);
    const numberAll = flags.b === 'a';
    let lineNum = 1;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `nl: ${inp.name}: ${inp.error}\n`;
        status = 1;
        continue;
      }
      const lines = inp.content.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      for (const line of lines) {
        if (!numberAll && line.trim() === '') {
          stdout += `${''.padStart(width + 2, ' ')}${line}\n`;
        } else {
          stdout += `${String(lineNum++).padStart(width, ' ')}\t${line}\n`;
        }
      }
    }

    return { stdout, stderr, status };
  }
};

// 20. strings
export const stringsCmd = {
  name: 'strings',
  platforms: ['linux'],
  flags: {
    n: { type: 'number', status: 'implemented', long: 'bytes' },
    a: { type: 'bool', status: 'implemented', long: 'all' }
  },
  usage: 'strings [option(s)] [file(s)]',
  man: {
    name: 'strings - print the sequences of printable characters in files',
    synopsis: 'strings [option(s)] [file(s)]',
    description: 'For each file specified, strings prints printable character sequences that are at least 4 characters long.',
    options: [
      '-n MIN-LEN   locate and print any sequence at least MIN-LEN characters long',
      '-a, --all    scan the whole file (already the default here: the simulated filesystem stores no section table to skip)'
    ],
    examples: ['strings binary_data', 'strings -n 6 evidence.bin']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    // -a asks strings to scan the entire file rather than only the loaded
    // sections of an object file. Simulated files have no section table, so
    // every scan is already a whole-file scan and -a changes nothing.
    const inputs = readInputs(operands, cwd, fs, stdin, user);
    const minLen = Number(flags.n || 4);
    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `strings: '${inp.name}': ${inp.error || 'No such file'}\n`;
        status = 1;
        continue;
      }

      const regex = new RegExp(`[a-zA-Z0-9_\\-\\.\\/\\:\\s\\[\\]\\{\\}]{${minLen},}`, 'g');
      const matches = inp.content.match(regex) || [];
      for (const m of matches) {
        const trimmed = m.trim();
        if (trimmed.length >= minLen) {
          stdout += `${trimmed}\n`;
        }
      }
    }

    return { stdout, stderr, status };
  }
};

// 21. file
export const fileCmd = {
  name: 'file',
  platforms: ['linux'],
  flags: {
    b: { type: 'bool', status: 'implemented', long: 'brief' },
    i: { type: 'bool', status: 'implemented', long: 'mime' }
  },
  usage: 'file [OPTION...] [FILE...]',
  man: {
    name: 'file - determine file type',
    synopsis: 'file [OPTION...] [FILE...]',
    description: 'file tests each argument in an attempt to classify it.',
    options: ['-b, --brief   do not prepend filenames to output lines', '-i, --mime    output MIME type strings'],
    examples: ['file mystery_file', 'file -b evidence.img']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'Usage: file [-b] [file...]\n', status: 1 };
    }

    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const op of operands) {
      const resolved = resolvePath(cwd, op, false);
      const st = stat(fs, resolved, false);

      if (!st.exists) {
        stderr += `file: cannot open '${op}' (No such file or directory)\n`;
        status = 1;
        continue;
      }

      let typeDesc = 'ASCII text';
      if (st.isDir) {
        typeDesc = 'directory';
      } else if (st.node?.fileType) {
        typeDesc = st.node.fileType;
      } else if (st.node?.content && /[\x00-\x08\x0E-\x1F]/.test(st.node.content)) {
        typeDesc = 'data';
      }

      if (flags.i) {
        typeDesc = st.isDir ? 'inode/directory; charset=binary' : 'text/plain; charset=us-ascii';
      }

      if (flags.b) {
        stdout += `${typeDesc}\n`;
      } else {
        stdout += `${op}: ${typeDesc}\n`;
      }
    }

    return { stdout, stderr, status };
  }
};

/**
 * Shared implementation of `md5sum -c` / `sha256sum -c`: read lines of
 * "<digest>  <name>" from each operand and re-hash every named file.
 */
function checkSums({ tool, hashOf, operands, cwd, fs, stdin, user }) {
  const listings = readInputs(operands, cwd, fs, stdin, user);
  let stdout = '';
  let stderr = '';
  let status = 0;
  let mismatches = 0;
  let unreadable = 0;
  let parsed = 0;

  for (const listing of listings) {
    if (!listing.ok) {
      stderr += `${tool}: ${listing.name}: ${listing.error || 'No such file or directory'}\n`;
      status = 1;
      continue;
    }

    for (const rawLine of listing.content.split('\n')) {
      const line = rawLine.trim();
      if (line === '') continue;

      const match = line.match(/^([0-9a-fA-F]+)\s+\*?(.+)$/);
      if (!match) {
        stderr += `${tool}: ${listing.name}: no properly formatted checksum lines found\n`;
        status = 1;
        continue;
      }
      parsed++;

      const [, expected, name] = match;
      const target = readFile(fs, resolvePath(cwd, name, false), false, { user });
      if (!target.ok) {
        stdout += `${name}: FAILED open or read\n`;
        stderr += `${tool}: ${name}: No such file or directory\n`;
        unreadable++;
        status = 1;
        continue;
      }

      if (hashOf(target).toLowerCase() === expected.toLowerCase()) {
        stdout += `${name}: OK\n`;
      } else {
        stdout += `${name}: FAILED\n`;
        mismatches++;
        status = 1;
      }
    }
  }

  if (unreadable > 0) {
    stderr += `${tool}: WARNING: ${unreadable} listed file could not be read\n`;
  }
  if (mismatches > 0) {
    stderr += `${tool}: WARNING: ${mismatches} computed checksum${mismatches === 1 ? '' : 's'} did NOT match\n`;
  }
  if (parsed === 0 && status === 0) {
    stderr += `${tool}: no properly formatted checksum lines found\n`;
    status = 1;
  }

  return { stdout, stderr, status };
}

// 22. md5sum
export const md5sumCmd = {
  name: 'md5sum',
  platforms: ['linux'],
  flags: {
    c: { type: 'bool', status: 'implemented', long: 'check' }
  },
  usage: 'md5sum [OPTION]... [FILE]...',
  man: {
    name: 'md5sum - compute and check MD5 message digest',
    synopsis: 'md5sum [OPTION]... [FILE]...',
    description: 'Print or check MD5 (128-bit) checksums.',
    options: ['-c, --check   read MD5 sums from the FILEs and check them'],
    examples: ['md5sum evidence.img', 'md5sum file1.txt file2.txt', 'md5sum -c sums.md5']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    if (flags.c || flags.check) {
      return checkSums({
        tool: 'md5sum',
        hashOf: (res) => res.node?.md5 || md5(res.content),
        operands, cwd, fs, stdin, user
      });
    }

    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `md5sum: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }

      const hash = inp.node?.md5 || md5(inp.content);
      const namePart = inp.isStdin ? '-' : inp.name;
      stdout += `${hash}  ${namePart}\n`;
    }

    return { stdout, stderr, status };
  }
};

// 23. sha256sum
export const sha256sumCmd = {
  name: 'sha256sum',
  platforms: ['linux'],
  flags: {
    c: { type: 'bool', status: 'implemented', long: 'check' }
  },
  usage: 'sha256sum [OPTION]... [FILE]...',
  man: {
    name: 'sha256sum - compute and check SHA256 message digest',
    synopsis: 'sha256sum [OPTION]... [FILE]...',
    description: 'Print or check SHA256 (256-bit) checksums.',
    options: ['-c, --check   read SHA256 sums from the FILEs and check them'],
    examples: ['sha256sum evidence.img', 'sha256sum file.txt', 'sha256sum -c sums.sha256']
  },
  run({ flags, operands, cwd, fs, stdin, user }) {
    if (flags.c || flags.check) {
      return checkSums({
        tool: 'sha256sum',
        hashOf: (res) => res.node?.sha256 || sha256Sync(res.content),
        operands, cwd, fs, stdin, user
      });
    }

    const inputs = readInputs(operands, cwd, fs, stdin, user);
    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const inp of inputs) {
      if (!inp.ok) {
        stderr += `sha256sum: ${inp.name}: ${inp.error || 'No such file or directory'}\n`;
        status = 1;
        continue;
      }

      const hash = inp.node?.sha256 || sha256Sync(inp.content);
      const namePart = inp.isStdin ? '-' : inp.name;
      stdout += `${hash}  ${namePart}\n`;
    }

    return { stdout, stderr, status };
  }
};

// 24. mkdir
export const mkdirCmd = {
  name: 'mkdir',
  platforms: ['linux'],
  flags: {
    p: { type: 'bool', status: 'implemented', long: 'parents' },
    m: { type: 'string', status: 'implemented', long: 'mode' }
  },
  usage: 'mkdir [OPTION]... DIRECTORY...',
  man: {
    name: 'mkdir - make directories',
    synopsis: 'mkdir [OPTION]... DIRECTORY...',
    description: 'Create the DIRECTORY(ies), if they do not already exist.',
    options: ['-p, --parents   no error if existing, make parent directories as needed', '-m, --mode=MODE set file mode (as in chmod)'],
    examples: ['mkdir projects', 'mkdir -p /tmp/test/sub']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'mkdir: missing operand\n', status: 1 };
    }

    let workingFs = { ...fs };
    let stderr = '';
    let status = 0;

    for (const op of operands) {
      const resolved = resolvePath(cwd, op, false);
      const res = mkdir(workingFs, resolved, false, {
        recursive: !!flags.p,
        user,
        mode: flags.m ? parseInt(flags.m, 8) : 0o755
      });
      if (!res.ok) {
        stderr += `mkdir: cannot create directory '${op}': ${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 25. rmdir
export const rmdirCmd = {
  name: 'rmdir',
  platforms: ['linux'],
  flags: {
    p: { type: 'bool', status: 'implemented', long: 'parents' }
  },
  usage: 'rmdir [OPTION]... DIRECTORY...',
  man: {
    name: 'rmdir - remove empty directories',
    synopsis: 'rmdir [OPTION]... DIRECTORY...',
    description: 'Remove the DIRECTORY(ies), if they are empty.',
    options: ['-p, --parents   remove DIRECTORY and its ancestors'],
    examples: ['rmdir old_dir']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'rmdir: missing operand\n', status: 1 };
    }

    let workingFs = { ...fs };
    let stderr = '';
    let status = 0;

    // NOTE: vfs/ops.js rmdir() forwards to unlink() WITHOUT recursive:true, and
    // unlink() refuses every directory unless recursive is set — so ops.rmdir()
    // can never succeed. The emptiness and type checks are therefore done here
    // and the removal is issued directly. (The ops.js bug still needs fixing
    // for any other caller.)
    const removeEmptyDir = (fsMap, path) => {
      const st = stat(fsMap, path, false);
      if (!st.exists) return { ok: false, error: `No such file or directory: ${path}` };
      if (!st.isDir) return { ok: false, error: `Not a directory: ${path}` };
      if ((st.node.contents || []).length > 0) return { ok: false, error: `Directory not empty: ${path}` };
      return unlink(fsMap, path, false, { recursive: true, user });
    };

    for (const op of operands) {
      let resolved = resolvePath(cwd, op, false);
      let label = op;
      const res = removeEmptyDir(workingFs, resolved);
      if (!res.ok) {
        stderr += `rmdir: failed to remove '${label}': ${res.error}\n`;
        status = 1;
        continue;
      }
      workingFs = res.fs;

      // -p also removes each parent that the removal has just emptied, and
      // reports the ancestor's own name when one of them cannot be removed.
      if (flags.p) {
        let parentLabel = label.replace(/\/+$/, '');
        while (parentLabel.includes('/')) {
          parentLabel = parentLabel.slice(0, parentLabel.lastIndexOf('/'));
          if (parentLabel === '' || parentLabel === '.' || parentLabel === '..') break;
          resolved = resolvePath(cwd, parentLabel, false);
          const upRes = removeEmptyDir(workingFs, resolved);
          if (!upRes.ok) {
            stderr += `rmdir: failed to remove '${parentLabel}': ${upRes.error}\n`;
            status = 1;
            break;
          }
          workingFs = upRes.fs;
        }
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 26. touch
export const touchCmd = {
  name: 'touch',
  platforms: ['linux'],
  flags: {
    // -a changes only the ACCESS time. The simulated filesystem stores mtime
    // and nothing else, so honouring -a is impossible; say so rather than
    // silently updating the modification time the student asked to preserve.
    a: { type: 'bool', status: 'notSimulated' },
    m: { type: 'bool', status: 'implemented' }
  },
  usage: 'touch [OPTION]... FILE...',
  man: {
    name: 'touch - change file timestamps or create empty files',
    synopsis: 'touch [OPTION]... FILE...',
    description: 'Update the access and modification times of each FILE to the current time. A FILE that does not exist is created empty.',
    options: ['-m   change only the modification time (the only timestamp this simulator keeps)'],
    examples: ['touch file.txt', 'touch /tmp/marker.log']
  },
  run({ operands, cwd, fs, user }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'touch: missing file operand\n', status: 1 };
    }

    let workingFs = { ...fs };
    let stderr = '';
    let status = 0;

    for (const op of operands) {
      const resolved = resolvePath(cwd, op, false);
      const res = touch(workingFs, resolved, false, { user });
      if (!res.ok) {
        stderr += `touch: cannot touch '${op}': ${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 27. cp
export const cpCmd = {
  name: 'cp',
  platforms: ['linux'],
  flags: {
    r: { type: 'bool', status: 'implemented', long: 'recursive' },
    R: { type: 'bool', status: 'implemented' },
    f: { type: 'bool', status: 'implemented', long: 'force' },
    // -i asks a yes/no question on the terminal. This shell runs one command
    // and returns; there is nowhere for the student to answer, so pretending
    // -i was honoured would be a lie about whether the file was overwritten.
    i: { type: 'bool', status: 'notSimulated', long: 'interactive' }
  },
  usage: 'cp [OPTION]... SOURCE... DEST',
  man: {
    name: 'cp - copy files and directories',
    synopsis: 'cp [OPTION]... SOURCE... DEST',
    description: 'Copy SOURCE to DEST, or multiple SOURCE(s) to DIRECTORY.',
    options: ['-r, -R, --recursive   copy directories recursively', '-f, --force          if an existing destination file cannot be opened, remove it and retry'],
    examples: ['cp notes.txt backup.txt', 'cp -r Documents /tmp/backup']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'cp: missing destination file operand\n', status: 1 };
    }

    let workingFs = { ...fs };
    const dest = operands[operands.length - 1];
    const sources = operands.slice(0, operands.length - 1);
    let stderr = '';
    let status = 0;

    for (const src of sources) {
      const srcResolved = resolvePath(cwd, src, false);
      const destResolved = resolvePath(cwd, dest, false);

      // -f: if the destination cannot be opened for writing, remove it and
      // retry, exactly as GNU cp does.
      if (flags.f) {
        const destSt = stat(workingFs, destResolved, false);
        if (destSt.exists && destSt.isFile && !hasPermission(destSt.node, 'w', user, false)) {
          const rmRes = unlink(workingFs, destResolved, false, { force: true, user });
          if (rmRes.ok) workingFs = rmRes.fs;
        }
      }

      const res = copyFile(workingFs, srcResolved, destResolved, false, {
        recursive: !!(flags.r || flags.R),
        user
      });
      if (!res.ok) {
        stderr += `${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 28. mv
export const mvCmd = {
  name: 'mv',
  platforms: ['linux'],
  flags: {
    f: { type: 'bool', status: 'implemented', long: 'force' },
    // See cp -i: there is no terminal to answer the prompt on.
    i: { type: 'bool', status: 'notSimulated', long: 'interactive' }
  },
  usage: 'mv [OPTION]... SOURCE... DEST',
  man: {
    name: 'mv - move (rename) files',
    synopsis: 'mv [OPTION]... SOURCE... DEST',
    description: 'Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.',
    options: ['-f, --force   do not prompt before overwriting'],
    examples: ['mv old_name.txt new_name.txt', 'mv file.txt Documents/']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'mv: missing destination file operand\n', status: 1 };
    }

    let workingFs = { ...fs };
    const dest = operands[operands.length - 1];
    const sources = operands.slice(0, operands.length - 1);
    let stderr = '';
    let status = 0;

    for (const src of sources) {
      const srcResolved = resolvePath(cwd, src, false);
      const destResolved = resolvePath(cwd, dest, false);

      // -f: overwrite an unwritable destination instead of refusing.
      if (flags.f) {
        const destSt = stat(workingFs, destResolved, false);
        if (destSt.exists && destSt.isFile && !hasPermission(destSt.node, 'w', user, false)) {
          const rmRes = unlink(workingFs, destResolved, false, { force: true, user });
          if (rmRes.ok) workingFs = rmRes.fs;
        }
      }

      const res = moveFile(workingFs, srcResolved, destResolved, false, { user });
      if (!res.ok) {
        stderr += `mv: cannot move '${src}' to '${dest}': ${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 29. rm
export const rmCmd = {
  name: 'rm',
  platforms: ['linux'],
  flags: {
    r: { type: 'bool', status: 'implemented', long: 'recursive' },
    R: { type: 'bool', status: 'implemented' },
    f: { type: 'bool', status: 'implemented', long: 'force' },
    // See cp -i: a confirmation prompt needs a terminal this shell has not got.
    i: { type: 'bool', status: 'notSimulated', long: 'interactive' }
  },
  usage: 'rm [OPTION]... [FILE]...',
  man: {
    name: 'rm - remove files or directories',
    synopsis: 'rm [OPTION]... [FILE]...',
    description: 'rm removes each specified file. By default, it does not remove directories.',
    options: [
      '-r, -R, --recursive   remove directories and their contents recursively',
      '-f, --force           ignore nonexistent files and arguments, never prompt'
    ],
    examples: ['rm file.txt', 'rm -r old_folder', 'rm -rf /tmp/scratch']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length === 0) {
      if (flags.f) return { stdout: '', stderr: '', status: 0 };
      return { stdout: '', stderr: 'rm: missing operand\n', status: 1 };
    }

    let workingFs = { ...fs };
    let stderr = '';
    let status = 0;

    for (const op of operands) {
      const resolved = resolvePath(cwd, op, false);
      const res = unlink(workingFs, resolved, false, {
        recursive: !!(flags.r || flags.R),
        force: !!flags.f,
        user
      });
      if (!res.ok) {
        stderr += `rm: cannot remove '${op}': ${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 30. chmod
export const chmodCmd = {
  name: 'chmod',
  platforms: ['linux'],
  flags: {
    R: { type: 'bool', status: 'implemented', long: 'recursive' }
  },
  usage: 'chmod [OPTION]... MODE[,MODE]... FILE...',
  man: {
    name: 'chmod - change file mode bits',
    synopsis: 'chmod [OPTION]... MODE[,MODE]... FILE...',
    description: 'chmod changes the file mode bits of each given file according to MODE (octal or symbolic).',
    options: ['-R, --recursive   change files and directories recursively'],
    examples: ['chmod 755 script.sh', 'chmod 600 secrets.txt', 'chmod u+x tool']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'chmod: missing operand\n', status: 1 };
    }

    const modeStr = operands[0];
    const targets = operands.slice(1);
    let workingFs = { ...fs };
    let stderr = '';
    let status = 0;

    for (const target of targets) {
      const resolved = resolvePath(cwd, target, false);
      const res = chmod(workingFs, resolved, modeStr, false, {
        recursive: !!flags.R,
        user
      });
      if (!res.ok) {
        stderr += `${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 31. chown
export const chownCmd = {
  name: 'chown',
  platforms: ['linux'],
  flags: {
    R: { type: 'bool', status: 'implemented', long: 'recursive' }
  },
  usage: 'chown [OPTION]... [OWNER][:[GROUP]] FILE...',
  man: {
    name: 'chown - change file owner and group',
    synopsis: 'chown [OPTION]... [OWNER][:[GROUP]] FILE...',
    description: 'chown changes the user and/or group ownership of each given FILE.',
    options: ['-R, --recursive   operate on files and directories recursively'],
    examples: ['chown student:student file.txt', 'sudo chown root:root /etc/shadow']
  },
  run({ flags, operands, cwd, fs, user }) {
    if (operands.length < 2) {
      return { stdout: '', stderr: 'chown: missing operand\n', status: 1 };
    }

    const ownerGroup = operands[0];
    const targets = operands.slice(1);
    let workingFs = { ...fs };
    let stderr = '';
    let status = 0;

    for (const target of targets) {
      const resolved = resolvePath(cwd, target, false);
      const res = chown(workingFs, resolved, ownerGroup, false, {
        recursive: !!flags.R,
        user
      });
      if (!res.ok) {
        stderr += `${res.error}\n`;
        status = 1;
      } else {
        workingFs = res.fs;
      }
    }

    return { stdout: '', stderr, status, fs: workingFs };
  }
};

// 32. stat
export const statCmd = {
  name: 'stat',
  platforms: ['linux'],
  flags: {
    c: { type: 'string', status: 'implemented', long: 'format' }
  },
  usage: 'stat [OPTION]... FILE...',
  man: {
    name: 'stat - display file or file system status',
    synopsis: 'stat [OPTION]... FILE...',
    description: 'Display file or file system status.',
    options: ['-c, --format=FORMAT   use the specified FORMAT instead of the default'],
    examples: ['stat access.log', 'stat -c "%a %n" /etc/passwd']
  },
  run({ flags, operands, cwd, fs }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'stat: missing operand\n', status: 1 };
    }

    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const op of operands) {
      const resolved = resolvePath(cwd, op, false);
      const st = stat(fs, resolved, false);
      if (!st.exists) {
        stderr += `stat: cannot stat '${op}': No such file or directory\n`;
        status = 1;
        continue;
      }

      if (flags.c) {
        let fmt = flags.c;
        fmt = fmt.replace(/%n/g, op);
        fmt = fmt.replace(/%a/g, (st.mode & 0o777).toString(8));
        fmt = fmt.replace(/%A/g, st.modeStr);
        fmt = fmt.replace(/%s/g, String(st.size));
        fmt = fmt.replace(/%U/g, st.owner);
        fmt = fmt.replace(/%G/g, st.group);
        stdout += `${fmt}\n`;
      } else {
        stdout += `  File: ${op}\n`;
        stdout += `  Size: ${st.size}\t\tBlocks: 8\t   IO Block: 4096   ${st.isDir ? 'directory' : 'regular file'}\n`;
        stdout += `Device: 801h/2049d\tInode: 1048576\t   Links: 1\n`;
        const octalMode = (st.mode & 0o777).toString(8).padStart(4, '0');
        stdout += `Access: (${octalMode}/${st.modeStr})\tUid: ( 1000/ ${st.owner})\tGid: ( 1000/ ${st.group})\n`;
        stdout += `Access: 2026-08-17 09:30:00.000000000 +0000\nModify: 2026-08-17 09:30:00.000000000 +0000\nChange: 2026-08-17 09:30:00.000000000 +0000\n`;
      }
    }

    return { stdout, stderr, status };
  }
};

// 33. du
export const duCmd = {
  name: 'du',
  platforms: ['linux'],
  flags: {
    h: { type: 'bool', status: 'implemented', long: 'human-readable' },
    s: { type: 'bool', status: 'implemented', long: 'summarize' },
    a: { type: 'bool', status: 'implemented', long: 'all' }
  },
  usage: 'du [OPTION]... [FILE]...',
  man: {
    name: 'du - estimate file space usage',
    synopsis: 'du [OPTION]... [FILE]...',
    description: 'Summarize disk usage of the set of FILEs, recursively for directories. Without -s, every subdirectory is listed before its parent.',
    options: [
      '-h, --human-readable   print sizes in human readable format (e.g., 1K 234M 2G)',
      '-s, --summarize        display only a total for each argument',
      '-a, --all              write counts for all files, not just directories'
    ],
    examples: ['du -sh Documents', 'du -h', 'du -a Documents']
  },
  run({ flags, operands, cwd, fs }) {
    const targets = operands.length > 0 ? operands : ['.'];
    const summarize = !!(flags.s || flags.summarize);
    const listFiles = !!(flags.a || flags.all);
    let stdout = '';
    let stderr = '';
    let status = 0;

    if (summarize && listFiles) {
      return { stdout: '', stderr: 'du: cannot both summarize and show all entries\n', status: 1 };
    }

    // du reports allocated space, not file length: an ext4 filesystem hands
    // out whole 4 KiB blocks, so a 6-byte file costs 4K and an empty one 0.
    // The figures are printed in 1K units, which is du's default.
    const blocksOf = (bytes) => Math.ceil((Number(bytes) || 0) / 4096) * 4;
    const render = (kb) => (flags.h || flags['human-readable'] ? humanSize(kb * 1024) : String(kb));

    for (const target of targets) {
      const resolved = resolvePath(cwd, target, false);
      const st = stat(fs, resolved, false);
      if (!st.exists) {
        stderr += `du: cannot access '${target}': No such file or directory\n`;
        status = 1;
        continue;
      }

      const label = target.replace(/\/+$/, '') || target;

      if (!st.isDir) {
        stdout += `${render(blocksOf(st.size))}\t${label}\n`;
        continue;
      }

      // Post-order walk: children are reported before the directory that
      // contains them, which is the order real du prints.
      const walk = (dirKey, displayPath) => {
        let total = blocksOf(4096);
        let out = '';
        const node = fs[dirKey];
        const entries = [...(node?.contents || [])].sort((x, y) => x.localeCompare(y));

        for (const entry of entries) {
          const childKey = resolvePath(dirKey, entry, false);
          const childSt = stat(fs, childKey, false);
          if (!childSt.exists) continue;
          const childDisplay = `${displayPath}/${entry}`;

          if (childSt.isDir) {
            const sub = walk(childKey, childDisplay);
            total += sub.total;
            out += sub.out;
          } else {
            const kb = blocksOf(childSt.size);
            total += kb;
            if (listFiles && !summarize) out += `${render(kb)}\t${childDisplay}\n`;
          }
        }

        if (!summarize) out += `${render(total)}\t${displayPath}\n`;
        return { total, out };
      };

      const res = walk(resolved, label);
      stdout += summarize ? `${render(res.total)}\t${label}\n` : res.out;
    }

    return { stdout, stderr, status };
  }
};

// 34. df
export const dfCmd = {
  name: 'df',
  platforms: ['linux'],
  flags: {
    h: { type: 'bool', status: 'implemented', long: 'human-readable' }
  },
  usage: 'df [OPTION]... [FILE]...',
  man: {
    name: 'df - report file system disk space usage',
    synopsis: 'df [OPTION]... [FILE]...',
    description: 'df displays the amount of disk space available on the file system.',
    options: ['-h, --human-readable   print sizes in powers of 1024 (e.g., 1023M)'],
    examples: ['df -h']
  },
  run({ flags }) {
    const human = !!flags.h;
    const lines = human ? [
      'Filesystem      Size  Used Avail Use% Mounted on',
      '/dev/root        20G  4.2G   15G  22% /',
      'tmpfs           2.0G     0  2.0G   0% /tmp',
      'none             20G  4.2G   15G  22% /mnt/c'
    ] : [
      'Filesystem     1K-blocks    Used Available Use% Mounted on',
      '/dev/root       20971520 4404019  15728640  22% /',
      'tmpfs            2097152       0   2097152   0% /tmp',
      'none            20971520 4404019  15728640  22% /mnt/c'
    ];
    return { stdout: `${lines.join('\n')}\n`, stderr: '', status: 0 };
  }
};

// 35. echo
export const echoCmd = {
  name: 'echo',
  platforms: ['linux'],
  flags: {
    n: { type: 'bool', status: 'implemented' },
    e: { type: 'bool', status: 'implemented' },
    E: { type: 'bool', status: 'implemented' }
  },
  // bash's echo parses its own options: they must be leading, must consist
  // only of n/e/E, and stop at the first other word (`echo hi -n` prints
  // "hi -n"). The generic parser cannot express that, so echo reads argv.
  passthroughArgs: true,
  usage: 'echo [SHORT-OPTION]... [STRING]...',
  man: {
    name: 'echo - display a line of text',
    synopsis: 'echo [SHORT-OPTION]... [STRING]...',
    description: 'Echo the STRING(s) to standard output.',
    options: [
      '-n   do not output the trailing newline',
      '-e   enable interpretation of backslash escapes (e.g. \\n, \\t)',
      '-E   disable interpretation of backslash escapes (default)'
    ],
    examples: ['echo "Hello world"', 'echo -n "flag:"', 'echo -e "a\\tb"', 'echo $HOME']
  },
  run({ argv }) {
    const words = argv.slice(1);
    let idx = 0;
    let noNewline = false;
    let escapes = false;

    // Leading -n/-e/-E only, in any combination; the later letter wins.
    while (idx < words.length && /^-[neE]+$/.test(words[idx])) {
      for (const ch of words[idx].slice(1)) {
        if (ch === 'n') noNewline = true;
        else if (ch === 'e') escapes = true;
        else if (ch === 'E') escapes = false;
      }
      idx++;
    }

    let text = words.slice(idx).join(' ');
    if (escapes) {
      text = text
        .replace(/\\\\/g, '\u0000')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\u0000/g, '\\');
    }

    const stdout = noNewline ? text : `${text}\n`;
    return { stdout, stderr: '', status: 0 };
  }
};

// 36. test and [
export const testCmd = {
  name: 'test',
  aliases: ['['],
  platforms: ['linux'],
  flags: {},
  // Every word after `test` is part of the EXPRESSION, not an option of test
  // itself: `test -f x` must reach run() as -f and x, so the generic flag
  // parser (which would reject -f as an invalid option) is bypassed.
  passthroughArgs: true,
  usage: 'test EXPRESSION or [ EXPRESSION ]',
  man: {
    name: 'test - check file types and compare values',
    synopsis: 'test EXPRESSION or [ EXPRESSION ]',
    description: 'Exit with the status determined by EXPRESSION. Prints nothing; only the exit status is set, so test is normally used with && or ||.',
    options: [
      '-e FILE            FILE exists',
      '-f FILE            FILE exists and is a regular file',
      '-d FILE            FILE exists and is a directory',
      '-r FILE            FILE exists and read permission is granted',
      '-w FILE            FILE exists and write permission is granted',
      '-x FILE            FILE exists and execute permission is granted',
      '-s FILE            FILE exists and has a size greater than zero',
      '-z STRING          the length of STRING is zero',
      '-n STRING          the length of STRING is nonzero',
      'STRING1 = STRING2  the strings are equal',
      'STRING1 != STRING2 the strings are not equal',
      'INT1 -eq INT2      the integers are equal (also -ne -lt -le -gt -ge)',
      '! EXPRESSION       EXPRESSION is false'
    ],
    examples: ['test -f access.log && echo "found"', '[ -d Documents ] && cd Documents', '[ "$USER" = student ] || echo "not student"']
  },
  run({ argv, cwd, fs, user = 'student' }) {
    const name = argv[0] === '[' ? '[' : 'test';
    let args = argv.slice(1);

    // `[` is a command whose last argument must be `]`.
    if (name === '[') {
      if (args.length === 0 || args[args.length - 1] !== ']') {
        return { stdout: '', stderr: `[: missing ']'\n`, status: 2 };
      }
      args = args.slice(0, -1);
    }

    const fail = (msg) => ({ stdout: '', stderr: `${name}: ${msg}\n`, status: 2 });
    const result = (ok) => ({ stdout: '', stderr: '', status: ok ? 0 : 1 });

    const FILE_OPS = new Set(['-e', '-f', '-d', '-r', '-w', '-x', '-s']);
    const STRING_OPS = new Set(['-z', '-n']);
    const UNARY_OPS = new Set([...FILE_OPS, ...STRING_OPS]);
    const STRING_CMP = new Set(['=', '==', '!=']);
    const INT_CMP = new Set(['-eq', '-ne', '-lt', '-le', '-gt', '-ge']);

    const unary = (op, operand) => {
      if (STRING_OPS.has(op)) {
        return op === '-z' ? operand.length === 0 : operand.length > 0;
      }
      const st = stat(fs, resolvePath(cwd, operand, false), false);
      if (!st.exists) return false;
      switch (op) {
        case '-e': return true;
        case '-f': return st.isFile;
        case '-d': return st.isDir;
        case '-s': return st.isFile && st.size > 0;
        case '-r': return hasPermission(st.node, 'r', user, false);
        case '-w': return hasPermission(st.node, 'w', user, false);
        case '-x': return hasPermission(st.node, 'x', user, false);
        default: return false;
      }
    };

    const INT_RE = /^[+-]?\d+$/;
    const binary = (left, op, right) => {
      if (STRING_CMP.has(op)) {
        if (op === '!=') return { ok: left !== right };
        return { ok: left === right };
      }
      if (!INT_RE.test(left.trim())) return { err: `${left}: integer expression expected` };
      if (!INT_RE.test(right.trim())) return { err: `${right}: integer expression expected` };
      const a = parseInt(left, 10);
      const b = parseInt(right, 10);
      switch (op) {
        case '-eq': return { ok: a === b };
        case '-ne': return { ok: a !== b };
        case '-lt': return { ok: a < b };
        case '-le': return { ok: a <= b };
        case '-gt': return { ok: a > b };
        case '-ge': return { ok: a >= b };
        default: return { err: `${op}: binary operator expected` };
      }
    };

    // Leading `!` negates whatever the rest of the expression evaluates to.
    let negate = false;
    while (args.length > 1 && args[0] === '!') {
      negate = !negate;
      args = args.slice(1);
    }
    const decide = (res) => (
      res.status === 2 ? res : { stdout: '', stderr: '', status: negate ? (res.status === 0 ? 1 : 0) : res.status }
    );

    // 0 args: false. 1 arg: true when the string is non-empty (so `test !`
    // and `test -f` with no operand are both true, as in bash).
    if (args.length === 0) return decide(result(false));
    if (args.length === 1) return decide(result(args[0].length > 0));

    if (args.length === 2) {
      if (!UNARY_OPS.has(args[0])) return fail(`${args[0]}: unary operator expected`);
      return decide(result(unary(args[0], args[1])));
    }

    if (args.length === 3) {
      const [left, op, right] = args;
      if (!STRING_CMP.has(op) && !INT_CMP.has(op)) {
        return fail(`${op}: binary operator expected`);
      }
      const res = binary(left, op, right);
      if (res.err) return fail(res.err);
      return decide(result(res.ok));
    }

    return fail('too many arguments');
  }
};

// 37. true / false
export const trueCmd = {
  name: 'true',
  platforms: ['linux'],
  flags: {},
  usage: 'true',
  man: { name: 'true - do nothing, successfully', synopsis: 'true', description: 'Exit with a status code indicating success (0).' },
  run() { return { stdout: '', stderr: '', status: 0 }; }
};

export const falseCmd = {
  name: 'false',
  platforms: ['linux'],
  flags: {},
  usage: 'false',
  man: { name: 'false - do nothing, unsuccessfully', synopsis: 'false', description: 'Exit with a status code indicating failure (1).' },
  run() { return { stdout: '', stderr: '', status: 1 }; }
};

// 38. which / whereis / type
export const whichCmd = {
  name: 'which',
  aliases: ['whereis', 'type'],
  platforms: ['linux'],
  flags: {},
  usage: 'which [options] [--] programname ...',
  man: { name: 'which - locate a command', synopsis: 'which command...', description: 'which returns the pathnames of the files which would be executed in the current environment.' },
  run({ operands, context }) {
    if (operands.length === 0) return { stdout: '', stderr: '', status: 1 };
    let stdout = '';
    for (const op of operands) {
      if (context.registry?.get(op, 'linux')) {
        stdout += `/usr/bin/${op}\n`;
      } else {
        return { stdout: '', stderr: `${op} not found\n`, status: 1 };
      }
    }
    return { stdout, stderr: '', status: 0 };
  }
};

// 39. history
export const historyCmd = {
  name: 'history',
  platforms: ['linux'],
  flags: {
    c: { type: 'bool', status: 'implemented' }
  },
  usage: 'history [-c]',
  man: { name: 'history - GNU History Library', synopsis: 'history [-c]', description: 'Display or manipulate the history list with line numbers.' },
  run({ flags, context }) {
    if (flags.c) {
      if (context.history) context.history.length = 0;
      return { stdout: '', stderr: '', status: 0 };
    }
    const historyList = context.history || ['pwd', 'ls -la', 'cat welcome.txt'];
    let stdout = '';
    for (let i = 0; i < historyList.length; i++) {
      stdout += `${String(i + 1).padStart(5, ' ')}  ${historyList[i]}\n`;
    }
    return { stdout, stderr: '', status: 0 };
  }
};

// 40. export & env
export const envCmd = {
  name: 'env',
  platforms: ['linux'],
  flags: {},
  usage: 'env [OPTION]...',
  man: { name: 'env - run a program in a modified environment or print environment', synopsis: 'env', description: 'Set each NAME to VALUE in the environment and run COMMAND, or print existing environment.' },
  run({ env = {} }) {
    let stdout = '';
    const fullEnv = {
      HOME: '/home/student',
      USER: 'student',
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: '/home/student',
      ...env
    };
    for (const [k, v] of Object.entries(fullEnv)) {
      if (k !== '?') stdout += `${k}=${v}\n`;
    }
    return { stdout, stderr: '', status: 0 };
  }
};

export const exportCmd = {
  name: 'export',
  platforms: ['linux'],
  flags: {},
  usage: 'export [-fn] [name[=value] ...] or export -p',
  man: { name: 'export - set export attribute for shell variables', synopsis: 'export NAME=VALUE', description: 'Marks each NAME for automatic export to the environment of subsequently executed commands.' },
  run({ operands, env = {} }) {
    if (operands.length === 0) return envCmd.run({ env });
    const updatedEnv = { ...env };
    for (const op of operands) {
      const eqIdx = op.indexOf('=');
      if (eqIdx !== -1) {
        const k = op.slice(0, eqIdx);
        const v = op.slice(eqIdx + 1);
        updatedEnv[k] = v;
      }
    }
    return { stdout: '', stderr: '', status: 0, env: updatedEnv };
  }
};

// 41. ps & kill & jobs
export const psCmd = {
  name: 'ps',
  platforms: ['linux'],
  flags: {
    a: { type: 'bool', status: 'implemented' },
    u: { type: 'bool', status: 'implemented' },
    x: { type: 'bool', status: 'implemented' }
  },
  // `ps aux` is BSD syntax: the option letters carry no leading dash, so the
  // generic parser would read "aux" as a file operand. ps reads argv itself.
  passthroughArgs: true,
  usage: 'ps [aux]',
  man: {
    name: 'ps - report a snapshot of the current processes',
    synopsis: 'ps [aux]',
    description: 'ps displays information about a selection of the active processes. With no options it shows only the processes of this terminal.',
    options: [
      'a   also show processes belonging to other users',
      'u   user-oriented output format (USER, %CPU, %MEM, ...)',
      'x   also show processes with no controlling terminal'
    ],
    examples: ['ps', 'ps aux']
  },
  run({ argv, user = 'student' }) {
    let showOthers = false;
    let userFormat = false;
    let bad = null;

    // Accept both BSD (`ps aux`) and UNIX (`ps -aux`) spellings.
    for (const word of argv.slice(1)) {
      const letters = word.startsWith('-') ? word.slice(1) : word;
      for (const ch of letters) {
        if (ch === 'a' || ch === 'x') showOthers = true;
        else if (ch === 'u') userFormat = true;
        else bad = ch;
      }
    }

    if (bad) {
      return { stdout: '', stderr: `error: unsupported option (BSD syntax) -- '${bad}'\nusage: ps [aux]\n`, status: 1 };
    }

    const own = [
      { user, pid: 1024, cpu: '0.0', mem: '0.1', vsz: 18432, rss: 5120, tty: 'pts/0', stat: 'Ss', cmd: '-bash', shortCmd: 'bash' },
      { user, pid: 2048, cpu: '0.0', mem: '0.1', vsz: 10240, rss: 3072, tty: 'pts/0', stat: 'R+', cmd: 'ps', shortCmd: 'ps' }
    ];
    const others = [
      { user: 'root', pid: 1, cpu: '0.0', mem: '0.1', vsz: 22580, rss: 4096, tty: '?', stat: 'Ss', cmd: '/sbin/init', shortCmd: 'init' },
      { user: 'root', pid: 412, cpu: '0.0', mem: '0.2', vsz: 45120, rss: 6144, tty: '?', stat: 'Ss', cmd: '/usr/sbin/sshd -D', shortCmd: 'sshd' }
    ];

    const procs = showOthers ? [...others, ...own].sort((p, q) => p.pid - q.pid) : own;

    if (userFormat) {
      const lines = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
      for (const p of procs) {
        lines.push(
          `${p.user.padEnd(9, ' ')}${String(p.pid).padStart(7, ' ')} ${p.cpu.padStart(4, ' ')} ${p.mem.padStart(4, ' ')} `
          + `${String(p.vsz).padStart(6, ' ')} ${String(p.rss).padStart(5, ' ')} ${p.tty.padEnd(8, ' ')} ${p.stat.padEnd(4, ' ')} `
          + `${p.tty === '?' ? '09:00' : '09:30'}   0:00 ${p.cmd}`
        );
      }
      return { stdout: `${lines.join('\n')}\n`, stderr: '', status: 0 };
    }

    // Default (no options): the short four-column listing.
    const lines = ['    PID TTY          TIME CMD'];
    for (const p of procs) {
      lines.push(`${String(p.pid).padStart(7, ' ')} ${p.tty.padEnd(8, ' ')} 00:00:00 ${p.shortCmd}`);
    }
    return { stdout: `${lines.join('\n')}\n`, stderr: '', status: 0 };
  }
};

export const killCmd = {
  name: 'kill',
  platforms: ['linux'],
  flags: {},
  usage: 'kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...',
  man: { name: 'kill - send a signal to a process', synopsis: 'kill [-9] PID', description: 'Send the specified signal to the process with PID.' },
  run({ operands }) {
    if (operands.length === 0) return { stdout: '', stderr: 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ...\n', status: 2 };
    return { stdout: '', stderr: '', status: 0 };
  }
};

export const jobsCmd = {
  name: 'jobs',
  platforms: ['linux'],
  flags: {},
  usage: 'jobs [options]',
  man: { name: 'jobs - display status of jobs in the current session', synopsis: 'jobs', description: 'Lists active background jobs.' },
  run() { return { stdout: '', stderr: '', status: 0 }; }
};

// 42. sudo
export const sudoCmd = {
  name: 'sudo',
  platforms: ['linux'],
  flags: {},
  // sudo wraps another command; its arguments belong to that command.
  passthroughArgs: true,
  usage: 'sudo [-u user] command',
  man: {
    name: 'sudo - execute a command as another user',
    synopsis: 'sudo [-u user] command [args]',
    description: 'sudo allows a permitted user to execute a command as the superuser or another user. The command keeps its own options: sudo ls -l runs ls -l as root.',
    options: ['-u USER   run the command as USER instead of root'],
    examples: ['sudo cat /etc/shadow', 'sudo ls -la /var/log', 'sudo -u root wc -l /etc/passwd']
  },
  run({ argv, cwd, fs, stdin, isTTY, context }) {
    let subArgs = argv.slice(1);

    // sudo's own options come first and stop at the command name.
    let asUser = 'root';
    while (subArgs.length > 0 && subArgs[0].startsWith('-')) {
      const opt = subArgs[0];
      if (opt === '-u' || opt === '--user') {
        if (subArgs.length < 2) {
          return { stdout: '', stderr: 'sudo: option requires an argument -- \'u\'\n', status: 1 };
        }
        asUser = subArgs[1];
        subArgs = subArgs.slice(2);
        continue;
      }
      if (opt.startsWith('-u') && opt.length > 2) {
        asUser = opt.slice(2);
        subArgs = subArgs.slice(1);
        continue;
      }
      return { stdout: '', stderr: `sudo: invalid option -- '${opt.replace(/^-+/, '')}'\nusage: sudo [-u user] command\n`, status: 1 };
    }

    if (subArgs.length === 0) {
      return { stdout: '', stderr: 'usage: sudo [-u user] command\n', status: 1 };
    }

    // Special handler for simulated apt-get
    if (subArgs[0] === 'apt-get' || subArgs[0] === 'apt') {
      const isInstall = subArgs.includes('install');
      const isUpdate = subArgs.includes('update');
      if (isUpdate && isInstall) {
        return {
          stdout: 'Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease\nReading package lists... Done\nBuilding dependency tree... Done\nSetting up packages...\nDone.\n',
          stderr: '',
          status: 0,
          installedPackage: subArgs.slice(subArgs.indexOf('install') + 1).find(a => !a.startsWith('-'))
        };
      }
      if (isUpdate) {
        return {
          stdout: 'Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease\nReading package lists... Done\n',
          stderr: '',
          status: 0
        };
      }
      if (isInstall) {
        // The package is the first operand after `install`, not the last token —
        // `apt-get install <pkg> -y` would otherwise "install" a package named -y.
        const pkg = subArgs.slice(subArgs.indexOf('install') + 1).find(a => !a.startsWith('-'))
          || subArgs[subArgs.length - 1];
        return {
          stdout: `Reading package lists... Done\nBuilding dependency tree... Done\nSetting up ${pkg}...\nDone.\n`,
          stderr: '',
          status: 0,
          installedPackage: pkg
        };
      }
    }

    const { registry } = context;
    const cmdImpl = registry?.get(subArgs[0], 'linux');
    if (!cmdImpl) {
      return { stdout: '', stderr: `sudo: ${subArgs[0]}: command not found\n`, status: 1 };
    }

    // The wrapped command parses its OWN options, so `sudo ls -l` is `ls -l`.
    return runWrappedCommand(cmdImpl, subArgs[0], subArgs.slice(1), {
      cwd,
      fs,
      stdin,
      env: context.env,
      user: asUser, // Elevate: root by default, or whoever -u named.
      isTTY,
      context: { ...context, user: asUser }
    });
  }
};

// 43. vi / nano
export const viCmd = {
  name: 'vi',
  aliases: ['vim'],
  platforms: ['linux'],
  flags: {},
  usage: 'vi [file]',
  man: { name: 'vi - screen-oriented text editor', synopsis: 'vi [file]', description: 'vi is a modal screen editor. In real life, press :q! to exit without saving or :wq to save.' },
  run({ operands }) {
    const filename = operands[0] || 'new_file';
    return {
      stdout: `~                                                           \n~                                                           \n"${filename}" [readonly] -- Tip: In real Vim, press :q! to quit without saving, or :wq to save and exit.\n`,
      stderr: '',
      status: 0
    };
  }
};

export const nanoCmd = {
  name: 'nano',
  platforms: ['linux'],
  flags: {},
  usage: 'nano [file]',
  man: { name: 'nano - Nano\'s ANOther editor', synopsis: 'nano [file]', description: 'nano is a simple text editor. In real life, press Ctrl+X to exit.' },
  run({ operands }) {
    const filename = operands[0] || 'new_file';
    return {
      stdout: `  GNU nano 6.2                        ${filename}                             \n\n\n^G Help        ^O WriteOut    ^W Where Is    ^K Cut Text    ^J Justify     ^C Cur Pos\n^X Exit        ^R Read File   ^\\ Replace     ^U Paste Text  ^T To Spell    ^_ Go To Line\n`,
      stderr: '',
      status: 0
    };
  }
};

// 44. tar / gzip / gunzip / zip / unzip
export const tarCmd = {
  name: 'tar',
  platforms: ['linux'],
  // Nothing here is simulated: there is no archive format in this filesystem,
  // so -c wrote no archive, -x extracted nothing and -t printed an invented
  // listing. Each flag now says so instead of appearing to work.
  flags: {
    c: { type: 'bool', status: 'notSimulated' },
    x: { type: 'bool', status: 'notSimulated' },
    t: { type: 'bool', status: 'notSimulated' },
    z: { type: 'bool', status: 'notSimulated' },
    f: { type: 'string', status: 'notSimulated' },
    v: { type: 'bool', status: 'notSimulated' }
  },
  usage: 'tar [OPTION...] [FILE]...',
  man: { name: 'tar - an archiving utility', synopsis: 'tar -czf archive.tar.gz files...', description: 'tar saves many files together into a single tape or disk archive, and can restore individual files.' },
  run() {
    return {
      stdout: '',
      stderr: 'tar: archives are not simulated here (see the Reference tab). On a real system, tar -czf backup.tar.gz DIR packs DIR into one compressed file.\n',
      status: 2
    };
  }
};

export const gzipCmd = {
  name: 'gzip',
  aliases: ['gunzip'],
  platforms: ['linux'],
  flags: { d: { type: 'bool', status: 'notSimulated', long: 'decompress' } },
  usage: 'gzip [ -d ] [ name ...  ]',
  man: { name: 'gzip - compress or expand files', synopsis: 'gzip file.txt', description: 'gzip reduces the size of named files using Lempel-Ziv coding. Compression is not simulated here.' },
  run() {
    // It used to exit 0 having done nothing, so `gzip notes.txt` looked like
    // it had produced notes.txt.gz. There is no compression in this filesystem.
    return {
      stdout: '',
      stderr: 'gzip: compression is not simulated here (see the Reference tab). On a real system, gzip FILE replaces FILE with FILE.gz.\n',
      status: 2
    };
  }
};

// 45. clear
export const clearCmd = {
  name: 'clear',
  platforms: ['linux'],
  flags: {},
  usage: 'clear',
  man: { name: 'clear - clear the terminal screen', synopsis: 'clear', description: 'clear clears your screen if this is possible.' },
  run() { return { stdout: '', stderr: '', status: 0, clear: true }; }
};

// 46. find
export const findCmd = {
  name: 'find',
  platforms: ['linux'],
  flags: {
    name: { type: 'string', status: 'implemented' },
    iname: { type: 'string', status: 'implemented' },
    type: { type: 'string', status: 'implemented' },
    maxdepth: { type: 'number', status: 'implemented' },
    size: { type: 'string', status: 'implemented' },
    // -mtime needs a clock. Every node in this filesystem carries the same
    // frozen build timestamp, so any answer would be fiction.
    mtime: { type: 'string', status: 'notSimulated' },
    // -delete and -exec run an ACTION per match. find here only reports paths;
    // it never writes the filesystem back, so both used to be silent no-ops.
    delete: { type: 'bool', status: 'notSimulated' },
    exec: { type: 'string', status: 'notSimulated' }
  },
  // find's expression is not a list of options: `-size -1k` has an argument
  // that starts with a dash, and the generic parser reads it as the unknown
  // short options -1 and -k. find walks argv itself and rejects the predicates
  // it cannot honour below.
  passthroughArgs: true,
  usage: 'find [-H] [-L] [-P] [path...] [expression]',
  man: {
    name: 'find - search for files in a directory hierarchy',
    synopsis: 'find [path...] [expression]',
    description: 'Recursively search directory tree for files matching criteria.',
    options: [
      '-name PATTERN      base of file name matches shell pattern PATTERN',
      '-iname PATTERN     like -name, but case-insensitive',
      '-type [f|d|l]      file is of type: f (file), d (directory), l (symlink)',
      '-maxdepth LEVELS   descend at most LEVELS directory levels',
      '-size [+-]N[cwbkMG] file uses N units of space (c bytes, k KiB, M MiB, G GiB; b 512-byte blocks, the default)'
    ],
    examples: ['find . -name "*.txt"', 'find /var/log -type f', 'find . -name "*.log" -maxdepth 2']
  },
  run({ argv, cwd, fs }) {
    let startPaths = [];
    let namePattern = null;
    let isCaseInsensitive = false;
    let typeFilter = null;
    let maxDepth = Infinity;
    let sizeTest = null;

    // Predicates that exist in real find and are deliberately not simulated
    // here. Refusing them is the point: silently ignoring one would make find
    // print matches the student did not ask for.
    const UNSIMULATED = {
      '-mtime': '-mtime needs a clock; every file here carries the same frozen build timestamp',
      '-mmin': '-mmin needs a clock; every file here carries the same frozen build timestamp',
      '-newer': '-newer needs a clock; every file here carries the same frozen build timestamp',
      '-delete': '-delete is an action; find here only reports paths',
      '-exec': '-exec is an action; find here only reports paths',
      '-execdir': '-execdir is an action; find here only reports paths',
      '-ok': '-ok is an action; find here only reports paths',
      '-perm': '-perm matching is not simulated here'
    };
    const KNOWN = new Set(['-name', '-iname', '-type', '-maxdepth', '-mindepth', '-size', '-print']);

    for (const arg of argv.slice(1)) {
      if (UNSIMULATED[arg]) {
        return {
          stdout: '',
          stderr: `find: ${arg} is not simulated here (see the Reference tab).\nTry 'find --help' for more information.\n`,
          status: 2
        };
      }
    }

    let i = 1;
    while (i < argv.length) {
      const arg = argv[i];
      if (arg === '-size' && i + 1 < argv.length) {
        const spec = argv[++i];
        const m = spec.match(/^([+-]?)(\d+)([cwbkMG]?)$/);
        if (!m) {
          return { stdout: '', stderr: `find: invalid -size type \`${spec.slice(-1)}'\n`, status: 1 };
        }
        const UNITS = { c: 1, w: 2, b: 512, k: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
        sizeTest = { sign: m[1], count: Number(m[2]), unit: UNITS[m[3] || 'b'] };
      } else if (arg === '-name' && i + 1 < argv.length) {
        namePattern = argv[++i];
      } else if (arg === '-iname' && i + 1 < argv.length) {
        namePattern = argv[++i];
        isCaseInsensitive = true;
      } else if (arg === '-type' && i + 1 < argv.length) {
        typeFilter = argv[++i];
      } else if (arg === '-maxdepth' && i + 1 < argv.length) {
        maxDepth = parseInt(argv[++i], 10) || Infinity;
      } else if (arg === '-print') {
        // The default action; nothing to record.
      } else if (arg.startsWith('-') && arg.length > 1 && !KNOWN.has(arg)) {
        return { stdout: '', stderr: `find: unknown predicate \`${arg}'\n`, status: 2 };
      } else if (!arg.startsWith('-')) {
        startPaths.push(arg);
      }
      i++;
    }

    if (startPaths.length === 0) startPaths = ['.'];

    let regex = null;
    if (namePattern) {
      let regStr = '^' + namePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
      regex = new RegExp(regStr, isCaseInsensitive ? 'i' : '');
    }

    let stdout = '';
    let stderr = '';
    let status = 0;

    for (const startPath of startPaths) {
      const resolved = resolvePath(cwd, startPath, false);
      const st = stat(fs, resolved, false);
      if (!st.exists) {
        stderr += `find: '${startPath}': No such file or directory\n`;
        status = 1;
        continue;
      }

      const prefix = resolved === '/' ? '/' : `${resolved}/`;
      const baseDepth = resolved.split('/').filter(Boolean).length;

      for (const key of Object.keys(fs)) {
        if (key === resolved || key.startsWith(prefix)) {
          const depth = key.split('/').filter(Boolean).length - baseDepth;
          if (depth > maxDepth) continue;

          const node = fs[key];
          if (typeFilter === 'f' && node.type !== 'file') continue;
          if (typeFilter === 'd' && node.type !== 'dir') continue;

          const nodeBase = basename(key, false);
          if (regex && !regex.test(nodeBase)) continue;

          if (sizeTest) {
            // find rounds a file UP to the next whole unit before comparing.
            const bytes = node.type === 'file'
              ? (typeof node.size === 'number' ? node.size : (node.content || '').length)
              : 4096;
            const units = Math.ceil(bytes / sizeTest.unit);
            if (sizeTest.sign === '+' && !(units > sizeTest.count)) continue;
            if (sizeTest.sign === '-' && !(units < sizeTest.count)) continue;
            if (sizeTest.sign === '' && units !== sizeTest.count) continue;
          }

          // Format relative or absolute as requested
          let displayPath = key;
          if (startPath === '.') {
            displayPath = key === resolved ? '.' : `./${key.slice(prefix.length)}`;
          } else if (!startPath.startsWith('/')) {
            displayPath = key === resolved ? startPath : `${startPath}/${key.slice(prefix.length)}`;
          }

          stdout += `${displayPath}\n`;
        }
      }
    }

    return { stdout, stderr, status };
  }
};

// 47. man & help
export const manCmd = {
  name: 'man',
  platforms: ['linux'],
  flags: {},
  usage: 'man [section] page...',
  man: { name: 'man - an interface to the system reference manuals', synopsis: 'man command', description: 'man formats and displays the on-line manual pages.' },
  run({ operands, context }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'What manual page do you want?\n', status: 1 };
    }
    const pageName = operands[0].toLowerCase();
    const manPage = context.registry?.getManPage(pageName, 'linux') || context.packHelp?.[pageName];

    if (!manPage) {
      return { stdout: '', stderr: `No manual entry for ${pageName}\n`, status: 1 };
    }

    let out = '';
    if (manPage.name) out += `NAME\n    ${manPage.name}\n\n`;
    if (manPage.synopsis) out += `SYNOPSIS\n    ${manPage.synopsis}\n\n`;
    if (manPage.description) out += `DESCRIPTION\n    ${manPage.description.split('\n').join('\n    ')}\n\n`;
    if (manPage.options && manPage.options.length > 0) {
      out += `OPTIONS\n`;
      for (const opt of manPage.options) out += `    ${opt}\n`;
      out += '\n';
    }
    if (manPage.examples && manPage.examples.length > 0) {
      out += `EXAMPLES\n`;
      for (const ex of manPage.examples) out += `    ${ex}\n`;
      out += '\n';
    }

    return { stdout: out, stderr: '', status: 0 };
  }
};

export const helpCmd = {
  name: 'help',
  platforms: ['linux'],
  flags: {},
  usage: 'help',
  man: { name: 'help - display information about builtin and simulated commands', synopsis: 'help', description: 'Displays brief summary of commands available in this shell.' },
  run({ context }) {
    const list = context.registry?.getAll('linux') || [];
    let stdout = 'Available simulated commands:\n\n';
    const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
    for (const cmd of sorted) {
      const summary = cmd.man?.description ? cmd.man.description.split('\n')[0] : (cmd.usage || '');
      stdout += `  ${cmd.name.padEnd(12, ' ')} - ${summary}\n`;
    }
    stdout += '\nType `man <command>` for complete manual and examples.\n';
    return { stdout, stderr: '', status: 0 };
  }
};

// Array of all Linux command definitions
export const ALL_LINUX_COMMANDS = [
  pwdCmd, cdCmd, lsCmd, catCmd, headCmd, tailCmd, lessCmd, grepCmd, wcCmd, sortCmd, cutCmd,
  uniqCmd, trCmd, sedCmd, awkCmd, teeCmd, xargsCmd, diffCmd, nlCmd, stringsCmd, fileCmd,
  md5sumCmd, sha256sumCmd, mkdirCmd, rmdirCmd, touchCmd, cpCmd, mvCmd, rmCmd, chmodCmd,
  chownCmd, statCmd, duCmd, dfCmd, echoCmd, testCmd, trueCmd, falseCmd, whichCmd, historyCmd,
  envCmd, exportCmd, psCmd, killCmd, jobsCmd, sudoCmd, viCmd, nanoCmd, tarCmd, gzipCmd,
  clearCmd, findCmd, manCmd, helpCmd
];

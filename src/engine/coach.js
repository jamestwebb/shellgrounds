// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Coach: one-line plain-language explanations of what a command just did (or why it failed).
// Aimed at true CLI novices — the goal is to close the loop between action and mental model.

const ERROR_ADVICE = [
  {
    pattern: /command not found|is not recognized/i,
    advice: "That name is not a command here. Type `help` to see every command this terminal knows."
  },
  {
    pattern: /No such file or directory|cannot find the (file|path)|File not found|File Not Found/i,
    advice: "Nothing exists at that path from where you stand. Run `ls` (or `dir`) to see what is actually here, and check the spelling — paths are case-sensitive."
  },
  {
    pattern: /Not a directory|directory name is invalid/i,
    advice: "That target is a file, not a directory. `cd` only enters directories — use `cat` to read a file."
  },
  {
    pattern: /Is a directory|Access is denied/i,
    advice: "That target is a directory, not a file. Use `cd` to enter it, or `ls` (Windows: `dir`) to look inside it."
  },
  {
    pattern: /missing operand|missing pattern|missing filename|missing sector offset|missing disk image|syntax of the command is incorrect|Parameter format not correct|Bad command line|you must specify/i,
    advice: "The command needs more arguments. Run `man <command>` or `<command> --help` to see its usage line."
  },
  {
    pattern: /unmatched quote/i,
    advice: "A quote was opened but never closed. Every opening \" or ' needs a matching partner."
  },
  {
    pattern: /syntax error near/i,
    advice: "The shell could not parse that line. Check the special characters (|, >, quotes) — each has a strict shape."
  }
];

const SUCCESS_EXPLAINERS = {
  pwd: () => '`pwd` printed your absolute position: the chain of directories from the root `/` down to where you stand.',
  ls: (tokens) => {
    const flags = tokens.filter(t => t.startsWith('-')).join('');
    if (flags.includes('a')) {
      return '`ls` listed this directory, including hidden entries — names starting with `.` are invisible without `-a`.';
    }
    if (flags.includes('l')) {
      return '`ls -l` listed this directory in long form: permissions, owner, size, and date for every entry.';
    }
    return '`ls` listed what lives in this directory. Directories you can `cd` into; files you can `cat`.';
  },
  cat: () => '`cat` printed the entire file to the screen. For long files, `head`, `tail`, or `less` show just a part.',
  head: () => '`head` printed only the first lines of the input — a quick look at how a file starts.',
  tail: () => '`tail` printed only the last lines of the input — where logs keep their most recent entries.',
  less: () => '`less` opened the file as pages. On a real system you scroll with Space and quit with `q`.',
  grep: (tokens) => {
    const flags = tokens.filter(t => t.startsWith('-')).join('');
    if (flags.includes('v')) return '`grep -v` kept only the lines that do NOT match — filtering out known noise.';
    if (flags.includes('i')) return '`grep -i` kept the matching lines, ignoring upper/lower case differences.';
    return '`grep` kept only the lines that match your pattern and dropped everything else.';
  },
  find: () => '`find` walked every directory under the start path and tested each name against your filter.',
  file: () => "`file` read the first bytes (the magic number) to identify the true type — the extension can lie.",
  strings: () => '`strings` pulled the human-readable text out of a binary file and skipped the machine code.',
  md5sum: () => 'That hash is a fingerprint of the file contents. If even one byte changes, the hash changes completely.',
  sha256sum: () => 'That hash is a fingerprint of the file contents. Evidence is hashed before and after analysis to prove integrity.',
  wc: () => '`wc -l` counted lines. Analysts use it to measure "how much" before reading anything.',
  sort: () => '`sort` reordered the lines. Sorted output makes duplicates and outliers easy to spot.',
  cut: () => '`cut` split each line on the delimiter and kept only the field number you asked for.',
  echo: () => '`echo` printed its arguments back. It becomes useful with `>` — writing text into files.',
  cd: (tokens, { prevCwd, newCwd }) => {
    if (prevCwd === newCwd) return '`cd` ran, but you are still in the same directory.';
    const wentUp = tokens.includes('..') || (newCwd.length < prevCwd.length && prevCwd.startsWith(newCwd));
    if (wentUp) {
      return `You climbed from \`${prevCwd}\` up to \`${newCwd}\` — \`..\` always means the parent, one level toward the root.`;
    }
    return `You moved from \`${prevCwd}\` into \`${newCwd}\`. The prompt shows your new position.`;
  },
  sudo: () => '`sudo` ran the command with administrator rights; `apt-get` fetched and installed the package system-wide.',
  tracker: () => 'The installed tool ran like any built-in command — once installed, tools join the shell vocabulary.',
  scan: () => 'Read the table: each partition row has a Start sector. Analysts carry that number into the next command.',
  extract: () => 'You carried a value from one command\'s output into another command\'s flag — the core move of real forensic tooling.',
  dir: () => '`dir` listed this directory. Add `/a` to include hidden files — Windows hides by attribute, not by dot.',
  type: () => '`type` printed the file, the Windows twin of `cat`.',
  findstr: () => '`findstr` kept only the matching lines — the Windows twin of `grep`. `/i` ignores case.',
  certutil: () => 'That hash is the file\'s fingerprint — the Windows way to verify evidence integrity.',
  attrib: () => 'Those letters are attributes: H means Hidden — the Windows version of a dotfile.'
};

// Commands whose output already explains itself
const SKIP = new Set(['help', 'man', 'map', 'submit', 'clear', 'cls', 'apt-get']);

/**
 * Returns a one-line coach explanation for an executed command line, or null.
 */
export function explainCommand(input, res, platform, prevCwd) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/);
  let cmd = tokens[0].toLowerCase();
  if (cmd === 'sudo') cmd = 'sudo';

  if (res.hasError) {
    const match = ERROR_ADVICE.find(e => e.pattern.test(res.output || ''));
    return match
      ? match.advice
      : 'The command reported an error — read its message carefully; it usually names the file and the reason.';
  }

  if (SKIP.has(cmd)) return null;

  const notes = [];
  const base = SUCCESS_EXPLAINERS[cmd];
  if (base) {
    notes.push(base(tokens, { prevCwd, newCwd: res.newCwd }));
  }

  if (trimmed.includes('|')) {
    const stages = trimmed.split('|').length;
    notes.push(`The \`|\` pipe chained ${stages} commands: each one's output became the next one's input.`);
  }
  if (/(^|[^2])>/.test(trimmed)) {
    notes.push('The `>` sent the output into a file instead of the screen — `cat` that file to see it.');
  } else if (/2>/.test(trimmed)) {
    notes.push('The `2>` redirected the error stream — stdout and stderr are separate channels.');
  }

  if (notes.length === 0) return null;
  return notes.join(' ');
}

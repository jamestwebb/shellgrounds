// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// What a tool IS, as opposed to what to do with it.
//
// A brief tells a student to run `grep`. Nothing told them what grep is. The
// man page says it well -- "grep: print lines matching a pattern" -- and lives
// behind a command a beginner has no reason to run about a tool they have not
// met. So the product taught 51 commands and defined none of them at the moment
// of first contact, and taught 62 more concepts (`|`, `$?`, globbing, a flag)
// that were never defined anywhere at all.
//
// ── Why this is engine code and not pack content ────────────────────────────
//
// What `grep` is does not vary by course. Every pack that teaches it wants the
// same sentence, and a definition copied into three packs is a definition that
// will disagree with itself within a year. The same argument already decided
// two other files:
//
//   realFlags.js       which options a real tool accepts -- true everywhere
//   solutionSpace.js   which rewritings mean the same thing -- true everywhere
//
// and in each case the pack keeps only what is genuinely its own: its answers,
// its filesystem, its story. The rule is the same here.
//
//   THE ENGINE OWNS what is true of the shell everywhere.
//   THE PACK OWNS what is true of this course.
//
// ── The seam ────────────────────────────────────────────────────────────────
//
// A pack overrides or extends this through `manifest.glossary`, and needs to
// for two reasons that are not stylistic:
//
//   A pack can ship its own commands. forensics-cli-101 defines `scan`,
//   `extract`, `map` and `evtrace`, which no engine table could know about.
//
//   A pack teaches its own vocabulary. "chain of custody" and "magic bytes"
//   are forensics, not shell, and belong to the course that teaches them.
//
// Resolution is pack-first, engine-fallback -- the same order as every other
// override in this codebase.

/** Definitions keyed by the `teaches` tag a challenge already declares. */
export const ENGINE_GLOSSARY = {
  // ── Getting around ────────────────────────────────────────────────────────
  pwd: { term: 'pwd', what: '`pwd` prints where you are. The shell always has one current directory, and every relative path you type is measured from it.' },
  ls: { term: 'ls', what: '`ls` lists what is in a directory. It is how you look before you touch anything.' },
  cd: { term: 'cd', what: '`cd` moves you to another directory. Nothing is opened and nothing changes on disk; only your position does.' },
  'cd ..': { term: 'cd ..', what: '`..` means the directory above this one. `cd ..` steps back up the tree.' },
  'parent-directory': { term: '..', what: '`..` is the directory one level up. It works anywhere a path does, not only with `cd`.' },
  'parent-directories': { term: '..', what: '`..` is the directory one level up. It works anywhere a path does, not only with `cd`.' },
  'working-directory': { term: 'the working directory', what: 'The directory you are currently standing in. A path that does not begin with `/` is read from here.' },
  'current-directory': { term: 'the current directory', what: 'The folder you are standing in. A path that does not begin with a drive letter is read from here.' },
  'relative-paths': { term: 'a relative path', what: 'A path that starts from where you are, like `Documents/notes.txt`. An absolute path starts from the root, like `/home/student/Documents/notes.txt`, and means the same thing from anywhere.' },
  navigation: { term: 'moving around', what: 'The shell has no windows to click. You move with `cd` and look with `ls`, and the prompt tells you where you ended up.' },
  discovery: { term: 'looking around', what: 'Before changing anything, find out what is there. Most command-line mistakes are made in the dark.' },

  // ── Reading files ─────────────────────────────────────────────────────────
  cat: { term: 'cat', what: '`cat` prints a whole file to the screen. The name is short for concatenate, because it will also join several files together.' },
  head: { term: 'head', what: '`head` prints the first few lines of a file, ten by default. Useful when you want the shape of a file, not all of it.' },
  'head -n': { term: 'head -n', what: '`-n` says how many lines you want. `head -n 3` prints three.' },
  tail: { term: 'tail', what: '`tail` prints the last few lines of a file. It is where you look first in a log, because the newest lines are at the bottom.' },
  'tail -n': { term: 'tail -n', what: '`-n` says how many lines you want from the end.' },
  'file-viewing': { term: 'reading a file', what: 'Reading a file never changes it. You can print anything as often as you like without risk.' },
  file: { term: 'file', what: '`file` tells you what a file really is by looking inside it, not at its name. A `.jpg` that is actually a spreadsheet cannot hide from it.' },
  strings: { term: 'strings', what: '`strings` pulls the readable text out of a file that is otherwise binary. It is how you read something not meant to be read.' },
  stat: { term: 'stat', what: '`stat` shows a file\'s details rather than its contents: size, owner, permissions, and when it was last touched.' },
  metadata: { term: 'metadata', what: 'Facts about a file rather than what is in it: its size, its owner, when it changed. Often the evidence, not the file itself.' },

  // ── Searching ─────────────────────────────────────────────────────────────
  grep: { term: 'grep', what: '`grep` searches text. Give it a word and a file, and it prints only the lines that contain that word.' },
  'grep -i': { term: 'grep -i', what: '`-i` ignores capitals, so `error` also finds `ERROR` and `Error`. Case is the commonest reason a search "finds nothing" when the thing is there.' },
  'grep -v': { term: 'grep -v', what: '`-v` inverts the search: it prints every line that does NOT match. Removing what you understand is often faster than describing what you want.' },
  'pattern-matching': { term: 'a pattern', what: 'The text you are searching for. `grep` matches anywhere in a line, so `active` also matches inside `inactive`.' },
  'case-insensitivity': { term: 'case sensitivity', what: 'The shell treats `File` and `file` as different. Most search tools take a flag to stop caring.' },
  'inverted-matching': { term: 'inverting a match', what: 'Asking for everything that does not match, instead of everything that does.' },
  find: { term: 'find', what: '`find` walks a whole tree of directories looking for files that match what you describe. `ls` shows one directory; `find` searches all of them.' },
  'find -name': { term: 'find -name', what: '`-name` matches on the filename. Quote the pattern so the shell hands it to `find` untouched.' },
  'find -type': { term: 'find -type', what: '`-type f` keeps only files and `-type d` only directories, so a search does not return both.' },
  'log-analysis': { term: 'reading a log', what: 'A log is an ordinary text file that a program appends to. Everything you know about searching text works on it.' },
  'recursive-search': { term: 'searching recursively', what: 'Looking not only in a folder but in every folder inside it, all the way down.' },

  // ── Counting, sorting, cutting ────────────────────────────────────────────
  wc: { term: 'wc', what: '`wc` counts what it is given: lines, words and characters.' },
  'wc -l': { term: 'wc -l', what: '`-l` counts lines only. Piped onto a search, it answers "how many?" instead of "which?".' },
  'line-counting': { term: 'counting lines', what: 'Turning a list of results into a number, which is usually the question that was actually asked.' },
  sort: { term: 'sort', what: '`sort` puts lines in order. By default it compares them as text, which is why 105 comes before 78.' },
  'sort -n': { term: 'sort -n', what: '`-n` compares numbers as numbers. Without it, 105 sorts before 78 because "1" comes before "7".' },
  'sort -k': { term: 'sort -k', what: '`-k` picks which column to sort on. Pair it with `-t` to say what separates the columns.' },
  'sort -nr': { term: 'sort -nr', what: '`-r` reverses the order, so `-nr` gives you the largest number first.' },
  uniq: { term: 'uniq', what: '`uniq` collapses repeated neighbouring lines. It only sees duplicates that are next to each other, which is why it is almost always used after `sort`.' },
  cut: { term: 'cut', what: '`cut` takes one column out of each line. Tell it what separates the columns and which one you want.' },
  'field-extraction': { term: 'a field', what: 'One column of a line, once you have said what separates the columns — a comma in a CSV, a space in a log.' },
  'csv-parsing': { term: 'a CSV', term_alt: 'csv', what: 'A text file where each line is a row and commas separate the columns. Nothing special: ordinary text tools work on it.' },
  'text-processing': { term: 'text processing', what: 'Almost everything on a command line is lines of text. The same handful of tools work on all of it.' },

  // ── Editing streams ───────────────────────────────────────────────────────
  sed: { term: 'sed', what: '`sed` rewrites text as it passes by. It changes what reaches the screen, not the file on disk, which is why it is safe to experiment with.' },
  'stream-editing': { term: 'a stream', what: 'Text on its way from one place to another. A stream editor changes it in transit and leaves the original alone.' },
  awk: { term: 'awk', what: '`awk` reads a line at a time and can pick out fields and do arithmetic on them. It is a small programming language that happens to live in the shell.' },
  diff: { term: 'diff', what: '`diff` shows what changed between two files. It prints only the differences, which is usually all you want.' },
  'file-comparison': { term: 'comparing files', what: 'Asking what changed, rather than reading both files and hoping to spot it.' },

  // ── Joining commands ──────────────────────────────────────────────────────
  pipes: { term: 'a pipe', what: 'A pipe, written `|`, takes the output of one command and feeds it straight into the next, with nothing printed in between.' },
  pipelines: { term: 'a pipeline', what: 'Several commands joined by `|`, each doing one small job and handing the result on. Most real command-line work is built this way.' },
  redirection: { term: 'redirection', what: '`>` sends output into a file instead of the screen. Nothing is printed when it works, which is normal and not a failure.' },
  '>': { term: '>', what: '`>` writes output to a file, replacing whatever was there. `>>` adds to the end instead.' },
  '>>': { term: '>>', what: '`>>` adds output to the end of a file. `>` would replace the whole file.' },
  tee: { term: 'tee', what: '`tee` sends output two ways at once: to the screen and into a file. It is named after a T-shaped pipe fitting.' },
  '&&': { term: '&&', what: '`&&` runs the next command only if the first one succeeded. It is how you avoid acting on a step that failed.' },
  '||': { term: '||', what: '`||` runs the next command only if the first one FAILED. It is the way to say "or else".' },
  'command-lists': { term: 'chaining commands', what: 'Putting several commands on one line, with `&&` or `||` deciding whether the next one runs.' },
  'command-chaining': { term: 'chaining commands', what: 'Putting several commands on one line, so the next one depends on how the last one went.' },
  'conditional-execution': { term: 'running conditionally', what: 'Deciding whether to run a command based on whether the last one worked.' },
  'flag-chaining': { term: 'combining flags', what: 'Most commands let you put short flags together: `-l -a` and `-la` mean the same thing.' },
  '$?': { term: '$?', what: '`$?` holds the exit status of the last command: 0 for success, anything else for failure. It is how the shell knows what worked.' },
  'exit-status': { term: 'exit status', what: 'Every command reports a number when it finishes. Zero means it worked. That number is what `&&` and `||` are reading.' },

  // ── Making and changing things ────────────────────────────────────────────
  touch: { term: 'touch', what: '`touch` creates an empty file, or updates the timestamp of one that already exists.' },
  'file-creation': { term: 'creating a file', what: 'Making a new, empty file so that something can be written into it.' },
  mkdir: { term: 'mkdir', what: '`mkdir` makes a new directory.' },
  'mkdir -p': { term: 'mkdir -p', what: '`-p` creates the parent directories too, so you can make a whole path in one go.' },
  cp: { term: 'cp', what: '`cp` copies a file, leaving the original where it is.' },
  'cp -r': { term: 'cp -r', what: '`-r` copies a directory and everything inside it. Without it, `cp` refuses a directory.' },
  'recursive-copy': { term: 'copying recursively', what: 'Copying a folder along with everything inside it, all the way down.' },
  mv: { term: 'mv', what: '`mv` moves a file. Move it within the same directory and you have renamed it — the shell sees no difference.' },
  rm: { term: 'rm', what: '`rm` deletes a file. There is no recycle bin: it is gone.' },
  'file-deletion': { term: 'deleting', what: 'The command line does not ask twice and has nowhere to put things back from. Read the line before you press Enter.' },
  rename: { term: 'renaming', what: 'Giving a file a new name. On Linux this is a move; on Windows it has its own command.' },

  // ── Permissions ───────────────────────────────────────────────────────────
  chmod: { term: 'chmod', what: '`chmod` changes who may read, write or run a file.' },
  permissions: { term: 'permissions', what: 'Every file records what its owner, its group and everyone else are allowed to do with it. `ls -l` shows all three.' },
  'file-permissions': { term: 'permissions', what: 'Three sets of three: read, write and execute, for the owner, the group and everyone else.' },
  'octal-modes': { term: 'octal modes', what: 'A shorthand where read is 4, write is 2 and execute is 1. Add them up per group: 755 means the owner can do everything and everyone else can read and run.' },
  'executable-permissions': { term: 'the execute bit', what: 'A file is only runnable if it is marked executable. A correct script with the bit unset will not run.' },
  sudo: { term: 'sudo', what: '`sudo` runs one command as the administrator. It exists so that dangerous things take a deliberate extra word.' },
  root: { term: 'root', what: 'The administrator account, which no permission applies to. Powerful, and unforgiving.' },
  inodes: { term: 'an inode', what: 'The record the filesystem keeps about a file. The name is just a label pointing at it.' },

  // ── Shell behaviour ───────────────────────────────────────────────────────
  globbing: { term: 'globbing', what: 'The shell expands `*` before the command ever runs. `ls *.txt` never sees the star — it sees the list of matching filenames.' },
  wildcards: { term: 'a wildcard', what: '`*` stands for any run of characters and `?` for exactly one. The shell replaces them with real filenames before the command starts.' },
  quoting: { term: 'quoting', what: 'Quotes stop the shell interpreting what is inside. Double quotes still expand `$variables`; single quotes take everything literally.' },
  variables: { term: 'a variable', what: 'A name holding a value. Write `$HOME` and the shell replaces it with the value before the command runs.' },
  'environment-variables': { term: 'an environment variable', what: 'A setting the system hands to every program, like where your home folder is. On Windows they are written `%NAME%`.' },
  '%VAR%': { term: '%VAR%', what: 'How cmd.exe writes a variable. The shell replaces `%USERNAME%` with its value before the command runs.' },
  history: { term: 'history', what: 'The shell remembers what you have typed. The Up arrow walks back through it, which is faster and safer than retyping.' },
  'arrow-keys': { term: 'the arrow keys', what: 'Up and Down move through commands you have already run. Retyping is where mistakes come from.' },
  'tab-completion': { term: 'tab completion', what: 'Press Tab and the shell finishes the name for you. It also proves the file exists, which retyping does not.' },
  'shell-mastery': { term: 'working quickly', what: 'History, Tab completion and pipes are most of what fast terminal work actually is.' },
  'dotfiles': { term: 'a dotfile', what: 'On Linux a file whose name starts with `.` is hidden from an ordinary listing. Nothing else is different about it.' },
  'hidden-files': { term: 'hidden files', what: 'Files a plain listing leaves out. Linux hides them by a leading dot; Windows hides them with an attribute.' },
  'ls -a': { term: 'ls -a', what: '`-a` shows everything, including the dotfiles a plain `ls` leaves out.' },
  'ls -l': { term: 'ls -l', what: '`-l` gives one file per line with its permissions, owner, size and date.' },
  'ls -la': { term: 'ls -la', what: '`-l` for the detail, `-a` for the hidden files. The two are almost always used together.' },
  'package-management': { term: 'a package manager', what: 'The program that installs software for the whole system, so you do not download and unpack things by hand.' },
  'apt-get': { term: 'apt', what: 'The package manager on Debian and Ubuntu. It installs, updates and removes software.' },

  // ── Windows ───────────────────────────────────────────────────────────────
  dir: { term: 'dir', what: '`dir` lists what is in a folder: names, sizes and dates. It is the Windows way of looking around before you touch anything.' },
  'dir /a': { term: 'dir /a', what: '`/a` includes hidden files. Windows hides by attribute rather than by a dot in the name.' },
  'dir /b': { term: 'dir /b', what: '`/b` prints bare names only, with no heading or summary. It is the form to feed into another command.' },
  'dir /s': { term: 'dir /s', what: '`/s` searches this folder and every folder inside it.' },
  chdir: { term: 'chdir', what: '`chdir` is the same command as `cd`. Typed with no argument it prints where you are, which is what `pwd` does on Linux.' },
  type: { term: 'type', what: '`type` prints a whole file to the screen. It is the Windows equivalent of `cat`.' },
  tree: { term: 'tree', what: '`tree` draws the folder structure as a diagram, so you can see the shape of a disk at a glance.' },
  'tree /f': { term: 'tree /f', what: '`/f` includes the files, not only the folders.' },
  where: { term: 'where', what: '`where` tells you which file will actually run when you type a command name.' },
  copy: { term: 'copy', what: '`copy` duplicates a file, leaving the original in place.' },
  move: { term: 'move', what: '`move` relocates a file. Moving it within the same folder renames it.' },
  ren: { term: 'ren', what: '`ren` renames a file without moving it.' },
  del: { term: 'del', what: '`del` deletes a file. It does not go to the Recycle Bin.' },
  erase: { term: 'erase', what: '`erase` is the same command as `del`.' },
  md: { term: 'md', what: '`md` makes a new folder. `mkdir` does the same thing.' },
  rd: { term: 'rd', what: '`rd` removes a folder. `rmdir` does the same thing.' },
  rmdir: { term: 'rmdir', what: '`rmdir` removes a folder.' },
  cls: { term: 'cls', what: '`cls` clears the screen. Nothing is deleted; only the display is emptied.' },
  findstr: { term: 'findstr', what: '`findstr` searches inside files for a pattern. It is the Windows counterpart of `grep`.' },
  'findstr /i': { term: 'findstr /i', what: '`/i` ignores capitals when matching.' },
  set: { term: 'set', what: '`set` shows the environment variables, or creates one. With a name, it shows just that one.' },
  attrib: { term: 'attrib', what: '`attrib` shows and changes file attributes, including the hidden flag that keeps a file out of a plain `dir`.' },
  'hidden-attributes': { term: 'the hidden attribute', what: 'Windows marks a file hidden with a flag rather than a name. `dir /a` shows them; `attrib` changes them.' },
  'windows-attributes': { term: 'file attributes', what: 'Flags Windows keeps on a file: hidden, read-only, system, archive.' },
  tasklist: { term: 'tasklist', what: '`tasklist` lists the programs currently running, with the memory each is using.' },
  processes: { term: 'a process', what: 'One running program. The list changes constantly, and a snapshot of it is often the evidence.' },
  ipconfig: { term: 'ipconfig', what: '`ipconfig` shows how this machine is attached to the network: its addresses and its gateway.' },
  network: { term: 'the network settings', what: 'How a machine reaches other machines: its own address, and the router it sends everything through.' },
  systeminfo: { term: 'systeminfo', what: '`systeminfo` prints what the machine is: its name, its Windows version, its memory, when it was installed.' },
  certutil: { term: 'certutil', what: '`certutil -hashfile` computes a checksum on Windows. The tool does many other things; this is the part that matters here.' },
  hashing: { term: 'a hash', what: 'A short fingerprint computed from a file\'s contents. Change one byte and it changes completely, which is how you prove a file was not altered.' },
  md5sum: { term: 'md5sum', what: '`md5sum` computes a file\'s fingerprint. Two identical files always give the same one, and any change gives a different one.' },
  'windows-hashing': { term: 'hashing on Windows', what: 'The same idea as on Linux, through `certutil -hashfile` instead of `md5sum`.' },
  path: { term: 'PATH', what: 'The list of folders the shell searches when you type a command name. If a program is not on it, you must give its full path.' },
  'cmd-basics': { term: 'cmd.exe', what: 'The Windows command prompt. Older than PowerShell, still everywhere, and its own tradition rather than a variant of Linux.' },
  man: { term: 'man', what: '`man` opens a command\'s manual. Every real command has one, and it is the answer to "what does this flag do?".' }
};

/** Terms the packs teach that are their own vocabulary, not the shell's. */
export const PACK_OWNED_HINT =
  'This looks like course vocabulary rather than a shell concept. Define it in the pack, '
  + 'under manifest.glossary.';

/**
 * The definition for one `teaches` tag: the pack's if it has one, otherwise the
 * engine's, otherwise null.
 *
 * Pack-first is the same order every other override in this codebase uses, and
 * it is what lets a pack ship its own commands (`scan`, `extract`) and its own
 * vocabulary (`chain-of-custody`) without the engine knowing they exist.
 */
export function defineTerm(tag, manifest = null) {
  const own = manifest?.glossary?.[tag];
  if (own) {
    return typeof own === 'string'
      ? { term: tag, what: own, source: 'pack' }
      : { term: own.term || tag, what: own.what, source: 'pack' };
  }
  const engine = ENGINE_GLOSSARY[tag];
  return engine ? { ...engine, source: 'engine' } : null;
}

/**
 * Which definitions belong on which challenge: each tag is introduced on the
 * FIRST challenge, in act order, that claims to teach it.
 *
 * Derived rather than stored, and derived per pack rather than per student.
 * There is no "seen" state to keep, nothing to get out of step with a reseed,
 * and a student who comes back to practise an old challenge sees the definition
 * again — which is a feature, not a leak.
 *
 * @returns {Map<string, Array<{term, what, source, tag}>>} challenge id -> definitions
 */
export function firstEncounters(pack) {
  const byChallenge = new Map();
  const claimed = new Set();
  const ordered = [...(pack?.challenges || [])].sort((a, b) => (a.act || 0) - (b.act || 0));

  for (const challenge of ordered) {
    for (const tag of challenge.teaches || []) {
      if (claimed.has(tag)) continue;
      claimed.add(tag);
      const def = defineTerm(tag, pack.manifest);
      if (!def) continue;
      if (!byChallenge.has(challenge.id)) byChallenge.set(challenge.id, []);
      byChallenge.get(challenge.id).push({ ...def, tag });
    }
  }
  return byChallenge;
}

/** Tags a pack teaches that nothing defines. Used by the validator. */
export function undefinedTerms(pack) {
  const missing = new Map();
  for (const challenge of pack?.challenges || []) {
    for (const tag of challenge.teaches || []) {
      if (defineTerm(tag, pack.manifest)) continue;
      if (!missing.has(tag)) missing.set(tag, challenge.id);
    }
  }
  return [...missing].map(([tag, firstSeenIn]) => ({ tag, firstSeenIn }));
}

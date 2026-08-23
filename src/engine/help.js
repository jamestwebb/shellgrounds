// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Man pages and command help definitions for Shellgrounds

export const MAN_PAGES = {
  pwd: {
    name: 'pwd - print name of current/working directory',
    synopsis: 'pwd [-L | -P]',
    description: 'Print the full filename of the current working directory.\npwd tells you exactly where you stand in the directory tree.',
    options: [
      '-L, --logical   use PWD from environment, even if it contains symlinks',
      '-P, --physical  avoid all symlinks'
    ],
    examples: [
      'pwd             Print your current location (e.g. /home/analyst/training/level_1)'
    ]
  },
  ls: {
    name: 'ls - list directory contents',
    synopsis: 'ls [OPTION]... [FILE]...',
    description: 'List information about the FILEs (the current directory by default).\nSort entries alphabetically if none of -cftuvSUX nor --sort is specified.',
    options: [
      '-a, --all       do not ignore entries starting with . (reveals hidden dotfiles)',
      '-l              use a long listing format (shows permissions, owner, size, date)',
      '-la, -al        combine long format and hidden files'
    ],
    examples: [
      'ls              List visible files in current directory',
      'ls -la          Show all files including hidden files like .stash and .bashrc',
      'ls /mnt/c       Inspect the Windows filesystem via the WSL mount'
    ]
  },
  cd: {
    name: 'cd - change the shell working directory',
    synopsis: 'cd [dir]',
    description: 'Change the current directory to dir. The default dir is the value of the HOME shell variable (/home/analyst).\n\nSpecial arguments:\n  ..   Parent directory (climb upward one level)\n  ~    Home directory (/home/analyst)\n  -    Previous working directory',
    options: [
      '-L   force symbolic links to be followed',
      '-P   use the physical directory structure without following symbolic links'
    ],
    examples: [
      'cd training/level_1  Enter level_1',
      'cd ..                Climb up to the parent directory',
      'cd /mnt/c/Users      Navigate via absolute path to the Windows mount'
    ]
  },
  cat: {
    name: 'cat - concatenate files and print on the standard output',
    synopsis: 'cat [OPTION]... [FILE]...',
    description: 'Concatenate FILE(s) to standard output. With no FILE, or when FILE is -, read standard input.',
    options: [
      '-n, --number    number all output lines',
      '-b              number non-empty output lines'
    ],
    examples: [
      'cat welcome.txt             Read welcome.txt',
      'cat notes.txt access.log    Display both files in sequence'
    ]
  },
  head: {
    name: 'head - output the first part of files',
    synopsis: 'head [OPTION]... [FILE]...',
    description: 'Print the first 10 lines of each FILE to standard output. With more than one FILE, precede each with a header giving the file name. With no FILE, or when FILE is -, read standard input.',
    options: [
      '-n, --lines=[-]NUM   print the first NUM lines instead of the first 10; with the leading \'-\', print all but the last NUM lines of each file'
    ],
    examples: [
      'head access.log         Print the first 10 entries of access.log',
      'head -n 5 system.log    Print the first 5 lines of system.log'
    ]
  },
  tail: {
    name: 'tail - output the last part of files',
    synopsis: 'tail [OPTION]... [FILE]...',
    description: 'Print the last 10 lines of each FILE to standard output. With more than one FILE, precede each with a header giving the file name. With no FILE, or when FILE is -, read standard input.',
    options: [
      '-n, --lines=[+]NUM   output the last NUM lines, instead of the last 10; or use -n +NUM to output starting with line NUM',
      '-f, --follow         output appended data as the file grows'
    ],
    examples: [
      'tail access.log         Print the last 10 entries of access.log',
      'tail -n 3 alerts.log    Print the final 3 alerts'
    ]
  },
  less: {
    name: 'less - opposite of more; page through text files',
    synopsis: 'less [FILE]...',
    description: 'less is a program similar to more, but which allows backward movement in the file as well as forward movement.',
    options: [
      'q               Quit less and return to shell prompt',
      '/pattern        Search forward for matching pattern',
      'Space           Scroll forward one window'
    ],
    examples: [
      'less evidence.txt   Scroll interactively through large evidence log'
    ]
  },
  grep: {
    name: 'grep - print lines that match patterns',
    synopsis: 'grep [OPTION...] PATTERNS [FILE...]',
    description: 'grep searches for PATTERNS in each FILE. PATTERNS is one or more patterns separated by newline characters, and grep prints each line that matches a pattern.',
    options: [
      '-i, --ignore-case      ignore case distinctions in patterns and input data',
      '-v, --invert-match     invert the sense of matching, to select non-matching lines',
      '-c, --count            suppress normal output; instead print a count of matching lines',
      '-n, --line-number      prefix each line of output with the 1-based line number',
      '-E, --extended-regexp  interpret PATTERNS as extended regular expressions (allows a|b alternation)'
    ],
    examples: [
      'grep password secrets.txt          Find lines containing "password"',
      'grep -i error logs.txt             Case-insensitive match for error, ERROR, Error',
      'grep -v "ALLOW" firewall.log       Show all denied and suspicious network packets',
      'grep -E "CRITICAL|FATAL" alerts.log Search for either CRITICAL or FATAL events'
    ]
  },
  find: {
    name: 'find - search for files in a directory hierarchy',
    synopsis: 'find [path...] [expression]',
    description: 'find searches the directory tree rooted at each given starting-point by evaluating the given expression from left to right.',
    options: [
      '-name pattern   Base of file name (the path with the leading directories removed) matches shell pattern pattern',
      '-type [f|d]     File is of type: f (regular file), d (directory)',
      '-maxdepth n     Descend at most n directory levels'
    ],
    examples: [
      'find . -name "*.txt"      Find all .txt files in current subtree',
      'find / -type d            Find all directories on system',
      'find /mnt/c -name intake* Locate the intake dossier on the Windows mount'
    ]
  },
  file: {
    name: 'file - determine file type',
    synopsis: 'file [OPTION...] [FILE...]',
    description: 'file tests each argument in an attempt to classify it. There are three sets of tests, performed in this order: filesystem tests, magic tests, and language tests. File extensions are ignored in favor of magic bytes.',
    options: [
      '-b, --brief     do not prepend filenames to output lines (brief mode)',
      '-i, --mime      output mime type strings'
    ],
    examples: [
      'file mystery_file       Identify true format of header bytes regardless of filename',
      'file evidence.img       Confirm DOS/MBR partition header'
    ]
  },
  strings: {
    name: 'strings - print the sequences of printable characters in files',
    synopsis: 'strings [OPTION...] [FILE...]',
    description: 'strings prints the printable character sequences that are at least 4 characters long in files. In digital forensics, strings is essential for carving ASCII and UTF-8 strings from binary dumps, malware binaries, and memory images.',
    options: [
      '-n min-len      print sequences that are at least min-len characters long (default 4)',
      '-a              scan the entire file, not just data sections'
    ],
    examples: [
      'strings binary_data                Extract embedded text credentials from ELF binary',
      'strings memory.dmp | grep -i pass  Search memory capture for credentials'
    ]
  },
  md5sum: {
    name: 'md5sum - compute and check MD5 message digest',
    synopsis: 'md5sum [OPTION]... [FILE]...',
    description: 'Print or check MD5 (128-bit) checksums. Used in forensics to establish initial chain of custody hash.',
    options: [
      '-c, --check     read MD5 sums from the FILEs and check them',
      '--tag           create a BSD-style checksum'
    ],
    examples: [
      'md5sum evidence.img   Compute MD5 integrity hash of disk image'
    ]
  },
  sha256sum: {
    name: 'sha256sum - compute and check SHA256 message digest',
    synopsis: 'sha256sum [OPTION]... [FILE]...',
    description: 'Print or check SHA256 (256-bit) checksums. Standard cryptographic hash for digital evidence verification.',
    options: [
      '-c, --check     read SHA256 sums from the FILEs and check them'
    ],
    examples: [
      'sha256sum suspect.dd   Compute SHA-256 integrity hash'
    ]
  },
  wc: {
    name: 'wc - print newline, word, and byte counts for each file',
    synopsis: 'wc [OPTION]... [FILE]...',
    description: 'Print newline, word, and byte counts for each FILE, and a total line if more than one FILE is specified. With no FILE, or when FILE is -, read standard input.',
    options: [
      '-l, --lines     print the newline counts',
      '-w, --words     print the word counts',
      '-c, --bytes     print the byte counts'
    ],
    examples: [
      'wc -l access.log                     Count number of lines in access log',
      'grep -v "ALLOW" net.log | wc -l       Count number of non-allowed connections'
    ]
  },
  sort: {
    name: 'sort - sort lines of text files',
    synopsis: 'sort [OPTION]... [FILE]...',
    description: 'Write sorted concatenation of all FILE(s) to standard output.',
    options: [
      '-r, --reverse   reverse the result of comparisons',
      '-n, --numeric   compare according to string numerical value',
      '-u, --unique    output only the first of an equal run'
    ],
    examples: [
      'sort users.txt                  Sort lines alphabetically',
      'cat ips.txt | sort | uniq       Sort and remove duplicates'
    ]
  },
  cut: {
    name: 'cut - remove sections from each line of files',
    synopsis: 'cut OPTION... [FILE]...',
    description: 'Print selected parts of lines from each FILE to standard output.',
    options: [
      '-d DELIM        use DELIM instead of TAB for field delimiter',
      '-f LIST         select only these fields; also print any line that contains no delimiter character'
    ],
    examples: [
      'cut -d "," -f 3 security.csv    Extract 3rd column from CSV file',
      'cut -d ":" -f 1 /etc/passwd     List all username entries'
    ]
  },
  echo: {
    name: 'echo - display a line of text',
    synopsis: 'echo [SHORT-OPTION]... [STRING]...',
    description: 'Echo the STRING(s) to standard output.',
    options: [
      '-n              do not output the trailing newline',
      '-e              enable interpretation of backslash escapes'
    ],
    examples: [
      'echo "analyst note" > notes.txt    Write text into notes.txt',
      'echo "note appended" >> log.txt   Append text into log.txt'
    ]
  },
  map: {
    name: 'map - display the ASCII map of this filesystem',
    synopsis: 'map',
    description: 'Display a tree view of home, the training areas, evidence, logs, and the WSL bridge.',
    options: [],
    examples: [
      'map             Render the filesystem map'
    ]
  },
  submit: {
    name: 'submit - submit a captured flag for scoring',
    synopsis: 'submit [FLAG]',
    description: 'Submit a captured flag token (e.g. FLAG{...}) for cryptographic validation and leaderboard credit.',
    options: [],
    examples: [
      'submit FLAG{ABC123XYZ456}      Validate and record flag solve'
    ]
  },
  tracker: {
    name: 'tracker - filesystem sensor sweep utility',
    synopsis: 'tracker [-s sector] [-a]',
    description: 'A dedicated forensics tracking utility installed via apt-get. Sweeps the filesystem for sensor signatures.\n\nSPECIAL SECRET MANUAL ENTRY:\nThe sensor override code is [[FLAG:act3-man]].',
    options: [
      '-s <sector>     probe specific sector',
      '-a              all sectors telemetry scan'
    ],
    examples: [
      'tracker -a      Run a full sensor sweep'
    ]
  },
  scan: {
    name: 'scan - partition table and sector geometry analyzer',
    synopsis: 'scan <disk_image>',
    description: 'Scans raw forensic disk containers for partition headers, sector offsets, and filesystem magic bytes.',
    options: [
      '-v              verbose sector table dump'
    ],
    examples: [
      'scan suspect_drive.raw    Inspect partition table sector offsets'
    ]
  },
  extract: {
    name: 'extract - carve forensic volume at sector offset',
    synopsis: 'extract -o <sector_offset> <disk_image>',
    description: 'Carves volume header and extracts embedded forensic payloads at specified sector offset.',
    options: [
      '-o <offset>     specify partition start sector offset'
    ],
    examples: [
      'extract -o 206848 suspect_drive.raw    Carve active forensic partition'
    ]
  },
  clear: {
    name: 'clear - clear the terminal screen',
    synopsis: 'clear',
    description: 'Clears your terminal screen if possible.',
    options: [],
    examples: ['clear']
  },
  help: {
    name: 'help - display information about builtin commands',
    synopsis: 'help [pattern]',
    description: 'Displays brief summaries of the commands available in this terminal.',
    options: [],
    examples: ['help', 'man grep']
  }
};

export const LINUX_HELP = {
  pwd:       'pwd - print name of current working directory\nUsage: pwd',
  ls:        'ls - list directory contents\nUsage: ls [-la] [directory]\nOptions: -l (long format), -a (show hidden dotfiles)',
  cd:        'cd - change working directory\nUsage: cd [directory] (use "cd .." to climb up, "cd ~" for home)',
  cat:       'cat - concatenate and display file contents\nUsage: cat <file>',
  head:      'head - output the first part of a file\nUsage: head [-n lines] <file>',
  tail:      'tail - output the last part of a file\nUsage: tail [-n lines] <file>',
  less:      'less - view file contents interactively (press q to quit)\nUsage: less <file>',
  grep:      'grep - search for patterns in files or standard input\nUsage: grep [-i] [-v] <pattern> [file]',
  find:      'find - search for files in directory hierarchy\nUsage: find <path> -name <pattern> | -type [f|d]',
  file:      'file - determine true file type by header bytes\nUsage: file <file>',
  strings:   'strings - extract printable ASCII strings from binary\nUsage: strings <file>',
  md5sum:    'md5sum - compute MD5 message digest\nUsage: md5sum <file>',
  sha256sum: 'sha256sum - compute SHA-256 cryptographic digest\nUsage: sha256sum <file>',
  wc:        'wc - print newline, word, and byte counts\nUsage: wc [-l] [file]',
  sort:      'sort - sort lines of text files\nUsage: sort [-r] [-n] [file]',
  cut:       'cut - remove sections from each line\nUsage: cut -d <delim> -f <field> [file]',
  echo:      'echo - display a line of text\nUsage: echo "text" [> file]',
  man:       'man - format and display on-line manual pages\nUsage: man <command>',
  map:       'map - display ASCII map of this filesystem\nUsage: map',
  submit:    'submit - submit flag for scoring\nUsage: submit <flag_string>',
  tracker:   'tracker - sensor sweep utility (installed via apt-get)\nUsage: tracker -a',
  scan:      'scan - inspect partition table offsets\nUsage: scan <image_file>',
  extract:   'extract - carve volume at sector offset\nUsage: extract -o <offset> <image_file>',
  clear:     'clear - clear terminal screen\nUsage: clear',
  help:      'help - display available commands list\nUsage: help'
};

export const WINDOWS_HELP = {
  cd:       'CD - Displays or changes the current directory.\nUsage: CD [directory]\n\nExamples:\n  CD Documents    Change to Documents directory\n  CD ..           Go up one level\n  CD              Show current directory',
  dir:      'DIR - Displays a list of files and subdirectories.\nUsage: DIR [/A] [directory]\n\nOptions:\n  /A    Show hidden and system files',
  type:     'TYPE - Displays the contents of a text file.\nUsage: TYPE <filename>',
  find:     'FIND - Searches for a text string in a file.\nUsage: FIND "string" <filename>\n\nThe search string must be in quotes.',
  findstr:  'FINDSTR - Searches for strings in files using regular expressions.\nUsage: FINDSTR [/I] "pattern" <filename>\n\nOptions:\n  /I    Case-insensitive search',
  certutil: 'CERTUTIL - Certificate utility, commonly used for hashing.\nUsage: CERTUTIL -hashfile <filename> [algorithm]\n\nAlgorithms: MD5, SHA1, SHA256\n\nExample:\n  CERTUTIL -hashfile evidence.dd SHA256',
  attrib:   'ATTRIB - Displays or changes file attributes.\nUsage: ATTRIB <filename>\n\nAttributes: R=Read-only, H=Hidden, S=System, A=Archive',
  cls:      'CLS - Clears the screen.\nUsage: CLS',
  help:     'HELP - Displays available commands.\nUsage: HELP'
};

export function formatManPage(cmd) {
  const page = MAN_PAGES[cmd.toLowerCase()];
  if (!page) {
    return `No manual entry for ${cmd}`;
  }

  const lines = [
    `NAME`,
    `    ${page.name}`,
    ``,
    `SYNOPSIS`,
    `    ${page.synopsis}`,
    ``,
    `DESCRIPTION`,
    `    ${page.description.replace(/\n/g, '\n    ')}`,
    ``
  ];

  if (page.options && page.options.length > 0) {
    lines.push(`OPTIONS`);
    page.options.forEach(opt => {
      lines.push(`    ${opt}`);
    });
    lines.push(``);
  }

  if (page.examples && page.examples.length > 0) {
    lines.push(`EXAMPLES`);
    page.examples.forEach(ex => {
      lines.push(`    ${ex}`);
    });
    lines.push(``);
  }

  return lines.join('\n');
}

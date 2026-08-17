// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Challenge manifest and metadata for The Gauntlet

export const ACT_DEFINITIONS = [
  {
    id: 1,
    name: 'Act I: First Steps',
    tagline: 'Basic navigation, paths, prompt, and directory structure',
    icon: '🧭',
    glyph: '─·─',
    unlockThreshold: 0.0 // Unlocked by default
  },
  {
    id: 2,
    name: 'Act II: Reading the Evidence',
    tagline: 'Inspecting files, headers, and forensic checksums',
    icon: '📜',
    glyph: '─··─',
    unlockThreshold: 0.8 // 80% of Act I completed
  },
  {
    id: 3,
    name: 'Act III: Search & Discovery',
    tagline: 'Pattern search, find, manual pages, and the WSL /mnt/c bridge',
    icon: '🔎',
    glyph: '─···─',
    unlockThreshold: 0.8 // 80% of Act II completed
  },
  {
    id: 4,
    name: 'Act IV: The Plumbing',
    tagline: 'Pipes, redirection, filters, and multi-stage analysis',
    icon: '🔧',
    glyph: '─[|||]─',
    unlockThreshold: 0.8 // 80% of Act III completed
  },
  {
    id: 5,
    name: 'Act V: The Capstone',
    tagline: 'Multi-step investigation: partition offsets and evidence carving',
    icon: '🏁',
    glyph: '═★═',
    unlockThreshold: 0.8 // 80% of Act IV completed
  },
  {
    id: 6,
    name: 'Topside (Windows Quest)',
    tagline: 'Windows CMD parity: dir /a, type, findstr, attrib, and certutil',
    icon: '🪟',
    glyph: '[ C:\\>_ ]',
    unlockThreshold: 0.0, // Open any time as optional side-quest
    platform: 'windows'
  }
];

export const BADGE_DEFINITIONS = [
  {
    id: 'badge-groundbreaker',
    name: 'Groundbreaker',
    description: 'Completed Act I and found your bearings in the terminal.',
    icon: '⛏️',
    color: 'from-emerald-500 to-green-600',
    act: 1
  },
  {
    id: 'badge-signal',
    name: 'Signal in the Noise',
    description: 'Excavated hidden evidence using cryptographic hashes and file headers.',
    icon: '🔍',
    color: 'from-cyan-500 to-blue-600',
    act: 2
  },
  {
    id: 'badge-crossed-over',
    name: 'Crossed Over',
    description: 'Bridged Linux and Windows through the WSL mount at /mnt/c.',
    icon: '🌉',
    color: 'from-purple-500 to-indigo-600',
    act: 3
  },
  {
    id: 'badge-plumber',
    name: 'Master Plumber',
    description: 'Constructed multi-stage data pipelines and redirected standard streams.',
    icon: '🚰',
    color: 'from-amber-500 to-yellow-600',
    act: 4
  },
  {
    id: 'badge-out-of-warren',
    name: 'Gauntlet Champion',
    description: 'Solved the Capstone investigation and recovered the master evidence.',
    icon: '🏆',
    color: 'from-yellow-400 to-amber-500',
    special: true,
    act: 5
  },
  {
    id: 'badge-topsider',
    name: 'Topsider',
    description: 'Mastered the surface Windows Command Prompt forensic toolset.',
    icon: '🪟',
    color: 'from-blue-400 to-cyan-500',
    act: 6
  }
];

export const CHALLENGES = [
  // ==========================================
  // ACT I: FIRST STEPS
  // ==========================================
  {
    id: 'act1-pwd',
    act: 1,
    title: 'Where Am I?',
    points: 10,
    brief: 'Use the `pwd` command to print the directory you are standing in.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^pwd$'
    },
    hints: [
      { cost: 0, text: 'Type `pwd` (Present Working Directory) and press Enter.' }
    ],
    successMessage: 'You are at /home/analyst. `pwd` always prints your absolute location in the directory tree.',
    teaches: ['pwd', 'working-directory']
  },
  {
    id: 'act1-ls',
    act: 1,
    title: 'Survey the Ground',
    points: 10,
    brief: 'Use `ls` to list the files and directories where you are standing.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^ls(\\s+\\.)?$'
    },
    hints: [
      { cost: 0, text: 'Type `ls` to list files and folders.' }
    ],
    successMessage: '`ls` lists directory contents. You can see Documents, Downloads, evidence, and training.',
    teaches: ['ls']
  },
  {
    id: 'act1-hidden',
    act: 1,
    title: 'Hidden in Plain Sight',
    points: 15,
    brief: 'Something is hiding in your home directory. In Linux, files beginning with `.` are invisible to a plain `ls`. Use `ls -la` to find `.stash`, read it with `cat .stash`, and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/.stash'
    },
    hints: [
      { cost: 0, text: 'Run `ls -la` or `ls -a` to reveal files starting with a dot (`.`).' },
      { cost: 5, text: 'Run `cat .stash` to read the hidden file, then copy the FLAG{...} value and run `submit FLAG{...}`.' }
    ],
    successMessage: 'Dotfiles like `.bashrc` and `.stash` are hidden by default. In cyber forensics, malware and adversaries frequently disguise payloads as dotfiles.',
    teaches: ['ls -la', 'hidden-files', 'dotfiles', 'submit']
  },
  {
    id: 'act1-cd',
    act: 1,
    title: 'One Level Down',
    points: 15,
    brief: 'Move into `training/level_1`. Read `checkpoint_alpha.txt` and submit the recovered flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/training/level_1/checkpoint_alpha.txt'
    },
    hints: [
      { cost: 0, text: 'Use `cd training/level_1` to move down into it.' },
      { cost: 5, text: 'Run `cat checkpoint_alpha.txt` to view the flag, then run `submit FLAG{...}`.' }
    ],
    successMessage: '`cd` changes your working directory. You navigated down through child directory `training` into `level_1`.',
    teaches: ['cd', 'relative-paths']
  },
  {
    id: 'act1-paths',
    act: 1,
    title: 'Sideways Move',
    points: 15,
    brief: 'Now reach `training/level_2` — a SIBLING of level_1, not a child. If you are inside level_1, you must go up before you can go over. Read `checkpoint_beta.txt` and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/training/level_2/checkpoint_beta.txt'
    },
    hints: [
      { cost: 0, text: 'If you are in level_1, run `cd ..` to go up to `training`, then `cd level_2`.' },
      { cost: 5, text: 'Then `cat checkpoint_beta.txt` and submit the flag it contains.' }
    ],
    successMessage: '`..` represents the parent directory. `cd ..` moves you up one level toward the root.',
    teaches: ['cd ..', 'parent-directories']
  },
  {
    id: 'act1-tab',
    act: 1,
    title: 'Warp Speed (Tab Completion)',
    points: 15,
    brief: 'Typing full directory paths is slow. Type `cd Doc` and press Tab to auto-complete `cd Documents`, then press Enter.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^cd\\s+Documents/?$'
    },
    hints: [
      { cost: 0, text: 'Type `cd Doc` then press the Tab key. The shell will auto-complete to `cd Documents`.' }
    ],
    successMessage: 'Tab completion prevents typos and speeds up navigation. In intense incident response, Tab is indispensable.',
    teaches: ['tab-completion']
  },
  {
    id: 'act1-history',
    act: 1,
    title: 'Recall the Past (History)',
    points: 10,
    brief: 'Run `pwd`. Then press the Up Arrow key on your keyboard to recall `pwd` without retyping it, and run it again.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^pwd$'
    },
    hints: [
      { cost: 0, text: 'Run `pwd`, then press Up Arrow and Enter.' }
    ],
    successMessage: 'Up/Down arrows cycle through your command history. Combined with Tab completion, you can operate the terminal with rapid precision.',
    teaches: ['history', 'arrow-keys']
  },

  // ==========================================
  // ACT II: READING THE EVIDENCE
  // ==========================================
  {
    id: 'act2-cat',
    act: 2,
    title: 'Read the Dossier',
    points: 15,
    brief: 'Read `Documents/case_notes.txt` to review the preliminary findings on the unauthorized sector breach.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^cat\\s+(Documents/case_notes\\.txt|"Documents/case_notes\\.txt"|case_notes\\.txt)'
    },
    hints: [
      { cost: 0, text: 'Type `cat Documents/case_notes.txt`' }
    ],
    successMessage: '`cat` concatenates and prints entire file contents. Great for dossiers, configurations, and small text files.',
    teaches: ['cat']
  },
  {
    id: 'act2-head',
    act: 2,
    title: 'The Earliest Anomaly',
    points: 15,
    brief: '`Documents/access.log` contains extensive records. Use `head -n 5 Documents/access.log` to view only the first 5 log entries.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^head\\s+(-n\\s*5|-5)\\s+Documents/access\\.log'
    },
    hints: [
      { cost: 0, text: 'Run: `head -n 5 Documents/access.log`' }
    ],
    successMessage: '`head` outputs the start of a file (default 10 lines). `-n 5` restricts it to the first 5 records.',
    teaches: ['head', 'head -n']
  },
  {
    id: 'act2-tail',
    act: 2,
    title: 'The Sensor Freeze',
    points: 20,
    brief: 'The critical incident occurred right before sensors went dark. Use `tail` on `Documents/access.log` to read the final log entries and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/Documents/access.log'
    },
    hints: [
      { cost: 0, text: 'Run `tail -n 10 Documents/access.log` or `tail Documents/access.log`.' },
      { cost: 5, text: 'Find the flag on the final line and run `submit FLAG{...}`.' }
    ],
    successMessage: '`tail` displays the final lines of a file. In live forensics, `tail -f` streams incoming logs in real-time.',
    teaches: ['tail', 'log-analysis']
  },
  {
    id: 'act2-file',
    act: 2,
    title: "Don't Trust Extensions",
    points: 20,
    brief: 'Adversaries often rename files to trick analysts. Use `file evidence/mystery_file` to determine its true data format based on magic bytes.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^file\\s+evidence/mystery_file'
    },
    hints: [
      { cost: 0, text: 'Run `file evidence/mystery_file`' }
    ],
    successMessage: 'The `file` command examines file signatures (magic bytes). Never assume a file is safe or text based on its extension!',
    teaches: ['file', 'magic-bytes']
  },
  {
    id: 'act2-strings',
    act: 2,
    title: 'Carving Binary Artifacts',
    points: 25,
    brief: '`evidence/binary_data` is an executable containing compiled instructions. Use `strings evidence/binary_data` to extract embedded readable text and submit the discovered flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/evidence/binary_data'
    },
    hints: [
      { cost: 0, text: 'Run `strings evidence/binary_data`' },
      { cost: 5, text: 'Look for `TARGET_FLAG=FLAG{...}` in the output and submit it.' }
    ],
    successMessage: '`strings` extracts 4+ character ASCII/printable strings from binaries, memory dumps, and corrupt files. It is standard for malware triage.',
    teaches: ['strings', 'binary-analysis']
  },
  {
    id: 'act2-md5',
    act: 2,
    title: 'Integrity Checksum (MD5)',
    points: 25,
    brief: 'Digital evidence requires strict chain of custody verification. Calculate the MD5 hash of `evidence/evidence.img` using `md5sum`, inspect the evidence header, and submit the flag inside.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/evidence/evidence.img'
    },
    hints: [
      { cost: 0, text: 'Run `md5sum evidence/evidence.img` to compute the hash.' },
      { cost: 5, text: 'View `cat evidence/evidence.img` to read the partition sector signature flag, then submit it.' }
    ],
    successMessage: 'Always hash evidence upon acquisition and before/after examination to prove the forensic image was not altered.',
    teaches: ['md5sum', 'chain-of-custody']
  },

  // ==========================================
  // ACT III: SEARCH & DISCOVERY
  // ==========================================
  {
    id: 'act3-grep',
    act: 3,
    title: 'Secrets in Plain Sight',
    points: 25,
    brief: 'Search `Documents/secrets.txt` for the line containing `vault_passcode` using `grep`, then submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/Documents/secrets.txt'
    },
    hints: [
      { cost: 0, text: 'Run: `grep vault_passcode Documents/secrets.txt`' },
      { cost: 5, text: 'Submit the resulting FLAG{...} flag.' }
    ],
    successMessage: '`grep` searches files for matching text strings. It is one of the most powerful utilities in the Unix ecosystem.',
    teaches: ['grep']
  },
  {
    id: 'act3-grepi',
    act: 3,
    title: 'Case-Insensitive Searching',
    points: 30,
    brief: '`Documents/logs.txt` logs errors inconsistently as "error", "ERROR", and "Error". Use `grep -i "error" Documents/logs.txt` to find all corrupted stream entries and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/Documents/logs.txt'
    },
    hints: [
      { cost: 0, text: 'Use the `-i` flag: `grep -i "error" Documents/logs.txt`' },
      { cost: 5, text: 'Find the corrupted pipeline flag and submit it.' }
    ],
    successMessage: '`grep -i` ignores case distinctions, making it essential when analyzing unstructured application logs.',
    teaches: ['grep -i']
  },
  {
    id: 'act3-find',
    act: 3,
    title: 'Needle in /var/log',
    points: 30,
    brief: 'Locate all log files in `/var/log` using `find /var/log -name "*.log"`. Read the sensor audit log and submit the keycode flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/var/log/sensor_audit.log'
    },
    hints: [
      { cost: 0, text: 'Run `find /var/log -name "*.log"` to see every log that exists there.' },
      { cost: 10, text: 'Read the audit log you found with `cat` and submit the flag.' }
    ],
    successMessage: '`find` traverses entire directory hierarchies searching by filename patterns, file types, timestamps, and sizes.',
    teaches: ['find', 'find -name']
  },
  {
    id: 'act3-crossing',
    act: 3,
    title: 'The WSL Bridge',
    points: 40,
    brief: 'This machine has a Windows side. Its folder `C:\\Users\\analyst\\Desktop\\CASE_FILES` is reachable from Linux because WSL mounts drive C: at `/mnt/c`. Read `/mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt` and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt'
    },
    hints: [
      { cost: 0, text: 'WSL mounts Windows drives under `/mnt/c`. Check `ls /mnt/c/Users/analyst/Desktop/CASE_FILES`.' },
      { cost: 10, text: 'Run `cat /mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt` and submit the verification flag.' }
    ],
    successMessage: 'That is the WSL bridge: `C:\\Users\\x` on Windows maps to `/mnt/c/Users/x` in Linux. Case 001 asks you to navigate this bridge — now you have seen it work.',
    teaches: ['wsl-paths', '/mnt/c']
  },
  {
    id: 'act3-crossing-solo',
    act: 3,
    title: 'The Bridge, Unassisted',
    points: 45,
    brief: 'A second dossier sits on the Windows side at `C:\\Users\\analyst\\Documents\\surface_notes.txt`. Reach it from this Linux shell and submit the flag inside. This time, no path translation is given — Case 001 will not give you one either.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/mnt/c/Users/analyst/Documents/surface_notes.txt'
    },
    hints: [
      { cost: 0, text: 'Windows drives are mounted somewhere under the Linux root. Start with `ls /` and explore.' },
      { cost: 15, text: '`ls /mnt` shows the mounted drives. Translate the rest of the Windows path into Linux form yourself: `C:\\` becomes `/mnt/c/`, and backslashes become forward slashes.' }
    ],
    successMessage: 'You translated a Windows path to its WSL location without a map. In Case 001 §1C the lab deliberately withholds this answer — you already own it.',
    teaches: ['wsl-paths', 'path-translation']
  },
  {
    id: 'act3-man',
    act: 3,
    title: 'Consult the Manual',
    points: 30,
    brief: 'Real forensic analysts read the manual. Use `man tracker` to inspect the on-line manual page for the tracker sensor suite, uncover the secret manual override code, and submit it.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag'
    },
    hints: [
      { cost: 0, text: 'Run `man tracker` in the terminal.' },
      { cost: 10, text: 'Read the DESCRIPTION section carefully — the override code is buried in it. Submit the FLAG{...} code you find there.' }
    ],
    successMessage: '`man` renders standard UNIX manual documentation. When encountering unfamiliar forensic tools on exams or cases, `man <tool>` is your first line of defense.',
    teaches: ['man']
  },
  {
    id: 'act3-apt',
    act: 3,
    title: 'Deploy the Sensor Suite (apt-get)',
    points: 35,
    brief: 'The `tracker` tool is not yet installed on this node. Run `sudo apt-get update && sudo apt-get install tracker -y` to install it, then execute `tracker -a` to run a full sensor sweep and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: 'tracker'
    },
    hints: [
      { cost: 0, text: 'Run: `sudo apt-get update && sudo apt-get install tracker -y`' },
      { cost: 10, text: 'Once installed, run `tracker -a` and submit the returned flag.' }
    ],
    successMessage: '`apt-get` is Debian/Ubuntu\'s package management suite. In Case 001 §1B, you will install forensic tool packages on your live Linux workstation.',
    teaches: ['apt-get', 'sudo', 'package-management']
  },

  // ==========================================
  // ACT IV: THE PLUMBING
  // ==========================================
  {
    id: 'act4-grep-v',
    act: 4,
    title: 'Filter the Noise (Inverted Grep)',
    points: 40,
    brief: '`Documents/network_stream.log` is filled with normal `ALLOW` traffic. Use `grep -v "ALLOW" Documents/network_stream.log` to filter out benign packets, isolate the critical leak packet, and submit the flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/Documents/network_stream.log'
    },
    hints: [
      { cost: 0, text: 'Run: `grep -v "ALLOW" Documents/network_stream.log`' },
      { cost: 10, text: 'Find the CRITICAL_DATA_LEAK entry and submit the flag.' }
    ],
    successMessage: '`grep -v` inverts matches, displaying all lines that do NOT match the pattern. Essential for removing known-good noise during investigations.',
    teaches: ['grep -v', 'inverted-matching']
  },
  {
    id: 'act4-pipe-count',
    act: 4,
    title: 'First Pipeline (grep | wc -l)',
    points: 45,
    brief: 'Pipelines connect commands together using `|`. Pipe non-allowed network packets into `wc -l` to count how many anomalies exist: `grep -v "ALLOW" Documents/network_stream.log | wc -l`.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: 'grep\\s+-v\\s+["\']?ALLOW["\']?\\s+Documents/network_stream\\.log\\s*\\|\\s*wc\\s+-l'
    },
    hints: [
      { cost: 0, text: 'Type: `grep -v "ALLOW" Documents/network_stream.log | wc -l`' }
    ],
    successMessage: 'The pipe `|` sends the stdout of `grep` into the stdin of `wc -l`. You just constructed your first Unix pipeline!',
    teaches: ['pipes', 'wc -l']
  },
  {
    id: 'act4-pipe-csv',
    act: 4,
    title: 'Extracting Fields (cut & grep)',
    points: 45,
    brief: '`Documents/security_events.csv` holds comma-delimited logs. Pipe `grep "FLAG_EMIT" Documents/security_events.csv | cut -d, -f6` to extract the flag column and submit the token.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: '/home/analyst/Documents/security_events.csv'
    },
    hints: [
      { cost: 0, text: 'Run `grep "FLAG_EMIT" Documents/security_events.csv | cut -d, -f6` or `cat Documents/security_events.csv | grep FLAG_EMIT`.' },
      { cost: 10, text: 'Submit the extracted FLAG{...} flag.' }
    ],
    successMessage: 'Combining `grep` with `cut -d, -f<N>` lets you slice columns out of structured logs without complex spreadsheets.',
    teaches: ['cut', 'csv-parsing', 'pipes']
  },
  {
    id: 'act4-redirect',
    act: 4,
    title: 'Output Redirection (>)',
    points: 50,
    brief: 'The `>` operator redirects output to a file on disk instead of the screen. Extract all ERROR lines from `Documents/logs.txt` and save them into `/tmp/errors.log`: `grep -i "error" Documents/logs.txt > /tmp/errors.log`. Then `cat /tmp/errors.log`.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'state',
      check: (fs) => fs['/tmp/errors.log'] && fs['/tmp/errors.log'].content && fs['/tmp/errors.log'].content.length > 20
    },
    hints: [
      { cost: 0, text: 'Run: `grep -i "error" Documents/logs.txt > /tmp/errors.log`' },
      { cost: 10, text: 'After running the command, check `cat /tmp/errors.log` to verify your file was created.' }
    ],
    successMessage: 'Redirection `>` writes stdout directly into the filesystem. You can inspect your redirected file anytime with `cat`!',
    teaches: ['redirection', '>']
  },

  // ==========================================
  // ACT V: THE CAPSTONE
  // ==========================================
  {
    id: 'act5-scan',
    act: 5,
    title: 'Partition Geometry Inspection',
    points: 60,
    brief: 'Raw forensic image `evidence/suspect_drive.raw` contains multiple partition slices. Run `scan evidence/suspect_drive.raw` to analyze the partition table and identify the starting sector offset of the Evidence Vault partition.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'command',
      matchRegex: '^scan\\s+(evidence/suspect_drive\\.raw|"evidence/suspect_drive\\.raw")'
    },
    hints: [
      { cost: 0, text: 'Run: `scan evidence/suspect_drive.raw`' }
    ],
    successMessage: 'The partition table identifies partition 2 (Evidence Vault) beginning at sector offset 206848. You will carry this offset into the next step.',
    teaches: ['partition-tables', 'sector-offsets']
  },
  {
    id: 'act5-capstone',
    act: 5,
    title: 'Carve the Evidence (Finish Line)',
    points: 120,
    brief: 'Take the sector offset `206848` discovered in the partition scan and pass it to the forensic carver: `extract -o 206848 evidence/suspect_drive.raw`. Submit the decrypted Master Capstone Flag.',
    setup: { cwd: '/home/analyst' },
    success: {
      kind: 'flag',
      flagFile: 'act5-capstone'
    },
    hints: [
      { cost: 0, text: 'Run: `extract -o 206848 evidence/suspect_drive.raw`' },
      { cost: 20, text: 'Submit the master flag `FLAG{...}` printed in the terminal.' }
    ],
    successMessage: 'Congratulations, Analyst! You read partition geometry, carried an offset from one tool into another, and carved out the master evidence. That is exactly the move Case 003 will ask of you.',
    teaches: ['multi-step-forensics', 'evidence-carving', 'flag-chaining']
  },

  // ==========================================
  // TOPSIDE QUEST (WINDOWS CMD)
  // ==========================================
  {
    id: 'topside-nav',
    act: 6,
    platform: 'windows',
    title: 'Windows Navigation (dir & cd)',
    points: 15,
    brief: 'In Windows CMD, `cd` alone displays your current working directory, and `dir` lists files. Run `dir` to inspect `C:\\Users\\Analyst`.',
    setup: { cwd: 'C:\\Users\\Analyst' },
    success: {
      kind: 'command',
      matchRegex: '^dir$'
    },
    hints: [
      { cost: 0, text: 'Type `dir` and press Enter.' }
    ],
    successMessage: '`dir` is the Windows equivalent of `ls`. Notice Windows paths use backslashes (`\\`).',
    teaches: ['dir', 'cmd-basics']
  },
  {
    id: 'topside-attrib',
    act: 6,
    platform: 'windows',
    title: 'Hidden File Attributes (attrib)',
    points: 20,
    brief: 'Windows uses attributes rather than dotfiles for hidden files. Run `attrib evidence\\mystery_file`, then `type evidence\\mystery_file` to recover the hidden Topside flag.',
    setup: { cwd: 'C:\\Users\\Analyst' },
    success: {
      kind: 'flag',
      flagFile: 'C:\\Users\\Analyst\\evidence\\mystery_file'
    },
    hints: [
      { cost: 0, text: 'Run `attrib evidence\\mystery_file` to view its H (Hidden) attribute.' },
      { cost: 5, text: 'Run `type evidence\\mystery_file` and submit the flag.' }
    ],
    successMessage: '`attrib` displays and modifies file attributes: R=Read-only, H=Hidden, S=System, A=Archive.',
    teaches: ['attrib', 'type', 'windows-attributes']
  },
  {
    id: 'topside-findstr',
    act: 6,
    platform: 'windows',
    title: 'Windows String Search (findstr /i)',
    points: 25,
    brief: 'Use `findstr /i "marker" Documents\\logs.txt` to search the Windows event log for the flagged event and submit the flag.',
    setup: { cwd: 'C:\\Users\\Analyst' },
    success: {
      kind: 'flag',
      flagFile: 'C:\\Users\\Analyst\\Documents\\logs.txt'
    },
    hints: [
      { cost: 0, text: 'Run: `findstr /i "marker" Documents\\logs.txt`' },
      { cost: 5, text: 'Submit the discovered flag.' }
    ],
    successMessage: '`findstr /i` is the Windows CMD equivalent of `grep -i`. It supports regular expression matching with `/r`.',
    teaches: ['findstr', 'findstr /i']
  },
  {
    id: 'topside-certutil',
    act: 6,
    platform: 'windows',
    title: 'CertUtil Hashing',
    points: 20,
    brief: 'In Windows environments, `certutil -hashfile <file> MD5` is used for forensic integrity checks. Calculate the MD5 hash of `evidence\\evidence.img`.',
    setup: { cwd: 'C:\\Users\\Analyst' },
    success: {
      kind: 'command',
      matchRegex: '^certutil\\s+-hashfile\\s+evidence(\\\\|/)evidence\\.img\\s+MD5'
    },
    hints: [
      { cost: 0, text: 'Run: `certutil -hashfile evidence\\evidence.img MD5`' }
    ],
    successMessage: '`certutil -hashfile` supports MD5, SHA1, and SHA256 without needing third-party utilities on Windows workstations.',
    teaches: ['certutil', 'windows-hashing']
  }
];

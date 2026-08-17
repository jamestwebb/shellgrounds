// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Honest messages for commands this simulator does not implement.
//
// Saying "command not found" for `top` teaches a beginner something FALSE:
// top is a real Linux command, it just is not simulated here. These messages
// keep the student's mental model of the real shell accurate.

// Real Linux commands a curious student is likely to try. Not exhaustive —
// anything not listed falls back to the honest "not recognized" wording.
const REAL_LINUX = new Set([
  // processes & system
  'top', 'htop', 'ps', 'kill', 'killall', 'pkill', 'jobs', 'bg', 'fg', 'nice',
  'free', 'uptime', 'df', 'du', 'uname', 'whoami', 'id', 'who', 'w', 'date',
  'cal', 'history', 'alias', 'export', 'env', 'which', 'whereis', 'locate',
  'su', 'systemctl', 'service', 'mount', 'umount', 'lsblk', 'fdisk', 'dmesg',
  'journalctl', 'shutdown', 'reboot', 'crontab', 'lsof', 'strace', 'watch',
  // files & directories
  'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'ln', 'chmod', 'chown', 'chgrp',
  'stat', 'tree', 'basename', 'dirname', 'realpath', 'rsync', 'shred',
  // text processing
  'nano', 'vim', 'vi', 'emacs', 'awk', 'sed', 'tr', 'uniq', 'diff', 'tee',
  'more', 'split', 'paste', 'join', 'column', 'fold', 'rev', 'nl', 'jq',
  // network
  'ping', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'ifconfig', 'ip', 'netstat',
  'ss', 'dig', 'nslookup', 'traceroute', 'nmap', 'tcpdump', 'nc', 'netcat',
  // archives
  'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'xz', 'bzip2', '7z',
  // misc
  'git', 'python', 'python3', 'node', 'npm', 'pip', 'make', 'gcc', 'seq',
  'sleep', 'yes', 'xargs', 'test', 'expr', 'bc', 'printf', 'read', 'exit',
  'logout', 'clear_history', 'apt', 'apt-get', 'yum', 'dnf', 'snap'
]);

// Forensics tooling from the course — worth naming the context explicitly.
const COURSE_TOOLS = {
  dd: 'a raw imaging tool you will use for acquisition',
  hexdump: 'a hex viewer used to inspect file headers',
  xxd: 'a hex viewer used to inspect file headers',
  sha1sum: 'a hashing tool (this simulator has md5sum and sha256sum)',
  openssl: 'a crypto toolkit used for hashing and certificates',
  mmls: 'a Sleuth Kit tool for reading partition tables — Case 003 uses it for real',
  fsstat: 'a Sleuth Kit tool for filesystem details — Case 003 uses it for real',
  fls: 'a Sleuth Kit tool for listing files, including deleted ones — Case 003 uses it',
  icat: 'a Sleuth Kit tool for extracting file content by inode',
  mactime: 'a Sleuth Kit tool for building timelines — Case 005 uses it',
  tsk_recover: 'a Sleuth Kit recovery tool',
  exiftool: 'a metadata reader for documents and images — Case 004 uses it',
  volatility: 'a memory-forensics framework — Case 007 uses it',
  vol: 'the Volatility 3 command for memory forensics — Case 007 uses it',
  binwalk: 'a firmware and embedded-file carver',
  foremost: 'a file-carving tool',
  photorec: 'a file-recovery tool',
  testdisk: 'a partition-recovery tool',
  autopsy: 'the graphical front end to the Sleuth Kit',
  wireshark: 'a network protocol analyzer — Case 006 uses it',
  tshark: 'the command-line version of Wireshark',
  sqlite3: 'a command-line SQLite client — Case 001 inspects browser databases'
};

// Same command, other operating system — the single most useful correction.
const CROSS_PLATFORM = {
  linux: { dir: 'ls', type: 'cat', cls: 'clear', findstr: 'grep', copy: 'cp', move: 'mv', del: 'rm', ren: 'mv', certutil: 'md5sum or sha256sum' },
  windows: { ls: 'dir', cat: 'type', clear: 'cls', grep: 'findstr', cp: 'copy', mv: 'move', rm: 'del', pwd: 'cd (with no arguments)', md5sum: 'certutil -hashfile <file> MD5' }
};

/**
 * Builds the message for a command the simulator does not implement.
 * The phrase "not available in this simulator" is treated as an error marker
 * elsewhere, so these never satisfy a challenge.
 */
export function unknownCommandMessage(command, platform = 'linux') {
  const cmd = (command || '').toLowerCase();

  const otherName = CROSS_PLATFORM[platform]?.[cmd];
  if (otherName) {
    const thisOs = platform === 'windows' ? 'Windows CMD' : 'Linux';
    const otherOs = platform === 'windows' ? 'Linux' : 'Windows';
    return `${command}: that is the ${otherOs} name. On ${thisOs}, use \`${otherName}\` instead.`;
  }

  if (COURSE_TOOLS[cmd]) {
    return `${command}: real forensic tool — ${COURSE_TOOLS[cmd]} — but not available in this simulator. You will run it on the course workstation. Type \`help\` to see what works here.`;
  }

  if (platform === 'linux' && REAL_LINUX.has(cmd)) {
    return `${command}: a real Linux command, but not available in this simulator. It will work on the course workstation. Type \`help\` to see what works here.`;
  }

  return platform === 'windows'
    ? `'${command}' is not recognized as an internal or external command,\r\noperable program or batch file.`
    : `${command}: command not found. Type \`help\` to see the available commands.`;
}

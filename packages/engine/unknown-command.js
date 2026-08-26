// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Honest messages for commands this simulator does not implement.
//
// Saying "command not found" for `top` teaches a beginner something FALSE:
// top is a real Linux command, it just is not simulated here. These messages
// keep the student's mental model of the real shell accurate.

export const REAL_LINUX = new Set([
  // processes & system
  'top', 'htop', 'killall', 'pkill', 'bg', 'fg', 'nice',
  'free', 'uptime', 'uname', 'whoami', 'id', 'who', 'w', 'date',
  'cal', 'alias', 'whereis', 'locate',
  'su', 'systemctl', 'service', 'mount', 'umount', 'lsblk', 'fdisk', 'dmesg',
  'journalctl', 'shutdown', 'reboot', 'crontab', 'lsof', 'strace', 'watch',
  // files & directories
  'ln', 'chgrp',
  'tree', 'basename', 'dirname', 'realpath', 'rsync', 'shred',
  // text processing
  'vim', 'emacs', 'more', 'split', 'paste', 'join', 'column', 'fold', 'rev', 'jq',
  // network
  'ping', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'ifconfig', 'ip', 'netstat',
  'ss', 'dig', 'nslookup', 'traceroute', 'nmap', 'tcpdump', 'nc', 'netcat',
  // archives
  'gunzip', 'zip', 'unzip', 'xz', 'bzip2', '7z',
  // misc
  'git', 'python', 'python3', 'node', 'npm', 'pip', 'make', 'gcc', 'seq',
  'sleep', 'yes', 'expr', 'bc', 'printf', 'read', 'exit',
  'logout', 'clear_history', 'apt', 'apt-get', 'yum', 'dnf', 'snap']);

export const REAL_WINDOWS = new Set([
  'chdir', 'mkdir', 'rmdir', 'erase', 'rename', 'more', 'path', 'title', 'vol', 'date', 'time', 'taskkill', 'ping', 'tracert', 'netstat', 'nslookup', 'hostname', 'fc', 'comp', 'robocopy', 'xcopy',
  'powershell', 'pwsh', 'wmic', 'sc', 'net', 'shutdown', 'reg',
  'format', 'chkdsk', 'diskpart', 'sfc', 'assoc', 'ftype', 'pushd', 'popd',
  'choice', 'timeout', 'pause', 'exit']);

export const REAL_POWERSHELL = new Set([
  'Get-ChildItem', 'Set-Location', 'Get-Location', 'Get-Content', 'Set-Content',
  'Out-File', 'Select-String', 'Where-Object', 'Select-Object', 'Sort-Object',
  'Measure-Object', 'ForEach-Object', 'New-Item', 'Remove-Item', 'Copy-Item',
  'Move-Item', 'Rename-Item', 'Test-Path', 'Get-Process', 'Stop-Process',
  'Start-Process', 'Get-Service', 'Start-Service', 'Stop-Service', 'Get-Help',
  'Get-Command', 'Get-Alias', 'Get-Member', 'Format-Table', 'Format-List',
  'Format-Wide', 'Export-Csv', 'Import-Csv', 'ConvertTo-Json', 'ConvertFrom-Json',
  'Get-FileHash', 'Invoke-WebRequest', 'Invoke-RestMethod', 'Clear-Host'
]);

// Same command, other operating system — the single most useful correction.
export const CROSS_PLATFORM = {
  linux: {
    dir: 'ls',
    type: 'cat',
    cls: 'clear',
    findstr: 'grep',
    copy: 'cp',
    move: 'mv',
    del: 'rm',
    ren: 'mv',
    erase: 'rm',
    md: 'mkdir',
    rd: 'rmdir',
    certutil: 'md5sum or sha256sum'
  },
  windows: {
    ls: 'dir',
    cat: 'type',
    clear: 'cls',
    grep: 'findstr',
    cp: 'copy',
    mv: 'move',
    rm: 'del',
    pwd: 'cd (with no arguments)',
    md5sum: 'certutil -hashfile <file> MD5',
    sha256sum: 'certutil -hashfile <file> SHA256'
  }
};

/**
 * Builds the honest message for a command the simulator does not implement.
 */
export function unknownCommandMessage(command, platform = 'linux', context = {}) {
  const cmd = (command || '').trim().toLowerCase();
  const { packTools = {}, unsimulatedMessage } = context;

  // 1. Cross-platform name correction
  const otherName = CROSS_PLATFORM[platform]?.[cmd];
  if (otherName) {
    const thisOs = platform === 'windows' ? 'Windows CMD' : 'Linux';
    const otherOs = platform === 'windows' ? 'Linux' : 'Windows';
    return `${command}: that is the ${otherOs} name. On ${thisOs}, use \`${otherName}\` instead.`;
  }

  // 2. Pack-supplied virtual or domain tools
  if (packTools[cmd]) {
    return `${command}: ${packTools[cmd]} — not available in this simulator. Type \`help\` to see what works here.`;
  }

  // 3. Real Linux command
  if (platform === 'linux' && REAL_LINUX.has(cmd)) {
    return unsimulatedMessage || `${command}: a real Linux command, but not simulated here. Type \`help\` to see available commands.`;
  }

  // 4. Real Windows command
  if (platform === 'windows' && REAL_WINDOWS.has(cmd)) {
    return unsimulatedMessage || `'${command}' is a real Windows command, but not simulated in this environment. Type \`help\` to see available commands.`;
  }

  // 5. Default OS failure message
  return platform === 'windows'
    ? `'${command}' is not recognized as an internal or external command,\r\noperable program or batch file.`
    : `${command}: command not found. Type \`help\` to see available commands.`;
}

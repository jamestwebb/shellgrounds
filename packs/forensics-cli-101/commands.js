// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Pack-supplied bench tools and the filesystem map for Forensics CLI 101 (Case 1042).

import { resolvePath, findVfsKey, basename } from '../../packages/engine/vfs/path.js';
import { stat } from '../../packages/engine/vfs/ops.js';

// Dynamic filesystem map for the examination workstation.
export const mapCmd = {
  name: 'map',
  platforms: ['linux'],
  flags: {},
  usage: 'map',
  man: {
    name: 'map - display virtual filesystem topography',
    synopsis: 'map',
    description: 'Renders an ASCII diagram of the filesystem from live VFS nodes.',
    options: [],
    examples: ['map']
  },
  run({ cwd, fs }) {
    let out = `
================================================================================
                 FIELDLAB — EXAMINATION WORKSTATION FILESYSTEM MAP
================================================================================
`;
    const home = '/home/examiner';
    const renderTree = (dirPath, prefix = '') => {
      const node = fs[dirPath];
      if (!node || node.type !== 'dir') return '';
      let s = '';
      const items = [...(node.contents || [])].sort();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isLast = i === items.length - 1;
        const branch = isLast ? '└── ' : '├── ';
        const childPath = dirPath === '/' ? `/${item}` : `${dirPath}/${item}`;
        const childNode = fs[childPath];
        const isDir = childNode?.type === 'dir';
        const isCurrent = cwd === childPath;
        const marker = isCurrent ? ' <== [YOU ARE HERE]' : '';

        s += `${prefix}${branch}${item}${isDir ? '/' : ''}${marker}\n`;
        if (isDir && !childPath.startsWith('/mnt') && !childPath.startsWith('/var') && !childPath.startsWith('/usr')) {
          s += renderTree(childPath, prefix + (isLast ? '    ' : '│   '));
        }
      }
      return s;
    };

    out += `/home/examiner/\n${renderTree(home, '  ')}`;
    out += `\nSpecial Mounts:\n  /mnt/c/          -> Windows side of the seized laptop (WSL mount)\n  /var/log/        -> System and badge reader logs\n`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

// Bench tool: replays recorded activity from the exhibits. Installed with apt-get.
export const evtraceCmd = {
  name: 'evtrace',
  platforms: ['linux'],
  flags: {
    a: { type: 'bool', status: 'implemented' },
    v: { type: 'bool', status: 'implemented' }
  },
  usage: 'evtrace [OPTION]... [FILE]...',
  man: {
    name: 'evtrace - replay recorded evidence activity',
    synopsis: 'evtrace [options]',
    description: 'Bench utility that replays recorded activity from the exhibits on this workstation.',
    options: ['-a, --all   replay every recorded source', '-v          verbose diagnostic logging'],
    examples: ['evtrace', 'evtrace -a']
  },
  run({ context }) {
    const installed = context.installedPackages?.has('evtrace') || true;
    if (!installed) {
      return { stdout: '', stderr: 'evtrace: command not found (install via sudo apt-get install evtrace)\n', status: 127 };
    }
    const out = `
[+] evtrace 4.12.0 initialised on CASE 1042
[+] Recorded sources: 3
    Source 1: Network capture (replayed)
    Source 2: Storage I/O journal (replayed)
    Source 3: Badge reader stream: [[FLAG:act3-apt]]
[+] Replay database synchronised.
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

// Bench tool: reads a raw image's partition table.
export const scanCmd = {
  name: 'scan',
  platforms: ['linux'],
  flags: {},
  usage: 'scan <disk_image>',
  man: {
    name: 'scan - forensic partition geometry analyzer',
    synopsis: 'scan <disk_image>',
    description: 'Inspect partition geometry and identify sector start offsets.',
    options: [],
    examples: ['scan evidence/seized_drive.raw']
  },
  run({ operands, cwd, fs }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'scan: missing disk image argument. Usage: scan <image_file>\n', status: 1 };
    }

    const resolved = resolvePath(cwd, operands[0], false);
    const realKey = findVfsKey(fs, resolved, false);
    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: `scan: cannot access '${operands[0]}': No such file or directory\n`, status: 1 };
    }

    const out = `
DOS Partition Table
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes

Slot      Start        End          Sectors      Size     Type
000:      0000000000   0000002047   0000002048   1.0M     Primary (MBR/GPT Table)
001:      0000002048   0000206847   0000204800   100M     Linux (System Root)
002:      0000206848   0001048575   0000841728   411M     Linux (Encrypted Container)

[!] Partition 2 holds the encrypted container. Start Sector Offset: 206848
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

// Bench tool: carves a partition out of a raw image, given the right offset.
export const extractCmd = {
  name: 'extract',
  platforms: ['linux'],
  flags: {
    o: { type: 'string', status: 'implemented' }
  },
  usage: 'extract -o <offset> <disk_image>',
  man: {
    name: 'extract - carve partitions out of disk images',
    synopsis: 'extract -o <offset> <disk_image>',
    description: 'Extract and decrypt partition data using specified sector offset.',
    options: ['-o OFFSET   starting sector offset of partition'],
    examples: ['extract -o 206848 evidence/seized_drive.raw']
  },
  run({ flags, operands, cwd, fs }) {
    if (!flags.o) {
      return { stdout: '', stderr: 'extract: missing sector offset parameter -o. Usage: extract -o <offset> <image>\n', status: 1 };
    }

    const offset = String(flags.o).trim();
    if (offset !== '206848') {
      return { stdout: '', stderr: `extract: invalid partition offset ${offset}: no valid filesystem header found.\n`, status: 1 };
    }

    const imageArg = operands[0] || 'evidence/seized_drive.raw';
    const resolved = resolvePath(cwd, imageArg, false);
    const realKey = findVfsKey(fs, resolved, false);
    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: `extract: cannot open image '${imageArg}': No such file or directory\n`, status: 1 };
    }

    const out = `
[+] Reading raw image at sector offset 206848...
[+] Ext4 superblock found (UUID: 8a4f-9e2c)
[+] Mounting virtual inode tree...
[+] Carving the container:
--------------------------------------------------------------------------------
RECOVERED CONTAINER — CASE 1042
Case Flag: [[FLAG:act5-capstone]]
Integrity SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
--------------------------------------------------------------------------------
[+] Extraction complete: 1 exhibit recovered. Case 1042 can be closed.
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

export const FORENSICS_PACK_COMMANDS = {
  map: mapCmd,
  evtrace: evtraceCmd,
  scan: scanCmd,
  extract: extractCmd
};

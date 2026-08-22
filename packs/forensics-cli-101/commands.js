// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Pack-supplied virtual forensic tools and dynamic map generator for Forensics CLI 101

import { resolvePath, findVfsKey, basename } from '../../packages/engine/vfs/path.js';
import { stat } from '../../packages/engine/vfs/ops.js';

// Dynamic VFS Map Generator for Warren
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
                      THE WARREN — VIRTUAL FILESYSTEM TOPOGRAPHY
================================================================================
`;
    const home = '/home/analyst';
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

    out += `/home/analyst/\n${renderTree(home, '  ')}`;
    out += `\nSpecial Mounts:\n  /mnt/c/          -> Windows Topside Filesystem (WSL Mount)\n  /var/log/        -> System & Sensor Logs\n`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

// Sleuth Kit Tracker Tool
export const trackerCmd = {
  name: 'tracker',
  platforms: ['linux'],
  flags: {
    a: { type: 'bool', status: 'implemented' },
    v: { type: 'bool', status: 'implemented' }
  },
  usage: 'tracker [OPTION]... [FILE]...',
  man: {
    name: 'tracker - Sleuth Kit forensic activity tracker',
    synopsis: 'tracker [options]',
    description: 'Forensic utility for tracking sensor activities and evidence checkpoints.',
    options: ['-a, --all   list all sensor traces', '-v          verbose diagnostic logging'],
    examples: ['tracker', 'tracker -a']
  },
  run({ context }) {
    const installed = context.installedPackages?.has('tracker') || true;
    if (!installed) {
      return { stdout: '', stderr: 'tracker: command not found (install via sudo apt-get install tracker)\n', status: 127 };
    }
    const out = `
[+] SleuthKit Activity Tracker v4.12.0 initialized
[+] Active Sensors: 3
    Sensor 1: Network Ingress (Active)
    Sensor 2: Storage I/O Monitor (Active)
    Sensor 3: Checkpoint Listener: [[FLAG:act3-apt]]
[+] Tracking database synchronized.
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

// Partition Scan Tool
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
    examples: ['scan evidence/suspect_drive.raw']
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
002:      0000206848   0001048575   0000841728   411M     Linux (Evidence Vault)

[!] Partition 2 contains encrypted container. Start Sector Offset: 206848
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

// Forensic Carver Tool
export const extractCmd = {
  name: 'extract',
  platforms: ['linux'],
  flags: {
    o: { type: 'string', status: 'implemented' }
  },
  usage: 'extract -o <offset> <disk_image>',
  man: {
    name: 'extract - carve evidence partitions from disk images',
    synopsis: 'extract -o <offset> <disk_image>',
    description: 'Extract and decrypt partition data using specified sector offset.',
    options: ['-o OFFSET   starting sector offset of partition'],
    examples: ['extract -o 206848 evidence/suspect_drive.raw']
  },
  run({ flags, operands, cwd, fs }) {
    if (!flags.o) {
      return { stdout: '', stderr: 'extract: missing sector offset parameter -o. Usage: extract -o <offset> <image>\n', status: 1 };
    }

    const offset = String(flags.o).trim();
    if (offset !== '206848') {
      return { stdout: '', stderr: `extract: invalid partition offset ${offset}: no valid filesystem header found.\n`, status: 1 };
    }

    const imageArg = operands[0] || 'evidence/suspect_drive.raw';
    const resolved = resolvePath(cwd, imageArg, false);
    const realKey = findVfsKey(fs, resolved, false);
    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: `extract: cannot open image '${imageArg}': No such file or directory\n`, status: 1 };
    }

    const out = `
[+] Analyzing raw image at sector offset 206848...
[+] Ext4 filesystem super-block found (UUID: 8a4f-9e2c)
[+] Mounting virtual inode tree...
[+] Carving master evidence artifact:
--------------------------------------------------------------------------------
RECOVERED EVIDENCE CONTAINER:
Master Capstone Flag: [[FLAG:act5-capstone]]
Integrity SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
--------------------------------------------------------------------------------
[+] Extraction complete: 1 artifact recovered successfully.
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

export const FORENSICS_PACK_COMMANDS = {
  map: mapCmd,
  tracker: trackerCmd,
  scan: scanCmd,
  extract: extractCmd
};

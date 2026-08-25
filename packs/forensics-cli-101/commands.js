// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Pack-supplied bench tools and the filesystem map for Forensics CLI 101 (Case 1042).

import { resolvePath, findVfsKey } from '../../packages/engine/vfs/path.js';

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
    // `|| true` stood here, which made the whole check constant and the branch
    // below unreachable: evtrace ran whether or not the student had installed
    // it, so act3-apt taught "install it, then use it" and never once enforced
    // the first half. Debugging leftovers do not announce themselves; the
    // linter found this one by noticing App.jsx never called the setter that
    // fills this Set, which is the other half of the same bug.
    const installed = context.installedPackages?.has('evtrace') === true;
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
//
// THE SEAM. `mmls` is Sleuth Kit -- a forensics package, installed on a
// forensics bench and nowhere else -- so it is subject knowledge and it lives
// in the pack. `dd` is coreutils, on every Linux machine ever shipped, so it
// lives in the engine and this file must not reimplement it.
//
// This command used to be called `scan`, and its partner used to be
// `extract -o <offset>`. Neither exists on any real machine. The output below
// was already literal mmls output -- "DOS Partition Table", the Slot/Start/End
// header -- so the tool was mmls in a costume, and `extract -o` was `dd
// bs=512 skip=` in a costume. A student who finished the act knew a syntax
// that works nowhere, and this pack's own courseTools list told them mmls and
// dd were "not simulated here", which was the opposite of useful.
//
// The numbers below are the real geometry of the image built in fs.linux.js.
// They are what `dd skip=` is handed in act5-capstone, so a wrong number here
// is a capstone that carves the wrong bytes. Change one file and change both.
export const mmlsCmd = {
  name: 'mmls',
  platforms: ['linux'],
  flags: {},
  usage: 'mmls <image>',
  man: {
    name: 'mmls - display the partition layout of a volume system',
    synopsis: 'mmls <image>',
    description: 'Prints the partition table of a disk image: the sector each partition starts at, the sector it ends at, and what kind of partition it is. It reads the image and writes nothing to it. Part of the Sleuth Kit. The start sector it prints is the number `dd skip=` wants.',
    options: [],
    examples: ['mmls evidence/seized_drive.raw']
  },
  run({ operands, cwd, fs }) {
    if (operands.length === 0) {
      return { stdout: '', stderr: 'mmls: missing image argument. Usage: mmls <image>\n', status: 1 };
    }

    const resolved = resolvePath(cwd, operands[0], false);
    const realKey = findVfsKey(fs, resolved, false);
    if (!realKey || !fs[realKey]) {
      return { stdout: '', stderr: `mmls: cannot open '${operands[0]}': No such file or directory\n`, status: 1 };
    }

    const out = `
DOS Partition Table
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes

Slot      Start        End          Sectors      Size     Type
000:      0000000000   0000000000   0000000001   512B     Primary (MBR/GPT Table)
001:      0000000001   0000000040   0000000040   20K      Linux (System Root)
002:      0000000041   0000000044   0000000004   2.0K     Linux (Encrypted Container)

[!] Partition 2 holds the encrypted container. Start Sector Offset: 41
`;
    return { stdout: out, stderr: '', status: 0 };
  }
};

export const FORENSICS_PACK_COMMANDS = {
  map: mapCmd,
  evtrace: evtraceCmd,
  mmls: mmlsCmd
};

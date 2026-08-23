// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Virtual filesystem for the seized Windows laptop in Forensics CLI 101 (Case 1042).

import { buildFS, file } from '../../packages/engine/vfs/builder.js';

export function createWindowsFilesystem() {
  const built = buildFS({
    home: 'C:\\Users\\Examiner',
    isWindows: true,
    tree: {
      'Users\\Examiner': {
        'Documents': {
          'readme.txt': file(
`This is the Windows side of Case 1042 — the laptop Aurora Robotics sent us,
booted in a safe examination sandbox. Nothing here can escape this window.

Key CMD commands:
  cd                 - Display current directory
  cd <folder>        - Enter directory
  dir                - List directory contents
  dir /a             - Show all files including hidden
  type <file>        - View text contents
  find "text" <file> - Search literal text
  findstr /i "text"  - Case-insensitive regex search
  certutil -hashfile <file> <alg> - Compute hash
  attrib <file>      - Check file attributes
`),
          'case_1042.txt': file(
`CASE 1042 — WINDOWS EXAMINATION SHEET
Exhibit: Aurora Robotics laptop, C:\\Users\\Examiner
Examiner: (you)

Two jobs on this side: find what the Windows hidden attribute is covering up,
and hash the disk image for the chain of custody.

You do NOT need to act on this file. The Windows challenges in the left panel
walk you through each step.
`),
          'logs.txt': file(
`[WINDOWS EVENT LOG EXTRACT — CASE 1042]
EventID: 4624 - Logon Successful - Examiner
EventID: 4688 - Process Created: certutil.exe
EventID: 7036 - Service Stopped: Volume Shadow Copy
EventID: 4625 - Logon Failure: admin (Bad Password)
EventID: 9999 - Evidence marker identified: [[FLAG:act6-findstr]]
`),
          'secrets.txt': file('Saved credentials:\r\nadmin_key=xK9#mP2$vL5\r\nmaster_hash=9c1185a5c5e9fc54612808977ee8f548\r\n')
        },
        'Desktop': {
          'evidence_shortcut.lnk': file('[Shortcut target: C:\\Users\\Examiner\\evidence]')
        },
        'evidence': {
          'mystery_file': file('[Exhibit 1042-D: carries the Windows hidden attribute, not a leading dot.]\r\nFlag: [[FLAG:act6-attrib]]\r\n', {
            attrib: 'H',
            hidden: true
          }),
          'evidence.img': file('[WINDOWS DISK ARTIFACT CONTAINER — CASE 1042, EXHIBIT C]', {
            fileType: 'DOS/MBR boot sector'
          })
        },
        'Downloads': {
          'installer.exe': file('[PE32 executable for Windows (GUI)]')
        }
      },
      'Windows\\System32': {
        'cmd.exe': file('[CMD interpreter]'),
        'certutil.exe': file('[Certificate Utility]')
      },
      'Program Files\\Forensics Tools': {
        'imager.exe': file('[Disk imager CLI]')
      }
    }
  });

  return built.fs;
}

// packs/index.js still imports the pre-Shellgrounds name. Kept as a shim so the
// registry keeps booting; drop it once that import is updated.

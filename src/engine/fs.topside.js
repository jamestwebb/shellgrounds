// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Virtual Filesystem Definition for Topside — the Windows CMD side of The Gauntlet

import { buildFS, file } from './fs-builder.js';

export function createTopsideFilesystem() {
  const built = buildFS({
    home: 'C:\\Users\\Analyst',
    isWindows: true,
    tree: {
      'Users\\Analyst': {
        'Documents': {
          'readme.txt': file(
`Welcome to Topside — the Windows CMD side of Forensics CLI 101.
Your Windows forensic workstation is ready.

Key CMD Commands:
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
          'case_notes.txt': file(
`CASE DOSSIER: Topside Examination
Target: Suspicious Endpoint C:\\Users\\Analyst
Analyst: Forensic Examiner

Investigate hidden system files and verify integrity of seized disk images.
`),
          'logs.txt': file(
`[WINDOWS EVENT LOG ENTRY]
EventID: 4624 - Logon Successful - Analyst
EventID: 4688 - Process Created: certutil.exe
EventID: 7036 - Service Stopped: Windows Defender
EventID: 4625 - Logon Failure: admin (Bad Password)
EventID: 9999 - Topside Marker Identified: [[FLAG:topside-findstr]]
`),
          'secrets.txt': file('System Passwords:\r\nadmin_key=xK9#mP2$vL5\r\nmaster_hash=9c1185a5c5e9fc54612808977ee8f548\r\n')
        },
        'Desktop': {
          'evidence_shortcut.lnk': file('[Shortcut target: C:\\Users\\Analyst\\evidence]')
        },
        'evidence': {
          'mystery_file': file('[Hidden Topside Artifact: Attrib = Hidden]\r\nFlag: [[FLAG:topside-attrib]]\r\n', {
            attrib: 'H',
            hidden: true
          }),
          'evidence.img': file('[WINDOWS DISK ARTIFACT CONTAINER]', {
            fileType: 'DOS/MBR boot sector',
            md5: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
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
        'ftk_imager.exe': file('[FTK Imager CLI]')
      }
    }
  });

  return built.fs;
}

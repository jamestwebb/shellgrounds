// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Virtual Filesystem Definition for Windows CMD Essentials — Lost & Found.
//
// The fiction lives here and in pack.json, never in the engine: one unclaimed
// laptop on the lost-property desk, with a command prompt and no name on it.

import { buildFS, file } from '../../packages/engine/vfs/builder.js';

export function createWindowsEssentialsFilesystem() {
  const built = buildFS({
    home: 'C:\\Users\\Student',
    isWindows: true,
    tree: {
      'Users\\Student': {
        'lostfound.tag': file('Asset tag: LF-2291\r\nHanded in at: front desk, Tuesday\r\nReturn to owner once identified.\r\n', { attrib: 'H', hidden: true }),
        'Documents': {
          'readme.txt': file(
`================================================================================
                      LOST & FOUND - UNCLAIMED LAPTOP LF-2291
================================================================================
This machine came into the lost-property office with no name on it. Your job is
to find out whose it is, tidy it up, and log what you did.

Everything you need is in this Command Prompt window:
- Backslashes (\\) separate directory levels.
- Command switches use forward slashes (e.g. DIR /A /S).
- Environment variables are delimited by percent signs (e.g. %USERPROFILE%).
- FINDSTR searches inside files the way GREP does on Linux.
- CERTUTIL calculates the MD5 and SHA256 hashes you write on the form.

Start with Act I in the left panel.
`),
          'notes.txt': file('Project Status: Windows Rollout\r\nDomain: CORP.INTERNAL\r\nAdministrator: Student\r\n'),
          'servers.txt': file('DC01=192.168.1.10\r\nFS01=192.168.1.20\r\nSQL01=192.168.1.30\r\nWEB01=192.168.1.40\r\nRECOVERY=[[FLAG:w1-boss]]\r\n'),
          'hidden_config.ini': file('LicenseKey=WIN-PRO-2026-X99\r\n', { attrib: 'H', hidden: true }),
          'data.csv': file(
`EmployeeID,FullName,Department,Location,Status
1001,John Doe,Information Technology,Redmond,Active
1002,Jane Smith,Human Resources,Austin,Active
1003,Robert Davis,Finance,New York,Active
1004,Emily Wilson,Security Operations,Redmond,Active
1005,Michael Brown,Engineering,Seattle,Inactive
`)
        },
        'Desktop': {
          'Shortcut.lnk': file('[Shortcut to C:\\Users\\Student\\Documents]'),
          'todo.txt': file('1. Inspect system event logs\r\n2. Backup server configuration\r\n3. Verify file hashes with CertUtil\r\n')
        },
        'Downloads': {
          'setup.exe': file('[PE32 executable for Windows]'),
          'archive.zip': file('[ZIP Archive Container]')
        },
        'Projects': {},
        'logs': {
          'eventlog.txt': file(
`[EVENT ID 4624] An account was successfully logged on: TargetUserName: Student
[EVENT ID 4672] Special privileges assigned to new logon: Administrator
[EVENT ID 4688] A new process has been created: certutil.exe -hashfile data.csv MD5
[EVENT ID 7036] The Windows Defender Antivirus Service entered the running state.
[EVENT ID 4625] An account failed to log on: TargetUserName: Guest (Bad Password)
[EVENT ID 4688] A new process has been created: cmd.exe /c dir /a C:\\Users
[EVENT ID 1000] Application Error: svchost.exe crash at offset 0x004F2A
`),
          'firewall.log': file(
`#Fields: date time action protocol src-ip dst-ip src-port dst-port
2026-08-17 01:00:10 ALLOW TCP 192.168.1.10 192.168.1.20 49152 445
2026-08-17 01:02:15 DROP  TCP 10.0.0.99   192.168.1.20 54120 3389
2026-08-17 01:05:00 ALLOW TCP 192.168.1.10 192.168.1.30 49154 1433
2026-08-17 01:10:00 DROP  TCP 10.0.0.99   192.168.1.30 54122 1433
`)
        }
      },
      'Windows\\System32': {
        'cmd.exe': file('[Command Interpreter]'),
        'certutil.exe': file('[Certificate Utility]'),
        'drivers\\etc\\hosts': file('127.0.0.1       localhost\r\n::1             localhost\r\n192.168.1.10    dc01.corp.internal\r\n')
      },
      'ProgramData': {
        'PackageCache': {
          'summary.txt': file('Package Cache Status: Synchronized\r\n')
        }
      }
    }
  });

  return built.fs;
}

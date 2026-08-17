// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Virtual Filesystem Definition for The Gauntlet — Forensics CLI 101 (Linux Environment)

import { buildFS, file } from './fs-builder.js';

export function createWarrenFilesystem() {
  const built = buildFS({
    home: '/home/analyst',
    isWindows: false,
    tree: {
      'home/analyst': {
        '.bashrc': file('# Analyst bash profile\nexport PS1="analyst@lab:\\w\\$ "\nalias ll="ls -la"\n'),
        '.stash': file('You found the hidden file. Files that start with a dot are invisible to a plain ls.\nFlag: [[FLAG:act1-hidden]]\n', { hidden: true }),
        'welcome.txt': file(
`================================================================================
                      THE GAUNTLET — FORENSICS CLI 101 PROVING GROUND
================================================================================
Welcome, Analyst. This is a safe practice terminal: you cannot break anything,
so experiment freely. Solve challenges, capture flags, climb the leaderboard.

Essential commands:
  pwd          - Show where you are
  ls -la       - List everything here (including hidden files)
  cd <dir>     - Enter a directory (cd .. goes back up)
  cat <file>   - Read a file
  map          - Show a map of this whole filesystem
  submit <flag>- Send a captured FLAG{...} flag in for points

Start with Act I in the left panel. Good hunting.
`),
        'training': {
          'level_1': {
            'checkpoint_alpha.txt': file('Checkpoint Alpha reached.\n[[FLAG:act1-cd]]\n'),
            'notes.txt': file('Level 1 is one step below your home directory.\nRun pwd and compare the path with where you started.\n')
          },
          'level_2': {
            'checkpoint_beta.txt': file('Checkpoint Beta reached. You moved between sibling directories.\n[[FLAG:act1-paths]]\n'),
            'deeper': {
              'reminder.txt': file('You are now three levels below home.\nRemember: cd .. goes up one level. cd ~ jumps straight home.\n')
            }
          },
          'archive': {
            '2025': {
              'old_case_index.txt': file('Archived case list (2025):\nCF-2025-011 closed\nCF-2025-047 closed\nCF-2025-090 transferred\n')
            }
          }
        },
        'Documents': {
          'case_notes.txt': file(
`CASE FILE: #CF-2026-088
TITLE: Unauthorized Access — Practice Scenario
ANALYST: (you)
STATUS: TRAINING

SUMMARY
An unidentified actor reached the Windows side of this machine through the
WSL mount at /mnt/c. The evidence is scattered across this workstation:

  Documents/access.log ......... the access timeline
  Documents/logs.txt ........... application errors
  evidence/ .................... seized files to identify and hash

You do NOT need to act on any of this yet. The next challenges will walk you
through each piece, one command at a time. For now, reading this file with
'cat' was the whole job — and you just did it.
`),
          'access.log': file(
`2026-08-17 01:12:04 - DAEMON: System initialized on tty1
2026-08-17 01:15:30 - AUTH: User 'analyst' logged in from 10.0.4.12
2026-08-17 02:00:11 - KERNEL: Storage device sdb1 mounted at /mnt/c
2026-08-17 02:14:22 - FS: Query executed on /home/analyst/Documents
2026-08-17 02:45:00 - NETWORK: Inbound probe from unknown node
2026-08-17 03:10:00 - ALERT: Suspicious file access in /mnt/c/Users/analyst/Desktop
2026-08-17 03:30:15 - LOG: Automated health check completed. OK.
2026-08-17 04:00:00 - BACKUP: Snapshot created for volume /var/log
2026-08-17 04:22:18 - ALERT: Process 'tracker' spawned with PID 4410
2026-08-17 04:55:00 - STATUS: 0 anomalies detected in standard sweep
2026-08-17 05:01:23 - NOTICE: Sensor event recorded near node 7
2026-08-17 05:12:44 - TAIL_RECORD: Final log entry before sensor freeze.
[[FLAG:act2-tail]]
`),
          'secrets.txt': file(
`SYSTEM CREDENTIALS VAULT
========================
INTERNAL USE ONLY — DO NOT COMMIT OR LEAK

master_key: hunter2
admin_token: xK9#mP2$vL5
vault_passcode: [[FLAG:act3-grep]]
forensic_salt: 9f83acb172e
database_host: db.lab.local:5432
`),
          'logs.txt': file(
`08:00:01 INFO Service started
08:00:10 DEBUG Loading configuration
08:01:00 ERROR Connection timeout on socket 4
08:02:15 error: Handshake refused by remote node
08:03:00 INFO Attempting automatic recovery
08:04:12 Error: Secondary sync failed
08:05:00 CRITICAL Emergency bypass activated
08:06:00 INFO Connection restored to cluster
08:07:22 WARNING Memory utilization above 85%
08:08:00 ERROR Pipeline stream corrupted: [[FLAG:act3-grepi]]
`),
          'security_events.csv': file(
`id,timestamp,severity,source,event_type,details
101,2026-08-17T01:00:00Z,LOW,auth,LOGIN,analyst logged in
102,2026-08-17T01:15:00Z,MEDIUM,kernel,USB_PLUG,SanDisk 32GB plugged
103,2026-08-17T01:20:00Z,HIGH,file_mon,EXFIL,file copy to /mnt/c
104,2026-08-17T01:45:00Z,CRITICAL,ids,BREACH,perimeter breach detected
105,2026-08-17T02:00:00Z,LOW,syslog,ROTATE,log rotation completed
106,2026-08-17T02:10:00Z,HIGH,ids,FLAG_EMIT,Flag emitted: [[FLAG:act4-pipe-csv]]
107,2026-08-17T02:30:00Z,LOW,cron,BACKUP,backup finished
`),
          'network_stream.log': file(
`SRC=192.168.1.100 DST=10.0.0.1 PROTO=TCP PORT=443 STATUS=ALLOW
SRC=192.168.1.105 DST=10.0.0.2 PROTO=UDP PORT=53 STATUS=ALLOW
SRC=10.0.4.12 DST=10.0.0.5 PROTO=TCP PORT=22 STATUS=ALLOW
SRC=192.168.1.150 DST=10.0.0.1 PROTO=TCP PORT=8080 STATUS=DENY
SRC=10.0.4.99 DST=10.0.0.1 PROTO=TCP PORT=31337 STATUS=SUSPICIOUS
SRC=192.168.1.200 DST=10.0.0.8 PROTO=ICMP PORT=0 STATUS=ALLOW
SRC=10.0.4.102 DST=10.0.0.1 PROTO=TCP PORT=22 STATUS=DENY
SRC=192.168.1.188 DST=10.0.0.1 PROTO=TCP PORT=443 STATUS=ALLOW
SRC=10.0.4.110 DST=10.0.0.9 PROTO=TCP PORT=9001 STATUS=CRITICAL_DATA_LEAK_[[FLAG:act4-grep-v]]
SRC=192.168.1.210 DST=10.0.0.1 PROTO=TCP PORT=443 STATUS=ALLOW
`)
        },
        'evidence': {
          'mystery_file': file('\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x03 \x00\x00\x02X\x08\x06\x00\x00\x00', {
            fileType: 'PNG image data, 800 x 600, 8-bit/color RGBA, non-interlaced'
          }),
          'binary_data': file('\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00>\x00\x01\x00\x00\x00\x78\x05\x40\x00\x00\x00\x00\x00' +
            '__libc_start_main\x00GLIBC_2.2.5\x00lab_agent_daemon\x00' +
            'TARGET_FLAG=[[FLAG:act2-strings]]\x00' +
            'DEBUG: connecting to 127.0.0.1:9099\x00/etc/shadow\x00', {
            fileType: 'ELF 64-bit LSB executable, x86-64, version 1 (SYSV)'
          }),
          'evidence.img': file(
`[FORENSIC DISK IMAGE CONTAINER - SECTOR DUMP]
DISK GEOMETRY: CHS 1024/64/32 | TOTAL SECTORS: 2097152 | SECTOR SIZE: 512 BYTES
PARTITION TABLE:
Slot  Boot  StartSector  EndSector   Sectors   Type   Description
1     *     2048         1048575     1046528   0x83   Linux Extended / Evidence
2           1048576      2097151     1048576   0x07   NTFS / Windows Mount

SECTOR 2048 OFFSET INSPECTION:
Volume Header: LAB_VOL_01
Integrity Hash Checksum: VALID
Payload signature: [[FLAG:act2-md5]]
`, {
            fileType: 'DOS/MBR boot sector; partition 1: ID=0x83, active, start-sector 2048; partition 2: ID=0x07, start-sector 1048576'
          }),
          'suspect_drive.raw': file(
`PARTITION SCAN RESULTS:
Device: suspect_drive.raw
Unit: sectors of 1 * 512 = 512 bytes

Device             Boot      Start        End    Sectors  Size Id Type
suspect_drive.raw1            2048     206847     204800  100M 83 Linux
suspect_drive.raw2 *        206848     616447     409600  200M 83 Linux (Evidence Vault)
suspect_drive.raw3          616448    1048575     432128  211M  7 HPFS/NTFS/exFAT

INSPECTION HINT: Run 'scan suspect_drive.raw' to inspect partition table, then extract offset 206848 with 'extract -o 206848 suspect_drive.raw'.
`, {
            fileType: 'DOS/MBR boot sector, disk signature 0x4f81c9a2'
          })
        },
        'Downloads': {
          'installer.sh': file('#!/bin/bash\n# Forensic Toolset Installer\napt-get update\napt-get install -y tracker\n')
        }
      },
      // WSL bridge mapping (/mnt/c) — the Windows side of the machine
      'mnt/c/Users/analyst': {
        'Desktop': {
          'CASE_FILES': {
            'intake.txt': file(
`================================================================================
FORENSICS CLI 101 — CASE 001 INTAKE DOSSIER
================================================================================
LOCATION: Windows side (C:\\Users\\analyst\\Desktop\\CASE_FILES\\intake.txt)
ACCESSED VIA: WSL mount (/mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt)

Analyst Verification:
You successfully crossed from the Linux shell to the Windows filesystem.
In WSL — and in Case 001 — your Windows drive C:\\ is mounted at /mnt/c.

Verification Flag: [[FLAG:act3-crossing]]
`),
            'mercer_evidence_log.txt': file('Case 001 Evidence: Browser artifacts located in AppData\\Local\\Google\\Chrome.\n')
          }
        },
        'Documents': {
          'surface_notes.txt': file(
`WINDOWS-SIDE FIELD NOTES
========================
The analyst who can move between both filesystems without a map is the one
we trust with real cases. You found this file from the Linux shell on your own.
That is the whole lesson.

Verification Flag: [[FLAG:act3-crossing-solo]]
`)
        }
      },
      'var/log': {
        'syslog': file('kernel: [    0.000000] Linux version 6.8.0-lab (analyst@lab)\nkernel: [    1.204011] Network interface up.\n'),
        'auth.log': file('Aug 17 00:01:00 lab sshd[1020]: Accepted publickey for analyst from 10.0.4.12\n'),
        'sensor_audit.log': file(
`[SENSOR AUDIT TRAIL]
2026-08-17 00:00:01 EVENT: Motion detected at node 1
2026-08-17 01:14:22 EVENT: File activity near training area
2026-08-17 02:30:18 EVENT: Acoustic pulse recorded at sector 7
2026-08-17 03:45:00 EVENT: Signature verified
2026-08-17 04:12:00 EVENT: Keycode discovered: [[FLAG:act3-find]]
`)
      },
      'etc': {
        'passwd': file('root:x:0:0:root:/root:/bin/bash\nanalyst:x:1000:1000:Analyst,,,:/home/analyst:/bin/bash\n'),
        'hosts': file('127.0.0.1 localhost\n127.0.1.1 lab-node-01.lab.local lab-node-01\n10.0.4.1 hq.lab.local\n'),
        'motd': file('\n * The Gauntlet — Forensics CLI 101 Simulation Engine\n')
      },
      'tmp': {}
    }
  });

  return built.fs;
}

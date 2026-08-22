// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Virtual Filesystem Definition for Forensics CLI 101 (Linux Warren Environment)

import { buildFS, file } from '../../packages/engine/vfs/builder.js';

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
2026-08-17 02:14:55 - SENSOR: Checkpoint marker registered in training buffer
2026-08-17 03:22:18 - SSH: Accepted publickey for analyst from 10.0.4.12 port 52140
2026-08-17 03:45:00 - CRON: Log rotation completed cleanly
2026-08-17 04:10:22 - ALERT: Unrecognized binary signature in ~/evidence
2026-08-17 05:01:09 - AUDIT: Session checkpoint saved for training review
2026-08-17 05:30:44 - SYSTEM: Background telemetry synchronized to central host
2026-08-17 06:12:00 - DAEMON: Heartbeat ping OK - 0 dropped packets
2026-08-17 06:45:12 - AUTH: Re-authentication challenge issued to analyst
2026-08-17 07:00:01 - CRON: Hourly checksum verification passed (12 targets)
2026-08-17 07:15:29 - SENSOR: Level 2 checkpoint reached by session analyst
2026-08-17 07:44:10 - LOG: End of access log segment #088
2026-08-17 07:59:59 - NOTICE: Trailing record intact. [[FLAG:act2-tail]]
`),
          'logs.txt': file(
`[2026-08-17 00:01:12] INFO: System audit log initialized
[2026-08-17 01:14:02] DEBUG: Loading kernel modules: ext4, overlay, vfat
[2026-08-17 02:15:44] ERROR: Failed to bind port 8080 - address already in use
[2026-08-17 02:15:45] WARN: Falling back to secondary listener on port 8081
[2026-08-17 03:00:00] INFO: Daily health check completed - 0 anomalies
[2026-08-17 03:22:11] error: Database connection timeout on replica-02
[2026-08-17 03:22:15] INFO: Reconnected to replica-02 after 4000ms
[2026-08-17 04:10:05] ERROR: Authentication failed for user 'guest' from 192.168.1.105
[2026-08-17 04:10:06] WARN: Repeated login failures detected (threshold: 3)
[2026-08-17 04:10:08] ERROR: IP 192.168.1.105 temporarily blacklisted (15m)
[2026-08-17 05:00:00] INFO: Hourly sync to upstream master completed
[2026-08-17 05:30:21] error: Certificate expiration warning: cert expires in 12 days
[2026-08-17 05:30:22] WARN: Automatic renewal job scheduled for 2026-08-20
[2026-08-17 06:00:00] INFO: Backup archive created: /var/backups/daily-20260817.tar.gz
[2026-08-17 06:15:33] ERROR: Disk space on /var/log exceeded 85% threshold
[2026-08-17 06:15:34] INFO: Purged 3 archived log files (recovered 420MB)
[2026-08-17 07:00:00] INFO: Routine health check completed - 0 critical issues
[2026-08-17 07:22:19] ERROR: Failed to parse input stream at offset 0x4A20: [[FLAG:act3-grepi]]
[2026-08-17 07:22:20] INFO: Recovery handler executed cleanly
`),
          'secrets.txt': file(
`# Internal System Credentials (DO NOT DISTRIBUTE)
database_host=10.0.4.50
database_user=svc_analyst
database_pass=k7#mP9$xL2vQ
vault_passcode=FLAG: [[FLAG:act3-grep]]
api_endpoint=https://api.internal.lab/v1
api_key=ak_live_8fbc2390a1e4d678
ssh_bastion=bastion.internal.lab:2222
backup_encryption_key=0x9f4a12c8e3b701d5
`),
          'network_stream.log': file(
`2026-08-17 01:00:01 TCP ALLOW 10.0.4.12:52140 -> 10.0.4.50:5432
2026-08-17 01:00:02 TCP ALLOW 10.0.4.12:52142 -> 10.0.4.50:5432
2026-08-17 01:02:15 TCP DENY  192.168.1.105:44120 -> 10.0.4.50:22
2026-08-17 01:02:16 TCP DENY  192.168.1.105:44122 -> 10.0.4.50:22
2026-08-17 01:02:17 TCP DENY  192.168.1.105:44124 -> 10.0.4.50:22
2026-08-17 01:05:00 TCP ALLOW 10.0.4.12:52144 -> 10.0.4.50:5432
2026-08-17 01:10:22 UDP DROP  10.0.4.99:5353 -> 224.0.0.251:5353
2026-08-17 01:15:30 TCP ALLOW 10.0.4.12:52146 -> 10.0.4.50:80
2026-08-17 01:20:00 TCP DENY  172.16.0.44:33890 -> 10.0.4.50:3389
2026-08-17 01:25:00 TCP ALLOW 10.0.4.12:52148 -> 10.0.4.50:5432
2026-08-17 01:30:00 TCP DENY  192.168.1.200:50110 -> 10.0.4.50:445
2026-08-17 01:35:00 TCP ALLOW 10.0.4.12:52150 -> 10.0.4.50:5432
2026-08-17 01:40:00 TCP DROP  10.0.4.254:67 -> 255.255.255.255:68
2026-08-17 01:45:00 TCP ALLOW 10.0.4.12:52152 -> 10.0.4.50:80
2026-08-17 01:50:00 TCP DENY  10.0.4.77:8080 -> 10.0.4.50:8080
2026-08-17 01:55:42 TCP CRITICAL_DATA_LEAK 10.0.4.50:60122 -> 203.0.113.77:443 payload=[[FLAG:act4-grep-v]]
2026-08-17 01:55:00 TCP ALLOW 10.0.4.12:52154 -> 10.0.4.50:5432
`),
          'security_events.csv': file(
`timestamp,event_id,source_ip,destination_ip,action,flag_token
2026-08-17T01:00:00Z,1001,10.0.4.12,10.0.4.50,ALLOW,NONE
2026-08-17T01:15:00Z,1002,10.0.4.12,10.0.4.50,ALLOW,NONE
2026-08-17T02:00:00Z,4624,192.168.1.105,10.0.4.50,DENY,NONE
2026-08-17T02:30:00Z,4625,192.168.1.105,10.0.4.50,DENY,NONE
2026-08-17T03:00:00Z,9999,10.0.4.12,10.0.4.50,FLAG_EMIT,[[FLAG:act4-pipe-csv]]
2026-08-17T03:30:00Z,1001,10.0.4.12,10.0.4.50,ALLOW,NONE
2026-08-17T04:00:00Z,1002,10.0.4.12,10.0.4.50,ALLOW,NONE
`)
        },
        'evidence': {
          'mystery_file': file(
`\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x06\x00\x00\x00\x5c\x72\xa8\x66
[PNG Image Data — Seized Artifact #088-A]
Resolution: 256x256 | Color depth: 32-bit RGBA | Created: 2026-08-17
Flag: [[FLAG:act2-file]]
`, { fileType: 'PNG image data, 256 x 256, 8-bit/color RGBA, non-interlaced' }),
          'binary_data': file(
`\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x3e\x00
\x01\x00\x00\x00\x70\x05\x40\x00\x00\x00\x00\x00\x40\x00\x00\x00\x00\x00\x00\x00
/lib64/ld-linux-x86-64.so.2
libc.so.6
puts
__libc_start_main
GLIBC_2.2.5
__gmon_start__
AWAVAUATUSH
[]A\\A]A^A_
Seized binary payload extracted from memory capture.
Target signature: 0xDEADBEEF
Hidden recovery token: [[FLAG:act2-strings]]
End of printable strings section.
\x00\x00\x00\x00\x00\x00\x00\x00
`, { fileType: 'ELF 64-bit LSB executable, x86-64, version 1 (SYSV)' }),
          'evidence.img': file(
`[FORENSIC DISK IMAGE CONTAINER - CASE #CF-2026-088]
Disk geometry: 2048 cylinders, 64 heads, 32 sectors/track
Image format: Raw (dd) / Sector size: 512 bytes
Acquisition hash: [[FLAG:act2-md5]]
Integrity verified: SHA-256 matches chain of custody manifest.
`, { fileType: 'DOS/MBR boot sector' }),
          'suspect_drive.raw': file(
`[RAW DISK IMAGE: suspect_drive.raw - 512MB]
Partition Table Scheme: MBR / DOS
Partition 1: Type 0x83 (Linux native) / Start sector: 2048 / Length: 204800
Partition 2: Type 0x83 (Linux native) / Start sector: 206848 / Length: 841728
[Partition 2 contains encrypted forensic artifact container]
`, { fileType: 'DOS/MBR boot sector, code offset 0x58+2, OEM-ID "MSDOS5.0"' })
        }
      },
      'var/log': {
        'sensor_audit.log': file(
`2026-08-17 00:00:01 Sensor audit daemon started
2026-08-17 01:00:00 Sensor #1 heartbeat OK
2026-08-17 02:00:00 Sensor #2 heartbeat OK
2026-08-17 03:00:00 Sensor #3 checkpoint recorded: [[FLAG:act3-find]]
2026-08-17 04:00:00 Sensor audit routine completed cleanly
`)
      },
      'mnt/c': {
        'Users': {
          'analyst': {
            'Desktop': {
              'CASE_FILES': {
                'intake.txt': file(
`CASE INTAKE FORM — TOP-SIDE EXAMINATION
Case: CF-2026-088
Location: /mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt
Bridged Access Verification: [[FLAG:act3-crossing]]
Notes: Windows filesystem accessed via Linux WSL mount.
`)
              }
            },
            'Documents': {
              'surface_notes.txt': file(
`SURFACE WORKSTATION EXAMINATION NOTES
Analyst workstation (Windows C:\\ mount at /mnt/c in WSL).
Bridge token: [[FLAG:act3-crossing-solo]]
Cross-filesystem navigation confirmed.
`)
            }
          }
        }
      },
      'etc': {
        'passwd': file('root:x:0:0:root:/root:/bin/bash\nanalyst:x:1000:1000:analyst,,,:/home/analyst:/bin/bash\n'),
        'shadow': file('root:!$6$rounds=656000$saltsalt:19500:0:99999:7:::\nanalyst:!$6$rounds=656000$analyst:19500:0:99999:7:::\n', {
          mode: 0o400,
          owner: 'root',
          group: 'root'
        })
      },
      'tmp': {}
    }
  });

  return built.fs;
}

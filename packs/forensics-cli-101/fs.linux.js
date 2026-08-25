// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Virtual filesystem for Forensics CLI 101 — the Fieldlab examination workstation.
//
// Fiction lives here, in the pack, and nowhere in packages/engine. See README.md
// for the one-paragraph case summary a teacher needs before running the module.

import { buildFS, file } from '../../packages/engine/vfs/builder.js';

// ── The seized drive image ──────────────────────────────────────────────────
//
// Act V carves a partition out of this file with real `dd`, so the sectors in
// it have to be real sectors. `dd bs=512 skip=41` reads from byte 20992 and
// nowhere else, and if the container is not sitting at byte 20992 the student
// gets an empty file and no way of telling whether they or the exercise was
// wrong. So the image is assembled sector by sector here, and the partition
// table `mmls` prints in commands.js quotes these same numbers.
//
// WHY THE DRIVE IS SMALL. It used to be labelled 512MB and was 400 bytes of
// prose: nothing at any offset, because nothing ever read it at an offset.
// The invented `extract -o` command that replaced `dd` never looked. A real
// 512MB image would be 512MB of string in every student's browser and in every
// validator run, so the geometry is honest at a scale that fits: 45 sectors,
// 23,040 bytes, every offset in the table an offset that is really there.
//
// KEEP IN STEP: packs/forensics-cli-101/commands.js prints these numbers, and
// packs/forensics-cli-101/challenges.json carries the md5 of the container
// region as act5-capstone's success condition. Change a region and both follow.
// tests/exec.linux.test.js carves the image with the offset mmls prints and
// fails if the two ever disagree.
const SECTOR_BYTES = 512;

/** One partition region, padded with NULs to a whole number of sectors. */
function region(text, sectors) {
  const size = sectors * SECTOR_BYTES;
  if (text.length > size) {
    throw new Error(`seized_drive.raw: region needs ${text.length} bytes, has ${sectors} sectors (${size})`);
  }
  // Real images are mostly zeros, `strings` steps over them, and the alternative
  // -- padding with printable filler -- would dump twenty thousand characters of
  // nothing on a student who runs `cat` on the image.
  return text.padEnd(size, '\x00');
}

// Sector 0: the boot sector, holding the partition table mmls reads.
const DRIVE_MBR = region(
`[RAW DISK IMAGE: seized_drive.raw \u2014 MBR, volume label PRIVATE]
Partition Table Scheme: MBR / DOS
Sector size: 512 bytes
Partition 1: Type 0x83 (Linux native) / Start sector: 1 / Length: 40
Partition 2: Type 0x83 (Linux native) / Start sector: 41 / Length: 4
[Partition 2 holds an encrypted container. The prototype files are inside it.]
`, 1);

// Sectors 1-40: the decoy. A student who carves this one gets the wrong bytes,
// which is the whole reason the table has to be read rather than guessed at.
const DRIVE_SYSTEM_ROOT = region(
`EXT4 SUPERBLOCK \u2014 PARTITION 1 (SYSTEM ROOT)
Volume label: aurora-root
Volume UUID: 1f2e-77b0-4c31-9a05
This partition holds the operating system the machine booted from.
Nothing from Case 1042 is in here. The container is the partition after it.
`, 40);

// Sectors 41-44: the container, and the last sector of the image. Ending the
// file here means `dd ... skip=41` with no count= still carves exactly this
// region, so a student is not marked wrong for leaving count= off.
//
// No [[FLAG:...]] lives in here on purpose. The flag a student submits is
// rewritten per student, which would change these bytes, and act5-capstone is
// scored on the md5 of the carved file.
export const DRIVE_CONTAINER = region(
`RECOVERED CONTAINER \u2014 CASE 1042
EXT4 superblock, volume UUID 8a4f-9e2c-0d17-5b44
Contents: 412 prototype design files, Aurora Robotics
Last written: 2026-03-15 02:18
This is what left the building. Hash the carved file and put that hash in the
report, so the next examiner can prove they were handed the same bytes.
`, 4);

/** The sector the encrypted container starts at. mmls prints this number. */
export const CONTAINER_START_SECTOR = 41;

const SEIZED_DRIVE_IMAGE = DRIVE_MBR + DRIVE_SYSTEM_ROOT + DRIVE_CONTAINER;

export function createLinuxFilesystem() {
  const built = buildFS({
    home: '/home/examiner',
    isWindows: false,
    tree: {
      'home/examiner': {
        '.bashrc': file('# Fieldlab examiner profile\nexport PS1="examiner@fieldlab:\\w\\$ "\nalias ll="ls -la"\n'),
        '.stash': file('You found the hidden file. A name that starts with a dot is invisible to a plain ls.\nFlag: [[FLAG:act1-hidden]]\n', { hidden: true }),
        'welcome.txt': file(
`================================================================================
              FIELDLAB — DIGITAL FORENSICS EXAMINATION WORKSTATION
================================================================================
Welcome to the bench. You are the junior examiner on CASE 1042.

Aurora Robotics reports that prototype design files left the building on
somebody's personal drive. They sent us one laptop and one disk image. Nothing
here is dangerous and nothing here is real: this is a safe practice terminal,
you cannot break it, so try things.

Essential commands:
  pwd          - Show where you are
  ls -la       - List everything here (including hidden files)
  cd <dir>     - Enter a directory (cd .. goes back up)
  cat <file>   - Read a file
  map          - Show a map of this whole filesystem
  submit <find> - Hand in a FIND{...} for points

Start with Act I in the left panel. Work carefully.
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
              'closed_cases.txt': file('Cases closed by this bench in 2025:\n1017 returned to client\n1023 returned to client\n1031 transferred to another lab\n')
            }
          }
        },
        'Documents': {
          'case_1042.txt': file(
`CASE 1042 — AURORA ROBOTICS
OPENED: 2026-03-18
EXAMINER: (you)
STATUS: OPEN

WHAT THE CLIENT SAYS
Aurora Robotics designs floor-cleaning robots. Three days after an engineer
resigned, the prototype folder on the file server showed a bulk read at 02:15
in the morning. Aurora wants to know what left the building, and when.

WHAT THE CLIENT SENT US
  Documents/access.log ............ workstation timeline from the seized laptop
  Documents/logs.txt .............. application errors from the same machine
  evidence/ ....................... files to identify, hash, and record

HOUSE RULES
Hash before you touch. Identify a file by its contents, never by its name.
Write down every number you find; later steps ask for them again.

Reading this file was the whole job for now. The panel on the left takes you
through the rest, one command at a time.
`),
          'access.log': file(
`2026-03-14 08:02:11 - SESSION: workstation unlocked by badge 4417, day shift
2026-03-14 08:04:56 - SHARE: mounted //aurora-fs/prototypes read-only
2026-03-14 17:40:03 - SESSION: workstation locked, badge 4417 signed out
2026-03-15 02:14:39 - SESSION: workstation unlocked by badge 4417, OUT OF HOURS
2026-03-15 02:15:02 - SHARE: remounted //aurora-fs/prototypes read-write
2026-03-15 02:16:44 - USB: removable volume PRIVATE attached on port 3
2026-03-15 02:18:10 - COPY: 412 files queued from //aurora-fs/prototypes
2026-03-15 02:31:57 - COPY: queue drained, 412 files written to volume PRIVATE
2026-03-15 02:33:20 - USB: removable volume PRIVATE detached
2026-03-15 02:34:02 - SHARE: unmounted //aurora-fs/prototypes
2026-03-15 02:36:15 - SESSION: workstation locked
2026-03-16 09:00:00 - CRON: nightly integrity sweep completed, 0 differences
2026-03-17 11:22:41 - ADMIN: account for badge 4417 disabled on request
2026-03-18 08:15:00 - IMAGE: laptop acquired by Fieldlab, write blocker in line
2026-03-18 08:15:31 - NOTICE: last record on this timeline. [[FLAG:act2-tail]]
`),
          'logs.txt': file(
`[2026-03-15 00:01:12] INFO: sync agent started
[2026-03-15 01:14:02] DEBUG: loading modules: ext4, overlay, vfat
[2026-03-15 02:15:44] ERROR: failed to bind port 8080 - address already in use
[2026-03-15 02:15:45] WARN: falling back to secondary listener on port 8081
[2026-03-15 02:16:00] INFO: daily health check completed - 0 anomalies
[2026-03-15 02:16:48] error: quota exceeded on volume PRIVATE, retrying
[2026-03-15 02:17:03] INFO: retry succeeded after 4000ms
[2026-03-15 02:19:05] ERROR: read denied for user guest on //aurora-fs/prototypes
[2026-03-15 02:19:06] WARN: repeated access failures detected, threshold 3
[2026-03-15 02:19:08] ERROR: workstation 10.0.4.12 rate limited for 15m
[2026-03-15 03:00:00] INFO: hourly sync to file server completed
[2026-03-15 03:30:21] error: certificate expires in 12 days
[2026-03-15 03:30:22] WARN: renewal job scheduled for 2026-03-25
[2026-03-15 04:00:00] INFO: backup archive created: /var/backups/daily.tar.gz
[2026-03-15 06:15:33] ERROR: disk space on /var/log above 85 percent
[2026-03-15 06:15:34] INFO: purged 3 archived log files, recovered 420MB
[2026-03-15 07:00:00] INFO: routine health check completed - 0 critical issues
[2026-03-15 07:22:19] ERROR: could not parse record at offset 0x4A20: [[FLAG:act3-grepi]]
[2026-03-15 07:22:20] INFO: recovery handler executed cleanly
`),
          'secrets.txt': file(
`# Credentials recovered from the seized laptop. Handle as evidence.
database_host=10.0.4.50
database_user=svc_backup
database_pass=k7#mP9$xL2vQ
vault_passcode=FLAG: [[FLAG:act3-grep]]
api_endpoint=https://api.aurora-robotics.example/v1
api_key=ak_live_8fbc2390a1e4d678
ssh_jump_host=jump.aurora-robotics.example:2222
backup_encryption_key=0x9f4a12c8e3b701d5
`),
          'network_stream.log': file(
`2026-03-15 01:00:01 TCP ALLOW 10.0.4.12:52140 -> 10.0.4.50:5432
2026-03-15 01:00:02 TCP ALLOW 10.0.4.12:52142 -> 10.0.4.50:5432
2026-03-15 01:02:15 TCP DENY  192.168.1.105:44120 -> 10.0.4.50:22
2026-03-15 01:02:16 TCP DENY  192.168.1.105:44122 -> 10.0.4.50:22
2026-03-15 01:02:17 TCP DENY  192.168.1.105:44124 -> 10.0.4.50:22
2026-03-15 01:05:00 TCP ALLOW 10.0.4.12:52144 -> 10.0.4.50:5432
2026-03-15 01:10:22 UDP DROP  10.0.4.99:5353 -> 224.0.0.251:5353
2026-03-15 01:15:30 TCP ALLOW 10.0.4.12:52146 -> 10.0.4.50:80
2026-03-15 01:20:00 TCP DENY  172.16.0.44:33890 -> 10.0.4.50:3389
2026-03-15 01:25:00 TCP ALLOW 10.0.4.12:52148 -> 10.0.4.50:5432
2026-03-15 01:30:00 TCP DENY  192.168.1.200:50110 -> 10.0.4.50:445
2026-03-15 01:35:00 TCP ALLOW 10.0.4.12:52150 -> 10.0.4.50:5432
2026-03-15 01:40:00 TCP DROP  10.0.4.254:67 -> 255.255.255.255:68
2026-03-15 01:45:00 TCP ALLOW 10.0.4.12:52152 -> 10.0.4.50:80
2026-03-15 01:50:00 TCP DENY  10.0.4.77:8080 -> 10.0.4.50:8080
2026-03-15 02:31:57 TCP CRITICAL_DATA_LEAK 10.0.4.50:60122 -> 203.0.113.77:443 payload=[[FLAG:act4-grep-v]]
2026-03-15 02:55:00 TCP ALLOW 10.0.4.12:52154 -> 10.0.4.50:5432
`),
          'security_events.csv': file(
`timestamp,event_id,source_ip,destination_ip,action,flag_token
2026-03-15T01:00:00Z,1001,10.0.4.12,10.0.4.50,ALLOW,NONE
2026-03-15T01:15:00Z,1002,10.0.4.12,10.0.4.50,ALLOW,NONE
2026-03-15T02:00:00Z,4624,192.168.1.105,10.0.4.50,DENY,NONE
2026-03-15T02:30:00Z,4625,192.168.1.105,10.0.4.50,DENY,NONE
2026-03-15T03:00:00Z,9999,10.0.4.12,10.0.4.50,FLAG_EMIT,[[FLAG:act4-pipe-csv]]
2026-03-15T03:30:00Z,1001,10.0.4.12,10.0.4.50,ALLOW,NONE
2026-03-15T04:00:00Z,1002,10.0.4.12,10.0.4.50,ALLOW,NONE
`)
        },
        'evidence': {
          'mystery_file': file(
`\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x01\x00\x00\x00\x01\x00\x08\x06\x00\x00\x00\x5c\x72\xa8\x66
[Exhibit 1042-A — recovered from the laptop Pictures folder, extension removed]
Resolution: 256x256 | Color depth: 32-bit RGBA | Created: 2026-03-15
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
Exhibit 1042-B: copy helper found in the laptop temp folder.
Build signature: 0xDEADBEEF
Hidden recovery token: [[FLAG:act2-strings]]
End of printable strings section.
\x00\x00\x00\x00\x00\x00\x00\x00
`, { fileType: 'ELF 64-bit LSB executable, x86-64, version 1 (SYSV)' }),
          'evidence.img': file(
`[FORENSIC DISK IMAGE CONTAINER — CASE 1042, EXHIBIT C]
Disk geometry: 2048 cylinders, 64 heads, 32 sectors/track
Image format: Raw (dd) / Sector size: 512 bytes
Acquisition hash: [[FLAG:act2-md5]]
Integrity verified: SHA-256 matches the chain of custody sheet.
`, { fileType: 'DOS/MBR boot sector' }),
          'seized_drive.raw': file(
            SEIZED_DRIVE_IMAGE,
            { fileType: 'DOS/MBR boot sector, code offset 0x58+2, OEM-ID "MSDOS5.0"' })
        }
      },
      'var/log': {
        'badge_audit.log': file(
`2026-03-15 00:00:01 Badge reader daemon started
2026-03-15 01:00:00 Reader 1, main entrance, heartbeat OK
2026-03-15 02:00:00 Reader 2, lab corridor, heartbeat OK
2026-03-15 02:14:38 Reader 3, engineering floor, badge 4417 accepted: [[FLAG:act3-find]]
2026-03-15 04:00:00 Badge audit routine completed cleanly
`)
      },
      'mnt/c': {
        'Users': {
          'Examiner': {
            'Desktop': {
              'CASE_FILES': {
                'intake.txt': file(
`EVIDENCE INTAKE SHEET — CASE 1042
Exhibit: Aurora Robotics laptop, one unit, powered off on arrival
Location of this sheet: /mnt/c/Users/Examiner/Desktop/CASE_FILES/intake.txt
Bridged access verification: [[FLAG:act3-crossing]]
Note: this Windows filesystem is reachable from Linux through the WSL mount.
`)
              }
            },
            'Documents': {
              'handover_notes.txt': file(
`HANDOVER NOTES — CASE 1042, WINDOWS SIDE
Written by the examiner who imaged the laptop before you took the bench.
Bridge token: [[FLAG:act3-crossing-solo]]
Cross-filesystem navigation confirmed. The Windows exhibits are in evidence\\.
`)
            }
          }
        }
      },
      'etc': {
        'passwd': file('root:x:0:0:root:/root:/bin/bash\nexaminer:x:1000:1000:examiner,,,:/home/examiner:/bin/bash\n'),
        'shadow': file('root:!$6$rounds=656000$saltsalt:19500:0:99999:7:::\nexaminer:!$6$rounds=656000$examiner:19500:0:99999:7:::\n', {
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

// packs/index.js still imports the pre-Shellgrounds name. Kept as a shim so the
// registry keeps booting; drop it once that import is updated.

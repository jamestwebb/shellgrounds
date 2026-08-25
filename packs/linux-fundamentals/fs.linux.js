// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Virtual Filesystem Definition for Linux Fundamentals — Meridian Observatory.
//
// The fiction lives here and in pack.json, never in the engine: this is one
// small observatory computer, handed to a night-shift observer at dusk.

import { buildFS, file } from '../../packages/engine/vfs/builder.js';

export function createLinuxFundamentalsFilesystem() {
  const built = buildFS({
    home: '/home/student',
    isWindows: false,
    tree: {
      'home/student': {
        '.bashrc': file('# ~/.bashrc: executed by bash for non-login shells.\nexport PS1="\\u@meridian:\\w\\$ "\nalias ll="ls -la"\n'),
        '.profile': file('# ~/.profile: executed by Bourne-compatible login shells.\nexport PATH="$HOME/bin:$PATH"\n'),
        '.handover': file('The day crew left you this. Dome is sealed, sky is clear, nothing is on fire.\nThe dome key for tonight is [[FLAG:l1-boss]] -- do not lose it.\n', { hidden: true, mode: 0o600 }),
        'welcome.txt': file(
`================================================================================
                       MERIDIAN OBSERVATORY - NIGHT SHIFT
================================================================================
The day crew has gone down the mountain. The dome, the weather feed and the
public website all run on this one machine, and tonight it is yours.

Everything you need is a command away:
- Documents/  the duty roster, the night's notes, the website's access log
- logs/       what the dome controller and the login service recorded
- projects/   the observatory website and the maintenance scripts

Nothing here can break the telescope. Work through the acts in the left panel.
`),
        'Documents': {
          'notes.txt': file('Dome Status: sealed\nTonight Target: NGC 7331\nNight Lead: student\n'),
          'todo.txt': file('1. Check the dome controller log\n2. Count the failed logins\n3. Lock down the night notes\n4. Leave a clean handover\n'),
          'data.csv': file(
`id,name,team,hours,status
101,Alice Reyes,Optics,95,active
102,Bo Nakamura,Records,82,active
103,Chidi Adeyemi,Optics,105,active
104,Dana Ilves,Weather,115,active
105,Evan Wright,Outreach,78,inactive
106,Fiona Marsh,Weather,120,active
`),
          'dome_temps.log': file(
`9
12
-6
0
4
1
7
`),
          'dome_status.log': file(
`sealed
sealed
sealed
open
open
sealed
sealed
sealed
sealed
`),
          'server_access.log': file(
`192.168.1.10 - - [17/Aug/2026:01:00:15 +0000] "GET /index.html HTTP/1.1" 200 4523
192.168.1.11 - - [17/Aug/2026:01:05:22 +0000] "GET /style.css HTTP/1.1" 200 1204
192.168.1.12 - - [17/Aug/2026:01:10:00 +0000] "POST /login HTTP/1.1" 401 234
192.168.1.12 - - [17/Aug/2026:01:10:05 +0000] "POST /login HTTP/1.1" 401 234
192.168.1.12 - - [17/Aug/2026:01:10:12 +0000] "POST /login HTTP/1.1" 200 1024
10.0.0.5 - - [17/Aug/2026:02:15:30 +0000] "GET /api/v1/status HTTP/1.1" 200 89
10.0.0.6 - - [17/Aug/2026:02:16:00 +0000] "GET /api/v1/metrics HTTP/1.1" 500 512
10.0.0.7 - - [17/Aug/2026:03:00:00 +0000] "GET /admin HTTP/1.1" 403 312
192.168.1.50 - - [17/Aug/2026:04:12:00 +0000] "GET /downloads/skyatlas.tar.gz HTTP/1.1" 200 1048576
192.168.1.10 - - [17/Aug/2026:05:00:00 +0000] "GET /dashboard HTTP/1.1" 200 8920
`)
        },
        'projects': {
          'web': {
            'index.html': file('<!DOCTYPE html>\n<html>\n<head><title>Meridian Observatory</title></head>\n<body><h1>Tonight the dome is open</h1></body>\n</html>\n'),
            'app.js': file('console.log("Sky feed started");\nfunction seeing() { return 42; }\n'),
            'style.css': file('body { font-family: sans-serif; background: #111; color: #fff; }\n')
          },
          'scripts': {
            'backup.sh': file('#!/bin/bash\n# Nightly backup of the observing notes\ntar -czf /tmp/backup.tar.gz /home/student/Documents\necho "Backup finished."\n', { mode: 0o755 }),
            'deploy.py': file('#!/usr/bin/env python3\nprint("Website deployment check")\n', { mode: 0o644 })
          }
        },
        'logs': {
          'auth.log': file(
`Aug 17 01:15:00 meridian sshd[1024]: Accepted publickey for student from 192.168.1.50 port 52110 ssh2
Aug 17 02:00:10 meridian sudo: student : TTY=pts/0 ; PWD=/home/student ; USER=root ; COMMAND=/bin/ls
Aug 17 03:22:15 meridian sshd[1410]: Failed password for invalid user admin from 10.0.0.99 port 44100 ssh2
Aug 17 03:22:18 meridian sshd[1412]: Failed password for invalid user admin from 10.0.0.99 port 44102 ssh2
Aug 17 03:22:21 meridian sshd[1414]: Failed password for invalid user test from 10.0.0.99 port 44104 ssh2
Aug 17 04:00:00 meridian CRON[2010]: (root) CMD (/usr/local/bin/cleanup.sh)
Aug 17 04:15:00 meridian sshd[2200]: Accepted password for student from 192.168.1.50 port 52144 ssh2
`),
          'app_errors.log': file(
`[2026-08-17 01:00:00] INFO: Dome controller started
[2026-08-17 01:15:20] ERROR: Connection refused to weather feed on port 5432
[2026-08-17 01:15:25] WARN: Retrying connection in 5 seconds
[2026-08-17 01:15:30] INFO: Weather feed connected successfully
[2026-08-17 02:40:11] Error: Shutter position sensor returned no reading
[2026-08-17 03:10:00] error: Disk quota warning on partition /var
[2026-08-17 04:00:00] INFO: Scheduled mirror cooling completed
`),
          'debug.log': file('DEBUG: Subsystem initialized\nDEBUG: Star catalogue warmed with 120 entries\n')
        }
      },
      'etc': {
        'passwd': file(
`root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
student:x:1000:1000:Night Observer,,,:/home/student:/bin/bash
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`),
        'shadow': file(
`root:$6$rounds=656000$saltsalt$9x8K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0:19500:0:99999:7:::
student:$6$rounds=656000$domesalt$1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7A8B9C0D1E2F3:19500:0:99999:7:::
`, { mode: 0o400, owner: 'root', group: 'root' }),
        'hosts': file('127.0.0.1 localhost\n127.0.1.1 meridian\n::1 localhost ip6-localhost ip6-loopback\n'),
        'os-release': file('NAME="Ubuntu"\nVERSION="22.04.4 LTS (Jammy Jellyfish)"\nID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04.4 LTS"\n')
      },
      'var/log': {
        'syslog': file(
`Aug 17 00:00:01 meridian kernel: Linux version 5.15.0-generic (buildd@lcy02-amd64)
Aug 17 00:00:01 meridian kernel: Command line: BOOT_IMAGE=/vmlinuz-5.15.0 root=/dev/sda1 ro
Aug 17 00:00:01 meridian systemd[1]: Started System Logging Service.
Aug 17 01:00:00 meridian cron[800]: (CRON) STARTUP (fork ok)
Aug 17 02:30:00 meridian systemd[1]: Starting Daily apt download activities...
Aug 17 02:30:05 meridian systemd[1]: apt-daily.service: Deactivated successfully.
`)
      },
      'tmp': {
        'scratch.txt': file('Temporary calculation buffer\n')
      }
    }
  });

  return built.fs;
}

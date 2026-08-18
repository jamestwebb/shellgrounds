// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Virtual Filesystem Definition for Linux Fundamentals

import { buildFS, file } from '../../packages/engine/vfs/builder.js';

export function createLinuxFundamentalsFilesystem() {
  const built = buildFS({
    home: '/home/student',
    isWindows: false,
    tree: {
      'home/student': {
        '.bashrc': file('# ~/.bashrc: executed by bash for non-login shells.\nexport PS1="\\u@sandbox:\\w\\$ "\nalias ll="ls -la"\n'),
        '.profile': file('# ~/.profile: executed by Bourne-compatible login shells.\nexport PATH="$HOME/bin:$PATH"\n'),
        '.secret_token': file('FLAG{HIDDEN_DOTFILE_MASTER}\n', { hidden: true, mode: 0o600 }),
        'welcome.txt': file(
`================================================================================
                    LINUX FUNDAMENTALS PROVING GROUND
================================================================================
Welcome to the interactive Linux sandbox!

This training environment teaches standard Unix CLI concepts with total fidelity:
- Command navigation, options, and manual pages
- Real wildcard globbing (* and ?) expanded by the shell
- Byte-exact pipelines and standard streams (stdin, stdout, stderr)
- File permissions (rwx), ownership, and sudo privileges
- Stream editing with sed, awk, and xargs

To get started, follow the challenges in the left panel.
`),
        'Documents': {
          'notes.txt': file('Project Status: In Progress\nTarget Release: 2026-Q4\nTeam Lead: student\n'),
          'todo.txt': file('1. Configure backup script\n2. Inspect server error logs\n3. Set correct file permissions\n4. Review audit trail\n'),
          'data.csv': file(
`id,name,department,salary,status
101,Alice Smith,Engineering,95000,active
102,Bob Jones,Finance,82000,active
103,Charlie Brown,Engineering,105000,active
104,Diana Prince,Security,115000,active
105,Evan Wright,Marketing,78000,inactive
106,Fiona Gallagher,Security,120000,active
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
192.168.1.50 - - [17/Aug/2026:04:12:00 +0000] "GET /downloads/archive.tar.gz HTTP/1.1" 200 1048576
192.168.1.10 - - [17/Aug/2026:05:00:00 +0000] "GET /dashboard HTTP/1.1" 200 8920
`)
        },
        'projects': {
          'web': {
            'index.html': file('<!DOCTYPE html>\n<html>\n<head><title>Test App</title></head>\n<body><h1>Hello Linux</h1></body>\n</html>\n'),
            'app.js': file('console.log("Application started");\nfunction compute() { return 42; }\n'),
            'style.css': file('body { font-family: sans-serif; background: #111; color: #fff; }\n')
          },
          'scripts': {
            'backup.sh': file('#!/bin/bash\n# Daily backup utility\ntar -czf /tmp/backup.tar.gz /home/student/Documents\necho "Backup finished."\n', { mode: 0o755 }),
            'deploy.py': file('#!/usr/bin/env python3\nprint("Deployment verification script")\n', { mode: 0o644 })
          }
        },
        'logs': {
          'auth.log': file(
`Aug 17 01:15:00 sandbox sshd[1024]: Accepted publickey for student from 192.168.1.50 port 52110 ssh2
Aug 17 02:00:10 sandbox sudo: student : TTY=pts/0 ; PWD=/home/student ; USER=root ; COMMAND=/bin/ls
Aug 17 03:22:15 sandbox sshd[1410]: Failed password for invalid user admin from 10.0.0.99 port 44100 ssh2
Aug 17 03:22:18 sandbox sshd[1412]: Failed password for invalid user admin from 10.0.0.99 port 44102 ssh2
Aug 17 03:22:21 sandbox sshd[1414]: Failed password for invalid user test from 10.0.0.99 port 44104 ssh2
Aug 17 04:00:00 sandbox CRON[2010]: (root) CMD (/usr/local/bin/cleanup.sh)
Aug 17 04:15:00 sandbox sshd[2200]: Accepted password for student from 192.168.1.50 port 52144 ssh2
`),
          'app_errors.log': file(
`[2026-08-17 01:00:00] INFO: Worker thread 1 spawned
[2026-08-17 01:15:20] ERROR: Connection refused to database on port 5432
[2026-08-17 01:15:25] WARN: Retrying connection in 5 seconds
[2026-08-17 01:15:30] INFO: Database connected successfully
[2026-08-17 02:40:11] ERROR: Null pointer dereference in user_session.c:142
[2026-08-17 03:10:00] ERROR: Disk quota warning on partition /var
[2026-08-17 04:00:00] INFO: Scheduled garbage collection completed
`),
          'debug.log': file('DEBUG: Subsystem initialized\nDEBUG: Cache warmed with 120 entries\n')
        }
      },
      'etc': {
        'passwd': file(
`root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
student:x:1000:1000:Linux Student,,,:/home/student:/bin/bash
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
`),
        'shadow': file(
`root:$6$rounds=656000$saltsalt$9x8K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0:19500:0:99999:7:::
student:$6$rounds=656000$studentsalt$1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7A8B9C0D1E2F3:19500:0:99999:7:::
`, { mode: 0o400, owner: 'root', group: 'root' }),
        'hosts': file('127.0.0.1 localhost\n127.0.1.1 sandbox\n::1 localhost ip6-localhost ip6-loopback\n'),
        'os-release': file('NAME="Ubuntu"\nVERSION="22.04.4 LTS (Jammy Jellyfish)"\nID=ubuntu\nVERSION_ID="22.04"\nPRETTY_NAME="Ubuntu 22.04.4 LTS"\n')
      },
      'var/log': {
        'syslog': file(
`Aug 17 00:00:01 sandbox kernel: Linux version 5.15.0-generic (buildd@lcy02-amd64)
Aug 17 00:00:01 sandbox kernel: Command line: BOOT_IMAGE=/vmlinuz-5.15.0 root=/dev/sda1 ro
Aug 17 00:00:01 sandbox systemd[1]: Started System Logging Service.
Aug 17 01:00:00 sandbox cron[800]: (CRON) STARTUP (fork ok)
Aug 17 02:30:00 sandbox systemd[1]: Starting Daily apt download activities...
Aug 17 02:30:05 sandbox systemd[1]: apt-daily.service: Deactivated successfully.
`)
      },
      'tmp': {
        'scratch.txt': file('Temporary calculation buffer\n')
      }
    }
  });

  return built.fs;
}

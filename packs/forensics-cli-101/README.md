# Forensics CLI 101: The Aurora Case

**Curriculum type:** Digital forensics and incident response (DFIR) fundamentals
**Audience:** Ages 14 and up. No prior terminal experience required.
**Platforms:** Linux (`examiner@fieldlab`) and Windows CMD (`C:\Users\Examiner`)
**Length:** 30 challenges across 6 acts, 885 points.

## The story, in one minute

The student is the junior examiner at **Fieldlab**, a small independent digital
forensics lab. **Case 1042**: Aurora Robotics, a company that designs
floor-cleaning robots, believes prototype design files walked out of the
building on somebody's personal drive after an engineer resigned. Aurora sent
Fieldlab one laptop and one disk image. The student's job is to find out what
left, and when.

That is the whole fiction. It is self-contained: no violence, no real company
or person, no course, semester, or lecture to belong to. A teacher can run this
module without knowing anything else, and a student can be told the premise in
two sentences.

The case runs as a spine through the acts. Act I is orientation on the bench.
Act II opens the exhibits. Act III follows the trail onto the Windows side of
the laptop. Act IV counts and filters the network capture. Act V reads the
partition table of the seized drive, carries the sector offset into a second
tool, and carves out the encrypted container. Act VI repeats the core moves in
Windows CMD, so students see that the ideas outlive the shell.

## Learning objectives

- Navigate a filesystem: `pwd`, `ls`, `cd`, absolute and relative paths, dotfiles.
- Read files deliberately: `cat`, `head`, `tail`, and choosing the right end of a log.
- Identify a file by its contents, not its name: `file` and magic bytes, `strings`.
- Prove evidence integrity: `md5sum`, `sha256sum`, `certutil -hashfile`, chain of custody.
- Search at scale: `grep`, `grep -i`, `grep -v`, `find -name`, `man`.
- Bridge Linux and Windows through the WSL mount at `/mnt/c`.
- Build multi-stage pipelines: `|`, `wc -l`, `cut -d -f`, and `>` redirection.
- Carry a value from one tool's output into another tool's argument (`scan` → `extract -o`).
- Windows CMD parity: `dir /a`, `type`, `findstr /i`, `attrib`, `certutil`.

## Notes for the teacher

- Every flag is generated per student, so answers cannot be shared.
- Challenges grade what the terminal produced, not the exact keystrokes: any
  command that yields the right answer scores. Where a specific command *is*
  the lesson, the check accepts every reasonable equivalent and still verifies
  the output.
- The pack ships two invented bench tools, `scan` and `extract`, plus `evtrace`,
  which Act III installs with a simulated `apt-get`. They exist to teach reading
  a tool's output and its manual page; they are not real forensic software. The
  manifest's `courseTools` list names the real tools (Sleuth Kit, Volatility,
  `exiftool`, and so on) so the simulator can say honestly that it does not
  implement them.

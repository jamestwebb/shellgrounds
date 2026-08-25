# Three included campaigns

Three campaigns ship with the site — **106 challenges in total**. Students switch between
them from the header, and each is a full campaign with its own machine, its own story and
its own badges. Nothing is shared, so a student can finish one and start another without
losing anything.

Deciding what your class sees, and how it is scored, is in
[TEACHING.md](TEACHING.md). Writing your own is in
[../packs/AUTHORING.md](../packs/AUTHORING.md).

---

### Linux Fundamentals: The Night Shift

**46 challenges · 4 acts · Linux · no prior experience assumed**

You are the overnight operator at the Meridian Observatory. The day crew left the dome in a
state, the night log needs reading, and nobody is coming to help until dawn. This is the
one to start a class on: it begins at `pwd` and ends with a student writing a pipeline.

| Act | What it teaches |
|---|---|
| 🔭 I — Opening the Dome | Paths, `ls`, `cd`, reading files, wildcards |
| 📜 II — Reading the Night Log | `grep`, `wc`, `sort`, `head`/`tail`, `cut`, and the first pipe |
| 🔐 III — Keys to the Dome | `mkdir`, `cp`, `mv`, `rm`, `chmod`, octal modes, `sudo` |
| 🌅 IV — Handover at Dawn | `find`, `sed`, `awk`, `tee`, `diff`, redirection, `&&` and `||`, exit status |

### Windows CMD Essentials: Lost & Found

**30 challenges · 3 acts · Windows · no prior experience assumed**

A laptop arrives at a university lost-property desk with no name on it. Your job is to find
out whose it is, tidy it up, and fill in the property form — using `cmd.exe` and nothing
else. Real CMD, not bash wearing a `C:\` prompt.

| Act | What it teaches |
|---|---|
| 🔎 I — Whose Machine Is This? | `CD`, `DIR` and its switches, `TYPE`, `TREE`, `WHERE` |
| 📁 II — Tidy It Up | `COPY`, `MOVE`, `REN`, `DEL`, `MD`/`RD`, `SET` and `%VAR%` |
| 🧾 III — Fill In the Form | `FINDSTR`, pipes, `SYSTEMINFO`, `TASKLIST`, `IPCONFIG`, `CERTUTIL` hashing |

### Forensics CLI 101: The Aurora Case

**30 challenges · 6 acts · Linux and Windows · assumes the basics**

A digital-forensics case worked from the command line, from first arrival at the bench to
carving a file out of a disk image. Written for a cyber-forensics course, but it teaches
general CLI skill through the case rather than the other way round. Students who have done
one of the two packs above will be comfortable here; students who have not will struggle.

| Act | What it teaches |
|---|---|
| 🧭 I — First on Scene | Bearings: prompt, paths, what is really in a directory |
| 📜 II — Reading the Evidence | `cat`, `file`, magic bytes, `md5sum`, chain of custody |
| 🔎 III — Following the Trail | `grep`, `find`, `man`, and the WSL `/mnt/c` bridge |
| 🔧 IV — The Pipeline | Pipes, redirection, filters, multi-stage analysis |
| 🏁 V — Closing the Case | Partition tables, carrying a sector offset, carving a container |
| 🪟 VI — The Seized Laptop | The same work in Windows CMD: `dir /a`, `findstr`, `attrib`, `certutil` |

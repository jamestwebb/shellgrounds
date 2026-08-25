# Questions teachers ask

Short answers. Where something is not yet true, this says so.

---

### What does it cost?

Nothing, for a normal class. It is a static site on Netlify's free tier: no
database, no container, no per-student billing. The free tier covers a class
comfortably; a whole school on one site would want watching.

### What do you store about my students?

**A handle they choose, and what they have solved.** No email address, no real
name, no class list, no analytics, no third-party scripts. Nothing on the page
calls out to anyone else's server — a student's browser talks only to your own
Netlify site.

A student is identified by a token held in their browser. That is the whole
account. It also means a student who switches browsers cannot resume, which is
the honest trade for not collecting anything that would let them.

### Do students install anything?

No. They open a web page. The shell is simulated in the browser — there is no
server executing commands, and there is no server that *could*.

### Is this like a capture-the-flag?

Mechanically, yes. Culturally, no. Students never see the words "capture" or
"flag" — they find things. Nothing is timed, nothing eliminates anyone, and a
student who finishes last still finishes.

### Can students copy each other's answers?

Not the ones that matter. Every find is generated for the individual student
from their handle, so the string that scores for one student scores for nobody
else. Passing an answer along does not work, and students discover that quickly
enough to stop trying.

### Do I need to know Linux to run this?

No. You need to be able to make a copy of a repository and set three settings.
The guide in the README walks through it and takes about twenty minutes. You do
not have to be able to solve the challenges to run them — the instructor guide
in `docs/instructor/` ships with every answer.

### Is it a real shell?

No, and it says so. It is a simulation with a deliberate boundary, and the
boundary is visible: run something it does not implement and it tells you the
command is real but not simulated here, rather than pretending it does not
exist. The Reference screen lists every command it has, and which real flags it
knows about but has not built.

This matters pedagogically. A simulator that silently swallows a correct
command teaches a student to distrust what they know.

### Can I use it at my school? At a company?

**School, college, university, public library, government: yes**, and the
licence says so explicitly — an educational institution is permitted regardless
of how it is funded, so tuition does not change the answer.

**A for-profit training company: no.** The licence is
[PolyForm Noncommercial 1.0.0](../LICENSE.md), which permits noncommercial
purposes only. If you want to run it commercially, ask.

### How long does a campaign take?

Roughly a term of short sessions. Linux Fundamentals is 46 challenges across
four acts; the other two are 30 each. Most challenges are one command. Acts
unlock on progress, not on a clock, so a class moves at the pace of the class.

### Can I see who is stuck?

Yes. An instructor account gets a console showing each student's progress, which
act they are in, and which challenges are costing the most hints. It is meant
for "who do I sit with next", not for surveillance — it shows progress, not
keystrokes.

### Can I write my own campaign?

Yes, and this is the part the project cares most about. A campaign — a *pack*, in the
code and the file format — is a folder of
JSON: the story, the filesystem, the challenges, the answers. See
[`packs/AUTHORING.md`](../packs/AUTHORING.md) to build one in ten minutes and
[`docs/PACK-FORMAT.md`](PACK-FORMAT.md) for the full reference.

A validator (`npm run validate`) machine-proves that every challenge in your
pack is solvable before students ever see it, and reports the things that are
easy to get wrong: an answer a real shell would accept but your pattern rejects,
a command you teach and never define, a challenge that introduces four ideas at
once.

### Does it work on a phone?

Deliberately not. Below a certain width on a touch device it shows a notice
asking for a keyboard, because a command line without one teaches frustration
rather than commands. Chromebooks, laptops and desktops are the target, and a
desktop browser zoomed to 400% is not blocked.

### Is it accessible?

It is built to WCAG 2.1 AA and it is not finished. Six terminal colour schemes
ship, every one contrast-tested at 4.5:1, including a colour-blind-safe scheme
and a light one for readers who cannot use a dark screen. Colour is never the
only signal anywhere in the interface.

What is **not** done is honest in
[`docs/ACCESSIBILITY.md`](ACCESSIBILITY.md), which lists the open findings by
name. Most importantly: **nothing has been tested with a real screen reader
user.** Until it has, no claim about screen-reader support belongs here.

### How does it do all that without a server?

| Capability | How Shellgrounds does it |
| :--- | :--- |
| **No infrastructure** | Static site, serverless functions, and blob storage. No Docker, no VMs, no database to run. |
| **Answers cannot be shared** | Flags are HMAC-SHA256 values derived per student, per challenge. |
| **No broken challenges** | A validator proves a working solution path for every challenge before release. |
| **Honest simulation** | Unsimulated commands declare themselves rather than failing silently or lying. |
| **Pluggable curriculum** | Content packs are declarative data. Writing a new one needs no engine changes. |

The short version: nothing a student types is executed anywhere. The shell is
simulated in their browser, the finds are derived cryptographically from their
handle rather than stored, and the only thing the site keeps is who solved what.

---

### What happens when the class finishes?

They uncover a picture together — one square per find, the whole class working
on the same image. It finishes when the class finishes, not when the fastest
student does.

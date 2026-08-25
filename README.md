# Shellgrounds — learn the command line, one find at a time

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="docs/images/shellgrounds-banner-light.png">
    <img src="docs/images/shellgrounds-banner-dark.png" alt="Shellgrounds — learn the command line, one find at a time.">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/jamestwebb/shellgrounds/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/jamestwebb/shellgrounds/ci.yml?branch=master&style=flat-square&label=ci" alt="CI status"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-PolyForm%20Noncommercial-8b5cf6?style=flat-square" alt="License: PolyForm Noncommercial 1.0.0"></a>
  <a href="#running-it-on-your-own-machine"><img src="https://img.shields.io/badge/node-20-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 20"></a>
  <a href="docs/FAQ.md"><img src="https://img.shields.io/badge/students-nothing%20to%20install-d4b483?style=flat-square" alt="Students install nothing"></a>
</p>

<p align="center">
  <a href="#deploy-it-for-your-class">Deploy it</a> ·
  <a href="docs/FAQ.md">FAQ</a> ·
  <a href="packs/AUTHORING.md">Write a campaign</a> ·
  <a href="docs/PACK-FORMAT.md">Pack format</a> ·
  <a href="docs/ACCESSIBILITY.md">Accessibility</a>
</p>

**A free command-line training ground for high school and university technology educators.**
For CS, IT and cybersecurity programmes that need students fluent at a shell — without a
lab of virtual machines to build, patch and rebuild every term. Students open a web page,
pick a handle, and learn real bash and Windows CMD by solving small challenges. Setup
takes about twenty minutes — [start here](#deploy-it-for-your-class).

**Key features**

- **Nothing for students to install, nothing for you to administer.** A static site on a
  free tier — no virtual machines, no containers, no lab images, and no per-student
  accounts to provision. Deploying it needs a GitHub and a Netlify account and no software.
- **No student data beyond a handle they choose.** No email, no real name, no roster, no
  analytics, no third-party scripts. That is the whole answer to the privacy question.
- **Linux and Windows, in one place.** Three campaigns, 106 challenges, 143 distinct skills —
  `bash`, Windows `cmd`, and a forensics campaign that crosses between them over WSL.
- **Answers cannot be passed around.** Every find is generated from the student's own
  handle, so the string that scores for one student scores for nobody else.
- **A shared picture by default, a leaderboard only if you want one.** Every find turns
  over one square of a class image: names show, nothing is ranked, and it finishes well
  before the slowest student does. A public ranking pushes students toward looking
  competent rather than becoming competent — and being shown as 23rd of 24 confirms exactly
  what a frightened first-year already suspected. Switch to a board in one click; the full
  ranking and the gradebook stay in the instructor console either way.
- **Write the campaign you actually teach.** A campaign — a *pack*, in the code — is a
  folder of JSON: networking, git, SQL. `npm run validate` proves every challenge solvable
  before a class sees it.
- **WCAG 2.1 AA, and honest about the gaps.** Six terminal schemes, all contrast-tested at
  4.5:1; colour is never the only signal. What is unfinished is
  [listed by name](docs/ACCESSIBILITY.md).

![A student part-way through the forensics campaign. The left panel names the act and what
it covers, states the task in one line under the heading YOUR TASK, explains what `ls` is
the first time the campaign uses it, and gives the scene underneath. The right panel is a
simulated shell where the student has run `pwd` and `ls`; the coach has explained each
result in one line, and the challenge is marked solved for ten
points.](docs/images/shellgrounds-terminal.png)

<sub>Act I of the forensics campaign, in practice mode. The terminal is simulated in the
browser — nothing is executed on a server, and there is no server to execute it on.</sub>

---

## Deploy it for your class

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/jamestwebb/shellgrounds)

> **Before this button works, the GitHub repository must be renamed to
> `jamestwebb/shellgrounds`.** It is still published under its old name, and the button
> above points at the new one. Rename the repo first, or edit the URL to match wherever
> the code actually lives.

Clicking the button makes your own copy of the code, builds it, and puts it on the web at
a free `*.netlify.app` address. On the way through, Netlify asks you for three things:

| Setting | What to put in it |
| :--- | :--- |
| `CLASS_PASSWORD` | The password you tell your class. Students type it once, to create their handle. |
| `ADMIN_HANDLES` | Your own handle, so the site shows you the instructor view. Comma-separated for more than one teacher: `ms_okafor,ta_alex`. |
| `INSTRUCTOR_SETUP_CODE` | A second, private password only you know. It stops a student claiming the teacher handle before you do. Make it different from the class password, and do not announce it. |

### After the first deploy — two more steps

1. **Add a signing key.** In the Netlify dashboard, open **Site configuration ->
   Environment variables** and add `SESSION_SECRET`. It must be a long random string.
   On a Mac or Linux machine, `openssl rand -hex 32` prints one. Any long jumble of
   letters and numbers works. Then redeploy (**Deploys -> Trigger deploy**).
2. **Claim your handle.** Open the site, enter your handle from `ADMIN_HANDLES`, the class
   password, and — under **I am the instructor** — your setup code. You now see the
   instructor view.

Then give your class the site address and the class password. That is the whole setup.

### One name to change only between terms

`SHELLGROUNDS_STORE` names the storage area holding every handle, solve, and score. You do
not have to set it: it has a working default. Change the value and the site starts reading
a fresh, empty store, and every score already recorded becomes invisible — it is still on
disk, but the site no longer looks there. So change it once, at the start of a term, and
never in the middle of one.

If you deployed this site before it was renamed from The Gauntlet, you may have a
`GAUNTLET_STORE` variable. It still works and your scores are safe. Leave it, or copy its
value into `SHELLGROUNDS_STORE` and delete the old one.

---

## What your students get

Three packs ship with the site — **104 challenges in total**. Students switch packs from
the header, and each one is a full campaign with its own machine, its own story, and its own
badges. Nothing is shared between them, so a student can finish one and start another
without losing anything.

### Linux Fundamentals: The Night Shift

**44 challenges · 4 acts · Linux · no prior experience assumed**

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

### Choosing which packs your class sees

By default students see all three. To run one campaign at a time, set `ENABLED_PACKS` to a
comma-separated list of ids:

```
ENABLED_PACKS=linux-fundamentals
ENABLED_PACKS=linux-fundamentals,windows-cmd-essentials
```

The ids are `linux-fundamentals`, `windows-cmd-essentials`, and `forensics-cli-101`. Each
enabled pack is its own contest with its own leaderboard, so running two at once does not make
students compete across different material. A pack you switch off disappears from the
switcher, and the site refuses to grade its challenges even for a student who saved the
link from last term.

You do not have to use the variable at all. **Sign in as the instructor and open the
Packs tab** — the same choice is there as a row of switches, it applies immediately, and it
needs no redeploy. `ENABLED_PACKS` is only the starting point for a site nobody has
configured yet; once you save from the screen, the screen wins.

Scores are never affected. Switching a pack off hides it and stops the site grading its
challenges; switching it back on brings every score, solve and hint back exactly as it was.

### Competition, or a class working together

Under **Packs** in the instructor view you also choose what your class sees:

- **A shared picture** (the default). Every find by anyone turns over one square of an
  image from the campaign. Names appear, nothing is ranked, and the picture finishes well
  before the last student does — so nobody is ever visibly holding up the class.
- **A leaderboard.** The familiar ranked board, by points.

Either way you keep the full ranking and the gradebook in the instructor console, because
marks have to come from somewhere. This decides what the *class* is shown.

The shared picture is the default deliberately. A public ranking pushes students toward
looking competent rather than becoming competent, and for a first-year who is already
frightened of the terminal, being shown as 23rd of 24 confirms the thing they feared. Those
are the students the free first hint and the no-timers rule exist to protect. But you know
your class and some cohorts genuinely want a board, which is why it is one click away.

**You can also write your own.** A pack is a folder of JSON, or one `.pack.json` file you
can email to another teacher. See [`docs/PACK-FORMAT.md`](docs/PACK-FORMAT.md) to author
one and `node bin/shellgrounds.js new <name>` to start from a working scaffold.

Design decisions worth knowing before you teach with it:

- **Every student gets different flags**, derived from their handle. Copying a classmate's
  answer does not work.
- **The first hint on each challenge is free.** Later hints cost a few points. Nothing is
  ever locked behind a hint.
- **A student can skip one challenge per act.** No single challenge can trap anybody.
- **There are no timers and no streaks.** Speed pressure punishes exactly the students the
  hints exist to protect.
- **The simulation is honest.** Run a command Shellgrounds does not simulate and it tells
  you what that command really does, instead of pretending it does not exist.

---

## Running it on your own machine

You do not need any of this to teach with Shellgrounds. It is here for people writing
their own packs.

```bash
npm install       # install dependencies
npm run dev       # start the dev server
npm test          # unit, de-branding, and fidelity tests
npm run validate  # prove every challenge in every pack is solvable
npm run build     # production build
```

The pack validator also runs standalone, and takes a single pack:

```bash
node bin/shellgrounds.js validate
node bin/shellgrounds.js validate packs/linux-fundamentals --json
```

---

## How it is built

| Capability | How Shellgrounds does it |
| :--- | :--- |
| **No infrastructure** | Static site, serverless functions, and blob storage. No Docker, no VMs, no database to run. |
| **Answers cannot be shared** | Flags are HMAC-SHA256 values derived per student, per challenge. |
| **No broken challenges** | A validator proves a working solution path for every challenge before release. |
| **Honest simulation** | Unsimulated commands declare themselves rather than failing silently or lying. |
| **Pluggable curriculum** | Content packs are declarative data. Writing a new one needs no engine changes. |

---

## Contributing

Issues and pull requests are welcome, particularly content packs — a campaign for
networking, for git, for SQL, for whatever you actually teach. See
[`packs/AUTHORING.md`](packs/AUTHORING.md) to build one, and run `npm run validate`
before opening a PR: it machine-proves every challenge in your pack is solvable and
reports the mistakes that are easy to make and hard to see.

**AI-assisted PRs are welcome.** Say so in the description, and hold the work to the
same bar as anything else: it should be tested, it should explain *why* in its comments,
and you should have read it.

## Thanks

**[Netlify](https://github.com/netlify).** This project rests on their free tier, and the
shape of the product follows from it: a static site, serverless functions and a key-value
store, at no cost and with no card on file. That is why a teacher can run this without a
budget line, a purchase order or a conversation with procurement — which for most schools
is the difference between using something and not.

**[shields.io](https://shields.io)** for the badges above, and
**[JetBrains Mono](https://www.jetbrains.com/lp/mono/)** for every character a student types.

## License

**PolyForm Noncommercial License 1.0.0** — full text in [LICENSE.md](LICENSE.md).

Plain English. This summary is not a substitute for the licence itself:

- **Teachers and schools may use this, free of charge.** The licence names educational
  institutions as a permitted use *"regardless of the source of funding"*. Public schools,
  private schools, colleges, and universities are all covered, as are non-profits and
  government bodies.
- **You may change it and share your changes.** Fork it, write your own content packs,
  deploy it for your class, hand it to a colleague.
- **Keep the attribution.** Anyone who gets a copy from you must also get the licence and
  the `Required Notice:` line that names the copyright holder.
- **No commercial use.** You may not sell this, or sell a service built on it, without a
  separate licence from the copyright holder.

This is a *source-available* licence, not an OSI-approved open-source one. The
non-commercial restriction is deliberate. If you need commercial terms, ask.

Copyright (c) 2026 Rational Mystic LLC.

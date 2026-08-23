# Shellgrounds

> **Learn the command line by capturing flags.**

**Shellgrounds is a free command-line game you can run for your class.** Students open a
web page, pick a handle, and learn real bash and Windows commands by solving small
challenges and capturing flags — with a class leaderboard, badges, and hints for the ones
who get stuck. There is nothing to install and no server to maintain: it is a static site
you deploy to Netlify's free tier by clicking a button, setting three settings, and telling
your class one password. If you can make a Google Form, you can run this. Every student
gets flags generated just for them, so answers cannot be copied — the only way onto the
leaderboard is through the terminal. Setup takes about twenty minutes; the guide below
walks through every step.

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

Three packs ship with the site. Switch packs from the header; each one is a full course.

1. **Shellgrounds: Forensics** (`forensics-cli-101`) — 30 challenges across 6 acts. A
   case investigation that teaches navigation, file inspection, hashing, search, pipes,
   redirection, and Windows CMD parity.
2. **Shellgrounds: Linux Fundamentals** (`linux-fundamentals`) — 40 challenges: navigation,
   file management (`mkdir`, `cp`, `mv`, `rm`), text handling (`grep`, `sort`, `cut`,
   `uniq`, `tr`, `sed`, `awk`, `tee`), permissions (`chmod`, `chown`, `sudo`), and
   redirection. No story, for teachers who want none.
3. **Shellgrounds: Windows CMD** (`windows-cmd-essentials`) — 27 challenges: navigation,
   file operations (`copy`, `move`, `del`, `ren`, `md`, `rd`), text search (`find`,
   `findstr`), environment variables (`set %VAR%`), and system inspection (`systeminfo`,
   `ipconfig`, `certutil`).

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

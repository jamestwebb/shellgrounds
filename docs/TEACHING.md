# Running it with a class

What to switch on, what your students are shown, and the design decisions behind both.
The campaigns themselves are described in [CAMPAIGNS.md](CAMPAIGNS.md).

---

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
can email to another teacher. See [`PACK-FORMAT.md`](PACK-FORMAT.md) to author
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

# Authoring a content pack

The mechanical rules — file layout, `pack.json` fields, predicate names — are
enforced by `node bin/gauntlet.js validate`. Run it before you ship a pack; it
proves every challenge is solvable rather than taking your word for it.

This file covers the one rule the schema cannot express.

## Fading scaffolding: do not give away the answer for free

A third-party review of the first three packs found that **60 of 60** command
challenges printed the required command line inside the brief. A student could
finish an entire pack by copying the line above the terminal, so nothing was
being learned after the first act, and the hint economy was decorative because
the free hint restated the same line.

The rule now, by act:

| Act | The brief | The free (cost 0) hint | A costed hint |
|---|---|---|---|
| 1 | may show the whole command line | may show the whole command line | not needed |
| 2–3 | names the tool, never its flags or arguments | nudges toward the flag or argument | gives the exact line |
| 4+ | states the objective only | names the tool | gives the exact line |

Scaffolding must **fade**. A student who is still being handed the answer in the
last act was never asked to recall anything.

Two things follow from this:

- **State the goal, not the keystrokes.** "Find every line in `logs/app.log`
  that is not an INFO line" beats "Run `grep -v INFO logs/app.log`". The first
  makes the student choose a tool; the second makes them a typist.
- **Put the exact line behind a cost.** A student who is stuck still gets
  unstuck in ten seconds. They just pay for it, which is what makes the XP
  mean something.

Suggested hint costs: 5–10 XP in acts 2–3, 10–15 XP in act 4 and later, on
challenges worth 20–45 points. Keep the first hint free and conceptual so a lost
beginner is never charged for a nudge.

### It is checked

`tests/scaffolding.test.js` executes every backticked snippet in an act-2+ brief
and in every free hint, then tests the result against that challenge's own
success condition. If a snippet solves the challenge, the test fails and names
the file, the challenge, and the snippet.

Because the check runs the snippet rather than pattern-matching it, quoting a
command that is *meant* to fail is fine. `l3-sudo-shadow` tells the student that
`cat /etc/shadow` will be denied, and the lint stays quiet, because that line
does not satisfy the success condition.

## Writing the brief

- Address the student directly and say what outcome you want.
- Name the file or directory involved. Making them guess the target is not
  difficulty, it is a maze.
- Say what the tool is for when a tool is genuinely new. Recall works only for
  something the student has met before; `awk` in act 4 needs its purpose named
  even when its syntax does not.
- Keep it to two or three sentences. Long briefs get skimmed, and a skimmed
  brief is a student who types blind.

## Writing hints

- Hint 0, free: the concept or the shape of the answer. "One flag inverts a
  `grep` match" — not the flag letter.
- Hint 1, costed: the exact command, ready to type.
- For a flag challenge, a cheap final hint that says where the flag appears in
  the output prevents a student who ran the right command from stalling on the
  submit step.

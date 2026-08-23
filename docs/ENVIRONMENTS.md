<!-- Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md -->

# Is this a CLI trainer, or a framework that currently teaches CLI?

**Both, and the seam between them is in a good place. Nothing here is built yet.**

This document exists so that the next change to the pack format does not cement the shell
in by accident. It is a map, not a plan. No code depends on it.

---

## What is already general

None of this knows what a terminal is:

| Piece | Where | Why it is general |
|---|---|---|
| The pack format | `packages/engine/validate/packFile.js` | Data all the way down. No field can carry code. |
| Acts, unlocking, skipping | `packValidator.js`, `unlock-rule` | A curriculum shape, not a tool. |
| Hints and their costs | `netlify/functions/hint.js` | Server-recorded, per student. |
| Per-student finds | `crypto-utils.js` | An HMAC over `(secret, handle, challenge, pack)`. |
| Scoring, badges, gradebook | `store.js`, `admin-overview.js` | Records that a challenge was solved. |
| The instructor console | `AdminOverview.jsx` | Speaks in challenges, not commands. |
| The cooperative reveal | `packages/engine/reveal.js` | Counts solves. Does not care what a solve was. |
| Import, export, the deploy story | `scripts/pack-*.mjs`, `netlify.toml` | Files and a static site. |

## What is bound to the shell

| Piece | Where |
|---|---|
| Tokenizer, expansion, pipelines | `packages/engine/shell/` |
| The virtual filesystem | `packages/engine/vfs/` |
| The command registry | `packages/engine/commands/` |
| Roughly eleven of seventeen predicates | `validate/predicates.js` |

---

## The seam, and what it would take to name it

A challenge's success condition is **declarative data**, evaluated by `evaluatePredicate`
against a context object:

```js
evaluatePredicate(challenge.success, {
  command,      // what the student typed
  output,       // what came back
  exitStatus,   // how it ended
  cwd,          // where they were
  fs            // what the machine looked like afterwards
})
```

Four of the five fields in that context are shell-shaped. But the *shape of the
arrangement* is not: a predicate is a name plus arguments, evaluated against whatever the
environment reports. That is the seam.

Naming it would mean three things, none of which exist today:

**1. A pack declares its environment.**

```json
{ "id": "sql-basics", "environment": "sql", "platforms": ["sql"] }
```

**2. Predicates are namespaced to the environment that can evaluate them.**

```
shell.cwdIs, shell.fileExists, shell.outputMatches
sql.rowsEqual, sql.queryTouchedTable
git.branchIs, git.commitCount
```

Today's bare names would keep working as `shell.*`, because a pack in the wild must not
break. The validator would refuse a predicate an environment cannot evaluate — which is the
check that makes the abstraction real rather than decorative.

**3. An environment supplies its own context and its own practice surface.**

An environment is: a thing that takes what a student did, does it, and reports a context.
The shell environment is `runPipeline` plus a VFS. A SQL environment would be a query
engine plus a schema. That is the whole contract.

---

## What this would actually buy, in order of cost

**Free today, no architecture needed.** Anything that is *type a text command, check the
output or a file*. These already fit the existing engine and need only new command
implementations and content:

- `git` — branches, staging, history
- PowerShell, as a third platform beside bash and CMD
- Regular-expression practice, using `grep` as the surface
- Log triage and incident timelines
- Anything a teacher wants that lives in a shell

**A real project, one environment at a time.** These need a new practice surface, not just
new content:

- SQL — a query engine and a schema
- Packet capture — a capture file and a filter language
- Memory or disk forensics — an image and a tool set
- Code exercises — a language runtime, which is a much larger commitment

---

## Why it is not being built now

Two reasons, and the second is the real one.

The stated one: a class this term is better served by a working cooperative classroom than
by a second environment.

The honest one: **an abstraction written before its second case is a guess.** The right
moment to name the environment concept is while building the second environment, because
that is when the wrong guesses become visible. Writing it now would produce an interface
shaped entirely by the shell, wearing a general name.

## The one thing to protect in the meantime

**Do not add a pack field that only makes sense for a terminal without noticing.**

`manifest.linux` and `manifest.windows` already are that, and they are fine, because they
sit under names that say what they are for. The trap is a field like `startingDirectory` or
`defaultShell` at the top level, where a future environment would have to either honour it
meaninglessly or explain why it does not.

When in doubt: put it under the platform, not on the manifest.

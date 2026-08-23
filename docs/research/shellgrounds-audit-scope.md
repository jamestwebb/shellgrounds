# Audit scope — Shellgrounds, today's changes

I maintain this project and I am hardening my own code before I let a real class
use it. I want a second, independent read on correctness and on whether the
safety properties I believe I have are actually enforced. Tell me what is
missing or wrong so I can fix it; I am not asking for exploitation of anything.

## What the software is

A free browser-based command-line teaching site for schools and universities.
Students sign in with a class password and a handle, type real shell commands
into a **simulated** terminal (no real machine is ever touched), and are graded
by a server-side replay of what they typed. Teachers deploy it to Netlify's free
tier. Storage is Netlify Blobs — a key/value store, no database, no SQL.

Two facts that shape everything below:

- **There is no sandbox escape surface.** The "shell" is a pure-JavaScript
  simulator over an in-memory tree. It never spawns a process or touches a real
  filesystem. Bugs here are *correctness* bugs — a student marked wrong when
  right, or right when wrong — not execution risk.
- **Content packs are data.** A course is JSON. The format deliberately contains
  no field that can carry code, and I want that property re-checked rather than
  assumed.

## Priority 1 — Data integrity under concurrency

Every write to Netlify Blobs is a read-modify-write, and a whole class hits the
site at once. I have used compare-and-swap (`onlyIfMatch` / `onlyIfNew`, then
retry with backoff) where I believed it was needed. **Please find any
read-modify-write that still lacks it, and any that has it but is wrong.**

- `netlify/functions/utils/store.js` — the entire data layer. Look especially at
  `updatePlayer`, `addSolve`, `openHint`, `updateSettings`, `raiseRevealProgress`,
  `createPlayer`. Is the retry loop correct? Can a lost update still happen? Is
  there a path where a failed swap is reported as success?
- Is `mapLimit` correct — does it preserve input order, terminate on an empty
  list, and does a rejection inside it leave the other workers hanging?
- `readWithEtag` falls back to a plain `get` when `getWithMetadata` is absent.
  What happens to the swap then, and is that fallback safe or silently
  last-write-wins?
- The **local file backend** in the same file is used for development. Does its
  corrupt/empty-file guard actually prevent erasing data, and can it be defeated?

## Priority 2 — The cooperative reveal

A class uncovers one shared picture; each solved challenge uncovers a share of
it. Files: `packages/engine/reveal.js`, `netlify/functions/reveal.js`.

- `buildReveal` — arithmetic errors, off-by-one, division by zero, a fraction
  that can exceed 1 or go negative, `NaN` propagating from an unparseable date.
- `revealTarget` / `revealGrid` — can the grid be chosen such that `tiles` is 0,
  or such that the tile attribution index goes out of bounds?
- `tileOrder` is a seeded Fisher–Yates. Is it a genuine permutation for every
  size in the ladder? Is the xorshift seeding degenerate for any input (e.g. can
  `state` reach 0 and stick)?
- **A property I claim and want checked:** the picture must never uncover LESS
  than it did before. The target grows with the class roster, so a late intake
  raises the denominator. `floorFraction` plus `raiseRevealProgress` is meant to
  prevent it. Can the picture still go backwards on any path?
- **A property I claim and want checked:** this endpoint must return no score
  and no ranking of students, ever — the whole point of it is that students are
  not ranked against each other. Does anything rankable leak into the response?

## Priority 3 — Is the teacher-only boundary actually enforced?

Instructors configure the site; students must not be able to. "Instructor" means
BOTH being named in the `ADMIN_HANDLES` setting AND having proved a separate
setup code. Files: `netlify/functions/utils/admin.js`, `config.js`,
`admin-overview.js`, `claim-instructor.js`, `register-handle.js`.

- Is there any path where one of the two conditions is enough?
- Sessions are a base64 `handle:packId:expiry:hmac` string
  (`packages/engine/crypto-utils.js`). Is the verification order-of-operations
  correct — expiry checked, signature compared safely, no path where a malformed
  token is accepted or where a field can be smuggled through the delimiter?
- `admin-overview.js` returns the answer key. Confirm a student session cannot
  reach it under any parameter combination.
- Does the CSV export escape leading `=`, `+`, `-`, `@` so a handle cannot become
  a formula in a spreadsheet?

## Priority 4 — Untrusted pack content

A teacher can import a `.pack.json` written by someone else. The format is meant
to be data-only. Files: `packages/engine/validate/packFile.js`,
`presentation.js`, `predicates.js`, `safe-regex.js`, `packSource.js`,
`scripts/pack-import.mjs`, `scripts/pack-export.mjs`.

- `assertNoCode` — can anything executable survive it? Function values,
  `__proto__` / `constructor` / prototype pollution, getters, a key that looks
  like a comment but is not.
- `presentation.js` accepts an embedded image as a base64 `data:` URI. It must
  refuse SVG (a document that can carry script) and any remote URL, and cap the
  size. Is the parsing exact, or can a crafted prefix slip past the regex?
- `safe-regex.js` is meant to stop a pack-supplied pattern taking exponential
  time. Are the nested-quantifier and overlapping-alternation checks sound, and
  what dangerous patterns do they miss?
- Import/export write files from names in the pack. Is path traversal fully
  prevented, including on Windows-style separators and unicode?

## Priority 5 — Grading correctness

The server replays the student's command and evaluates a declarative predicate.
Files: `netlify/functions/submit-flag.js`, `packages/engine/validate/predicates.js`,
`packages/engine/shell/exec.js`.

- Can a student be marked **wrong when right**, or **right when wrong**? Either
  is serious; the first is worse for a beginner.
- Is the replay's starting directory chosen correctly, and can a client-supplied
  `cwd` influence a check it should not?
- Hint penalties are recorded server-side. Can the client still influence a score?

## Output

For each finding: **severity**, `file:line`, and a concrete failure scenario —
the input or sequence of events, and the wrong result it produces. If you
conclude a property I claimed above is genuinely enforced, say so briefly; that
is useful too. Use placeholder names, not any real paths or identifiers.

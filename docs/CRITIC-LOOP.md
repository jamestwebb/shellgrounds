# The Critic Loop — agy as the critic

A build protocol for this repository. It turns six rules into a procedure that a
third-party model (`agy`, Gemini 3.1 Pro, non-Anthropic) can enforce, instead of
a procedure that depends on the builder being honest about its own work.

Companion documents: `.claude/skills/gemini-audit/SKILL.md` (the transport) and
`docs/UPLIFT-PLAN.md` (the work this loop is applied to).

---

## 0. The anti-gaming clause

Before any unit is offered to the critic, the builder answers one question
honestly: **"am I proud of this?"** If no, the builder names the gap, fixes it,
and asks again. Inflating a score to exit the loop is banned. Lowering the bar
to exit the loop is banned. A unit leaves the loop on the critic's verdict or on
a `BLOCKED` report — never on the builder's opinion.

---

## 1. Decompose and fan out

Split the task into independent units. Give one builder agent one unit. Run the
builders in parallel, in separate worktrees, so file writes cannot collide.
Serial work on parallelizable units wastes wall-clock time.

**Variant tournament.** Every new feature gets 2–3 competing builders on the
*same* unit. The critic then has something to compare against, which is what
makes rule 3 possible. Fixes, docs, and performance work get a tournament only
when the unit is judgment-heavy — design, approach, or UX. A one-line bug fix
does not need three authors.

- Parallel builders: `Agent(..., isolation: "worktree")`, or the `Workflow` tool
  when the fan-out is large enough to script.
- Unit size: one unit is one thing a critic can judge in one sitting. If the
  critic must hold two unrelated concerns at once, the unit is too big.

> **Standing constraint in this repo:** the operator's instructions forbid
> spawning agents or workflows unless the operator asks. This section describes
> what to run *when asked*. Do not start a tournament on your own initiative.

---

## 2. The builder never grades its own work

Every unit's output goes to a critic that had no part in building it and never
sees the builder's reasoning. The critic gets the **deliverable plus the
reference material** — nothing else. A critic that reads the builder's
justification agrees with it before it starts.

Here this is structural, not a rule of etiquette:

| Leak path | Why agy cannot see it |
|---|---|
| Builder's chain of thought | agy runs in a separate process, with no conversation history |
| Builder's commit messages arguing the case | Write neutral messages for units under review |
| Uncommitted scratch work, notes, `.env` | The wrapper builds a throwaway worktree of **tracked files at one ref** |
| Prior rounds' feedback | Each run is a new process and a new worktree |

**Self-review does not count as review.** My own reading of the diff is a
pre-check that decides whether the unit is worth the critic's time. It is never
the verdict.

---

## 3. The critic is harsh by default; its job is to reject

Two halves: the *stance* and the *blinding*.

### 3a. The stance

`gemini-audit.sh` prepends a fixed guardrail to every scope. That guardrail is
tuned for a defect hunt, and it says *"prefer a few high-confidence real defects
over a long speculative list."* That is the correct instruction for an audit and
the **wrong** instruction for a tournament: it produces a findings list and no
verdict, so the loop has no exit condition.

The scope you write must therefore add the verdict contract. Paste this block
into the scope file, below the target description:

```markdown
## Your verdict is the deliverable

You are judging finished work, not surveying it. Reject by default. The work
passes only if you would genuinely choose it, or genuinely cannot tell it apart
from the reference, in the blind comparison below.

End your report with a VERDICT block in exactly this form:

    VERDICT: PASS | FAIL
    WINNER: A | B | INDISTINGUISHABLE
    WHY: <one sentence naming the deciding property>
    CRITERIA:
      - <named criterion>: MET | NOT MET — <the specific evidence>
      - ...

Rules for the verdict:
- "Pretty good" is a FAIL. "Acceptable" is a FAIL. "No major issues" is a FAIL.
- A PASS with unmet criteria is invalid. Re-read and change one or the other.
- Every criterion must be checkable by someone else from your evidence.
  "The error handling is cleaner" is not evidence. "Candidate A returns exit
  status 1 on a failed redirect at shell/streams.js:114; candidate B returns 0"
  is evidence.
- If you cannot decide, say INDISTINGUISHABLE. Do not split the difference.
- Rank findings most-severe first, above the VERDICT block.
```

Keep the language of quality and reliability. Do **not** write "attack",
"exploit", or "adversarial" in a scope that touches authentication, the flag
HMAC, or the Netlify functions — Gemini's content policy refuses that framing
and you get a refusal instead of a review. Harsh is allowed; offensive framing
is not. See the SKILL's "Security scopes" note.

### 3b. The blinding

Where a comparison exists, the critic must not know which candidate is ours.
agy reads a real filesystem, so blinding is a staging step, not a prompt
instruction. Stage the candidates as `candidate-a/` and `candidate-b/` on a
throwaway branch, in an order chosen by a coin flip, and keep the mapping
**outside** the tree:

```bash
# from the repo root; SCRATCH is the session scratchpad, never the repo
TASK=tab-completion
SCRATCH=/tmp/claude-1000/<session>/scratchpad/$TASK
mkdir -p "$SCRATCH/critique"

# 1. build the throwaway branch
git switch --detach HEAD
rm -rf candidate-a candidate-b

# 2. flip the coin OUTSIDE the tree, record it, then stage
if [ $((RANDOM % 2)) -eq 0 ]; then A=ours B=reference; else A=reference B=ours; fi
echo "round=1 candidate-a=$A candidate-b=$B" >> "$SCRATCH/critique/ab-map.txt"

git checkout "$BRANCH_OURS"     -- .   # then move the tree into candidate-{a|b}/
# ... stage each candidate under its letter ...

# 3. scrub the tells before committing
grep -rIl 'ours\|variant-1\|mine\|Claude\|Opus' candidate-a candidate-b
git commit -q -m "round 1 candidates"
REF=$(git rev-parse HEAD)
```

Then scrub the tells. A blind comparison dies on any of these:

- Directory or branch names that rank the candidates (`v1`/`v2`, `new`/`old`).
- Comment style or authorship fingerprints that differ between candidates.
- Copyright headers on one candidate and not the other.
- A candidate that still compiles against paths the other does not have.
- Commit metadata: use one squashed commit for both candidates.

If a unit has no natural reference — a first implementation with nothing to
compare to — run the tournament between two builders and label them A and B.
Blind still applies; there is simply no "ours".

---

## 4. Loop until pass

```
build → commit → critic (fresh) → revise against named findings → commit → critic (fresh) → …
```

A **fresh** critic re-judges cold every round. It has no memory of the last
round and no wish to be encouraging. This is free with agy — every invocation is
a new process against a new worktree — but only if you do two things:

1. **Commit before every round.** `gemini-audit.sh` builds its worktree from a
   git ref. Uncommitted work is invisible to the critic, and the run will
   silently review the previous state. This is the most common way to waste a
   round.
2. **Pass the ref explicitly.** `GEMINI_AUDIT_REF=<sha>` pins the round to a
   snapshot, so the verdict stays attached to code you can go back to.

```bash
GEMINI_AUDIT_REF="$REF" \
GEMINI_AUDIT_OUT="$SCRATCH/critique/round-1-verdict.md" \
  ~/.claude/skills/gemini-audit/gemini-audit.sh docs/research/<unit>-scope.md
```

Run it in the background. The process exits when agy finishes; that exit is the
completion signal, so do not poll.

**A pass requires the critic's explicit `VERDICT: PASS`.** The builder's claim
that it addressed everything is not a pass. A round with a missing or malformed
VERDICT block is a failed round, not a pass — re-run it.

**Verify before you revise.** The critic is not ground truth; false positives
are real. Check each finding against the code and mark it CONFIRMED, REFUTED, or
PARTIAL with file:line evidence, and record that in the round log. Default
posture: assume the critic is right until you can disprove it. A REFUTED finding
still needs an answer in the next scope, because a fresh critic will raise it
again — usually that means the code is unclear even though it is correct.

---

## 5. The stall rule

If **3 consecutive rounds** produce no improvement on the critic's *named
criteria*, stop. Do not start a fourth round and do not relax the criteria to
manufacture a pass.

Report `BLOCKED` with four things:

1. The critic's last verdict, quoted.
2. The evidence paths for every round.
3. The specific criterion that will not move, and what was tried against it.
4. What is missing, in one of three categories: an **asset** (test data,
   a design, a real Windows transcript), a **tool** (something the harness
   cannot do), or a **decision from James**.

"No improvement" is measured against the criteria the critic named, not against
the finding count. A round that trades three low findings for one new high
finding is not an improvement. Track it in the round log:

```
round | ref     | verdict | criteria MET | new findings | notes
------+---------+---------+--------------+--------------+---------------------
1     | a1b2c3d | FAIL    | 2/6          | 6            | blind: a=ours
2     | d4e5f6a | FAIL    | 4/6          | 2            | 1 refuted (see notes)
3     | 7b8c9d0 | FAIL    | 4/6          | 0            | stall 1/3
```

---

## 6. Evidence or it didn't happen

Every verdict ships with its artifacts. A claim in the final report that has no
artifact path next to it is treated as not having happened.

```
$SCRATCH/critique/
  ab-map.txt              # which letter was ours, per round — written BEFORE the run
  round-N-verdict.md      # agy's report, verbatim, including the VERDICT block
  round-N-verdict.md.err  # agy's stderr; check it when a report looks truncated
  round-N.diff            # what the builder changed going into round N
  round-N-verify.md       # CONFIRMED / REFUTED / PARTIAL for each finding
  round-log.md            # the table from section 5
  metrics.txt             # test counts, timings, sizes — whatever the criteria named
```

Reference the exact paths in the final report.

**Where artifacts live.** Raw artifacts stay in the scratchpad. No binaries and
no screenshots are committed. The one exception this repo already makes: a
finished audit report is worth keeping as history, so the *text* report may be
copied to `docs/research/` when the unit lands — as is already the case for
`docs/research/gemini-audit-*.md`. Round-by-round churn does not get committed.

---

## Full scope template

Copy to `docs/research/<unit>-scope.md`, fill the four bracketed parts, run.
The wrapper prepends the privacy guardrail and the defect-class framing, so this
file carries only the target, the criteria, and the verdict contract.

```markdown
# Critic round <N>: <unit name>

<Two or three sentences: what this software is, who uses it, and what the unit
is supposed to do. Written for a reader who has never seen the repo. No history,
no rationale for the approach, no mention of who wrote which candidate.>

## What to compare

`candidate-a/` and `candidate-b/` contain two independent implementations of the
same unit. They are interchangeable at the interface; judge the implementations.
Read both fully before forming an opinion.

## Reference

<The ground truth the unit must match: a real `bash` transcript, a POSIX or
Microsoft doc paragraph, the pack schema, the acceptance test. Quote it here.
Without this the critic invents its own standard and the verdict is noise.>

## Named criteria

1. <A criterion that can be checked, not felt.>
2. …

## Files

- candidate-a/… — <one line each>
- candidate-b/… — <one line each>
- <shared files the candidates depend on, marked read-only context>

## Your verdict is the deliverable

<paste the verdict contract from section 3a verbatim>
```

---

## What this loop does not enforce

Stated so nobody mistakes the protocol for a guarantee.

- **agy sees one ref, not a diff.** It judges the state of the code, so a
  regression relative to an earlier round is invisible unless a criterion names
  it. Carry regressions forward as explicit criteria.
- **No test execution.** agy reads source; it does not run `npm test`. Test
  results are the builder's evidence, and the critic can only check that the
  tests would exercise the claim. Put real numbers in `metrics.txt`.
- **The critic cannot see the running UI.** Anything about layout, colour, or
  feel needs a screenshot in the artifacts and a criterion the critic can apply
  to it, or it is out of scope for this critic.
- **One vendor, not a panel.** Independence from Anthropic is the point, but a
  single Gemini run is still one opinion. For a decision that is expensive to
  reverse, run the round twice with the candidates swapped between A and B; a
  critic that picks the same *letter* both times is reading position, not code.

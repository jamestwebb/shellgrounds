# Scope: hardening review of the auth, scoring, and pack-binding subsystem

I am the maintainer of this classroom capture-the-flag teaching app. I am
hardening my own code before I release it to students. Please review these
files and confirm that the safe behavior is enforced. Flag anything that is
missing, so I can harden it. This is a defensive pre-release review of code I
own and control.

## Review these files, and only these files

- netlify/functions/submit-flag.js
- netlify/functions/session.js
- netlify/functions/register-handle.js
- netlify/functions/leaderboard.js
- netlify/functions/admin-overview.js
- netlify/functions/manifest.js
- netlify/functions/utils/store.js
- netlify/functions/utils/admin.js
- packages/engine/crypto-utils.js
- packages/engine/sfw-filter.js
- packs/index.js
- src/utils/api.js

Read other files only to understand these. Do not report defects in other files.

## What the subsystem does

Students get a signed session token. Each student gets a per-student flag value
that is derived with HMAC. When a student submits a flag, the server records a
score. An instructor can read a class overview and export a CSV gradebook. The
grade matters to the students, so the score records must be correct and the
instructor endpoints must stay closed to students.

## Already known. Do not report these again.

1. submit-flag.js gets the pack from the session token, and the client never
   sends a packId. A fix is planned. Do not report it.
2. /api/manifest returns every flag value to the student. This is by design.
   The app is a client-side simulation, and the client must know the flags to
   put them in the simulated filesystem. Do not report it.
3. The client bundle contains all challenge data, with acceptedVariants and
   hint text. By design. Do not report it.
4. src/App.jsx passes cwd in the wrong argument position of submitFlagApi.
   Known. Do not report it.
5. src/utils/api.js fetchAdminOverview() drops the packId that the caller
   passes. Known. Do not report it.
6. manifest.js uses the Netlify Functions v1 handler shape, and the other
   functions use v2. Known. Do not report it.
7. Fixed and verified already: the normalizeSolve paths in admin-overview.js
   and submit-flag.js, the leaderboard weekly window NaN case, and the
   p.createdAt against p.created_at mismatch. Do not report these.

Please spend your effort on new ground instead.

## Where I want you to look

**Token construction and HMAC.** createSessionToken and verifySessionToken
build a payload and split it on colons. hmacSha256 reads key characters with
charCodeAt and does not mask to a byte. Confirm that a token cannot be forged,
truncated, or confused between the 3-field and the 4-field token shape. Confirm
that a field that itself contains a colon cannot shift the meaning of the other
fields. Check the expiry check and the comparison that is meant to be
constant time.

**Authorization.** Confirm that every instructor path checks the instructor
secret, and that a student token cannot reach instructor data.

**Score integrity.** Confirm that a student cannot score the same challenge
twice, cannot produce a negative score, and cannot get an act unlocked early.
Check the hint penalty arithmetic and the threshold maths in isActUnlocked.

**CSV export.** The gradebook CSV rows are built by string concatenation.
Compare the escaping against the characters that sfw-filter.js permits in a
student handle. Confirm that a handle cannot break a row, and confirm the
spreadsheet formula case.

**Storage races and data loss.** Look at createPlayer, addSolve, and the local
fileBackend. Confirm that two writes that overlap cannot drop or corrupt a
solve record.

**Error handling.** Confirm that no 500 path and no response body returns the
secret, the token, or an internal detail that the student should not see.

**Input validation.** The submit-flag request body carries hintsUsed,
commandText, and cwd, and none of them look validated. hintsUsed comes from
the client. Confirm that its effect is bounded.

## Output format

For each finding: severity, file:line, the concrete failure with the inputs
that produce the wrong outcome, and the smallest correct fix. Rank by
severity. Be concrete. If you cannot show inputs that produce the wrong
outcome, say so.

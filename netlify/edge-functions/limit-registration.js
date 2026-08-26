// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// A cap on how fast handles can be created.
//
// Registration is the one endpoint a stranger can reach without already having
// an account, and on the public demo the class password is printed on the page.
// Nothing stopped a script from creating handles until the leaderboard was junk
// and the shared class picture had been uncovered by nobody real.
//
// This runs at the edge, so refused requests never reach the function and never
// cost an invocation. That is the whole reason it is here and not inside
// register-handle.js.
//
// ── The number, and why it is not small ─────────────────────────────────────
//
// The obvious limit is "a student registers once, so allow one or two". That
// would break the actual use case. A class registers TOGETHER, in the first
// five minutes of a lesson, from behind ONE school NAT address. Thirty students
// on one public IP is the normal case here, not the attack.
//
// So the window is sized for a whole class arriving at once AND getting it
// wrong: thirty students is thirty requests, and ten of them mistyping the
// password once is forty. A limit of 40 would lock out the back half of the
// room over typos. 120 a minute leaves room for that and is still nowhere
// near what a script wants.
//
// windowSize is capped at 180 seconds by the platform.
//
// Verified against the live site by dropping the limit to 3 and sending
// sequential requests: 403 403 403 403 403 403 403 429 429 429 429 429. Note
// the burst -- a flood of TRULY parallel requests can outrun the edge counter,
// so this catches a script working through a list, not a thundering herd. It
// is a cost and nuisance control, not a security boundary.

export default async (request, context) => context.next();

export const config = {
  path: '/api/register-handle',
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    // Per visitor address. Pooling across the whole domain would let one
    // abusive source exhaust the quota for every school using the site.
    aggregateBy: ['ip', 'domain']
  }
};

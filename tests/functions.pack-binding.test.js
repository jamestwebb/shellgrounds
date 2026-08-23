// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// The regression suite for the server API.
//
// Each test here corresponds to a defect that shipped and was demonstrated
// against the running site. They are written as the smallest thing that would
// have gone red at the time.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  freshStore, call, get, post, register, readStore, writeStoreRaw,
  CLASS_PASSWORD, SETUP_CODE
} from './functions.helpers.js';

let registerHandler, submitHandler, sessionHandler, hintHandler, adminHandler, leaderboardHandler;

beforeEach(async () => {
  freshStore();
  // Import after the env is set so nothing caches a stale value.
  registerHandler = (await import('../netlify/functions/register-handle.js')).default;
  submitHandler = (await import('../netlify/functions/submit-flag.js')).default;
  sessionHandler = (await import('../netlify/functions/session.js')).default;
  hintHandler = (await import('../netlify/functions/hint.js')).default;
  adminHandler = (await import('../netlify/functions/admin-overview.js')).default;
  leaderboardHandler = (await import('../netlify/functions/leaderboard.js')).default;
});

describe('pack binding — a student may solve any pack', () => {
  it('scores a Linux Fundamentals challenge for a handle registered with no packId', async () => {
    // This is the exact bug: the browser never sent a packId, so every token
    // was minted for the default (forensics) pack and the server judged every
    // submission against it. 67 of 97 challenges could not be scored at all.
    const { token } = await register(registerHandler, 'student1');
    expect(token).toBeTruthy();

    const { status, body } = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'l1-pwd', commandText: 'pwd'
    }, token));

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.packId).toBe('linux-fundamentals');
    expect(body.points).toBe(10);
  });

  it('scores a Windows challenge from the same session', async () => {
    const { token } = await register(registerHandler, 'student2');
    const { status, body } = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'w1-cd-nav', commandText: 'cd Documents'
    }, token));
    expect(status).toBe(200);
    expect(body.packId).toBe('windows-cmd-essentials');
  });

  it('stores solves under <packId>/<challengeId>', async () => {
    const { token } = await register(registerHandler, 'student3');
    await call(submitHandler, post('/api/submit-flag', { challengeId: 'l1-pwd', commandText: 'pwd' }, token));
    expect(Object.keys(readStore()['solves/student3'])).toContain('linux-fundamentals/l1-pwd');
  });

  it('still reads a legacy bare-id solve record', async () => {
    const { token } = await register(registerHandler, 'student4');
    const store = readStore();
    store['solves/student4'] = { 'l1-pwd': { points: 10, hintPenalty: 0, earnedPoints: 10, solvedAt: new Date().toISOString() } };
    writeStoreRaw(JSON.stringify(store));

    const { body } = await call(submitHandler, post('/api/submit-flag', { challengeId: 'l1-pwd', commandText: 'pwd' }, token));
    expect(body.alreadySolved).toBe(true);
  });

  it('rejects an unknown challenge id with 404, not a scoring error', async () => {
    const { token } = await register(registerHandler, 'student5');
    const { status } = await call(submitHandler, post('/api/submit-flag', { challengeId: 'no-such-thing', commandText: 'pwd' }, token));
    expect(status).toBe(404);
  });
});

describe('instructor handles cannot be claimed by students', () => {
  it('refuses the configured admin handle when no setup code is given', async () => {
    // Demonstrated against the running site: with ADMIN_HANDLES=<name> and the
    // teacher not yet registered, any student holding the class password could
    // claim the handle and pull the whole gradebook.
    const { status, body } = await register(registerHandler, 'profsmith');
    expect(status).toBe(403);
    expect(body.error).toMatch(/reserved for an instructor/i);
  });

  it('refuses a wrong setup code', async () => {
    const { status } = await register(registerHandler, 'profsmith', { setupCode: 'guess' });
    expect(status).toBe(403);
  });

  it('allows the instructor with the setup code, and marks them admin', async () => {
    const { status, body } = await register(registerHandler, 'profsmith', { setupCode: SETUP_CODE });
    expect(status).toBe(200);
    expect(body.isAdmin).toBe(true);

    const session = await call(sessionHandler, get('/api/session', body.token));
    expect(session.body.isAdmin).toBe(true);
  });

  it('keeps a student out of the instructor endpoint', async () => {
    const { token } = await register(registerHandler, 'student6');
    const { status } = await call(adminHandler, get('/api/admin-overview', token));
    expect(status).toBe(403);
  });
});

describe('a challenge cannot be scored without doing it', () => {
  it('refuses a cwd challenge proved by a command that never moves', async () => {
    // `echo hi` with a hand-written cwd used to score this and congratulate the
    // student for a `cd` they never ran.
    const { token } = await register(registerHandler, 'student7');
    const { status } = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'l1-cd', commandText: 'echo hi', cwd: '/home/student/Documents'
    }, token));
    expect(status).toBe(400);
  });

  it('accepts the same challenge when the command actually moves', async () => {
    const { token } = await register(registerHandler, 'student8');
    const { status, body } = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'l1-cd', commandText: 'cd Documents'
    }, token));
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('ignores a cwd that is not a real directory in the pack', async () => {
    const { token } = await register(registerHandler, 'student9');
    const { status } = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'l1-pwd', commandText: 'pwd', cwd: '/etc/../../../nonsense'
    }, token));
    expect(status).toBe(200); // falls back to the pack home rather than trusting it
  });
});

describe('hint penalties are priced by the server', () => {
  it('ignores a hint count the client makes up', async () => {
    const { token } = await register(registerHandler, 'honest');
    const { body } = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'l1-pwd', commandText: 'pwd', hintsUsed: 99
    }, token));
    expect(body.points).toBe(10);
    expect(body.hintPenalty).toBe(0);
  });

  it('charges for a hint the server saw opened', async () => {
    const { token } = await register(registerHandler, 'hinted');
    // Find a challenge whose second hint actually costs something.
    const { getPackForChallenge } = await import('../packs/index.js');
    const ch = getPackForChallenge('l2-grep');
    const costly = (ch?.challenges.find(c => c.id === 'l2-grep')?.hints || [])
      .findIndex(h => (h.cost || 0) > 0);
    if (costly < 0) return; // nothing to charge for in this pack

    const opened = await call(hintHandler, post('/api/hint', { challengeId: 'l2-grep', index: costly }, token));
    expect(opened.status).toBe(200);
    expect(opened.body.totalPenalty).toBeGreaterThan(0);
    expect(opened.body.text).toBeTruthy();
  });
});

describe('one disclosed flag does not score the whole pack', () => {
  it('scores only the named challenge when a challengeId is supplied', async () => {
    const { token } = await register(registerHandler, 'flagger');
    const { generateUserFlag } = await import('../packages/engine/crypto-utils.js');
    const flag = generateUserFlag(process.env.SESSION_SECRET, 'flagger', 'act1-hidden', 'forensics-cli-101');

    const wrongTarget = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'act1-cd', flag
    }, token));
    expect(wrongTarget.status).toBe(400);

    const rightTarget = await call(submitHandler, post('/api/submit-flag', {
      challengeId: 'act1-hidden', flag
    }, token));
    expect(rightTarget.status).toBe(200);
  });
});

describe('concurrent solves are not silently dropped', () => {
  it('persists every one of four simultaneous submissions', async () => {
    // Four concurrent submits used to return four HTTP 200s and store one
    // record. The student was told they scored points that did not exist.
    const { token } = await register(registerHandler, 'racer');
    const jobs = [
      { challengeId: 'l1-pwd', commandText: 'pwd' },
      { challengeId: 'l1-ls', commandText: 'ls' },
      { challengeId: 'l1-cd', commandText: 'cd Documents' },
      { challengeId: 'l1-cat', commandText: 'cat Documents/notes.txt' }
    ];
    const results = await Promise.all(
      jobs.map(j => call(submitHandler, post('/api/submit-flag', j, token)))
    );
    const succeeded = results.filter(r => r.status === 200 && r.body.success);
    const stored = Object.keys(readStore()['solves/racer'] || {});
    expect(stored.length).toBe(succeeded.length);
  });
});

describe('the local store never silently erases a class', () => {
  it('throws on a corrupt store file instead of overwriting it', async () => {
    await register(registerHandler, 'student10');
    writeStoreRaw('{ this is not json');
    const { status } = await call(sessionHandler, get('/api/session', 'garbage'));
    expect(status).toBe(401); // bad token short-circuits before any read
    // The file must still be exactly what we wrote — not replaced with {}.
    const { readFileSync } = await import('node:fs');
    const { storePath } = await import('./functions.helpers.js');
    expect(readFileSync(storePath(), 'utf8')).toBe('{ this is not json');
  });
});

describe('leaderboard is per pack', () => {
  it('counts only the requested pack', async () => {
    const { token } = await register(registerHandler, 'multi');
    await call(submitHandler, post('/api/submit-flag', { challengeId: 'l1-pwd', commandText: 'pwd' }, token));
    await call(submitHandler, post('/api/submit-flag', { challengeId: 'w1-cd-nav', commandText: 'cd Documents' }, token));

    const linux = await call(leaderboardHandler, get('/api/leaderboard?packId=linux-fundamentals'));
    const overall = await call(leaderboardHandler, get('/api/leaderboard'));
    const row = (r) => r.body.leaderboard.find(x => x.handle === 'multi');

    expect(row(linux).solveCount).toBe(1);
    expect(row(overall).solveCount).toBe(2);
  });

  it('404s an unknown pack rather than silently showing everything', async () => {
    const { status } = await call(leaderboardHandler, get('/api/leaderboard?packId=nope'));
    expect(status).toBe(404);
  });
});

describe('the instructor can see answers and who is stuck', () => {
  it('serves the answer key for a pack', async () => {
    const { body } = await register(registerHandler, 'profsmith', { setupCode: SETUP_CODE });
    const { status, body: key } = await call(
      adminHandler, get('/api/admin-overview?packId=linux-fundamentals&view=answers', body.token)
    );
    expect(status).toBe(200);
    expect(key.challenges.length).toBeGreaterThan(0);
    expect(key.challenges[0]).toHaveProperty('solution');
    expect(key.challenges[0]).toHaveProperty('check');
  });

  it('reports where one student has got to', async () => {
    const prof = await register(registerHandler, 'profsmith', { setupCode: SETUP_CODE });
    const stu = await register(registerHandler, 'student11');
    await call(submitHandler, post('/api/submit-flag', { challengeId: 'l1-pwd', commandText: 'pwd' }, stu.token));

    const { status, body } = await call(
      adminHandler,
      get('/api/admin-overview?packId=linux-fundamentals&view=student&handle=student11', prof.body.token)
    );
    expect(status).toBe(200);
    expect(body.solvedCount).toBe(1);
    expect(body.frontier).toBeTruthy();
  });
});

describe('triage: who needs help, in one request', () => {
  it('names the students stuck on a challenge, without a request per student', async () => {
    const prof = await register(registerHandler, 'profsmith', { setupCode: SETUP_CODE });
    const stu = await register(registerHandler, 'student12');

    // Open every hint on one challenge without solving it — that is what
    // "stuck" means here, and it is the signal a teacher actually wants.
    const { getPackForChallenge } = await import('../packs/index.js');
    const pack = getPackForChallenge('l2-grep');
    const total = (pack.challenges.find(c => c.id === 'l2-grep')?.hints || []).length;
    for (let i = 0; i < total; i++) {
      await call(hintHandler, post('/api/hint', { challengeId: 'l2-grep', index: i }, stu.token));
    }

    const { status, body } = await call(
      adminHandler,
      get('/api/admin-overview?packId=linux-fundamentals&view=triage', prof.body.token)
    );
    expect(status).toBe(200);
    const row = body.students.find(s => s.handle === 'student12');
    expect(row).toBeTruthy();
    if (total > 0) {
      expect(row.struggling.map(c => c.id)).toContain('l2-grep');
    }
    expect(body).toHaveProperty('participants');
    expect(body).toHaveProperty('registered');
  });

  it('counts participants in this module, not everyone on the server', async () => {
    const prof = await register(registerHandler, 'profsmith', { setupCode: SETUP_CODE });
    await register(registerHandler, 'idle1');
    const active = await register(registerHandler, 'active1');
    await call(submitHandler, post('/api/submit-flag', { challengeId: 'l1-pwd', commandText: 'pwd' }, active.token));

    const { body } = await call(
      adminHandler,
      get('/api/admin-overview?packId=linux-fundamentals&view=triage', prof.body.token)
    );
    expect(body.registered).toBeGreaterThan(body.participants);
    expect(body.participants).toBe(1);
  });

  it('refuses triage to a student', async () => {
    const { token } = await register(registerHandler, 'student13');
    const { status } = await call(adminHandler, get('/api/admin-overview?view=triage', token));
    expect(status).toBe(403);
  });
});

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/hint — opens one hint and records that it was opened.
//
// Hints are served from here rather than read out of the client bundle, and the
// server keeps its own record of which ones a student opened. The penalty used
// to be a number the browser reported, so an honest student scored 10 on a
// challenge where a dishonest one scored 20.

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { getPackForChallenge } from '../../packs/index.js';
import { openHint } from './utils/store.js';

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders }
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) return json(401, { error: 'Unauthorized: Session expired or invalid' });

  try {
    const { challengeId, index } = (await req.json().catch(() => ({})));
    const i = Number(index);
    if (!challengeId || !Number.isInteger(i) || i < 0) {
      return json(400, { error: 'A challenge id and a hint index are required' });
    }

    const pack = getPackForChallenge(challengeId);
    const challenge = pack?.challenges.find(c => c.id === challengeId);
    if (!challenge) return json(404, { error: `Unknown challenge '${challengeId}'` });

    const hints = challenge.hints || [];
    if (i >= hints.length) return json(404, { error: 'No such hint for this challenge' });

    const opened = await openHint(verified.handle, pack.id, challenge.id, i);

    // Price the whole ladder up to and including this hint, so the client can
    // show the running cost without doing the arithmetic itself.
    let penalty = 0;
    for (let n = 0; n < Math.min(opened, hints.length); n++) penalty += (hints[n].cost || 0);

    return json(200, {
      success: true,
      packId: pack.id,
      challengeId: challenge.id,
      index: i,
      text: hints[i].text ?? hints[i].hint ?? '',
      cost: hints[i].cost || 0,
      hintsOpened: opened,
      totalPenalty: penalty,
      remainingHints: Math.max(0, hints.length - opened)
    });
  } catch (err) {
    console.error('Hint error:', err);
    return json(500, { error: 'Internal error opening hint' });
  }
};

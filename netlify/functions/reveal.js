// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/reveal?packId= — the class's shared picture.
//
// The cooperative alternative to the leaderboard. Every solve by anybody
// uncovers one tile; the class sees how far the picture has come and who has
// been contributing, and no student sees themselves ranked against another.
//
// This endpoint deliberately returns NO scores and NO ordering. Not because
// the numbers are secret — the same student can read their own points on their
// own screen — but because a client that receives a sorted list of everyone's
// totals will eventually display one. Ranking lives in the instructor console,
// where marks come from. What is not sent cannot leak back into the class view.

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { listPlayers, getSolves, splitSolveKey, normalizeSolve } from './utils/store.js';
import { PACKS, getPack } from '../../packs/index.js';
import { isPackEnabled, defaultPackId } from './utils/enabled.js';
import { buildReveal, REVEAL_COLUMNS, REVEAL_ROWS } from '../../packages/engine/reveal.js';

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders }
  });

/** How many recent finds the feed carries. Enough to feel alive, short enough to read. */
const FEED_LENGTH = 12;

export default async (req) => {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) return json(401, { error: 'Unauthorized: Valid session token required' });

  const requested = new URL(req.url).searchParams.get('packId');
  const packId = (await isPackEnabled(requested)) ? requested : await defaultPackId();
  const pack = getPack(packId);

  try {
    const players = await listPlayers();
    const solves = [];

    for (const p of players) {
      const solvesObj = await getSolves(p.handle);
      for (const [key, raw] of Object.entries(solvesObj)) {
        const { packId: owner, challengeId, legacy } = splitSolveKey(key);
        // A record written before packs were scoped still belongs to exactly
        // one pack, because challenge ids are unique across all of them.
        const resolved = legacy
          ? Object.values(PACKS).find(pk => pk.challenges.some(c => c.id === challengeId))?.id
          : owner;
        if (resolved !== packId) continue;

        const s = normalizeSolve(raw);
        solves.push({ handle: p.handle, challengeId, solvedAt: s.solvedAt });
      }
    }

    const state = buildReveal(solves, packId, verified.handle);

    // Titles, so the feed can say what somebody found rather than an id.
    const titleOf = new Map(pack.challenges.map(c => [c.id, c.title]));
    const feed = [...solves]
      .sort((a, b) => Date.parse(b.solvedAt) - Date.parse(a.solvedAt))
      .slice(0, FEED_LENGTH)
      .map(s => ({
        handle: s.handle,
        challengeId: s.challengeId,
        title: titleOf.get(s.challengeId) || s.challengeId,
        solvedAt: s.solvedAt
      }));

    return json(200, {
      success: true,
      packId,
      packName: pack.manifest.name,
      // The picture itself: whatever art the pack carries, or nothing, in
      // which case the client draws the pack's own theme colour instead.
      image: pack.manifest.reveal || pack.manifest.cover || null,
      accent: pack.manifest.theme?.accent || null,
      columns: REVEAL_COLUMNS,
      rows: REVEAL_ROWS,
      total: state.total,
      uncovered: state.uncovered,
      complete: state.complete,
      contributors: state.contributors,
      yours: state.yours,
      tiles: state.tiles,
      feed
    });
  } catch (err) {
    console.error('Reveal error:', err);
    return json(500, { error: 'Could not read the class picture. Try again in a moment.' });
  }
};

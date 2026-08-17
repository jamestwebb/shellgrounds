// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: POST /api/submit-flag

import { verifySessionToken, generateUserFlag } from '../../src/engine/crypto-utils.js';
import { CHALLENGES, ACT_DEFINITIONS } from '../../src/data/challenges.js';
import { runPipeline } from '../../src/engine/pipeline.js';
import { createWarrenFilesystem } from '../../src/engine/fs.warren.js';
import { createTopsideFilesystem } from '../../src/engine/fs.topside.js';
import { injectFlagsIntoVFS } from '../../src/utils/vfs-injector.js';
import { getDb } from './utils/db.js';

// Same marker list the client uses: a command that "ran" but errored does not count.
const ERROR_MARKERS = /command not found|No such file|missing operand|Not a directory|Is a directory|cannot access|is not recognized|cannot find/i;

// Act progression is enforced here, not just in the sidebar UI: without this, a
// student could pull later-act flags from their own manifest and submit them early.
function isActUnlocked(challenge, solvedIds) {
  const act = ACT_DEFINITIONS.find(a => a.id === challenge.act);
  if (!act || !act.unlockThreshold) return true;
  const prevChallenges = CHALLENGES.filter(c => c.act === challenge.act - 1);
  if (prevChallenges.length === 0) return true;
  const solved = prevChallenges.filter(c => solvedIds.has(c.id)).length;
  return solved / prevChallenges.length >= act.unlockThreshold;
}

function buildServerFlags(sessionSecret, handle) {
  const flags = {};
  for (const c of CHALLENGES) {
    if (c.success?.kind === 'flag' && !c.success.staticFlag) {
      flags[c.id] = generateUserFlag(sessionSecret, handle, c.id);
    }
  }
  return flags;
}

// Re-executes the submitted command line against a fresh VFS on the server.
// This is what makes 'command' and 'state' challenges cost actual work: the client's
// claim is never trusted, the command itself is the proof.
function replayCommand(challenge, commandText, sessionSecret, handle) {
  const isWindows = challenge.platform === 'windows';
  const baseFs = isWindows ? createTopsideFilesystem() : createWarrenFilesystem();
  const { fs } = injectFlagsIntoVFS(baseFs, handle, buildServerFlags(sessionSecret, handle));
  const cwd = challenge.setup?.cwd || (isWindows ? 'C:\\Users\\Analyst' : '/home/analyst');
  const res = runPipeline(commandText.trim(), cwd, fs, isWindows ? 'windows' : 'linux', {
    installedPackages: new Set()
  });
  const ok = !res.hasError && !ERROR_MARKERS.test(res.output || '');
  return { ok, fs: res.fs };
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server is not configured. Contact the instructor.' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Session expired or invalid' })
    };
  }

  const handle = verified.handle;

  try {
    const { challengeId, flag, hintsUsed = 0, commandText = '', hintsUsedByChallenge } = JSON.parse(event.body || '{}');

    if (!challengeId && !(flag && flag.trim())) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'A challenge ID or a flag is required' })
      };
    }

    let challenge = CHALLENGES.find(c => c.id === challengeId);

    // 1. Validation Logic — every kind requires proof; nothing validates by default.
    let isValid = false;

    if (flag && flag.trim()) {
      // A flag string identifies its own challenge: match it against every flag-kind
      // challenge, so students are not punished for having the "wrong" one selected.
      const cleanSubmitted = flag.trim().toUpperCase();
      for (const c of CHALLENGES) {
        if (c.success?.kind !== 'flag') continue;
        const expected = c.success.staticFlag
          ? c.success.staticFlag.toUpperCase()
          : generateUserFlag(sessionSecret, handle, c.id).toUpperCase();
        if (cleanSubmitted === expected) {
          challenge = c;
          isValid = true;
          break;
        }
      }
      if (!isValid) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'That flag does not match any challenge for your handle. Flags are personal — a copied one will not validate.'
          })
        };
      }
    } else if (!challenge) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Challenge not found' })
      };
    } else if (challenge.success.kind === 'flag') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Flag submission cannot be empty' })
      };
    } else if (challenge.success.kind === 'command') {
      if (challenge.success.matchRegex && commandText && commandText.trim()) {
        const regex = new RegExp(challenge.success.matchRegex, 'i');
        if (regex.test(commandText.trim())) {
          isValid = replayCommand(challenge, commandText, sessionSecret, handle).ok;
        }
      }
    } else if (challenge.success.kind === 'state') {
      if (commandText && commandText.trim() && typeof challenge.success.check === 'function') {
        const replay = replayCommand(challenge, commandText, sessionSecret, handle);
        isValid = replay.ok && !!challenge.success.check(replay.fs);
      }
    }

    if (!isValid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: false,
          error: 'Flag verification failed. Check your excavated artifacts and command syntax.'
        })
      };
    }

    // 2. Compute hint penalty (clamped: hint counts are client-reported).
    // Prefer the per-challenge map so a flag matched to a different challenge
    // than the one selected is charged its OWN hint count.
    let hintPenalty = 0;
    const mapClaim = hintsUsedByChallenge && Number.isInteger(hintsUsedByChallenge[challenge.id])
      ? hintsUsedByChallenge[challenge.id]
      : null;
    const fallbackClaim = Number.isInteger(hintsUsed) ? hintsUsed : 0;
    const claimedHints = Math.max(0, mapClaim !== null ? mapClaim : fallbackClaim);
    if (claimedHints > 0 && challenge.hints) {
      for (let i = 0; i < Math.min(claimedHints, challenge.hints.length); i++) {
        hintPenalty += (challenge.hints[i].cost || 0);
      }
    }
    hintPenalty = Math.min(hintPenalty, challenge.points - 1);

    const netPoints = challenge.points - hintPenalty;
    const db = await getDb();

    let alreadySolved = false;

    if (db.mode === 'neon') {
      // Find player id
      const playerRows = await db.sql`
        SELECT id FROM players WHERE LOWER(handle) = LOWER(${handle})
      `;

      if (playerRows.length === 0) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Player record not found' })
        };
      }

      const playerId = playerRows[0].id;

      const solvedRows = await db.sql`
        SELECT challenge_id FROM solves WHERE player_id = ${playerId}
      `;
      const solvedIds = new Set(solvedRows.map(r => r.challenge_id));
      if (!isActUnlocked(challenge, solvedIds)) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'That challenge is still locked. Solve 80% of the previous act first.'
          })
        };
      }

      const inserted = await db.sql`
        INSERT INTO solves (player_id, challenge_id, points, hint_penalty)
        VALUES (${playerId}, ${challenge.id}, ${challenge.points}, ${hintPenalty})
        ON CONFLICT (player_id, challenge_id) DO NOTHING
        RETURNING challenge_id
      `;
      alreadySolved = inserted.length === 0;
    } else {
      // In-memory store (local netlify dev only)
      const lower = handle.toLowerCase();
      const player = db.store.players.get(lower);
      if (!player) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Player record not found' })
        };
      }

      const solvedIds = new Set(
        [...db.store.solves.values()].filter(s => s.player_id === player.id).map(s => s.challenge_id)
      );
      if (!isActUnlocked(challenge, solvedIds)) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'That challenge is still locked. Solve 80% of the previous act first.'
          })
        };
      }

      const solveKey = `${player.id}:${challenge.id}`;
      if (db.store.solves.has(solveKey)) {
        alreadySolved = true;
      } else {
        db.store.solves.set(solveKey, {
          player_id: player.id,
          challenge_id: challenge.id,
          points: challenge.points,
          hint_penalty: hintPenalty,
          solved_at: new Date()
        });
        db.save?.();
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        success: true,
        alreadySolved,
        pointsAwarded: alreadySolved ? 0 : netPoints,
        basePoints: challenge.points,
        hintPenalty,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        successMessage: challenge.successMessage
      })
    };
  } catch (err) {
    console.error('Flag submission error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error processing flag submission' })
    };
  }
};

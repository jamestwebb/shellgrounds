// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: POST /api/submit-flag

import { verifySessionToken, generateUserFlag } from '../../src/engine/crypto-utils.js';
import { CHALLENGES, ACT_DEFINITIONS } from '../../src/data/challenges.js';
import { runPipeline } from '../../src/engine/pipeline.js';
import { createWarrenFilesystem } from '../../src/engine/fs.warren.js';
import { createTopsideFilesystem } from '../../src/engine/fs.topside.js';
import { injectFlagsIntoVFS } from '../../src/utils/vfs-injector.js';
import { getPlayer, getSolves, addSolve } from './utils/store.js';

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
function replayCommand(challenge, commandText, sessionSecret, handle, clientCwd) {
  const isWindows = challenge.platform === 'windows';
  const baseFs = isWindows ? createTopsideFilesystem() : createWarrenFilesystem();
  const { fs } = injectFlagsIntoVFS(baseFs, handle, buildServerFlags(sessionSecret, handle));
  // Replay from where the student actually stood: a relative path that worked
  // in their shell must also work in the replay. The claimed cwd is harmless —
  // the command still has to execute cleanly against the fixed filesystem.
  const cwd = (typeof clientCwd === 'string' && clientCwd.length > 0 && clientCwd.length < 300)
    ? clientCwd
    : (challenge.setup?.cwd || (isWindows ? 'C:\\Users\\Analyst' : '/home/analyst'));
  const res = runPipeline(commandText.trim(), cwd, fs, isWindows ? 'windows' : 'linux', {
    installedPackages: new Set()
  });
  const ok = !res.hasError && !ERROR_MARKERS.test(res.output || '');
  return { ok, fs: res.fs };
}

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) {
    return json(401, { error: 'Unauthorized: Session expired or invalid' });
  }

  const handle = verified.handle;

  try {
    const { challengeId, flag, hintsUsed = 0, commandText = '', hintsUsedByChallenge, cwd } = (await req.json().catch(() => ({})));

    if (!challengeId && !(flag && flag.trim())) {
      return json(400, { error: 'A challenge ID or a flag is required' });
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
        return json(400, {
            success: false,
            error: 'That flag is not valid for your handle. Check for typos — click the flag in the terminal output to copy it exactly. (Flags are also personal: another student\'s flag will never validate for you.)'
          });
      }
    } else if (!challenge) {
      return json(404, { error: 'Challenge not found' });
    } else if (challenge.success.kind === 'flag') {
      return json(400, { error: 'Flag submission cannot be empty' });
    } else if (challenge.success.kind === 'command') {
      if (challenge.success.matchRegex && commandText && commandText.trim()) {
        const regex = new RegExp(challenge.success.matchRegex, 'i');
        if (regex.test(commandText.trim())) {
          isValid = replayCommand(challenge, commandText, sessionSecret, handle, cwd).ok;
        }
      }
    } else if (challenge.success.kind === 'state') {
      if (commandText && commandText.trim() && typeof challenge.success.check === 'function') {
        const replay = replayCommand(challenge, commandText, sessionSecret, handle, cwd);
        isValid = replay.ok && !!challenge.success.check(replay.fs);
      }
    }

    if (!isValid) {
      return json(400, {
          success: false,
          error: 'Verification failed. Re-run the exact command shown in the challenge brief, then submit again.'
        });
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

    const player = await getPlayer(handle);
    if (!player) {
      return json(404, { error: 'Player record not found — log out and register again.' });
    }

    const existingSolves = await getSolves(handle);
    if (!isActUnlocked(challenge, new Set(Object.keys(existingSolves)))) {
      return json(403, {
          success: false,
          error: 'That challenge is still locked. Solve 80% of the previous act first.'
        });
    }

    const { alreadySolved } = await addSolve(handle, challenge.id, challenge.points, hintPenalty);

    return json(200, {
        success: true,
        alreadySolved,
        pointsAwarded: alreadySolved ? 0 : netPoints,
        basePoints: challenge.points,
        hintPenalty,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        successMessage: challenge.successMessage
      }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Flag submission error:', err);
    return json(500, { error: 'Internal error processing flag submission' });
  }
};

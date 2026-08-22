// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/submit-flag (Server-Side Pack-Aware Verification)

import { verifySessionToken, generateUserFlag } from '../../packages/engine/crypto-utils.js';
import { runPipeline } from '../../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../../packages/engine/validate/predicates.js';
import { ERROR_MARKERS } from '../../packages/engine/constants.js';
import { getPack, DEFAULT_PACK_ID } from '../../packs/index.js';
import { getPlayer, getSolves, addSolve, normalizeSolve } from './utils/store.js';
import { isAdminHandle } from './utils/admin.js';

function isActUnlocked(actId, acts, challenges, solvedIdSet) {
  const act = acts.find(a => a.id === actId);
  if (!act || !act.unlockThreshold) return true;
  const prior = challenges.filter(c => c.act === actId - 1);
  if (prior.length === 0) return true;
  // Honour the author's configured threshold, but never require 100%: a
  // student stuck on a single challenge must still be able to progress.
  // (0.8 x 4 challenges = 3.2 -> ceil 4 = every one, which deadlocked Act V.)
  const byThreshold = Math.ceil(prior.length * (act.unlockThreshold ?? 0.8));
  const required = Math.min(Math.max(1, byThreshold), Math.max(1, prior.length - 1));
  const solved = prior.filter(c => solvedIdSet.has(c.id)).length;
  return solved >= required;
}

function buildServerFlags(sessionSecret, handle, challenges, packId) {
  const flags = {};
  for (const c of challenges) {
    if (c.success?.kind === 'flag' && !c.success.staticFlag) {
      flags[c.id] = generateUserFlag(sessionSecret, handle, c.id, packId);
    }
  }
  return flags;
}

function replayCommand(challenge, commandText, sessionSecret, handle, clientCwd, pack) {
  const isWindows = challenge.platform === 'windows';
  const rawFs = pack.createFs(isWindows ? 'windows' : 'linux');
  const serverFlags = buildServerFlags(sessionSecret, handle, pack.challenges, pack.id);

  // Inject flags into VFS
  const fs = { ...rawFs };
  for (const [key, node] of Object.entries(fs)) {
    if (node.type === 'file' && typeof node.content === 'string') {
      let text = node.content;
      for (const [cId, fVal] of Object.entries(serverFlags)) {
        text = text.replaceAll(`[[FLAG:${cId}]]`, fVal);
      }
      text = text.replaceAll('[[FLAG:USER_HANDLE]]', handle);
      fs[key] = { ...node, content: text };
    }
  }

  const defaultCwd = isWindows
    ? (pack.manifest.windows?.home || 'C:\\Users\\Student')
    : (pack.manifest.linux?.home || '/home/student');

  const cwd = (typeof clientCwd === 'string' && clientCwd.length > 0 && clientCwd.length < 300)
    ? clientCwd
    : (challenge.setup?.cwd || defaultCwd);

  const res = runPipeline(commandText.trim(), cwd, fs, isWindows ? 'windows' : 'linux', {
    packCommands: pack.commands,
    packHelp: pack.help,
    // Must match the browser: the pack declares who the student is, and file
    // permissions are evaluated against it. A hardcoded user makes the server
    // deny commands the client allowed.
    user: (isWindows ? pack.manifest.windows?.user : pack.manifest.linux?.user)
      || (isWindows ? 'Student' : 'student')
  });

  const ok = !res.hasError && (!ERROR_MARKERS.test(res.output || '') || commandText.includes('||'));
  return { ok, fs: res.fs, res };
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
  const packId = verified.packId || DEFAULT_PACK_ID;
  const pack = getPack(packId);

  try {
    const { challengeId, flag, hintsUsed = 0, commandText = '', cwd } = (await req.json().catch(() => ({})));

    if (!challengeId && !(flag && flag.trim())) {
      return json(400, { error: 'A challenge ID or a flag is required' });
    }

    let challenge = pack.challenges.find(c => c.id === challengeId);
    let isValid = false;

    if (flag && flag.trim()) {
      const cleanSubmitted = flag.trim().toUpperCase();
      for (const c of pack.challenges) {
        if (c.success?.kind !== 'flag') continue;
        const expected = c.success.staticFlag
          ? c.success.staticFlag.toUpperCase()
          : generateUserFlag(sessionSecret, handle, c.id, pack.id).toUpperCase();
        if (cleanSubmitted === expected) {
          isValid = true;
          challenge = c;
          break;
        }
      }
    } else if (challenge) {
      if (challenge.success?.kind === 'command' || challenge.success?.predicate === 'commandMatches') {
        if (!commandText || !commandText.trim()) {
          return json(400, { error: 'Command execution proof required for this challenge' });
        }
        const { ok, res } = replayCommand(challenge, commandText, sessionSecret, handle, cwd, pack);
        const predicatePasses = evaluatePredicate(challenge.success, {
          fs: res.fs,
          cwd: res.newCwd || cwd,
          commandText,
          stdout: res.stdout,
          stderr: res.stderr,
          output: res.output,
          status: res.status,
          isWindows: challenge.platform === 'windows',
          trusted: true
        });
        isValid = ok && predicatePasses;
      } else if (challenge.success?.predicate || challenge.success?.kind === 'state') {
        if (!commandText || !commandText.trim()) {
          return json(400, { error: 'Action execution required to reach success state' });
        }
        const { ok, res } = replayCommand(challenge, commandText, sessionSecret, handle, cwd, pack);
        const predicatePasses = evaluatePredicate(challenge.success, {
          fs: res.fs,
          cwd: res.newCwd || cwd,
          commandText,
          stdout: res.stdout,
          stderr: res.stderr,
          output: res.output,
          status: res.status,
          isWindows: challenge.platform === 'windows',
          trusted: true
        });
        isValid = ok && predicatePasses;
      }
    }

    if (!isValid || !challenge) {
      return json(400, {
        error: 'INCORRECT FLAG OR INVALID COMMAND PROOF — verify your output and try again.'
      });
    }

    // Check player progression & unlock
    const existingSolves = await getSolves(handle);
    const solvedSet = new Set(Object.keys(existingSolves));

    // An instructor works the material in whatever order they like: they are
    // building a lesson, not being paced by one. Students keep the gate.
    // Without this the sidebar would let an instructor OPEN a later act and
    // then reject the solve with a 403.
    if (!isAdminHandle(handle)
        && !isActUnlocked(challenge.act, pack.manifest.acts, pack.challenges, solvedSet)) {
      return json(403, {
        error: 'ACT LOCKED — solve previous act challenges first.'
      });
    }

    if (existingSolves[challenge.id]) {
      return json(200, {
        success: true,
        alreadySolved: true,
        message: 'Challenge was already completed.',
        // Legacy records nest the payload, so a raw .points read can hand the
        // browser an object where it expects a number.
        points: normalizeSolve(existingSolves[challenge.id]).netPoints
      });
    }

    // Compute hint penalty
    const hints = challenge.hints || [];
    let penalty = 0;
    for (let i = 0; i < Math.min(hintsUsed, hints.length); i++) {
      penalty += (hints[i].cost || 0);
    }
    const earnedPoints = Math.max(0, (challenge.points || 0) - penalty);

    await addSolve(handle, challenge.id, {
      points: challenge.points || 0,
      hintPenalty: penalty,
      earnedPoints,
      solvedAt: new Date().toISOString()
    });

    return json(200, {
      success: true,
      challengeId: challenge.id,
      points: earnedPoints,
      successMessage: challenge.successMessage || 'Challenge Solved!'
    });
  } catch (err) {
    console.error('Flag submission error:', err);
    return json(500, { error: 'Internal error processing submission' });
  }
};

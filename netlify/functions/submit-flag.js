// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/submit-flag — server-side verification.
//
// The pack is resolved from the SUBMITTED CHALLENGE ID, never from the session
// token. The token's pack was fixed at registration and the browser had no way
// to change it, so a student who switched modules had every correct answer
// rejected — 67 of the 97 challenges could not be scored by anyone.

import { verifySessionToken, generateUserFlag } from '../../packages/engine/crypto-utils.js';
import { runPipeline } from '../../packages/engine/shell/exec.js';
import { evaluatePredicate } from '../../packages/engine/validate/predicates.js';
import { ERROR_MARKERS } from '../../packages/engine/constants.js';
import { stat } from '../../packages/engine/vfs/ops.js';
import { getPack, getPackForChallenge, PACKS, DEFAULT_PACK_ID } from '../../packs/index.js';
import {
  getSolves, addSolve, readSolveEntry, splitSolveKey, normalizeSolve,
  getHintsUsed, hintCountFor, touchPlayer
} from './utils/store.js';
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

// A challenge only declares `platform` when its pack spans both. For a
// single-platform pack the manifest is the answer, and assuming linux built a
// linux filesystem for every Windows challenge.
function platformOf(pack, challenge) {
  const declared = challenge.platform || pack.manifest.platforms?.[0] || 'linux';
  return declared === 'windows';
}

function packHome(pack, isWindows) {
  return isWindows
    ? (pack.manifest.windows?.home || 'C:\\Users\\Student')
    : (pack.manifest.linux?.home || '/home/student');
}

/**
 * The browser tells us which directory the student was standing in. That is a
 * convenience, not evidence: it only decides where the replay starts. It is
 * accepted only when it names a real directory in this pack's filesystem, and
 * a `cwdIs` challenge ignores it entirely (see below).
 */
function startingCwd(pack, challenge, clientCwd, rawFs, isWindows) {
  const fallback = challenge.setup?.cwd || packHome(pack, isWindows);
  // A directory challenge always starts where the author said it starts, so the
  // only way to reach the target is to actually move there.
  if (ignoresClientCwd(challenge.success)) return fallback;
  if (typeof clientCwd !== 'string' || !clientCwd || clientCwd.length > 300) return fallback;
  const st = stat(rawFs, clientCwd, isWindows);
  return st.exists && st.isDir ? clientCwd : fallback;
}

function replayCommand(challenge, commandText, sessionSecret, handle, clientCwd, pack) {
  const isWindows = platformOf(pack, challenge);
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

  const cwd = startingCwd(pack, challenge, clientCwd, fs, isWindows);

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
  return { ok, res, startCwd: cwd, isWindows };
}

/**
 * A `cwdIs` challenge must be proved by a command that actually moves.
 *
 * Accepting the browser's reported directory meant `echo hi` with a
 * hand-written cwd scored the challenge and congratulated the student for a
 * `cd` they never ran. `runPipeline` always reports a newCwd — the current one,
 * moved or not — so the fix is to start the replay at the challenge's declared
 * directory and ignore what the browser claims.
 */
function ignoresClientCwd(success) {
  const type = success?.predicate || success?.kind;
  if (type === 'cwdIs') return true;
  if (type === 'allOf' || type === 'anyOf') {
    return (success.predicates || []).some(ignoresClientCwd);
  }
  return false;
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
    const { challengeId, flag, commandText = '', cwd } = (await req.json().catch(() => ({})));

    if (!challengeId && !(flag && flag.trim())) {
      return json(400, { error: 'A challenge ID or a flag is required' });
    }

    let challenge = null;
    let pack = null;
    let isValid = false;

    if (challengeId) {
      pack = getPackForChallenge(challengeId);
      challenge = pack ? pack.challenges.find(c => c.id === challengeId) : null;
      if (!challenge) {
        return json(404, { error: `Unknown challenge '${challengeId}'` });
      }
    }

    if (flag && flag.trim()) {
      const cleanSubmitted = flag.trim().toUpperCase();
      // A flag names its own challenge. When the client also told us which
      // challenge it is answering, honour that: searching every pack for any
      // matching flag turned one disclosed flag list into a bulk-scoring tool.
      const searchSpace = challenge
        ? [{ pack, challenge }]
        : Object.values(PACKS).flatMap(p => p.challenges.map(c => ({ pack: p, challenge: c })));

      for (const entry of searchSpace) {
        const c = entry.challenge;
        if (c.success?.kind !== 'flag') continue;
        const expected = c.success.staticFlag
          ? c.success.staticFlag.toUpperCase()
          : generateUserFlag(sessionSecret, handle, c.id, entry.pack.id).toUpperCase();
        if (cleanSubmitted === expected) {
          isValid = true;
          challenge = c;
          pack = entry.pack;
          break;
        }
      }
    } else if (challenge) {
      if (!commandText || !commandText.trim()) {
        return json(400, { error: 'Run the command in the terminal — the server checks what it produced.' });
      }

      const { ok, res, startCwd, isWindows } = replayCommand(
        challenge, commandText, sessionSecret, handle, cwd, pack
      );

      const effectiveCwd = res.newCwd || startCwd;

      const predicatePasses = evaluatePredicate(challenge.success, {
        fs: res.fs,
        cwd: effectiveCwd,
        commandText,
        stdout: res.stdout,
        stderr: res.stderr,
        output: res.output,
        status: res.status,
        isWindows,
        user: (isWindows ? pack.manifest.windows?.user : pack.manifest.linux?.user)
          || (isWindows ? 'Student' : 'student'),
        trusted: true
      });

      isValid = ok && predicatePasses;
    }

    if (!isValid || !challenge || !pack) {
      return json(400, {
        error: 'Not quite — check what your command printed, then try again.'
      });
    }

    const existingSolves = await getSolves(handle);

    // Act gating counts solves in THIS pack only.
    const solvedSet = new Set(
      Object.keys(existingSolves)
        .map(k => splitSolveKey(k))
        .filter(k => k.legacy || k.packId === pack.id)
        .map(k => k.challengeId)
    );

    // An instructor works the material in whatever order they like: they are
    // building a lesson, not being paced by one. Students keep the gate.
    if (!isAdminHandle(handle)
        && !isActUnlocked(challenge.act, pack.manifest.acts, pack.challenges, solvedSet)) {
      return json(403, {
        error: 'This act is still locked — finish more of the previous act first.'
      });
    }

    const already = readSolveEntry(existingSolves, pack.id, challenge.id);
    if (already) {
      return json(200, {
        success: true,
        alreadySolved: true,
        packId: pack.id,
        challengeId: challenge.id,
        message: 'You have already solved this one.',
        points: normalizeSolve(already).netPoints
      });
    }

    // The hint penalty comes from the server's own record of which hints were
    // opened. It used to be whatever the browser declared, so an honest student
    // scored 10 where a dishonest one scored 20 for the same command.
    const hints = challenge.hints || [];
    const opened = hintCountFor(await getHintsUsed(handle), pack.id, challenge.id);
    let penalty = 0;
    for (let i = 0; i < Math.min(opened, hints.length); i++) {
      penalty += (hints[i].cost || 0);
    }
    const earnedPoints = Math.max(0, (challenge.points || 0) - penalty);

    const { alreadySolved } = await addSolve(handle, pack.id, challenge.id, {
      points: challenge.points || 0,
      hintPenalty: penalty,
      earnedPoints,
      solvedAt: new Date().toISOString()
    });

    if (alreadySolved) {
      return json(200, {
        success: true, alreadySolved: true, packId: pack.id,
        challengeId: challenge.id, message: 'You have already solved this one.',
        points: earnedPoints
      });
    }

    await touchPlayer(handle);

    return json(200, {
      success: true,
      packId: pack.id,
      challengeId: challenge.id,
      points: earnedPoints,
      hintPenalty: penalty,
      successMessage: challenge.successMessage || 'Solved.'
    });
  } catch (err) {
    console.error('Flag submission error:', err);
    return json(500, { error: 'Internal error processing submission' });
  }
};

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/register-handle

import { checkSFW } from '../../packages/engine/sfw-filter.js';
import { createSessionToken } from '../../packages/engine/crypto-utils.js';
import { DEFAULT_PACK_ID, PACKS } from '../../packs/index.js';
import { createPlayer } from './utils/store.js';

const json = (status, obj, extraHeaders = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const { handle, classPassword, packId = DEFAULT_PACK_ID } = (await req.json().catch(() => ({})));

    if (!handle) {
      return json(400, { error: 'Handle is required' });
    }

    // Check class/cohort password. No fallback: fail closed if unconfigured.
    const expectedPassword = process.env.CLASS_PASSWORD || process.env.COHORT_PASSWORD;
    const sessionSecret = process.env.SESSION_SECRET;
    if (!expectedPassword || !sessionSecret) {
      console.error('Missing CLASS_PASSWORD or SESSION_SECRET environment variable');
      return json(500, { error: 'Server is not configured. Contact the instructor.' });
    }
    if (!classPassword || classPassword.trim() !== expectedPassword.trim()) {
      return json(403, {
        error: 'ACCESS DENIED — the door only opens from the inside. Get the cohort password in class.'
      });
    }

    // SFW & format validation
    const sfw = checkSFW(handle);
    if (!sfw.safe) {
      return json(400, { error: sfw.reason });
    }

    const cleanHandle = sfw.handle;
    const activePackId = PACKS[packId] ? packId : DEFAULT_PACK_ID;

    const { created } = await createPlayer(cleanHandle);
    if (!created) {
      return json(409, {
        error: `Handle '@${cleanHandle}' is already claimed. If it is yours, open The Gauntlet in the browser you registered with — sessions resume automatically.`
      });
    }

    const token = createSessionToken(sessionSecret, cleanHandle, activePackId);

    return json(200, {
      success: true,
      handle: cleanHandle,
      packId: activePackId,
      token,
      message: 'Welcome to The Gauntlet. Access granted.'
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Registration error:', err);
    return json(500, { error: 'Internal server error during authentication' });
  }
};

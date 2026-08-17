// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: POST /api/register-handle

import { checkSFW } from '../../src/engine/sfw-filter.js';
import { createSessionToken } from '../../src/engine/crypto-utils.js';
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
    const { handle, classPassword } = (await req.json().catch(() => ({})));

    if (!handle) {
      return json(400, { error: 'Handle is required' });
    }

    // Check class password (announced in lecture). No fallback: fail closed if unconfigured.
    const expectedPassword = process.env.CLASS_PASSWORD;
    const sessionSecret = process.env.SESSION_SECRET;
    if (!expectedPassword || !sessionSecret) {
      console.error('Missing CLASS_PASSWORD or SESSION_SECRET environment variable');
      return json(500, { error: 'Server is not configured. Contact the instructor.' });
    }
    if (!classPassword || classPassword.trim() !== expectedPassword.trim()) {
      return json(403, {
          error: 'ACCESS DENIED — the door only opens from the inside. Get the password in class.'
        });
    }

    // SFW & format validation
    const sfw = checkSFW(handle);
    if (!sfw.safe) {
      return json(400, { error: sfw.reason });
    }

    const cleanHandle = sfw.handle;

    // A handle can only be claimed once. Returning players resume via the token stored
    // in their original browser; re-registering an existing handle would let anyone with
    // the shared class password take over another student's account.
    const { created } = await createPlayer(cleanHandle);
    if (!created) {
      return json(409, {
          error: `Handle '@${cleanHandle}' is already claimed. If it is yours, open The Gauntlet in the browser you registered with — sessions resume automatically. If you lost access, ask your instructor to reset the handle.`
        });
    }

    const token = createSessionToken(sessionSecret, cleanHandle);

    return json(200, {
        success: true,
        handle: cleanHandle,
        token,
        message: 'Welcome to The Gauntlet, Analyst. Access granted.'
      }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Registration error:', err);
    return json(500, { error: 'Internal server error during authentication' });
  }
};

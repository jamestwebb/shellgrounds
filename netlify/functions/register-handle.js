// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: POST /api/register-handle

import { checkSFW } from '../../src/engine/sfw-filter.js';
import { createSessionToken } from '../../src/engine/crypto-utils.js';
import { initBlobs, createPlayer } from './utils/store.js';

export const handler = async (event) => {
  initBlobs(event);
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { handle, classPassword } = JSON.parse(event.body || '{}');

    if (!handle) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Handle is required' })
      };
    }

    // Check class password (announced in lecture). No fallback: fail closed if unconfigured.
    const expectedPassword = process.env.CLASS_PASSWORD;
    const sessionSecret = process.env.SESSION_SECRET;
    if (!expectedPassword || !sessionSecret) {
      console.error('Missing CLASS_PASSWORD or SESSION_SECRET environment variable');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Server is not configured. Contact the instructor.' })
      };
    }
    if (!classPassword || classPassword.trim() !== expectedPassword.trim()) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'ACCESS DENIED — the door only opens from the inside. Get the password in class.'
        })
      };
    }

    // SFW & format validation
    const sfw = checkSFW(handle);
    if (!sfw.safe) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: sfw.reason })
      };
    }

    const cleanHandle = sfw.handle;

    // A handle can only be claimed once. Returning players resume via the token stored
    // in their original browser; re-registering an existing handle would let anyone with
    // the shared class password take over another student's account.
    const { created } = await createPlayer(cleanHandle);
    if (!created) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Handle '@${cleanHandle}' is already claimed. If it is yours, open The Gauntlet in the browser you registered with — sessions resume automatically. If you lost access, ask your instructor to reset the handle.`
        })
      };
    }

    const token = createSessionToken(sessionSecret, cleanHandle);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        success: true,
        handle: cleanHandle,
        token,
        message: 'Welcome to The Gauntlet, Analyst. Access granted.'
      })
    };
  } catch (err) {
    console.error('Registration error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error during authentication' })
    };
  }
};

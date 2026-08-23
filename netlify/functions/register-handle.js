// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/register-handle

import { checkSFW } from '../../packages/engine/sfw-filter.js';
import { createSessionToken } from '../../packages/engine/crypto-utils.js';
import { isPackEnabled, defaultPackId } from './utils/enabled.js';
import { createPlayer } from './utils/store.js';
import { isAdminHandle, setupCodeMatches, grantInstructor } from './utils/admin.js';

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
    const { handle, classPassword, setupCode, packId = null } =
      (await req.json().catch(() => ({})));

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
        error: 'That class password is not right. Ask your instructor for it.'
      });
    }

    // SFW & format validation
    const sfw = checkSFW(handle);
    if (!sfw.safe) {
      return json(400, { error: sfw.reason });
    }

    const cleanHandle = sfw.handle;

    // Anyone may offer the setup code, and offering a correct one is what makes
    // an account an instructor. Being named in ADMIN_HANDLES is checked at
    // request time and is never sufficient on its own.
    //
    // Checking only the env list left a window: with ADMIN_HANDLES unset — which
    // .env.example documents as supported — a student could register the handle
    // the teacher intended to use, be asked for nothing, and become an
    // instructor the instant the teacher configured the variable. Demonstrated
    // end to end, not theorised.
    const offeredSetup = setupCode !== undefined && String(setupCode).trim() !== '';
    const setupOk = offeredSetup && setupCodeMatches(setupCode);
    if (offeredSetup && !setupOk) {
      return json(403, { error: 'That instructor setup code did not match.' });
    }
    if (isAdminHandle(cleanHandle) && !setupOk) {
      return json(403, {
        error: process.env.INSTRUCTOR_SETUP_CODE
          ? 'This handle is reserved for an instructor. Enter the setup code to claim it.'
          : 'This handle is reserved for an instructor. The site owner must set '
            + 'INSTRUCTOR_SETUP_CODE in the site settings before it can be claimed.'
      });
    }

    const activePackId = (await isPackEnabled(packId)) ? packId : await defaultPackId();

    const { created } = await createPlayer(cleanHandle);
    if (!created) {
      return json(409, {
        error: `The handle '@${cleanHandle}' is taken. If it is yours, open the site in the `
          + 'browser you registered with — your session resumes on its own.'
      });
    }

    // Record the proof on the account, so a later config change can neither
    // grant nor be needed to grant instructor rights.
    if (setupOk) await grantInstructor(cleanHandle);

    const token = createSessionToken(sessionSecret, cleanHandle, activePackId);

    return json(200, {
      success: true,
      handle: cleanHandle,
      packId: activePackId,
      isAdmin: setupOk && isAdminHandle(cleanHandle),
      token,
      message: 'You are in. Good luck.'
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Registration error:', err);
    return json(500, { error: 'Internal server error during authentication' });
  }
};

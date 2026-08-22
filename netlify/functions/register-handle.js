// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/register-handle

import { checkSFW } from '../../packages/engine/sfw-filter.js';
import { createSessionToken } from '../../packages/engine/crypto-utils.js';
import { DEFAULT_PACK_ID, PACKS } from '../../packs/index.js';
import { createPlayer } from './utils/store.js';
import { isAdminHandle } from './utils/admin.js';

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
    const { handle, classPassword, setupCode, packId = DEFAULT_PACK_ID } =
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

    // An instructor handle needs the setup code as well as the class password.
    //
    // Every student holds the class password, and registration is first-come,
    // so without this any student could claim the handle named in
    // ADMIN_HANDLES before the teacher did and walk off with the whole
    // gradebook. Demonstrated, not theorised. The name filter does not help:
    // it blocks the literal word "admin", not the handle actually configured.
    if (isAdminHandle(cleanHandle)) {
      const expectedSetup = process.env.INSTRUCTOR_SETUP_CODE;
      if (!expectedSetup) {
        console.error('An instructor handle was claimed but INSTRUCTOR_SETUP_CODE is not set');
        return json(403, {
          error: 'This handle is reserved for an instructor. The site owner must set '
            + 'INSTRUCTOR_SETUP_CODE in the site settings before it can be claimed.'
        });
      }
      if (!setupCode || String(setupCode).trim() !== expectedSetup.trim()) {
        return json(403, {
          error: 'This handle is reserved for an instructor, and the setup code did not match.'
        });
      }
    }

    const activePackId = PACKS[packId] ? packId : DEFAULT_PACK_ID;

    const { created } = await createPlayer(cleanHandle);
    if (!created) {
      return json(409, {
        error: `The handle '@${cleanHandle}' is taken. If it is yours, open the site in the `
          + 'browser you registered with — your session resumes on its own.'
      });
    }

    const token = createSessionToken(sessionSecret, cleanHandle, activePackId);

    return json(200, {
      success: true,
      handle: cleanHandle,
      packId: activePackId,
      isAdmin: isAdminHandle(cleanHandle),
      token,
      message: 'You are in. Good luck.'
    }, { 'Cache-Control': 'no-store' });
  } catch (err) {
    console.error('Registration error:', err);
    return json(500, { error: 'Internal server error during authentication' });
  }
};

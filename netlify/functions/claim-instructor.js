// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: POST /api/claim-instructor
//
// The recovery path for a teacher who registered before setting up their
// instructor account. Registration records the proof when the setup code is
// supplied there; this does the same for an account that already exists.
//
// It cannot be used to escalate: the handle must ALSO be named in
// ADMIN_HANDLES, which only whoever controls the site's settings can change.

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { isAdminHandle, setupCodeMatches, grantInstructor, resolveIsInstructor }
  from './utils/admin.js';

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) return json(401, { error: 'Unauthorized: Session expired or invalid' });

  try {
    const { setupCode } = (await req.json().catch(() => ({})));
    const handle = verified.handle;

    if (!process.env.INSTRUCTOR_SETUP_CODE) {
      return json(403, {
        error: 'No setup code is configured for this site. Set INSTRUCTOR_SETUP_CODE in the site settings first.'
      });
    }
    if (!isAdminHandle(handle)) {
      // Deliberately the same message as a wrong code: whether a given handle
      // is on the instructor list is not something to confirm to a guesser.
      return json(403, { error: 'That did not work. Check the handle and the setup code.' });
    }
    if (!setupCodeMatches(setupCode)) {
      return json(403, { error: 'That did not work. Check the handle and the setup code.' });
    }

    await grantInstructor(handle);
    return json(200, {
      success: true,
      handle,
      isAdmin: await resolveIsInstructor(handle),
      message: 'You are set up as the instructor for this site.'
    });
  } catch (err) {
    console.error('Instructor claim error:', err);
    return json(500, { error: 'Internal error claiming instructor access' });
  }
};

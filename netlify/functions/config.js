// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET/POST /api/config — which packs this site offers.
//
// GET is open to any signed-in account. A student's browser needs the list to
// draw the pack switcher, and the list is not a secret: it is the names of the
// courses they are about to be shown.
//
// POST is instructors only, and instructor means what it means everywhere else
// here: named in ADMIN_HANDLES *and* proved the setup code. Being on the list
// alone is not enough, because a student can reach a handle before the teacher
// does. See utils/admin.js.
//
// Saving does not touch ENABLED_PACKS. A site cannot rewrite its own build
// configuration, and a dashboard that disagreed with the running site would be
// worse than one that is plainly the seed value.

import { verifySessionToken } from '../../packages/engine/crypto-utils.js';
import { resolveIsInstructor } from './utils/admin.js';
import { updateSettings } from './utils/store.js';
import { readEnabledPacks, validateEnabledPacks, packCatalogue } from './utils/enabled.js';

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export default async (req) => {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return json(500, { error: 'Server is not configured. Contact the instructor.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) return json(401, { error: 'Unauthorized: Session expired or invalid' });

  try {
    if (req.method === 'GET') {
      const { enabledPacks, configured, source } = await readEnabledPacks();
      return json(200, {
        success: true,
        enabledPacks,
        // False until an instructor saves. The instructor view uses this to
        // open on the pack screen at first login rather than the class view.
        configured,
        source,
        packs: packCatalogue()
      });
    }

    if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

    if (!(await resolveIsInstructor(verified.handle))) {
      return json(403, { error: 'Only an instructor can change which packs this site offers.' });
    }

    const body = await req.json().catch(() => ({}));
    const checked = validateEnabledPacks(body?.enabledPacks);
    if (!checked.ok) return json(400, { error: checked.error });

    const saved = await updateSettings({ enabledPacks: checked.ids }, verified.handle);

    return json(200, {
      success: true,
      enabledPacks: saved.enabledPacks,
      configured: true,
      source: 'settings',
      updatedAt: saved.updatedAt,
      updatedBy: saved.updatedBy,
      packs: packCatalogue()
    });
  } catch (err) {
    console.error('Config error:', err);
    return json(500, { error: 'Could not read or save the settings. Try again in a moment.' });
  }
};

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Netlify Function: GET /api/manifest (Serves Pack Manifests & Flag Hashes)

import { verifySessionToken, generateUserFlag } from '../../packages/engine/crypto-utils.js';
import { getPack, DEFAULT_PACK_ID } from '../../packs/index.js';

export const handler = async (event) => {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error('Missing SESSION_SECRET environment variable');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server is not configured. Contact the instructor.' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const verified = verifySessionToken(sessionSecret, token);
  if (!verified) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized: Valid session token required' })
    };
  }

  const handle = verified.handle;
  const packId = verified.packId || event.queryStringParameters?.packId || DEFAULT_PACK_ID;
  const pack = getPack(packId);

  const flags = {};
  for (const c of pack.challenges) {
    if (c.success?.kind === 'flag') {
      if (c.success.staticFlag) {
        flags[c.id] = c.success.staticFlag;
      } else {
        flags[c.id] = generateUserFlag(sessionSecret, handle, c.id, pack.id);
      }
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-cache'
    },
    body: JSON.stringify({
      success: true,
      handle,
      packId: pack.id,
      flags
    })
  };
};

// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Netlify Function: GET /api/manifest

import { verifySessionToken, generateUserFlag } from '../../src/engine/crypto-utils.js';
import { CHALLENGES } from '../../src/data/challenges.js';

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
  const flags = {};

  for (const c of CHALLENGES) {
    if (c.success?.kind === 'flag') {
      if (c.success.staticFlag) {
        flags[c.id] = c.success.staticFlag;
      } else {
        flags[c.id] = generateUserFlag(sessionSecret, handle, c.id);
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
      flags
    })
  };
};

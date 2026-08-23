// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Test harness for the Netlify functions.
//
// The 96 tests that existed before this file all sat at the engine and content
// layer; not one imported netlify/functions/. That is exactly why a bug which
// made 67 of the 97 challenges impossible to score stayed green in CI. These
// helpers drive the REAL handlers over real Request/Response objects, against
// the same on-disk blob backend that local development uses, pointed at a
// throwaway file so a test run can never touch real class data.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SECRET = 'test-session-secret-do-not-use-in-production';
export const CLASS_PASSWORD = 'open-sesame';
export const SETUP_CODE = 'teacher-setup-code';

let storeFile = null;

/** Point the store at a fresh empty file and set the env every handler reads. */
export function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shellgrounds-test-'));
  storeFile = path.join(dir, 'blobs.json');
  fs.writeFileSync(storeFile, '{}');

  process.env.NETLIFY_DEV = 'true';
  process.env.SHELLGROUNDS_BLOBS_FILE = storeFile;
  process.env.SESSION_SECRET = SECRET;
  process.env.CLASS_PASSWORD = CLASS_PASSWORD;
  process.env.INSTRUCTOR_SETUP_CODE = SETUP_CODE;
  process.env.ADMIN_HANDLES = 'profsmith';
  return storeFile;
}

export const storePath = () => storeFile;
export const readStore = () => JSON.parse(fs.readFileSync(storeFile, 'utf8'));
export const writeStoreRaw = (text) => fs.writeFileSync(storeFile, text);

const BASE = 'https://example.test';

export function get(url, token) {
  return new Request(`${BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

export function post(url, body, token) {
  return new Request(`${BASE}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body ?? {})
  });
}

/** Calls a handler and returns { status, body } with the body already parsed. */
export async function call(handler, request) {
  const res = await handler(request, {});
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

/** Registers a player and returns their token. */
export async function register(handler, handle, extra = {}) {
  const { status, body } = await call(
    handler, post('/api/register-handle', { handle, classPassword: CLASS_PASSWORD, ...extra })
  );
  return { status, body, token: body?.token };
}

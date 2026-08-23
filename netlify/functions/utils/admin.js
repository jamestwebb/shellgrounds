// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Who counts as an instructor.
//
// Being named in ADMIN_HANDLES is NOT sufficient on its own. A handle is an
// instructor only if the account ALSO proved it held INSTRUCTOR_SETUP_CODE when
// it was created or claimed.
//
// Why both: the env list is read at request time, but registration happens
// once. With ADMIN_HANDLES unset — which .env.example documents as supported —
// a student could register the handle the teacher was going to use, be asked
// for nothing, and silently become an instructor the moment the teacher
// configured the variable. The first version of this guard checked the env list
// alone and had exactly that window.

import { getPlayer, setInstructorFlag } from './store.js';

export function adminHandles() {
  return (process.env.ADMIN_HANDLES || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Named in ADMIN_HANDLES. Necessary, never sufficient. */
export function isAdminHandle(handle) {
  return !!handle && adminHandles().includes(String(handle).toLowerCase());
}

/** Constant-time compare, so a wrong code leaks nothing through timing. */
export function setupCodeMatches(supplied) {
  const expected = process.env.INSTRUCTOR_SETUP_CODE;
  if (!expected) return false;
  const a = String(supplied ?? '').trim();
  const b = String(expected).trim();
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The real check. Both halves must hold:
 *   1. the handle is named in ADMIN_HANDLES right now, and
 *   2. this account proved it held the setup code.
 *
 * Removing a handle from ADMIN_HANDLES therefore revokes access immediately,
 * and an account that never proved the code can never gain it by a later
 * config change.
 */
export async function resolveIsInstructor(handle) {
  if (!isAdminHandle(handle)) return false;
  const player = await getPlayer(handle);
  return !!player?.instructor;
}

/** Marks an account as having proved the setup code. */
export async function grantInstructor(handle) {
  return setInstructorFlag(handle, true);
}

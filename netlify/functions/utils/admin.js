// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Who counts as an instructor. One list, read by every function that needs it,
// so session.js and submit-flag.js can never disagree about who is an admin.

export function adminHandles() {
  return (process.env.ADMIN_HANDLES || '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminHandle(handle) {
  return !!handle && adminHandles().includes(String(handle).toLowerCase());
}

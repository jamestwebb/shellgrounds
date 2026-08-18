// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Machine Solvability Test Suite: Proves 100% solvability of all curriculum packs

import { describe, it, expect } from 'vitest';
import { PACKS } from '../packs/index.js';
import { validatePack } from '../packages/engine/validate/packValidator.js';

describe('Curriculum Solvability Suite (Uplift §7.1)', () => {
  for (const [packId, packObj] of Object.entries(PACKS)) {
    it(`Content Pack '${packId}' must pass all 7 machine validation checks with 0 errors`, async () => {
      const report = await validatePack(packObj, { verbose: false });

      if (!report.valid) {
        console.error(`Pack ${packId} failed with errors:`, report.errors);
      }

      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.checks.solvability.solved).toBe(report.checks.solvability.total);
      expect(report.checks.flagPlaceholders.pass).toBe(true);
      expect(report.checks.vfsPaths.pass).toBe(true);
    });
  }
});

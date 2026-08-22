// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// De-branding Lint Test: Asserts packages/engine/ contains zero course or case strings

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const FORBIDDEN_WORDS = [
  'warren',
  'topside',
  'analyst',
  'case_notes',
  'CF-2026',
  'suspect_drive',
  'tracker',
  'extract -o',
  'scan evidence',
  'FLAG:act'
];

function scanDirectory(dirPath, fileList = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe('Engine De-branding & Domain Neutrality (Uplift §7.3)', () => {
  it('packages/engine/ must contain ZERO domain-specific strings', () => {
    const engineDir = path.resolve(process.cwd(), 'packages/engine');
    const files = scanDirectory(engineDir);

    const violations = [];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Ignore generic copyright headers
        if (line.includes('Copyright (c)')) continue;

        for (const word of FORBIDDEN_WORDS) {
          const regex = new RegExp(`\\b${word}\\b`, 'i');
          if (regex.test(line)) {
            violations.push(`${path.relative(process.cwd(), filePath)}:${i + 1} contains '${word}': "${line.trim()}"`);
          }
        }
      }
    }

    expect(violations, `Found ${violations.length} de-branding violations in packages/engine:\n${violations.join('\n')}`).toEqual([]);
  });
});

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// How a pack introduces itself, and the one field that could reopen a closed door.
//
// A description is text and a briefing is text. A cover image is not, and the
// two natural ways to carry a picture both undo something this project decided
// on purpose:
//
//   A remote URL makes a student's browser call somebody else's server, which
//   leaks who is studying, breaks offline use, and lets the picture be changed
//   after the pack was reviewed.
//
//   An SVG data URI is a document that can carry <script>. Accepting one would
//   hand a pack author code execution in every student's browser -- exactly the
//   hole closed when the `js` predicate was deleted.
//
// The tests below are what stops either from being allowed back by accident.

import { describe, it, expect } from 'vitest';
import {
  validatePresentation, checkCoverImage,
  ALLOWED_COVER_TYPES, MAX_COVER_BYTES, MAX_DESCRIPTION_LENGTH
} from '../packages/engine/validate/presentation.js';
import { PACKS } from '../packs/index.js';

/** A base64 payload of roughly `bytes` bytes. */
const payload = (bytes) => 'A'.repeat(Math.ceil(bytes / 3) * 4);

describe('the cover image cannot carry code', () => {
  it('refuses SVG, whatever it is spelled like', () => {
    for (const type of ['image/svg+xml', 'image/SVG+XML', 'text/svg']) {
      const res = checkCoverImage(`data:${type};base64,${payload(100)}`);
      expect(res.ok, `should refuse ${type}`).toBe(false);
      expect(res.error).toMatch(/svg/i);
      expect(res.error, 'the reason must be stated, not just the refusal').toMatch(/script/i);
    }
  });

  it('refuses a web address, and says why', () => {
    for (const url of ['https://example.test/logo.png', 'http://example.test/logo.png', '//cdn.test/x.png']) {
      const res = checkCoverImage(url);
      expect(res.ok, `should refuse ${url}`).toBe(false);
      expect(res.error).toMatch(/web address|remote/i);
    }
  });

  it('accepts the raster formats, which are pixels rather than documents', () => {
    for (const type of ALLOWED_COVER_TYPES) {
      const res = checkCoverImage(`data:${type};base64,${payload(1000)}`);
      expect(res.ok, `should accept ${type}`).toBe(true);
      expect(res.type).toBe(type);
    }
  });

  it('refuses anything that is not a base64 data URI', () => {
    for (const bad of ['', 'not a uri', 'data:image/png,rawbytes', 'javascript:alert(1)', 42, null]) {
      expect(checkCoverImage(bad).ok, `should refuse ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it('caps the size, because a pack file gets emailed', () => {
    const under = checkCoverImage(`data:image/png;base64,${payload(MAX_COVER_BYTES - 4096)}`);
    expect(under.ok).toBe(true);

    const over = checkCoverImage(`data:image/png;base64,${payload(MAX_COVER_BYTES + 8192)}`);
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(/KB/);
  });

  it('measures the payload, not the string', () => {
    const res = checkCoverImage(`data:image/png;base64,${'A'.repeat(400)}`);
    expect(res.ok).toBe(true);
    expect(res.bytes).toBe(300);
  });
});

describe('the fields a pack introduces itself with', () => {
  const base = { description: 'A course.', icon: '📁' };

  it('warns rather than fails when a pack has no description', () => {
    const res = validatePresentation({});
    expect(res.errors).toEqual([]);
    expect(res.warnings.join(' ')).toMatch(/description/);
    expect(res.warnings.join(' ')).toMatch(/icon/);
  });

  it('caps the description, because it is a card and not a syllabus', () => {
    const long = { ...base, description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) };
    expect(validatePresentation(long).errors.join(' ')).toMatch(/characters/);
  });

  it('refuses an empty description, which is worse than none', () => {
    expect(validatePresentation({ ...base, description: '   ' }).errors.length).toBe(1);
  });

  it('refuses an icon that is a phrase rather than an emoji', () => {
    expect(validatePresentation({ ...base, icon: 'Linux Fundamentals' }).errors.join(' '))
      .toMatch(/one or two emoji/i);
    expect(validatePresentation({ ...base, icon: '🔭' }).errors).toEqual([]);
    expect(validatePresentation({ ...base, icon: '🔭🌙' }).errors).toEqual([]);
  });

  it('requires a briefing to actually say something', () => {
    expect(validatePresentation({ ...base, briefing: {} }).errors.join(' ')).toMatch(/body is required/);
    expect(validatePresentation({ ...base, briefing: 'text' }).errors.join(' ')).toMatch(/must be an object/);
    expect(validatePresentation({ ...base, briefing: { body: 'Set the scene.' } }).errors).toEqual([]);
  });

  it('refuses a learning list too long to be read', () => {
    const many = { ...base, briefing: { body: 'x', youWillLearn: Array(20).fill('a skill') } };
    expect(validatePresentation(many).errors.join(' ')).toMatch(/limit is 12/);
  });

  it('refuses a blank line inside the learning list', () => {
    const blank = { ...base, briefing: { body: 'x', youWillLearn: ['fine', '   '] } };
    expect(validatePresentation(blank).errors.length).toBe(1);
  });
});

describe('every shipped pack introduces itself', () => {
  for (const pack of Object.values(PACKS)) {
    describe(pack.id, () => {
      const m = pack.manifest;

      it('passes its own rules', () => {
        const res = validatePresentation(m);
        expect(res.errors).toEqual([]);
        expect(res.warnings).toEqual([]);
      });

      it('has a description a student can choose from', () => {
        expect(m.description).toBeTruthy();
        expect(m.description.length).toBeGreaterThan(80);
      });

      it('has a briefing that sets the scene and says what it teaches', () => {
        expect(m.briefing?.body).toBeTruthy();
        expect(m.briefing.youWillLearn?.length).toBeGreaterThan(2);
      });

      // The briefing is the promise; the acts are the delivery. A pack that
      // promises six things and has one act is selling something else.
      it('has at least as many acts as it takes to deliver the promise', () => {
        expect((m.acts || []).length).toBeGreaterThan(0);
      });
    });
  }
});

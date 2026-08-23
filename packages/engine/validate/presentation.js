// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// How a pack introduces itself: the card a student picks from, and the briefing
// they read before their first command.
//
// ── Why an image is the hard field here ─────────────────────────────────────
//
// Everything else in a pack is text. A picture is not, and the two obvious
// ways to carry one both reopen a door this project deliberately closed.
//
//   A remote URL (https://…/logo.png) means a student's browser makes a
//   request to somebody else's server. It leaks who is studying and from
//   where, it breaks a site used offline or behind a school proxy, and the
//   picture can be swapped for something else after a teacher approved the
//   pack. A reviewed pack must stay the pack that was reviewed.
//
//   An SVG data URI is worse. SVG is a document format: it can carry <script>
//   and event handlers, so accepting one would hand a pack author the ability
//   to run code in every student's browser — precisely the hole removed when
//   the `js` predicate was deleted. There is no safe way to accept SVG here
//   short of writing a sanitiser, and a sanitiser is a thing that gets bypassed.
//
// So: an emoji always works and costs nothing, and a pack that wants a real
// picture may embed a raster one as a data URI, capped in size and restricted
// to formats that are pixels rather than documents. No remote fetch, no script,
// and what was reviewed is what ships.

/** Formats that are pixel data. Deliberately excludes SVG — see above. */
export const ALLOWED_COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** A pack file is emailed between teachers; a cover must not dominate it. */
export const MAX_COVER_BYTES = 128 * 1024;

export const MAX_DESCRIPTION_LENGTH = 600;
export const MAX_BRIEFING_BODY_LENGTH = 1500;
export const MAX_LEARNING_POINTS = 12;

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Checks a data: URI carrying a cover image.
 * @returns {{ ok: true, type: string, bytes: number } | { ok: false, error: string }}
 */
export function checkCoverImage(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, error: 'manifest.cover must be a data: URI holding an image.' };
  }

  if (/^\s*https?:/i.test(value) || /^\s*\/\//.test(value)) {
    return {
      ok: false,
      error: 'manifest.cover must not be a web address. A remote image tells someone else\'s '
        + 'server which students are studying, stops working offline, and can be changed after '
        + 'the pack was reviewed. Embed the image as a data: URI instead.'
    };
  }

  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) {
    return {
      ok: false,
      error: 'manifest.cover must look like "data:image/png;base64,…". Only base64 data URIs are read.'
    };
  }

  const type = match[1].toLowerCase();
  if (type === 'image/svg+xml' || type.includes('svg')) {
    return {
      ok: false,
      error: 'manifest.cover cannot be an SVG. SVG is a document that can carry scripts, and a '
        + 'pack must never be able to run code in a student\'s browser. Export it as a PNG.'
    };
  }
  if (!ALLOWED_COVER_TYPES.includes(type)) {
    return {
      ok: false,
      error: `manifest.cover is '${type}'. Use one of: ${ALLOWED_COVER_TYPES.join(', ')}.`
    };
  }

  // 4 base64 characters carry 3 bytes; padding removes one or two.
  const b64 = match[2].replace(/\s+/g, '');
  const padding = (b64.match(/=+$/) || [''])[0].length;
  const bytes = Math.floor((b64.length * 3) / 4) - padding;

  if (bytes > MAX_COVER_BYTES) {
    return {
      ok: false,
      error: `manifest.cover is ${Math.round(bytes / 1024)} KB. The limit is `
        + `${MAX_COVER_BYTES / 1024} KB, because a pack file is something teachers email each other.`
    };
  }

  return { ok: true, type, bytes };
}

/**
 * Checks the fields a pack uses to introduce itself.
 * All of them are optional; a pack without them still works, and still says so.
 *
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validatePresentation(manifest = {}) {
  const errors = [];
  const warnings = [];

  if (manifest.description === undefined) {
    warnings.push(
      'manifest.description is missing. It is the paragraph a student reads when choosing '
      + 'between packs, so without it your course is a name and nothing else.'
    );
  } else if (!isNonEmptyString(manifest.description)) {
    errors.push('manifest.description must be a non-empty string.');
  } else if (manifest.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `manifest.description is ${manifest.description.length} characters; the limit is `
      + `${MAX_DESCRIPTION_LENGTH}. It is a card, not a syllabus — put the detail in the briefing.`
    );
  }

  if (manifest.icon !== undefined) {
    if (typeof manifest.icon !== 'string' || manifest.icon.trim().length === 0) {
      errors.push('manifest.icon must be a short string, normally one emoji.');
    } else if ([...manifest.icon.trim()].length > 4) {
      errors.push('manifest.icon should be one or two emoji, not a phrase.');
    }
  } else {
    warnings.push('manifest.icon is missing. One emoji makes the pack recognisable in a list.');
  }

  // Two image fields, one set of rules. `cover` is the small card in a list;
  // `reveal` is the picture a class uncovers together. Neither may be an SVG
  // and neither may be a web address -- see checkCoverImage for why.
  for (const field of ['cover', 'reveal']) {
    if (manifest[field] === undefined) continue;
    const checked = checkCoverImage(manifest[field]);
    if (!checked.ok) errors.push(checked.error.replace('manifest.cover', `manifest.${field}`));
  }

  if (manifest.briefing !== undefined) {
    const b = manifest.briefing;
    if (typeof b !== 'object' || b === null || Array.isArray(b)) {
      errors.push('manifest.briefing must be an object with "body", and optionally "heading" and "youWillLearn".');
    } else {
      if (!isNonEmptyString(b.body)) {
        errors.push('manifest.briefing.body is required: it is what a student reads before their first command.');
      } else if (b.body.length > MAX_BRIEFING_BODY_LENGTH) {
        errors.push(
          `manifest.briefing.body is ${b.body.length} characters; the limit is `
          + `${MAX_BRIEFING_BODY_LENGTH}. A student who has to scroll before starting will not read it.`
        );
      }

      if (b.heading !== undefined && !isNonEmptyString(b.heading)) {
        errors.push('manifest.briefing.heading must be a non-empty string when present.');
      }

      if (b.youWillLearn !== undefined) {
        if (!Array.isArray(b.youWillLearn)) {
          errors.push('manifest.briefing.youWillLearn must be an array of short lines.');
        } else {
          if (b.youWillLearn.length > MAX_LEARNING_POINTS) {
            errors.push(
              `manifest.briefing.youWillLearn has ${b.youWillLearn.length} entries; the limit is `
              + `${MAX_LEARNING_POINTS}. A list nobody finishes reading teaches nothing.`
            );
          }
          for (const line of b.youWillLearn) {
            if (!isNonEmptyString(line)) {
              errors.push('Every entry in manifest.briefing.youWillLearn must be a non-empty string.');
              break;
            }
          }
        }
      }
    }
  }

  return { errors, warnings };
}

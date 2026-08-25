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
//
// ── Three pictures, three jobs ──────────────────────────────────────────────
//
// A pack may carry three images, and they are not interchangeable. Each one is
// shown at a different moment and cropped to a different shape, so a pack that
// puts the same picture in all three wastes two of them.
//
//   cover   a 56-pixel square beside the pack's name in a list of courses.
//           Anything with detail in it is mud at that size; `icon`, an emoji,
//           is usually the better answer and costs nothing.
//
//   scene   a wide banner across the top of the briefing, read once, before
//           the student's first command. This is the establishing shot: the
//           place the story opens, drawn so the briefing has somewhere to be.
//
//   reveal  the picture the whole class uncovers, one square per find. This is
//           the place the story ENDS, and `revealCaption` says what it was.
//
// The pairing of the last two is worth using on purpose. Shipped packs draw
// `scene` and `reveal` as the same place before and after: the same bench with
// the case unopened and then the recovered drawings on it, the same hills at
// 21:40 and then at sunrise, the same desk after hours and then in daylight
// with the form filled in. A class that spends a term turning over squares
// arrives back where it started and can see what changed.

// ── revealCaption, and why the picture is never a secret ────────────────────
//
// `reveal` is the picture a class uncovers together. `revealCaption` is the one
// line printed under it when the last square turns over. Without it a class
// finishes and reads "you finished", which is a progress bar talking, not the
// end of a story. With it the picture becomes the answer to whatever the pack
// asked in its briefing.
//
// Two rules follow from how the picture actually reaches a student, and both
// are easy to get wrong:
//
//   The picture cannot be a secret, so do not hide a find in it. The pack ships
//   inside the browser bundle, so every student holds the full image from the
//   first second and can read it out of the page in about thirty seconds. Make
//   the picture MEANINGFUL only after the work rather than VISIBLE only after
//   it: a recovered blueprint means nothing until you know what was stolen.
//
//   The caption must not contain an answer. The picture is sized to the class,
//   so a class finishes it well before its slowest student finishes the pack.
//   Whoever is still on Act II will read this caption. Name what was found;
//   never name the offset, the command, or the string that finds it.

/** Formats that are pixel data. Deliberately excludes SVG — see above. */
export const ALLOWED_COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** A pack file is emailed between teachers; a cover must not dominate it. */
export const MAX_COVER_BYTES = 128 * 1024;

export const MAX_DESCRIPTION_LENGTH = 600;
export const MAX_BRIEFING_BODY_LENGTH = 1500;
export const MAX_LEARNING_POINTS = 12;

/**
 * The line printed under the finished picture. Two sentences, not a paragraph:
 * it is read once, by a class looking at a picture, and it competes with the
 * picture for attention.
 */
export const MAX_REVEAL_CAPTION_LENGTH = 240;

/**
 * A definition of a tool or an idea, shown above the brief the first time a
 * student meets it. Two sentences: it is orientation, not the lesson.
 */
export const MAX_DEFINITION_LENGTH = 320;

/**
 * The one line that says what the student has to DO.
 *
 * A brief is a scene: it says where you are, why it matters, and somewhere
 * inside it, what to do. Students read the scene and cannot find the task,
 * because nothing marks which sentence is the instruction. The objective is
 * that sentence pulled out and labelled, and it is the thing a student comes
 * back to after a failed attempt.
 *
 * One sentence, and short enough to read without moving your eyes twice. If it
 * needs two, the challenge is asking for two things and should be two
 * challenges -- or the second sentence is context, and context is the brief's
 * job.
 *
 * It states the GOAL, not the keystrokes. "Print the full path of the
 * directory you are standing in" is a task. "Run `pwd`" is an answer, and an
 * answer printed above the terminal is a challenge nobody has to think about.
 */
export const MAX_OBJECTIVE_LENGTH = 200;

/**
 * `theme.accent` is the one colour a pack still chooses, and it is the only one
 * that survived a deliberate cull.
 *
 * `theme.titleBar`, `theme.sidebarTone`, `linux.shell` and `windows.shell` were
 * carried by every shipped pack and read by nothing: the prompt is built from
 * user and host, and chrome colour belongs to the student's own terminal scheme
 * rather than to the course. They are removed from the format; a pack that
 * still declares one is warned rather than failed, because deleting a key from
 * somebody's pack.json is their edit to make.
 *
 * `accent` stays because netlify/functions/reveal.js genuinely reads it: a pack
 * with no reveal picture gets a wash of its own accent instead, and the caption
 * under the finished picture takes it as a border. Both are graphical elements
 * that carry meaning, so WCAG 2.1 1.4.11 asks 3:1 against what they sit on —
 * and what they sit on is the reveal screen's near-black ground.
 */
export const REVEAL_GROUND = '#0a0a09';
export const MIN_ACCENT_CONTRAST = 3;

/**
 * Fields that were part of the manifest and are not any more, with the reason.
 *
 * They are reported by `shellgrounds validate` under a heading of their own
 * rather than pushed into the warning stream, for the reason every finding in
 * this project is: a warning among warnings is a thing nobody deletes. The
 * shipped packs still carry these keys, and each pack's own author removes
 * them — the validator's job is to say so, once, in a place that is read.
 */
export const REMOVED_MANIFEST_FIELDS = {
  'theme.titleBar':
    'Nothing renders it. A pack cannot set chrome text, because the terminal chrome belongs to '
    + 'the student\'s own scheme.',
  'theme.sidebarTone':
    'Nothing reads it. A pack cannot set chrome colour: students choose from six schemes that '
    + 'are contrast-tested at 4.5:1, and a pack-supplied tone is not.',
  'linux.shell':
    'Nothing reads it. The prompt is built from `user` and `host`.',
  'windows.shell':
    'Nothing reads it. The prompt is built from `user` and `host`.'
};

/** Which of the removed fields a manifest still declares. */
export function removedFieldsIn(manifest = {}) {
  const found = [];
  for (const [dotted, why] of Object.entries(REMOVED_MANIFEST_FIELDS)) {
    const [head, tail] = dotted.split('.');
    if (manifest?.[head] && typeof manifest[head] === 'object' && manifest[head][tail] !== undefined) {
      found.push({ field: `manifest.${dotted}`, why });
    }
  }
  return found;
}

/** #rgb or #rrggbb to {r,g,b}, or null for anything this cannot measure. */
function parseHexColour(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join('') : m[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

const relativeLuminance = ({ r, g, b }) => {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** WCAG 2.1 contrast ratio between two hex colours, or null if either is unreadable. */
export function contrastRatio(a, b) {
  const ca = parseHexColour(a);
  const cb = parseHexColour(b);
  if (!ca || !cb) return null;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

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

  // Three image fields, one set of rules. `cover` is the thumbnail in a list;
  // `scene` is the wide establishing shot on the briefing; `reveal` is the
  // picture a class uncovers together. None may be an SVG and none may be a
  // web address -- see checkCoverImage for why.
  for (const field of ['cover', 'scene', 'reveal']) {
    if (manifest[field] === undefined) continue;
    const checked = checkCoverImage(manifest[field]);
    if (!checked.ok) errors.push(checked.error.replace('manifest.cover', `manifest.${field}`));
  }

  if (manifest.revealCaption !== undefined) {
    if (!isNonEmptyString(manifest.revealCaption)) {
      errors.push('manifest.revealCaption must be a non-empty string.');
    } else if (manifest.revealCaption.length > MAX_REVEAL_CAPTION_LENGTH) {
      errors.push(
        `manifest.revealCaption is ${manifest.revealCaption.length} characters; the limit is `
        + `${MAX_REVEAL_CAPTION_LENGTH}. It is the last line of a story, not a summary of it.`
      );
    }
    if (manifest.reveal === undefined) {
      warnings.push(
        'manifest.revealCaption is set but manifest.reveal is not. The caption is printed under '
        + 'the finished picture, so without a picture nobody will read it.'
      );
    }
  } else if (manifest.reveal !== undefined) {
    warnings.push(
      'manifest.reveal has no manifest.revealCaption. The class will finish the picture and be '
      + 'told only that they finished it. One line naming what they uncovered turns the picture '
      + 'into the end of your scenario instead of decoration.'
    );
  }

  // ── theme ────────────────────────────────────────────────────────────────
  // One field, one floor. See the note above REVEAL_GROUND for what left and why.
  if (manifest.theme !== undefined) {
    const t = manifest.theme;
    if (typeof t !== 'object' || t === null || Array.isArray(t)) {
      errors.push('manifest.theme must be an object.');
    } else {
      if (t.accent !== undefined) {
        const ratio = contrastRatio(t.accent, REVEAL_GROUND);
        if (ratio === null) {
          errors.push(
            `manifest.theme.accent is ${JSON.stringify(t.accent)}. Write it as a hex colour `
            + '(#22c55e), because it is drawn on the near-black reveal screen and its contrast '
            + 'has to be measurable before it ships.'
          );
        } else if (ratio < MIN_ACCENT_CONTRAST) {
          errors.push(
            `manifest.theme.accent ${t.accent} has ${ratio.toFixed(1)}:1 contrast against the `
            + `reveal screen's background ${REVEAL_GROUND}; WCAG 2.1 AA asks ${MIN_ACCENT_CONTRAST}:1 `
            + 'for a graphical element that carries meaning. Pick a lighter shade of the same hue.'
          );
        }
      }
    }
  }

  // A pack's own vocabulary: its commands, and the words its course uses that
  // the shell does not. The engine defines the shell itself, so a key here is
  // either something the engine cannot know or a deliberate override.
  if (manifest.glossary !== undefined) {
    const g = manifest.glossary;
    if (typeof g !== 'object' || g === null || Array.isArray(g)) {
      errors.push('manifest.glossary must be an object keyed by the `teaches` tag it defines.');
    } else {
      for (const [tag, entry] of Object.entries(g)) {
        if (tag.startsWith('//')) continue;
        const what = typeof entry === 'string' ? entry : entry?.what;
        if (!isNonEmptyString(what)) {
          errors.push(`manifest.glossary["${tag}"] needs text saying what it is.`);
        } else if (what.length > MAX_DEFINITION_LENGTH) {
          errors.push(
            `manifest.glossary["${tag}"] is ${what.length} characters; the limit is `
            + `${MAX_DEFINITION_LENGTH}. It is read before a student's first attempt, `
            + 'so it competes with the brief for attention.'
          );
        }
        if (entry && typeof entry === 'object' && entry.term !== undefined
            && !isNonEmptyString(entry.term)) {
          errors.push(`manifest.glossary["${tag}"].term must be a non-empty string when present.`);
        }
      }
    }
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

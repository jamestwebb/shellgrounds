import { describe, it, expect } from 'vitest';
import { checkSFW, normaliseForMatching } from '../packages/engine/sfw-filter.js';

describe('SFW Filter & Handle Validation', () => {
  it('accepts valid alphanumeric handles', () => {
    expect(checkSFW('j_smith').safe).toBe(true);
    expect(checkSFW('analyst-42').safe).toBe(true);
    expect(checkSFW('GhostRider').safe).toBe(true);
  });

  it('rejects short handles (< 3 chars) and long handles (> 20 chars)', () => {
    expect(checkSFW('ab').safe).toBe(false);
    expect(checkSFW('a_very_long_handle_exceeding_twenty_chars').safe).toBe(false);
  });

  it('rejects purely numeric handles', () => {
    expect(checkSFW('123456').safe).toBe(false);
  });

  it('rejects reserved impersonation handles', () => {
    expect(checkSFW('admin_01').safe).toBe(false);
    expect(checkSFW('system_bot').safe).toBe(false);
    expect(checkSFW('moderator').safe).toBe(false);
  });

  it('rejects inappropriate profanity', () => {
    expect(checkSFW('badword_fuck').safe).toBe(false);
    expect(checkSFW('sh1thead').safe).toBe(false);
  });
});

// The filter used to refuse Hassan, Cassandra, Michelle and Killian while
// accepting n1gg3r. Both halves are pinned, because either one alone looks
// like a working filter.
describe('handles a real class would type', () => {
  it('does not tell a student their own name is inappropriate', () => {
    for (const name of [
      'Hassan', 'Cassandra', 'Cassidy', 'Michelle', 'Hellen', 'Killian',
      'Bassam', 'Kellan', 'Spicer', 'Nguyen', 'bassist', 'classic',
      'class_rep', 'grasshopper', 'assembly', 'shelly', 'sussex'
    ]) {
      const r = checkSFW(name);
      expect(r.safe, `${name} was refused: ${r.reason}`).toBe(true);
    }
  });

  it('refuses a slur however it is spelled', () => {
    for (const bad of [
      'nigger', 'n1gg3r', 'n1gga', 'niiigger', 'n_i_g_g_e_r',
      'K1KE', 'H1TL3R', 'f4gg0t', 'r3tard'
    ]) {
      expect(checkSFW(bad).safe, `${bad} got through`).toBe(false);
    }
  });

  it('refuses profanity written to dodge a plain match', () => {
    for (const bad of ['fuck', 'f_u_c_k', 'fvck', 'f4ck', 'sh17', 'b17ch', 'p0rn', 'c0ke_meth']) {
      expect(checkSFW(bad).safe, `${bad} got through`).toBe(false);
    }
  });

  it('refuses a mild word standing on its own, not buried in a name', () => {
    for (const bad of ['hell', 'ass', 'shit', 'shit_lord', 'shitLord', 'crap42']) {
      expect(checkSFW(bad).safe, `${bad} got through`).toBe(false);
    }
    // ...while the same letters inside a name are fine.
    for (const ok of ['Michelle', 'Hassan', 'classic']) {
      expect(checkSFW(ok).safe, `${ok} was refused`).toBe(true);
    }
  });

  it('normalises the way the matcher depends on', () => {
    expect(normaliseForMatching('N1GG3R')).toBe(normaliseForMatching('nigger'));
    expect(normaliseForMatching('f_u_c_k')).toBe(normaliseForMatching('fuck'));
    expect(normaliseForMatching('a')).toBe('a');
    expect(normaliseForMatching('')).toBe('');
    expect(normaliseForMatching('123'), 'a 2 maps to no letter, so it drops out').toBe('ie');
  });
});

// The curated list caught 14% of the standard English word list. It now carries
// that list too, matched as whole tokens. The two assertions below are a pair:
// coverage without the name check is how the filter got into its original state
// of refusing Hassan while accepting n1gg3r.
describe('the vendored word list', () => {
  it('is matched as whole tokens, never as substrings', async () => {
    const { BLOCKED_WORD_SET, normaliseForMatching } =
      await import('../packages/engine/sfw-filter.js');

    // Every one of these entries sits inside an ordinary word or place name.
    for (const [entry, innocent] of [
      ['paki', 'Pakistan'], ['mong', 'among'], ['coon', 'raccoon'],
      ['tit', 'title'], ['butt', 'Butterworth'], ['scat', 'scatter'],
      ['cum', 'accumulate']
    ]) {
      expect(BLOCKED_WORD_SET.has(normaliseForMatching(entry)), `${entry} should be listed`).toBe(true);
      expect(checkSFW(innocent).safe, `${innocent} must not be refused`).toBe(true);
    }
  });

  it('normalises both sides, or it matches almost nothing', async () => {
    const { BLOCKED_WORD_SET, normaliseForMatching } =
      await import('../packages/engine/sfw-filter.js');
    // Storing raw words while comparing normalised tokens silently let plain
    // `asshole` through, because the token collapses to `ashole`.
    expect(BLOCKED_WORD_SET.has('ass'), 'the raw spelling must NOT be what is stored').toBe(false);
    expect(BLOCKED_WORD_SET.has(normaliseForMatching('ass'))).toBe(true);
    for (const h of ['asshole', 'a55hole', 'ass']) {
      expect(checkSFW(h).safe, h).toBe(false);
    }
  });

  it('carries its attribution, because the licence requires it', async () => {
    const { readFileSync } = await import('node:fs');
    const notice = readFileSync(new URL('../NOTICE.md', import.meta.url), 'utf8');
    expect(notice).toContain('CC-BY-4.0');
    expect(notice).toContain('Shutterstock');
  });
});

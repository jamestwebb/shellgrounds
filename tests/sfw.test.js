import { describe, it, expect } from 'vitest';
import { checkSFW } from '../src/engine/sfw-filter.js';

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

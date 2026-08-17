import { describe, it, expect } from 'vitest';
import { buildFS, file } from '../src/engine/fs-builder.js';
import { injectFlagsIntoVFS } from '../src/utils/vfs-injector.js';

describe('VFS Builder & Flag Injection', () => {
  it('builds flat maps and contents arrays from nested trees', () => {
    const { fs } = buildFS({
      tree: {
        'home/analyst': {
          'welcome.txt': file('Hello World'),
          'tunnels': {
            'shaft_1': {
              'note.txt': file('Burrow data')
            }
          }
        }
      }
    });

    expect(fs['/home/analyst']).toBeDefined();
    expect(fs['/home/analyst'].contents).toContain('welcome.txt');
    expect(fs['/home/analyst'].contents).toContain('tunnels');
    expect(fs['/home/analyst/welcome.txt'].content).toBe('Hello World');
    expect(fs['/home/analyst/tunnels/shaft_1/note.txt'].content).toBe('Burrow data');
  });

  it('splices per-user flags into placeholders', () => {
    const { fs: rawFs } = buildFS({
      tree: {
        'home/analyst': {
          'secrets.txt': file('The flag is [[FLAG:act3-grep]]')
        }
      }
    });

    const { fs: injectedFs } = injectFlagsIntoVFS(rawFs, 'reema_patel', {
      'act3-grep': 'WRF{TESTFLAG1234}'
    });

    expect(injectedFs['/home/analyst/secrets.txt'].content).toBe('The flag is WRF{TESTFLAG1234}');
  });
});

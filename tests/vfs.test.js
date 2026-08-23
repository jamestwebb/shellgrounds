import { describe, it, expect } from 'vitest';
import { buildFS, file } from '../src/engine/fs-builder.js';
import { injectFlagsIntoVFS } from '../src/utils/vfs-injector.js';

describe('VFS Builder & Flag Injection', () => {
  it('builds flat maps and contents arrays from nested trees', () => {
    const { fs } = buildFS({
      tree: {
        'home/student': {
          'welcome.txt': file('Hello World'),
          'projects': {
            'alpha': {
              'note.txt': file('nested data')
            }
          }
        }
      }
    });

    expect(fs['/home/student']).toBeDefined();
    expect(fs['/home/student'].contents).toContain('welcome.txt');
    expect(fs['/home/student'].contents).toContain('projects');
    expect(fs['/home/student/welcome.txt'].content).toBe('Hello World');
    expect(fs['/home/student/projects/alpha/note.txt'].content).toBe('nested data');
  });

  it('splices per-user flags into placeholders', () => {
    const { fs: rawFs } = buildFS({
      tree: {
        'home/student': {
          'secrets.txt': file('The flag is [[FLAG:act3-grep]]')
        }
      }
    });

    const { fs: injectedFs } = injectFlagsIntoVFS(rawFs, 'reema_patel', {
      'act3-grep': 'WRF{TESTFLAG1234}'
    });

    expect(injectedFs['/home/student/secrets.txt'].content).toBe('The flag is WRF{TESTFLAG1234}');
  });
});

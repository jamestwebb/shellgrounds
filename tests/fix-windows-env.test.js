// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Regression tests for two engine defects:
//   1. Windows %VAR% expansion and `set` never worked, so the two challenges
//      that TEACH them (w2-env-var, w2-set) showed the student a lie.
//   2. Redirections were applied after the command ran, so a command with an
//      unopenable target still did its work.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { getPack } from '../packs/index.js';
import { findVfsKey } from '../packages/engine/vfs/path.js';

/**
 * A session: state (cwd, fs, env) threads from one command to the next
 * exactly as the client is required to thread it.
 */
function makeSession(packId, platform) {
  const pack = getPack(packId);
  const manifest = platform === 'windows' ? pack.manifest.windows : pack.manifest.linux;
  const state = {
    cwd: manifest.home,
    fs: pack.createFs(platform),
    env: undefined,
    user: manifest.user
  };

  return {
    state,
    run(cmd) {
      const res = runPipeline(cmd, state.cwd, state.fs, platform, {
        user: state.user,
        env: state.env,
        packCommands: pack.commands
      });
      if (res.newCwd) state.cwd = res.newCwd;
      if (res.fs) state.fs = res.fs;
      if (res.env) state.env = res.env;
      return res;
    }
  };
}

describe('Windows environment variables', () => {
  it('expands %VAR% anywhere in an argument', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');
    expect(s.run('echo %USERPROFILE%').stdout).toBe('C:\\Users\\Student\r\n');
    expect(s.run('echo home is %USERPROFILE% ok').stdout).toBe('home is C:\\Users\\Student ok\r\n');
    expect(s.run('echo [%USERNAME%]').stdout).toBe('[Student]\r\n');
    expect(s.run('echo %OS%').stdout).toBe('Windows_NT\r\n');
  });

  it('expands %VAR% case-insensitively, as cmd.exe does', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');
    const upper = s.run('echo %USERPROFILE%').stdout;
    expect(s.run('echo %userprofile%').stdout).toBe(upper);
    expect(s.run('echo %UserProfile%').stdout).toBe(upper);
  });

  it('leaves an undefined variable as literal %VAR% text', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');
    expect(s.run('echo %NO_SUCH_VARIABLE%').stdout).toBe('%NO_SUCH_VARIABLE%\r\n');
  });

  it('seeds a realistic cmd environment derived from the pack, not hardcoded', () => {
    const student = makeSession('windows-cmd-essentials', 'windows');
    const studentEnv = student.run('set').stdout;
    expect(studentEnv).toContain('USERPROFILE=C:\\Users\\Student\r\n');
    expect(studentEnv).toContain('USERNAME=Student\r\n');

    // A different pack must seed its own user and home from its manifest.
    const other = makeSession('forensics-cli-101', 'windows');
    const otherHome = getPack('forensics-cli-101').manifest.windows.home;
    const otherUser = getPack('forensics-cli-101').manifest.windows.user;
    expect(otherHome).not.toBe('C:\\Users\\Student');
    expect(other.run('echo %USERPROFILE%').stdout).toBe(`${otherHome}\r\n`);
    expect(other.run('echo %USERNAME%').stdout).toBe(`${otherUser}\r\n`);

    // The minimum realistic set every Windows session must have.
    for (const name of ['USERPROFILE', 'USERNAME', 'COMPUTERNAME', 'OS', 'PATH', 'TEMP', 'CD']) {
      expect(studentEnv).toContain(`${name}=`);
      expect(student.run(`echo %${name}%`).stdout.trim()).not.toBe(`%${name}%`);
    }
  });

  it('set with no arguments prints every variable sorted, one NAME=value per line', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');
    const res = s.run('set');
    expect(res.status).toBe(0);

    const lines = res.stdout.split('\r\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) {
      expect(line).toMatch(/^[^=]+=.*$/);
    }

    const names = lines.map(l => l.slice(0, l.indexOf('=')));
    const sorted = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    expect(names).toEqual(sorted);

    // The internal last-status slot is not a cmd variable and must not leak.
    expect(names).not.toContain('?');
  });

  it('set NAME prints NAME=value, or reports it is not defined', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');

    const missing = s.run('set MY_VAR');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toBe('Environment variable MY_VAR not defined\r\n');
    expect(missing.stdout).toBe('');

    s.run('set MY_VAR=123');
    const found = s.run('set MY_VAR');
    expect(found.status).toBe(0);
    expect(found.stdout).toBe('MY_VAR=123\r\n');
  });

  it('set NAME=value defines a variable that persists across commands', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');

    const assign = s.run('set MY_VAR=123');
    expect(assign.status).toBe(0);
    expect(assign.stdout).toBe('');
    expect(assign.hasError).toBeFalsy();

    // Second command, same session: the variable must still be there.
    expect(s.run('echo %MY_VAR%').stdout).toBe('123\r\n');
    // Third command: and still there after other commands have run.
    s.run('dir');
    expect(s.run('echo %MY_VAR%').stdout).toBe('123\r\n');
    expect(s.run('set').stdout).toContain('MY_VAR=123\r\n');
  });

  it('set assigns case-insensitively and accepts values containing spaces', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');

    s.run('set my_var=first');
    s.run('set MY_VAR=second');
    // One variable, not two spelled differently.
    const listed = s.run('set my_var').stdout.split('\r\n').filter(Boolean);
    expect(listed).toEqual(['my_var=second']);

    s.run('set GREETING=hello there');
    expect(s.run('echo %GREETING%').stdout).toBe('hello there\r\n');
  });

  it('%CD% tracks the current directory', () => {
    const s = makeSession('windows-cmd-essentials', 'windows');
    expect(s.run('echo %CD%').stdout).toBe('C:\\Users\\Student\r\n');

    s.run('cd Documents');
    expect(s.state.cwd).toBe('C:\\Users\\Student\\Documents');
    expect(s.run('echo %CD%').stdout).toBe('C:\\Users\\Student\\Documents\r\n');

    s.run('cd ..');
    expect(s.run('echo %CD%').stdout).toBe('C:\\Users\\Student\r\n');
  });

  it('runPipeline returns the environment so a caller can persist it', () => {
    const pack = getPack('windows-cmd-essentials');
    const fs = pack.createFs('windows');
    const first = runPipeline('set MY_VAR=123', 'C:\\Users\\Student', fs, 'windows', { user: 'Student' });
    expect(first.env).toBeTruthy();
    expect(first.env.MY_VAR).toBe('123');

    // Handing that env back is the whole contract for persistence.
    const second = runPipeline('echo %MY_VAR%', 'C:\\Users\\Student', fs, 'windows', {
      user: 'Student',
      env: first.env
    });
    expect(second.stdout).toBe('123\r\n');

    // Dropping it is what the old client did, and the variable is gone.
    const forgetful = runPipeline('echo %MY_VAR%', 'C:\\Users\\Student', fs, 'windows', { user: 'Student' });
    expect(forgetful.stdout).toBe('%MY_VAR%\r\n');
  });

  it('teaches what challenge w2-env-var and w2-set claim to teach', () => {
    const pack = getPack('windows-cmd-essentials');
    const byId = Object.fromEntries(pack.challenges.map(c => [c.id, c]));
    const s = makeSession('windows-cmd-essentials', 'windows');

    const envVar = s.run(byId['w2-env-var'].acceptedVariants[0]);
    expect(envVar.hasError).toBeFalsy();
    expect(envVar.output).toBe('C:\\Users\\Student\r\n');
    // The success message promises this exact expansion.
    expect(byId['w2-env-var'].successMessage).toContain(envVar.output.trim());

    const setVar = s.run(byId['w2-set'].acceptedVariants[0]);
    expect(setVar.hasError).toBeFalsy();
    expect(s.run('set MY_VAR').stdout).toBe('MY_VAR=123\r\n');
    expect(s.run('echo %MY_VAR%').stdout).toBe('123\r\n');
  });
});

describe('Redirections are opened before the command runs', () => {
  it('does not run the command when the redirect target cannot be opened', () => {
    const s = makeSession('linux-fundamentals', 'linux');
    s.run('echo hello > important.txt');
    const target = `${s.state.cwd}/important.txt`;
    expect(findVfsKey(s.state.fs, target, false)).toBeTruthy();

    const res = s.run('rm important.txt > /nodir/out.txt');

    // Bash: opens the target first, fails, never forks the command.
    expect(res.status).not.toBe(0);
    expect(res.hasError).toBe(true);
    expect(res.stderr).toBe('bash: /nodir/out.txt: No such file or directory\n');
    expect(res.stdout).toBe('');

    // The file the command would have destroyed is untouched.
    expect(findVfsKey(s.state.fs, target, false)).toBeTruthy();
    expect(s.run('cat important.txt').stdout).toBe('hello\n');
  });

  it('reports a permission failure with the bash prefix and runs nothing', () => {
    // This pack's /etc/passwd is owned by another user, so the open is denied.
    const s = makeSession('forensics-cli-101', 'linux');
    const res = s.run('echo secret > /etc/passwd');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toBe('bash: /etc/passwd: Permission denied\n');
    expect(res.stdout || '').not.toContain('secret');
  });

  it('fails the command when a stderr redirect target cannot be opened', () => {
    const s = makeSession('linux-fundamentals', 'linux');
    s.run('echo keep > survivor.txt');
    const target = `${s.state.cwd}/survivor.txt`;

    const res = s.run('rm survivor.txt 2> /nodir/err.txt');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toBe('bash: /nodir/err.txt: No such file or directory\n');
    expect(findVfsKey(s.state.fs, target, false)).toBeTruthy();
  });

  it('still writes and appends when the target can be opened', () => {
    const s = makeSession('linux-fundamentals', 'linux');
    const first = s.run('echo one > out.txt');
    expect(first.status).toBe(0);
    expect(first.stdout).toBe('');
    expect(s.run('cat out.txt').stdout).toBe('one\n');

    s.run('echo two >> out.txt');
    expect(s.run('cat out.txt').stdout).toBe('one\ntwo\n');

    // The probe must not truncate a file it only checks.
    const probeCheck = s.run('echo three >> out.txt');
    expect(probeCheck.status).toBe(0);
    expect(s.run('cat out.txt').stdout).toBe('one\ntwo\nthree\n');
  });
});

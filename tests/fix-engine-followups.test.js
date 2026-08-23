// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Four defects found while writing content, each fixed at the engine rather
// than routed around in the packs. Content that steers past a broken command
// leaves the command broken for the next author.

import { describe, it, expect } from 'vitest';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { buildFS, file, dir } from '../packages/engine/vfs/builder.js';
import { PACKS } from '../packs/index.js';

const win = PACKS['windows-cmd-essentials'];
const lin = PACKS['linux-fundamentals'];

const runWin = (cmd, cwd = 'C:\\Users\\Student') =>
  runPipeline(cmd, cwd, win.createFs('windows'), 'windows',
    { packCommands: win.commands, packHelp: win.help, user: 'Student' });

const runLin = (cmd, cwd = '/home/student') =>
  runPipeline(cmd, cwd, lin.createFs('linux'), 'linux',
    { packCommands: lin.commands, packHelp: lin.help, user: 'student' });

describe('a cmd.exe switch takes its value attached, never as the next word', () => {
  it('dir /a Documents lists Documents, not the current directory', () => {
    // /a swallowed "Documents" as its attribute filter, so the student was
    // shown the wrong directory and told nothing was wrong.
    expect(runWin('dir /a Documents').output).toContain('Directory of C:\\Users\\Student\\Documents');
  });

  it('accepts the attached forms cmd.exe accepts', () => {
    for (const cmd of ['dir /a', 'dir /a:h', 'dir /ah', 'dir /a /b']) {
      expect(runWin(cmd).status, `${cmd} should succeed`).toBe(0);
    }
  });

  it('still reads an explicitly colon-separated value', () => {
    expect(runWin('dir /o:n').status).toBe(0);
  });
});

describe('where', () => {
  it('does not append a second extension', () => {
    expect(runWin('where cmd.exe').output.trim()).toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('still adds .exe to a bare name', () => {
    expect(runWin('where notepad').output.trim()).toBe('C:\\Windows\\System32\\notepad.exe');
  });
});

describe('awk builds a string from juxtaposed terms', () => {
  const firstLines = (out, n = 2) => out.trim().split('\n').slice(0, n);

  it('concatenates around a quoted comma', () => {
    // Splitting the argument list on every comma tore `$2 "," $4` in half, and
    // `$4` was printed as the literal text. This is the ordinary way to build
    // a CSV line, so it is worth getting right.
    const out = runLin(`awk -F, '{print $2 "," $4}' Documents/data.csv`).stdout;
    expect(firstLines(out)).toEqual(['name,hours', 'Alice Reyes,95']);
  });

  it('separates comma-listed arguments with a space', () => {
    const out = runLin(`awk -F, '{print $2, $4}' Documents/data.csv`).stdout;
    expect(firstLines(out)).toEqual(['name hours', 'Alice Reyes 95']);
  });

  it('concatenates around any literal', () => {
    const out = runLin(`awk -F, '{print $1 "-" $2}' Documents/data.csv`).stdout;
    expect(firstLines(out)).toEqual(['id-name', '101-Alice Reyes']);
  });

  it('still handles NR and a bare field', () => {
    expect(firstLines(runLin(`awk -F, '{print NR, $2}' Documents/data.csv`).stdout, 1))
      .toEqual(['1 name']);
    expect(firstLines(runLin(`awk -F, '{print $2}' Documents/data.csv`).stdout, 1))
      .toEqual(['name']);
  });
});

describe('a file belongs to the pack that declares it', () => {
  it('derives the owner from the home directory', () => {
    // file() hardcoded owner: 'student', so a pack whose user was anybody else
    // owned nothing inside its own home and permissions challenges broke.
    const { fs } = buildFS({
      home: '/home/observer',
      tree: { 'home/observer': { 'a.txt': file('hi'), 'sub': dir({ contents: { 'b.txt': file('x') } }) } }
    });
    expect(fs['/home/observer/a.txt'].owner).toBe('observer');
    expect(fs['/home/observer/a.txt'].group).toBe('observer');
    expect(fs['/home/observer/sub'].owner).toBe('observer');
  });

  it('still honours an explicit owner and mode', () => {
    const { fs } = buildFS({
      home: '/home/observer',
      tree: { 'home/observer': { 'secret': file('s', { owner: 'root', mode: 0o600 }) } }
    });
    expect(fs['/home/observer/secret'].owner).toBe('root');
    expect(fs['/home/observer/secret'].mode).toBe(0o600);
  });

  it('derives a Windows owner the same way', () => {
    const { fs } = buildFS({
      isWindows: true,
      home: 'C:\\Users\\Examiner',
      tree: { 'Users/Examiner': { 'c.txt': file('hi') } }
    });
    expect(fs['C:\\Users\\Examiner\\c.txt'].owner).toBe('Examiner');
  });

  it('leaves system files to root, so the permission lesson survives', () => {
    // Deriving every file's owner from the pack's home user handed the student
    // /etc/passwd, and `echo secret > /etc/passwd` quietly succeeded. Ownership
    // follows location the way it does on a real machine.
    for (const pack of Object.values(PACKS)) {
      if (!(pack.manifest.platforms || []).includes('linux')) continue;
      const built = pack.createFs('linux');
      const home = pack.manifest.linux?.home;
      for (const [path, node] of Object.entries(built)) {
        if (node.type !== 'file') continue;
        if (home && path.startsWith(`${home}/`)) continue;
        if (path.startsWith('/tmp/') || path.startsWith('/var/tmp/')) continue;
        expect(node.owner, `${pack.id}: ${path} should not belong to the student`).not.toBe(
          pack.manifest.linux?.user || 'student'
        );
      }
    }
  });

  it('still refuses a redirect into a root-owned file', () => {
    const res = runLin('echo secret > /etc/passwd');
    expect(res.status).not.toBe(0);
    expect(res.stdout || '').not.toContain('secret');
  });

  it('leaves every shipped pack owning its own home', () => {
    for (const pack of Object.values(PACKS)) {
      for (const platform of pack.manifest.platforms || ['linux']) {
        const isWin = platform === 'windows';
        const home = isWin
          ? (pack.manifest.windows?.home) : (pack.manifest.linux?.home);
        if (!home) continue;
        const built = pack.createFs(platform);
        const owned = Object.entries(built)
          .filter(([k, v]) => k.startsWith(home) && v.type === 'file');
        expect(owned.length, `${pack.id}/${platform} has no files under ${home}`).toBeGreaterThan(0);
        for (const [k, v] of owned) {
          expect(v.owner, `${k} is owned by nobody`).toBeTruthy();
        }
      }
    }
  });
});

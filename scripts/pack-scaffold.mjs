#!/usr/bin/env node
// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Scaffold a new pack that passes `shellgrounds validate` the moment it is written.
//
// The point is not to save typing. It is that a first pack should be a WORKING
// pack, so the author's first run is green and every later red is something
// they just did. A blank template that fails validation teaches the author that
// the validator is noise.
//
// Every file it writes carries `//` comment keys. That is a real key in this
// format — see docs/PACK-FORMAT.md — and the loader drops any key beginning
// with `//`, so the explanations live in the file the author is editing rather
// than in a document they have to keep open beside it.

import { writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PackFormatError, DEFAULT_MTIME } from '../packages/engine/validate/packFile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_FILE_MODULE = resolve(HERE, '../packages/engine/validate/packFile.js');

const displayPath = (p) => {
  const rel = relative(process.cwd(), p);
  return (!rel || rel.startsWith('..')) ? p : rel;
};

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const pascal = (id) => String(id).split(/[^a-zA-Z0-9]+/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const titleCase = (id) => String(id).split(/[^a-zA-Z0-9]+/).filter(Boolean)
  .map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** A short, pack-specific challenge-id prefix. Ids must be unique across ALL packs. */
function idPrefix(packId) {
  const words = String(packId).split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0]).join('').toLowerCase();
  return words[0].slice(0, 4).toLowerCase();
}

export async function scaffoldPack(packId, outDir = null, options = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(packId)) {
    throw new PackFormatError(
      `Pack id '${packId}' must be lower-case letters, digits and hyphens, e.g. 'network-basics'.`
    );
  }
  const dir = resolve(outDir || join('packs', packId));
  if (await exists(dir) && !options.force) {
    throw new PackFormatError(`${dir} already exists. Choose another directory, or pass --force.`);
  }
  await mkdir(dir, { recursive: true });

  const p = idPrefix(packId);
  const name = titleCase(packId);
  const written = [];
  const put = async (file, content) => {
    await writeFile(join(dir, file), content, 'utf8');
    written.push(file);
  };
  const putJson = (file, value) => put(file, `${JSON.stringify(value, null, 2)}\n`);

  // ── pack.json ─────────────────────────────────────────────────────────────
  await putJson('pack.json', {
    '//': 'The manifest. Everything here is about the COURSE, not any one challenge.',
    id: packId,
    '// id': 'Must match this directory name and be unique across every pack on the site.',
    name,
    '// name': 'The title a student sees in the pack picker.',
    version: '1.0.0',
    platforms: ['linux'],
    '// platforms': 'One or both of "linux" and "windows". Each needs its own fs.<platform>.json.',

    '// icon': 'One emoji. It is how your course is recognised in a list of them.',
    icon: '📁',
    '// description': 'The paragraph a student reads when choosing between courses. Two or three sentences: what the scenario is, and who it is for. 600 characters at most.',
    description: `${name} is a starter course. Replace this description with what your `
      + 'students will actually be doing, and who it is for.',
    '// briefing': 'What a student reads once, before their first command. "body" is required; blank lines separate paragraphs. "youWillLearn" is what they will be able to do at the end, not a list of commands.',
    briefing: {
      heading: 'Your briefing',
      body: 'Set the scene here. Say where the student is, what has gone wrong, and what they '
        + 'are expected to produce.\n\nThen tell them nothing can break, and that the first hint '
        + 'on every challenge is free.',
      youWillLearn: [
        'Find your way around a filesystem',
        'Read a file without opening an editor',
        'Count the lines that match a pattern'
      ]
    },

    '// cover': 'Optional. An image, embedded as a data: URI -- "data:image/png;base64,...". PNG, JPEG, WebP or GIF, 128 KB at most. Not SVG, which can carry scripts, and never a web address, which would tell someone else\'s server who your students are. Delete this line to use the emoji instead.',
    linux: {
      '//': 'Who the student is, and where they start. The home directory must exist in fs.linux.json.',
      home: '/home/student',
      user: 'student',
      host: 'sandbox',
      shell: 'bash'
    },
    theme: {
      '//': 'Cosmetic. accent is a CSS colour; sidebarTone is a Tailwind colour family.',
      accent: '#38bdf8',
      titleBar: `${name.toUpperCase()} TTY1`,
      sidebarTone: 'sky'
    },
    messages: {
      '//': 'What the terminal says when a student types something real that is not simulated.',
      unsimulated: 'That is a real command. It is not simulated here.',
      unsupportedSyntax: 'That shell feature is not simulated here.'
    },
    acts: [
      {
        '//': 'Act 1 is always open: unlockThreshold 0 means no prior work is required.',
        id: 1,
        name: 'Act I: Getting Oriented',
        tagline: 'Looking around and reading files',
        icon: '🧭',
        glyph: '─·─',
        unlockThreshold: 0.0
      },
      {
        '//': 'unlockThreshold 0.5 = solve half of act 1 to open act 2. Keep it low enough that a '
          + 'student who is stuck on one challenge is not locked out; the app always lets them skip one.',
        id: 2,
        name: 'Act II: Finding Things',
        tagline: 'Searching text and turning up what is hidden',
        icon: '🔎',
        glyph: '─··─',
        unlockThreshold: 0.5
      }
    ],
    badges: [
      {
        '//': 'A badge is awarded when every challenge in its act is solved.',
        id: `badge-${p}-oriented`,
        name: 'Oriented',
        description: 'Completed Act I: looked around and read a file.',
        icon: '🧭',
        color: 'from-sky-500 to-blue-600',
        act: 1
      },
      {
        id: `badge-${p}-finder`,
        name: 'Finder',
        description: 'Completed Act II: searched text and found what was hidden.',
        icon: '🔎',
        color: 'from-amber-500 to-yellow-600',
        act: 2,
        special: true
      }
    ]
  });

  // ── challenges.json ───────────────────────────────────────────────────────
  await putJson('challenges.json', [
    {
      '//': 'The simplest possible challenge. In act 1 the brief may show the whole command line.',
      id: `${p}-1-look`,
      act: 1,
      title: 'Look Around',
      points: 10,
      brief: 'Run `ls` to see what is in your home directory.',
      setup: { cwd: '/home/student', '// cwd': 'Where the student starts. This path must exist in fs.linux.json.' },
      success: {
        '//': 'outputContains checks what the TERMINAL PRINTED. Prefer this to commandMatches: it '
          + 'accepts any command that genuinely produced the answer, and it cannot pass when the '
          + 'simulation printed nothing.',
        predicate: 'outputContains',
        text: 'welcome.txt'
      },
      hints: [{ cost: 0, text: 'Type `ls` and press Enter.', '// cost': 'Hint 0 should be free.' }],
      successMessage: '`ls` lists the entries in a directory.',
      teaches: ['ls', 'navigation'],
      acceptedVariants: ['ls', 'ls -l', 'ls -la'],
      '// acceptedVariants': 'Every line here is replayed by the validator and MUST pass. A variant '
        + 'that fails is the course promising an answer that does not work.'
    },
    {
      id: `${p}-1-read`,
      act: 1,
      title: 'Read the Welcome File',
      points: 10,
      brief: 'Print the contents of `welcome.txt` to the screen with `cat`.',
      setup: { cwd: '/home/student' },
      success: { predicate: 'outputContains', text: 'three log lines' },
      hints: [{ cost: 0, text: 'Run `cat welcome.txt`.' }],
      successMessage: '`cat` prints a whole file to standard output.',
      teaches: ['cat', 'file-viewing'],
      acceptedVariants: ['cat welcome.txt', 'cat ./welcome.txt', 'cat /home/student/welcome.txt']
    },
    {
      '//': 'From act 2 on, the brief states the GOAL and never the command line. The exact command '
        + 'moves behind a costed hint. See packs/AUTHORING.md for the rule and why it exists.',
      id: `${p}-2-count`,
      act: 2,
      title: 'Count the Errors',
      points: 20,
      brief: 'How many lines of `notes/log.txt` mention ERROR? Make the terminal print just the number.',
      setup: { cwd: '/home/student' },
      success: {
        '//': 'Anchored so a listing of the matching lines does not accidentally satisfy it.',
        predicate: 'outputMatches',
        pattern: '^\\s*3\\s*$'
      },
      hints: [
        { cost: 0, text: 'One `grep` flag counts the matching lines instead of printing them.' },
        { cost: 8, text: 'Run `grep -c ERROR notes/log.txt`.' }
      ],
      successMessage: '`grep -c` reports how many lines matched, not the lines themselves.',
      teaches: ['grep -c', 'counting'],
      acceptedVariants: ['grep -c ERROR notes/log.txt', 'grep -c ERROR /home/student/notes/log.txt']
    },
    {
      '//': 'A FLAG challenge. The student finds a FLAG{...} string and submits it, so there is no '
        + 'command to check. The flag is per-student: the file holds the placeholder [[FLAG:<id>]] '
        + 'and the server substitutes a value derived from the student handle, so a leaked flag is '
        + 'useless to anyone else.',
      id: `${p}-2-keycode`,
      act: 2,
      title: 'The Hidden Keycode',
      points: 25,
      brief: 'A keycode is hidden in the `notes` directory, in a file the plain listing does not show. Find it and submit it.',
      setup: { cwd: '/home/student' },
      success: {
        kind: 'flag',
        flagFile: '/home/student/notes/.keycode',
        '// flagFile': 'Optional, but worth setting: the validator then proves this file exists, '
          + 'holds the placeholder, and is readable by the student.'
      },
      hints: [
        { cost: 0, text: 'A file whose name starts with a dot is hidden from a plain listing.' },
        { cost: 10, text: 'Run `ls -a notes`, then read the dotfile you find.' }
      ],
      successMessage: 'Hidden files are hidden by convention, not by permission.',
      teaches: ['hidden-files', 'dotfiles'],
      commandCheckExempt: false
    }
  ]);

  // ── fs.linux.json ─────────────────────────────────────────────────────────
  await putJson('fs.linux.json', {
    '//': 'The filesystem the student explores, as DATA. A directory has "children"; a file has '
      + '"content". Anything the loader can work out for itself — size, md5, sha256 — is left out.',
    platform: 'linux',
    root: '/',
    defaults: {
      '//': 'Applied to every node that does not say otherwise. Modes are octal strings.',
      owner: 'student',
      group: 'student',
      fileMode: '0644',
      dirMode: '0755',
      mtime: DEFAULT_MTIME
    },
    tree: {
      home: {
        type: 'dir',
        children: {
          student: {
            type: 'dir',
            children: {
              'welcome.txt': {
                type: 'file',
                content: `Welcome to ${name}.\n\nThis sandbox holds a notes directory with three log lines that matter,\nand one file the plain listing will not show you.\n`
              },
              notes: {
                type: 'dir',
                children: {
                  'log.txt': {
                    type: 'file',
                    content: '2026-08-17 09:00 INFO  service started\n'
                      + '2026-08-17 09:04 ERROR database refused the connection\n'
                      + '2026-08-17 09:05 WARN  retrying in five seconds\n'
                      + '2026-08-17 09:05 ERROR database refused the connection\n'
                      + '2026-08-17 09:11 INFO  connected\n'
                      + '2026-08-17 10:20 ERROR disk quota exceeded on /var\n'
                  },
                  '.keycode': {
                    '//': 'The placeholder is replaced per student at run time. The id after FLAG: '
                      + 'must match a challenge id exactly, or the student sees the raw placeholder.',
                    type: 'file',
                    content: `RECOVERY KEYCODE\n================\n[[FLAG:${p}-2-keycode]]\n`,
                    hidden: true,
                    mode: '0600'
                  }
                }
              }
            }
          }
        }
      },
      tmp: {
        '//': '/tmp is world-writable and sticky on every real Unix, so scratch work behaves.',
        type: 'dir',
        mode: '1777',
        owner: 'root',
        group: 'root',
        children: {}
      }
    }
  });

  // ── the generated loader ──────────────────────────────────────────────────
  let importPath = relative(dir, PACK_FILE_MODULE).split('\\').join('/');
  if (!importPath.startsWith('.')) importPath = `./${importPath}`;
  await put('fs.linux.js', `// GENERATED. Do not edit — edit fs.linux.json instead.
//
// packs/index.js imports a function, so one has to exist. These four lines are
// fixed: the pack's content is data in fs.linux.json, and importing a pack
// therefore never adds code to the app.
import { expandFilesystem } from '${importPath}';
import tree from './fs.linux.json' with { type: 'json' };

export function create${pascal(packId)}Filesystem() {
  return expandFilesystem(tree, { isWindows: false });
}
`);

  const P = pascal(packId);
  await put('README.md', `# ${name}

A starter pack, scaffolded by \`shellgrounds new ${packId}\`. It already passes validation.

\`\`\`bash
node bin/shellgrounds.js validate ${displayPath(dir)}
node bin/shellgrounds.js try ${p}-2-count "grep -c ERROR notes/log.txt" --pack ${displayPath(dir)}
node bin/shellgrounds.js export ${displayPath(dir)} ${packId}.pack.json
\`\`\`

## The files

| File | What it is |
|---|---|
| \`pack.json\` | manifest: name, platforms, theme, acts, badges |
| \`challenges.json\` | every challenge, in order |
| \`fs.linux.json\` | the filesystem the student explores, as data |
| \`fs.linux.js\` | a generated four-line loader; do not edit |

Every \`"//"\` key in those files is a comment. The loader drops it.

## Show it in the app

The registry is still hand-edited. Add to \`packs/index.js\`:

\`\`\`js
import ${P}PackJson from './${packId}/pack.json' with { type: 'json' };
import ${P}Challenges from './${packId}/challenges.json' with { type: 'json' };
import { create${P}Filesystem } from './${packId}/fs.linux.js';

// ...then inside PACKS:
  '${packId}': {
    id: '${packId}',
    manifest: ${P}PackJson,
    challenges: ${P}Challenges,
    help: {},
    commands: {},
    createFs: () => create${P}Filesystem()
  },
\`\`\`

## Next

- \`docs/PACK-FORMAT.md\` — every field and every predicate.
- \`packs/AUTHORING.md\` — the tutorial and the rules about giving away answers.
`);

  return { outDir: dir, written, packId, idPrefix: p };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const [packId, out] = args;
  if (!packId) {
    console.error('Usage: node scripts/pack-scaffold.mjs <pack-id> [outDir] [--force]');
    process.exit(1);
  }
  const r = await scaffoldPack(packId, out, { force });
  console.log(`Created ${r.outDir}`);
  for (const f of r.written) console.log(`  ${f}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

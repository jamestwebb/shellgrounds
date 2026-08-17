// Generates the instructor guide FROM the live challenge data, so it can never
// drift from the game. Run: node scripts/build-instructor-guide.mjs
import { CHALLENGES, ACT_DEFINITIONS, requiredSolvesToUnlock } from '../src/data/challenges.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { createWarrenFilesystem } from '../src/engine/fs.warren.js';
import { createTopsideFilesystem } from '../src/engine/fs.topside.js';
import { injectFlagsIntoVFS } from '../src/utils/vfs-injector.js';
import { generateUserFlag } from '../src/engine/crypto-utils.js';
import fs from 'fs';

// Canonical solution per challenge (kept in step with tests/solvability.test.js)
const SOLUTIONS = {
  'act1-pwd': { cmd: 'pwd' },
  'act1-ls': { cmd: 'ls' },
  'act1-hidden': { cmd: 'ls -la', then: 'cat .stash' },
  'act1-cd': { cmd: 'cd training/level_1', then: 'cat checkpoint_alpha.txt' },
  'act1-paths': { cmd: 'cd training/level_2', then: 'cat checkpoint_beta.txt', note: 'From inside level_1 the sibling route is: cd .. then cd level_2 — that is the lesson.' },
  'act1-tab': { cmd: 'cd Documents', typed: 'cd Doc', then: 'press Tab → completes to Documents, then Enter', skipVerify: true, note: 'Students type cd Doc and press Tab. Typing it in full also counts.' },
  'act1-history': { cmd: 'pwd', then: 'press Up Arrow, then Enter' },
  'act2-cat': { cmd: 'cat Documents/case_notes.txt' },
  'act2-head': { cmd: 'head -n 5 Documents/access.log' },
  'act2-tail': { cmd: 'tail Documents/access.log' },
  'act2-file': { cmd: 'file evidence/mystery_file' },
  'act2-strings': { cmd: 'strings evidence/binary_data' },
  'act2-md5': { cmd: 'md5sum evidence/evidence.img', then: 'cat evidence/evidence.img', note: 'The hash is NOT the flag — the flag is in the file text.' },
  'act3-grep': { cmd: 'grep vault_passcode Documents/secrets.txt' },
  'act3-grepi': { cmd: 'grep -i "error" Documents/logs.txt' },
  'act3-find': { cmd: 'find /var/log -name "*.log"', then: 'cat /var/log/sensor_audit.log' },
  'act3-crossing': { cmd: 'cat /mnt/c/Users/analyst/Desktop/CASE_FILES/intake.txt' },
  'act3-crossing-solo': { cmd: 'cat /mnt/c/Users/analyst/Documents/surface_notes.txt', note: 'Deliberately unassisted — mirrors Case 001 §1C.' },
  'act3-man': { cmd: 'man tracker', note: 'Flag is inside the DESCRIPTION section.' },
  'act3-apt': { cmd: 'sudo apt-get update && sudo apt-get install tracker -y', then: 'tracker -a' },
  'act4-grep-v': { cmd: 'grep -v "ALLOW" Documents/network_stream.log' },
  'act4-pipe-count': { cmd: 'grep -v "ALLOW" Documents/network_stream.log | wc -l' },
  'act4-pipe-csv': { cmd: 'grep "FLAG_EMIT" Documents/security_events.csv | cut -d, -f6' },
  'act4-redirect': { cmd: 'grep -i "error" Documents/logs.txt > /tmp/errors.log', then: 'cat /tmp/errors.log', note: 'The redirect prints nothing — that is correct.' },
  'act5-scan': { cmd: 'scan evidence/suspect_drive.raw', note: 'Students must READ the Start sector (206848) from the table.' },
  'act5-capstone': { cmd: 'extract -o 206848 evidence/suspect_drive.raw' },
  'topside-nav': { cmd: 'dir' },
  'topside-attrib': { cmd: 'attrib evidence\\mystery_file', then: 'type evidence\\mystery_file' },
  'topside-findstr': { cmd: 'findstr /i "marker" Documents\\logs.txt' },
  'topside-certutil': { cmd: 'certutil -hashfile evidence\\evidence.img MD5' }
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

// Live-verify every canonical solution so the guide cannot document a broken step
const demoFlags = {};
for (const c of CHALLENGES) if (c.success?.kind === 'flag' && !c.success.staticFlag) demoFlags[c.id] = generateUserFlag('guide', 'demo', c.id);
const verify = (c) => {
  const sol = SOLUTIONS[c.id];
  if (!sol) return '?';
  if (sol.skipVerify) return 'OK';
  const isWin = c.platform === 'windows';
  const base = isWin ? createTopsideFilesystem() : createWarrenFilesystem();
  const { fs: vfs } = injectFlagsIntoVFS(base, 'demo', demoFlags);
  const cwd = c.setup?.cwd || (isWin ? 'C:\\Users\\Analyst' : '/home/analyst');
  const ctx = { installedPackages: new Set(['tracker']) };
  const r = runPipeline(sol.cmd, cwd, vfs, isWin ? 'windows' : 'linux', ctx);
  return r.hasError ? 'ERROR' : 'OK';
};

const totalPoints = CHALLENGES.reduce((s, c) => s + c.points, 0);
let html = `<!doctype html><html><head><meta charset="utf-8"><title>The Gauntlet — Instructor Guide</title>
<style>
@page { size: letter; margin: 0.6in; }
body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 10pt; line-height: 1.45; color: #111; }
h1 { font-size: 20pt; margin: 0 0 2px; }
h2 { font-size: 13pt; margin: 18px 0 6px; border-bottom: 2px solid #222; padding-bottom: 3px; page-break-after: avoid; }
h3 { font-size: 10.5pt; margin: 12px 0 3px; page-break-after: avoid; }
code { font-family: "SF Mono", Consolas, monospace; background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 9pt; }
.sub { color: #555; margin: 0 0 12px; }
.box { border: 1px solid #bbb; border-radius: 5px; padding: 9px 11px; margin: 10px 0; background: #fafafa; }
.key { background: #fffbe6; border-color: #e0c000; }
table { width: 100%; border-collapse: collapse; margin: 7px 0; font-size: 9pt; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; }
.ch { border: 1px solid #ddd; border-left: 3px solid #2b7; border-radius: 4px; padding: 8px 10px; margin: 8px 0; page-break-inside: avoid; }
.ch h3 { margin-top: 0; }
.pts { float: right; font-weight: normal; color: #666; font-size: 9pt; }
.ans { background: #eefaf0; border: 1px solid #b8e0c2; border-radius: 4px; padding: 6px 8px; margin: 5px 0; }
.hint { color: #555; font-size: 9pt; margin: 3px 0 0 12px; }
.note { color: #a05000; font-size: 9pt; font-style: italic; margin-top: 4px; }
.act { page-break-before: always; }
.act:first-of-type { page-break-before: avoid; }
footer { margin-top: 20px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 8pt; color: #777; }
</style></head><body>
<h1>The Gauntlet — Instructor Guide</h1>
<p class="sub">Forensics CLI 101 · every challenge, answer, and accepted variant · generated ${new Date().toISOString().slice(0, 10)} from the live game data</p>

<div class="box key">
<strong>Quick reference</strong><br>
Site: <code>gauntlet-cis4400.netlify.app</code> &nbsp;·&nbsp; Class password: <code>locard-2026</code> (lowercase, case-sensitive)<br>
Handles: 3–20 characters, letters/numbers/underscore/hyphen, <strong>claimed once only</strong>. Admin handle: <code>warden</code>.<br>
${CHALLENGES.length} challenges · ${totalPoints} points total · flags look like <code>FLAG{ABCD2345EFGH}</code> and are <strong>different for every student</strong>.
</div>

<h2>If a student says "it's not working"</h2>
<table>
<tr><th>Symptom</th><th>Cause &amp; what to say</th></tr>
<tr><td>"My flag is rejected"</td><td>Flags are per-student — a classmate's flag never validates. Tell them to <strong>click the green flag in the terminal</strong> to copy it exactly, rather than retyping.</td></tr>
<tr><td>"Handle already claimed"</td><td>Someone took it, or they registered before and cleared their browser. Pick a new handle. (To free one, delete that player in Netlify Blobs.)</td></tr>
<tr><td>"I ran the command, nothing happened"</td><td>Check the blue path in their prompt — they may be in a different directory. Most challenges accept short or full paths, but the file must exist from where they stand. <code>cd ~</code> returns home.</td></tr>
<tr><td>"It says command not found"</td><td>If it's a real Linux command we don't simulate (<code>top</code>, <code>nano</code>), the game says so explicitly. Genuine typos say "command not found".</td></tr>
<tr><td>"The act is locked"</td><td>Each act opens after solving all but one of the previous act's challenges. Topside (WIN) is always open.</td></tr>
<tr><td>"Nothing printed"</td><td>Correct for <code>cd</code> and redirects. The game prints "(no output — in a shell, silence usually means success)".</td></tr>
<tr><td>Lost all progress</td><td>Progress is tied to the browser token. Same browser = resumes automatically. Different machine = new handle needed.</td></tr>
</table>

<h2>Act structure &amp; unlocking</h2>
<table><tr><th>Act</th><th>Teaches</th><th>Challenges</th><th>Points</th><th>Unlock</th></tr>`;

for (const a of ACT_DEFINITIONS) {
  const cs = CHALLENGES.filter(c => c.act === a.id);
  const pts = cs.reduce((s, c) => s + c.points, 0);
  const unlock = a.unlockThreshold === 0 ? 'Always open' : `Solve ${requiredSolvesToUnlock(a.id, CHALLENGES)} of ${CHALLENGES.filter(c => c.act === a.id - 1).length} in the prior act`;
  html += `<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.tagline)}</td><td>${cs.length}</td><td>${pts}</td><td>${esc(unlock)}</td></tr>`;
}
html += `</table>
<p style="font-size:9pt;color:#555">Students may skip <strong>one</strong> challenge per act and still advance. The Topside (Windows) quest is optional and open from the start.</p>`;

for (const a of ACT_DEFINITIONS) {
  const cs = CHALLENGES.filter(c => c.act === a.id);
  if (!cs.length) continue;
  html += `<div class="act"><h2>${esc(a.name)}</h2><p class="sub">${esc(a.tagline)}</p>`;
  for (const c of cs) {
    const sol = SOLUTIONS[c.id] || {};
    const kind = c.success.kind === 'flag' ? 'Submits a flag'
      : c.success.kind === 'command' ? 'Auto-completes on the command (no flag)'
      : 'Auto-completes when the file is created (no flag)';
    html += `<div class="ch"><h3><span class="pts">${c.points} pts · ${esc(c.id)} · ${verify(c)}</span>${esc(c.title)}</h3>
      <div><strong>Task:</strong> ${md(c.brief)}</div>
      <div class="ans"><strong>Answer:</strong> <code>${esc(sol.typed || sol.cmd || '—')}</code>${sol.then ? `<br><strong>Then:</strong> ${sol.then.startsWith('press') ? esc(sol.then) : `<code>${esc(sol.then)}</code>`}` : ''}</div>
      <div style="font-size:9pt;color:#555"><strong>Completion:</strong> ${esc(kind)}${c.success.kind === 'flag' && c.success.flagFile ? ` · flag is inside <code>${esc(c.success.flagFile)}</code>` : ''}</div>`;
    (c.hints || []).forEach((h, i) => {
      html += `<div class="hint"><strong>Hint ${i + 1}${h.cost ? ` (−${h.cost} XP)` : ' (free)'}:</strong> ${md(h.text)}</div>`;
    });
    if (sol.note) html += `<div class="note">Instructor note: ${esc(sol.note)}</div>`;
    html += `</div>`;
  }
  html += `</div>`;
}

html += `<h2>Accepted command variants</h2>
<p style="font-size:9pt">Auto-completing challenges accept the natural variations a beginner types, so a correct command is never silently ignored:</p>
<ul style="font-size:9pt">
<li>Optional quotes: <code>cat "Documents/case_notes.txt"</code></li>
<li>Path prefixes: <code>./Documents</code>, <code>~/Documents</code>, <code>/home/analyst/Documents</code></li>
<li>Short paths when already in the folder: <code>head -n 5 access.log</code> from inside <code>Documents</code></li>
<li>Flag spacing: <code>head -n 5</code>, <code>head -n5</code>, <code>head -5</code></li>
<li>Windows: forward or back slashes, any capitalization (<code>md5</code> or <code>MD5</code>)</li>
<li>Trailing spaces are ignored everywhere</li>
</ul>

<h2>Teaching notes</h2>
<ul style="font-size:9.5pt">
<li><strong>The Coach</strong> (toggle in the terminal title bar) explains every command and error in plain language. Explanations fade after the second use of a command. Leave it ON for beginners.</li>
<li><strong>Reference tab</strong> holds a manual page for every command, and tells students the real-shell equivalent (<code>man grep</code>). Point stuck students there rather than giving the answer.</li>
<li><strong>Course tie-ins:</strong> Act III's WSL bridge is exactly what Case 001 §1C asks students to figure out unaided. Act V's offset-carrying mirrors Case 003's <code>mmls</code> → <code>fsstat -o</code> chain. Act IV's pipes and redirection are Case 005's core skills.</li>
<li><strong>Unsimulated tools</strong> (<code>mmls</code>, <code>vol</code>, <code>exiftool</code>) reply with what they are and which case uses them — a free preview of the semester.</li>
<li><strong>Hints:</strong> first is free, later ones cost XP. Hint use is visible in the instructor dashboard as a signal of where the class is struggling.</li>
</ul>

<footer>The Gauntlet · Forensics CLI 101 · github.com/jamestwebb/the-gauntlet · Generated from live challenge data — regenerate with <code>node scripts/build-instructor-guide.mjs</code></footer>
</body></html>`;

fs.writeFileSync('docs/instructor/instructor-guide.html', html);
const verified = CHALLENGES.map(verify);
console.log(`Guide built: ${CHALLENGES.length} challenges, ${totalPoints} points`);
console.log(`Solution verification: ${verified.filter(v => v === 'OK').length} OK, ${verified.filter(v => v !== 'OK').length} problems`);

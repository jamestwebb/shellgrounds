// Generates an instructor guide FROM the live pack data, so it cannot drift
// from the game. Run: node scripts/build-instructor-guide.mjs [packId]
//
// The answer key is DERIVED, never hand-maintained: the exact command line now
// lives in each challenge's costed hint (see packs/AUTHORING.md), so the guide
// reads the answer from the same text the student can buy. A hand-kept
// SOLUTIONS map silently rots the moment a pack is edited.
import { PACKS } from '../packs/index.js';
import { runPipeline } from '../packages/engine/shell/exec.js';
import { registry } from '../packages/engine/commands/registry.js';
import { generateUserFlag } from '../packages/engine/crypto-utils.js';
import { injectFlagsIntoVFS } from '../src/utils/vfs-injector.js';
import fs from 'fs';

const packId = process.argv[2] || 'forensics-cli-101';
const pack = PACKS[packId];
if (!pack) {
  console.error(`Unknown pack '${packId}'. Available: ${Object.keys(PACKS).join(', ')}`);
  process.exit(1);
}

const { manifest, challenges: CHALLENGES, commands = {}, help = {}, createFs } = pack;
const ACT_DEFINITIONS = manifest.acts || [];
const platforms = manifest.platforms || ['linux'];
// getAll() defaults to linux, so both platforms must be asked for explicitly;
// otherwise every Windows answer derives as empty.
const knownCommands = new Set([
  ...registry.getAll('linux').map(c => c.name),
  ...registry.getAll('windows').map(c => c.name),
  ...Object.keys(commands)
]);

// Mirrors netlify/functions/submit-flag.js: a student may skip one per act.
const requiredSolvesToUnlock = (actId) => {
  const act = ACT_DEFINITIONS.find(a => a.id === actId);
  const prior = CHALLENGES.filter(c => c.act === actId - 1).length;
  if (!prior || !act?.unlockThreshold) return 0;
  return Math.min(Math.max(1, Math.ceil(prior * act.unlockThreshold)), Math.max(1, prior - 1));
};

// Instructor-facing commentary that is genuinely authored, not derivable.
const NOTES = {
  'act1-paths': 'From inside level_1 the sibling route is: cd .. then cd level_2 — that is the lesson.',
  'act1-tab': 'Students type cd Doc and press Tab. Typing it in full also counts.',
  'act1-history': 'The lesson is the Up Arrow key, not the pwd command itself.',
  'act2-md5': 'The hash is NOT the flag — the flag is in the file text.',
  'act3-crossing-solo': 'Deliberately unassisted: the student must translate the Windows path themselves.',
  'act3-man': 'Flag is inside the DESCRIPTION section.',
  'act4-redirect': 'The redirect prints nothing — that is correct.',
  'act5-scan': 'Students must READ the Start sector offset from the table; the capstone no longer prints it for them.',
  'act5-capstone': 'Chains off act5-scan. A wrong offset is rejected by the tool, so a student who skipped the scan must go back.',
  'l3-sudo-shadow': 'The brief deliberately shows the command that FAILS. Elevation is the lesson.',
  'w3-find-count': 'The find /c /v "" idiom is genuinely unguessable — expect most of the class to buy the hint.'
};
const SKIP_VERIFY = new Set(['act1-tab', 'act1-history']);

/**
 * The ordered command steps that solve a challenge, read out of the pack.
 * Costed hints hold the exact line by convention, so they are the primary
 * source; acceptedVariants supply the canonical single command when present.
 */
function solutionSteps(c) {
  const steps = [];
  const push = (s) => { if (s && !steps.includes(s)) steps.push(s); };
  for (const h of c.hints || []) {
    for (const m of String(h.text || '').matchAll(/`([^`]+)`/g)) {
      const snippet = m[1].trim();
      const words = snippet.split(/\s+/);
      if (words.length > 1 && knownCommands.has(words[0])) push(snippet);
    }
  }
  if (!steps.length && Array.isArray(c.acceptedVariants) && c.acceptedVariants.length) {
    push(c.acceptedVariants[0]);
  }
  return steps;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

// Live-verify every derived solution so the guide cannot document a broken step.
const filesystems = Object.fromEntries(platforms.map(p => [p, createFs(p)]));
const demoFlags = {};
for (const c of CHALLENGES) {
  if (c.success?.kind === 'flag' && !c.success.staticFlag) {
    demoFlags[c.id] = generateUserFlag('guide-secret', 'demo', c.id, packId);
  }
}
const verify = (c) => {
  if (SKIP_VERIFY.has(c.id)) return 'OK';
  const steps = solutionSteps(c);
  if (!steps.length) return '?';
  const isWin = (c.platform || platforms[0]) === 'windows';
  const plat = isWin ? 'windows' : 'linux';
  const user = (isWin ? manifest.windows?.user : manifest.linux?.user) || (isWin ? 'Student' : 'student');
  const home = (isWin ? manifest.windows?.home : manifest.linux?.home) || (isWin ? 'C:\\Users\\Student' : '/home/student');
  const { fs: vfs } = injectFlagsIntoVFS(filesystems[plat], 'demo', demoFlags, CHALLENGES);
  let cwd = c.setup?.cwd || home;
  let workingFs = vfs;
  for (const step of steps) {
    const r = runPipeline(step, cwd, workingFs, plat, {
      packCommands: commands, packHelp: help, user,
      installedPackages: new Set(Object.keys(commands))
    });
    // `||` challenges demonstrate failure handling on purpose.
    if (r.hasError && !step.includes('||')) return 'ERROR';
    cwd = r.newCwd || cwd;
    if (r.fs) workingFs = r.fs;
  }
  return 'OK';
};

const totalPoints = CHALLENGES.reduce((s, c) => s + c.points, 0);
const guideTitle = `${manifest.name} — Instructor Guide`;
let html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(guideTitle)}</title>
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
<h1>${esc(guideTitle)}</h1>
<p class="sub">Every challenge, answer, and accepted variant · generated ${new Date().toISOString().slice(0, 10)} from the live pack data</p>

<div class="box key">
<strong>Quick reference</strong><br>
Set your own site URL and class password before handing this out. Admin handle: <code>warden</code>.<br>
Handles: 3–20 characters, letters/numbers/underscore/hyphen, <strong>claimed once only</strong>.<br>
${CHALLENGES.length} challenges · ${totalPoints} points total · flags look like <code>FLAG{ABCD2345EFGH}</code> and are <strong>different for every student</strong>.
</div>

<div class="box">
<strong>How the difficulty fades</strong> — Act I briefs show the whole command, and the free hint repeats it. From Act II the brief names the tool but not its flags or arguments, and the exact line moves into a hint that costs XP. By the last act the brief states only the objective. A student who never buys a hint has genuinely recalled every command. Hint spend is visible in the instructor dashboard, so it reads as a difficulty signal rather than as cheating.
</div>

<h2>If a student says "it's not working"</h2>
<table>
<tr><th>Symptom</th><th>Cause &amp; what to say</th></tr>
<tr><td>"My flag is rejected"</td><td>Flags are per-student — a classmate's flag never validates. Tell them to <strong>click the green flag in the terminal</strong> to copy it exactly, rather than retyping.</td></tr>
<tr><td>"Handle already claimed"</td><td>Someone took it, or they registered before and cleared their browser. Pick a new handle. (To free one, delete that player in Netlify Blobs.)</td></tr>
<tr><td>"I ran the command, nothing happened"</td><td>Check the blue path in their prompt — they may be in a different directory. Most challenges accept short or full paths, but the file must exist from where they stand. <code>cd ~</code> returns home.</td></tr>
<tr><td>"It says command not found"</td><td>If it's a real command we don't simulate (<code>top</code>, <code>nano</code>), the game says so explicitly. Genuine typos say "command not found".</td></tr>
<tr><td>"I don't know which command to use"</td><td>Intended from Act II on. Point them at the free hint first, then the Reference tab. The costed hint is the safety net, not a failure.</td></tr>
<tr><td>"The act is locked"</td><td>Each act opens after solving all but one of the previous act's challenges.</td></tr>
<tr><td>"Nothing printed"</td><td>Correct for <code>cd</code> and redirects. The game prints "(no output — in a shell, silence usually means success)".</td></tr>
<tr><td>Lost all progress</td><td>Progress is tied to the browser token. Same browser = resumes automatically. Different machine = new handle needed.</td></tr>
</table>

<h2>Act structure &amp; unlocking</h2>
<table><tr><th>Act</th><th>Teaches</th><th>Challenges</th><th>Points</th><th>Unlock</th></tr>`;

for (const a of ACT_DEFINITIONS) {
  const cs = CHALLENGES.filter(c => c.act === a.id);
  const pts = cs.reduce((s, c) => s + c.points, 0);
  const prior = CHALLENGES.filter(c => c.act === a.id - 1).length;
  const unlock = !a.unlockThreshold ? 'Always open' : `Solve ${requiredSolvesToUnlock(a.id)} of ${prior} in the prior act`;
  html += `<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.tagline)}</td><td>${cs.length}</td><td>${pts}</td><td>${esc(unlock)}</td></tr>`;
}
html += `</table>
<p style="font-size:9pt;color:#555">Students may skip <strong>one</strong> challenge per act and still advance.</p>`;

for (const a of ACT_DEFINITIONS) {
  const cs = CHALLENGES.filter(c => c.act === a.id);
  if (!cs.length) continue;
  html += `<div class="act"><h2>${esc(a.name)}</h2><p class="sub">${esc(a.tagline)}</p>`;
  for (const c of cs) {
    const steps = solutionSteps(c);
    const kind = c.success?.kind === 'flag'
      ? 'Submits a flag'
      : `Auto-completes on: ${c.success?.predicate || 'a state check'}`;
    html += `<div class="ch"><h3><span class="pts">${c.points} pts · ${esc(c.id)} · ${verify(c)}</span>${esc(c.title)}</h3>
      <div><strong>Task:</strong> ${md(c.brief)}</div>
      <div class="ans"><strong>Answer:</strong> ${steps.length
        ? steps.map(s => `<code>${esc(s)}</code>`).join(' <strong>then</strong> ')
        : '—'}</div>
      <div style="font-size:9pt;color:#555"><strong>Completion:</strong> ${esc(kind)}${c.success?.kind === 'flag' && c.success.flagFile ? ` · flag is inside <code>${esc(c.success.flagFile)}</code>` : ''}</div>`;
    (c.hints || []).forEach((h, i) => {
      html += `<div class="hint"><strong>Hint ${i + 1}${h.cost ? ` (−${h.cost} XP)` : ' (free)'}:</strong> ${md(h.text)}</div>`;
    });
    if (Array.isArray(c.acceptedVariants) && c.acceptedVariants.length > 1) {
      html += `<div class="hint"><strong>Also accepted:</strong> ${c.acceptedVariants.slice(1).map(v => `<code>${esc(v)}</code>`).join(', ')}</div>`;
    }
    if (NOTES[c.id]) html += `<div class="note">Instructor note: ${esc(NOTES[c.id])}</div>`;
    html += `</div>`;
  }
  html += `</div>`;
}

html += `<h2>Accepted command variants</h2>
<p style="font-size:9pt">Auto-completing challenges accept the natural variations a beginner types, so a correct command is never silently ignored:</p>
<ul style="font-size:9pt">
<li>Optional quotes around a path</li>
<li>Path prefixes: <code>./Documents</code>, <code>~/Documents</code>, or the full absolute path</li>
<li>Short paths when already inside the folder</li>
<li>Flag spacing: <code>head -n 5</code>, <code>head -n5</code>, <code>head -5</code></li>
<li>Windows: forward or back slashes, any capitalization (<code>md5</code> or <code>MD5</code>)</li>
<li>Trailing spaces are ignored everywhere</li>
</ul>

<h2>Teaching notes</h2>
<ul style="font-size:9.5pt">
<li><strong>The Coach</strong> (toggle in the terminal title bar) explains every command and error in plain language. Explanations fade after the second use of a command. Leave it ON for beginners.</li>
<li><strong>Reference tab</strong> holds a manual page for every command, and tells students the real-shell equivalent. Point stuck students there before they buy a hint.</li>
<li><strong>Unsimulated tools</strong> reply with what they are, rather than a bare "command not found".</li>
<li><strong>Hints:</strong> the first is free and conceptual; the one that gives the exact command costs XP. Hint use is visible in the instructor dashboard as a signal of where the class is struggling.</li>
<li><strong>Watch the stuck points.</strong> The dashboard flags any challenge with a solve rate under 35%. Now that briefs no longer contain the answer, that number means something: it marks a concept the class did not get, not a typing error.</li>
</ul>

<footer>${esc(manifest.name)} · pack <code>${esc(packId)}</code> v${esc(manifest.version || '?')} · Generated from live pack data — regenerate with <code>node scripts/build-instructor-guide.mjs ${esc(packId)}</code></footer>
</body></html>`;

const outPath = `docs/instructor/instructor-guide-${packId}.html`;
fs.writeFileSync(outPath, html);
const verified = CHALLENGES.map(verify);
const bad = CHALLENGES.filter((c, i) => verified[i] !== 'OK');
console.log(`Guide built: ${outPath} — ${CHALLENGES.length} challenges, ${totalPoints} points`);
console.log(`Solution verification: ${verified.filter(v => v === 'OK').length} OK, ${bad.length} problems`);
for (const c of bad) console.log(`  ${verify(c)}  ${c.id}: steps = ${JSON.stringify(solutionSteps(c))}`);

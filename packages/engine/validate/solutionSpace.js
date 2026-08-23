// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Does this challenge accept the other correct ways of doing it?
//
// A challenge grades on two different kinds of thing, and only one of them is
// about whether the student was right:
//
//   OUTCOME checks -- outputEquals, fileExists, cwdIs -- ask what happened.
//   Any command producing that result passes, which is what makes a challenge
//   accept solutions its author never thought of.
//
//   TEXT checks -- commandMatches -- ask what was typed. They exist for a good
//   reason: a challenge teaching `find` should not be passable with `ls -R |
//   grep`, and no outcome check can tell those apart. But they are written by
//   hand, and a pattern that is one character tighter than the author meant
//   rejects a student who was completely right.
//
// That is not hypothetical. The same challenge, written twice:
//
//   linux-fundamentals/l1-pwd    ^pwd\b.*$     `pwd -P` accepted
//   forensics-cli-101/act1-pwd   ^pwd\s*$      `pwd -P` REJECTED
//
// Identical output, identical understanding, opposite verdicts. Nobody chose
// that; two people wrote the same idea and one anchored the pattern.
//
// ── How this finds them ─────────────────────────────────────────────────────
//
// Every variant tried here is a SEMANTICS-PRESERVING TRANSFORMATION OF A
// COMMAND THE CHALLENGE ALREADY ACCEPTS. That constraint is the whole design.
// It means a report can be trusted: `cat file` is never generated for a `head`
// challenge, because it is not a rewriting of `head -n 2 file`, so the text
// check that legitimately blocks it is never flagged.
//
// A variant is reported as unfairly rejected when it passes EVERY outcome check
// and fails only on a text check. It did the job and was refused for its
// spelling.

/** Predicates that ask what happened, rather than what was typed. */
export const OUTCOME_PREDICATES = new Set([
  'outputEquals', 'outputContains', 'outputMatches', 'outputLineCountIs',
  'lineCountAtLeast', 'fileExists', 'fileMatches', 'fileContains', 'dirExists',
  'fileHasMode', 'cwdIs', 'exitStatusIs', 'fileAbsent'
]);

/** Predicates that ask what the student typed. */
export const TEXT_PREDICATES = new Set(['commandMatches', 'commandEquals']);

/**
 * Splits a success predicate into the part about the result and the part about
 * the wording. Either may be null: a challenge can have only one kind.
 */
export function splitPredicate(success) {
  if (!success || typeof success !== 'object') return { outcome: null, text: null };

  const outcome = [];
  const text = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const key of ['predicates', 'allOf', 'anyOf']) {
      if (Array.isArray(node[key])) { node[key].forEach(visit); return; }
    }
    if (!node.predicate) return;
    if (TEXT_PREDICATES.has(node.predicate)) text.push(node);
    else if (OUTCOME_PREDICATES.has(node.predicate)) outcome.push(node);
  };
  visit(success);

  const wrap = (list) => (list.length === 0 ? null
    : list.length === 1 ? list[0]
      : { predicate: 'allOf', predicates: list });
  return { outcome: wrap(outcome), text: wrap(text) };
}

// Windows switches start with a slash, so a naive `startsWith('-')` reads
// `/a` as an operand and happily "quotes" it into `dir "/a"` -- which cmd does
// not treat the same way at all. A generator that produces non-equivalents
// produces false reports, and a report with false entries gets ignored whole.
const isFlag = (t, isWindows) =>
  (/^-/.test(t) && t !== '-' && t !== '--') || (isWindows && /^\/[A-Za-z]/.test(t));

const REDIRECTS = new Set(['>', '>>', '<', '|', '2>', '&&', '||', ';']);

/**
 * Flags that a command accepts and that provably do not change its result in
 * this simulator, so adding one is a rewriting rather than a different command.
 * Deliberately tiny: every entry is a claim that has to be true.
 */
export const EQUIVALENT_ADDITIONS = {
  // No node in this filesystem is a symlink, so the logical and physical
  // working directory are the same string. `pwd`, `pwd -L` and `pwd -P` cannot
  // differ here, and the command's own source says so.
  pwd: ['-L', '-P']
};

/**
 * Semantics-preserving rewritings of one command line.
 *
 * @param {string} command  a command the challenge is known to accept
 * @param {object} opts     { flagSpecs, home } — flagSpecs supplies long names
 * @returns {string[]} variants, excluding the original
 */
export function expandVariants(command, opts = {}) {
  const { flagSpecs = {}, home = null, isWindows = false } = opts;
  const line = String(command).trim();
  if (!line) return [];

  // Anything past a redirect or a pipe belongs to the shell. Rewriting it is a
  // different question, so this only ever touches the first stage.
  const tokens = line.split(/\s+/);
  const cut = tokens.findIndex(t => REDIRECTS.has(t));
  const head = cut === -1 ? tokens : tokens.slice(0, cut);
  const tail = cut === -1 ? [] : tokens.slice(cut);
  const rebuild = (parts) => [...parts, ...tail].join(' ');

  const name = head[0];
  const args = head.slice(1);
  const out = new Set();

  // 1. Quoting an operand. A shell strips the quotes before the command sees
  //    them, so `grep active f` and `grep "active" f` are the same call.
  args.forEach((arg, i) => {
    if (isFlag(arg, isWindows) || /["'*?\[\]$]/.test(arg)) return;
    // cmd.exe does not strip quotes the way a POSIX shell does, so quoting is
    // only claimed to be equivalent on Linux.
    if (isWindows) return;
    for (const q of ['"', "'"]) {
      const copy = [...args];
      copy[i] = `${q}${arg}${q}`;
      out.add(rebuild([name, ...copy]));
    }
  });

  // 2. Path spelling. `./x` and an absolute path resolve to the same node.
  args.forEach((arg, i) => {
    // Windows path spelling is a different problem -- drive letters, backslash
    // separators, and a home that is not a prefix of a relative path. Mixing
    // the two produced `C:\\Users\\Examiner/evidence\\evidence.img`, which is
    // not a rewriting of anything. Linux only, until it is worth doing properly.
    if (isWindows) return;
    if (isFlag(arg, isWindows) || arg.startsWith('/') || arg.startsWith('./') || arg.startsWith('~')) return;
    if (!/[a-zA-Z0-9]/.test(arg) || /["'*?]/.test(arg)) return;
    const copy = [...args];
    copy[i] = `./${arg}`;
    out.add(rebuild([name, ...copy]));
    if (home) {
      const abs = [...args];
      abs[i] = `${home.replace(/\/$/, '')}/${arg}`;
      out.add(rebuild([name, ...abs]));
    }
  });

  // 3. Combined short flags: -la, -al, -l -a all set the same two flags.
  args.forEach((arg, i) => {
    if (!/^-[a-zA-Z]{2,}$/.test(arg)) return;
    const letters = arg.slice(1).split('');
    const split = [...args];
    split.splice(i, 1, ...letters.map(l => `-${l}`));
    out.add(rebuild([name, ...split]));
    if (letters.length === 2) {
      const swapped = [...args];
      swapped[i] = `-${letters[1]}${letters[0]}`;
      out.add(rebuild([name, ...swapped]));
    }
  });

  // 4. Long form. The command's own flag table names it, so this is not a guess.
  args.forEach((arg, i) => {
    const m = /^-([a-zA-Z])$/.exec(arg);
    if (!m) return;
    const long = flagSpecs[m[1]]?.long;
    if (!long) return;
    const copy = [...args];
    copy[i] = `--${long}`;
    out.add(rebuild([name, ...copy]));
  });

  // 5. A flag that this command accepts and that cannot change the answer.
  for (const extra of EQUIVALENT_ADDITIONS[name] || []) {
    if (args.includes(extra)) continue;
    out.add(rebuild([name, extra, ...args]));
  }

  out.delete(line);
  return [...out];
}

/**
 * Runs every rewriting of every accepted solution and reports the ones that did
 * the job and were refused anyway.
 *
 * The caller injects `runPipeline` and `evaluatePredicate` so this module stays
 * free of the shell and the grader, and so a test can drive it directly.
 *
 * @returns {{ challengeId, tried, unfair: Array<{variant, from, textPattern}> }}
 */
export function auditChallenge(pack, challenge, deps) {
  const { runPipeline, evaluatePredicate, flagSpecsFor = () => ({}) } = deps;
  const { outcome, text } = splitPredicate(challenge.success);
  const result = { challengeId: challenge.id, tried: 0, unfair: [] };

  // With no text check there is nothing to be unfair: any command producing the
  // outcome already passes.
  if (!text || !outcome) return result;

  const accepted = challenge.acceptedVariants || [];
  if (!accepted.length) return result;

  const platform = challenge.platform || pack.manifest.platforms?.[0] || 'linux';
  const isWindows = platform === 'windows';
  const home = isWindows ? pack.manifest.windows?.home : pack.manifest.linux?.home;
  const cwd = challenge.setup?.cwd || home;

  for (const solution of accepted) {
    const name = String(solution).trim().split(/\s+/)[0];
    const variants = expandVariants(solution, {
      flagSpecs: flagSpecsFor(name, platform), home, isWindows
    });

    for (const variant of variants) {
      let fs;
      try { fs = pack.createFs(platform); } catch { continue; }

      let res;
      try { res = runPipeline(variant, cwd, fs, isWindows ? 'windows' : 'linux', {}); }
      catch { continue; }
      result.tried++;

      const ctx = {
        fs: res.fs || fs,
        cwd: res.newCwd || cwd,
        commandText: variant,
        stdout: res.stdout,
        stderr: res.stderr,
        output: res.output,
        status: res.status,
        isWindows,
        trusted: true
      };

      let didTheJob = false;
      let accepted_ = false;
      try {
        didTheJob = !res.hasError && evaluatePredicate(outcome, ctx);
        accepted_ = !res.hasError && evaluatePredicate(challenge.success, ctx);
      } catch { continue; }

      // The variant produced the required result and was still refused. The
      // only thing left to refuse it on is how it was spelled.
      if (didTheJob && !accepted_) {
        result.unfair.push({
          variant,
          from: solution,
          textPattern: text.predicate === 'commandMatches' ? text.pattern : JSON.stringify(text)
        });
      }
    }
  }
  return result;
}

/** Every challenge in a pack. Returns only the ones with something to report. */
export function auditPack(pack, deps) {
  const reports = [];
  for (const challenge of pack.challenges) {
    const r = auditChallenge(pack, challenge, deps);
    if (r.unfair.length) reports.push(r);
  }
  return reports;
}

// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Tokenizer for The Gauntlet CLI engine supporting quoting, pipes, and redirection

/**
 * Tokenizes a raw command line into command stages connected by pipes,
 * with argument arrays, quoting resolution, and stdout/stderr redirection.
 *
 * @param {string} input - Raw user input string
 * @returns {object} { pipeline: Array<Stage>, error?: string }
 */
export function tokenizeCommandLine(input) {
  if (!input || typeof input !== 'string') {
    return { pipeline: [] };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { pipeline: [] };
  }

  // Check for special simulated apt-get compound command
  if (/sudo\s+apt-get\s+update\s+&&\s+sudo\s+apt-get\s+install/i.test(trimmed)) {
    return {
      pipeline: [{
        argv: ['sudo', 'apt-get', 'install', '-y', 'tracker'],
        raw: trimmed,
        isCompoundApt: true
      }]
    };
  }

  // Check for unsupported shell features with informative error
  const unsupportedChecks = [
    { regex: /;\s*\S/, msg: "bash: syntax error near ';': feature not simulated here — you'll meet it on the WorkBench VM" },
    { regex: /&&\s*\S/, msg: "bash: syntax error near '&&': feature not simulated here — you'll meet it on the WorkBench VM" },
    { regex: /\|\|\s*\S/, msg: "bash: syntax error near '||': feature not simulated here — you'll meet it on the WorkBench VM" },
    { regex: /\$\(/, msg: "bash: command substitution '$()' is not simulated here — you'll meet it on the WorkBench VM" },
    { regex: /`[^`]+`/, msg: "bash: backtick substitution is not simulated here — you'll meet it on the WorkBench VM" },
    { regex: /(?<!2)>(?!>)\s*&/, msg: "bash: unsupported redirection syntax — you'll meet advanced redirection on the WorkBench VM" },
  ];

  // Test only the UNQUOTED parts: `grep "error && warning" file` is a valid
  // search, not an attempt to use the && operator.
  const unquoted = trimmed.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  for (const check of unsupportedChecks) {
    if (check.regex.test(unquoted)) {
      return { error: check.msg, pipeline: [] };
    }
  }

  // State machine to split on top-level pipes '|' while respecting quotes
  const stages = [];
  let currentSegment = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let isEscaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (isEscaped) {
      currentSegment += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      // Lookahead: check if this is an alternation inside grep pattern like \|
      // If we are inside double quotes or outside quotes, preserve escape for regex or handle next char
      isEscaped = true;
      currentSegment += char;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      currentSegment += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      currentSegment += char;
      continue;
    }

    if (char === '|' && !inSingleQuote && !inDoubleQuote) {
      // Pipe operator
      if (currentSegment.trim() === '') {
        return { error: "bash: syntax error near unexpected token '|'", pipeline: [] };
      }
      stages.push(currentSegment.trim());
      currentSegment = '';
      continue;
    }

    currentSegment += char;
  }

  if (inSingleQuote || inDoubleQuote) {
    return { error: 'bash: syntax error: unmatched quote detected', pipeline: [] };
  }

  if (currentSegment.trim() !== '') {
    stages.push(currentSegment.trim());
  } else if (stages.length > 0) {
    return { error: "bash: syntax error near unexpected token '|'", pipeline: [] };
  }

  // Now parse each stage for tokens and redirection
  const parsedStages = [];

  for (const stageStr of stages) {
    const stageResult = parseSingleStage(stageStr);
    if (stageResult.error) {
      return { error: stageResult.error, pipeline: [] };
    }
    parsedStages.push(stageResult);
  }

  return { pipeline: parsedStages };
}

/**
 * Quote-aware argv split for Windows CMD, which has no pipes/redirection in
 * this simulator but does have quoted paths ("Program Files").
 */
export function splitArgsRespectingQuotes(input) {
  const args = [];
  let cur = '';
  let inS = false, inD = false, has = false;
  for (const ch of (input || '')) {
    if (ch === "'" && !inD) { inS = !inS; has = true; continue; }
    if (ch === '"' && !inS) { inD = !inD; has = true; continue; }
    if (/\s/.test(ch) && !inS && !inD) {
      if (cur.length > 0 || has) { args.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0 || has) args.push(cur);
  return args;
}

// A redirect target may be quoted to contain spaces: > "my file.txt"
function unquoteTarget(raw) {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw.replace(/['"]/g, '');
}

/**
 * Parses a single command stage (e.g. `grep -v "root" > /tmp/output.txt 2>/dev/null`)
 */
function parseSingleStage(raw) {
  const tokens = [];
  let currentToken = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let isEscaped = false;

  let redirectOut = null; // { file: string, append: boolean }
  let redirectErr = null; // 'null' | 'stdout' | { file: string, append: boolean }

  const pushToken = () => {
    if (currentToken.length > 0) {
      tokens.push(currentToken);
      currentToken = '';
    }
  };

  let i = 0;
  while (i < raw.length) {
    const char = raw[i];

    if (isEscaped) {
      currentToken += char;
      isEscaped = false;
      i++;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      // In double quotes or unquoted, escape next character
      // Keep escape if it is followed by another char, but if it is escaping quotes, resolve it
      const nextChar = raw[i + 1];
      if (nextChar === '"' || nextChar === "'" || nextChar === ' ' || nextChar === '\\') {
        currentToken += nextChar;
        i += 2;
      } else {
        currentToken += char;
        isEscaped = true;
        i++;
      }
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      i++;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      i++;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      // Stderr redirection: 2>&1, 2>/dev/null, 2> file, 2>> file.
      // The '2' only counts as a file descriptor when it starts its own token
      // (bash: `abc2>out` redirects stdout of the word `abc2`, not stderr).
      if (char === '2' && raw[i + 1] === '>' && currentToken === '') {
        if (raw.substring(i, i + 4) === '2>&1') {
          redirectErr = 'stdout';
          i += 4;
          continue;
        }
        let append = false;
        let offset = 2;
        if (raw[i + 2] === '>') {
          append = true;
          offset = 3;
        }
        const targetMatch = raw.slice(i + offset).match(/^\s*("[^"]*"|'[^']*'|\S+)/);
        if (!targetMatch) {
          return { error: "bash: syntax error near unexpected token 'newline'" };
        }
        const file = unquoteTarget(targetMatch[1]);
        redirectErr = file === '/dev/null' ? 'null' : { file, append };
        i += offset + targetMatch[0].length;
        continue;
      }

      // Stdout redirection: > file or >> file. Parsing continues afterward so a
      // trailing `2>/dev/null` (the Case 005 idiom) is still honored.
      if (char === '>') {
        pushToken();
        let append = false;
        let offset = 1;
        if (raw[i + 1] === '>') {
          append = true;
          offset = 2;
        }
        const targetMatch = raw.slice(i + offset).match(/^\s*("[^"]*"|'[^']*'|\S+)/);
        if (!targetMatch) {
          return { error: "bash: syntax error near unexpected token 'newline'" };
        }
        const file = unquoteTarget(targetMatch[1]);
        redirectOut = { file, append };
        i += offset + targetMatch[0].length;
        continue;
      }

      // Whitespace delimiter
      if (/\s/.test(char)) {
        pushToken();
        i++;
        continue;
      }
    }

    currentToken += char;
    i++;
  }

  pushToken();

  if (tokens.length === 0 && !redirectOut) {
    return { error: 'bash: syntax error: empty command' };
  }

  return {
    raw,
    argv: tokens,
    redirectOut,
    redirectErr
  };
}

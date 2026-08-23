// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Shell Command Line Lexer & AST Parser for Linux Bash and Windows CMD

/**
 * Splits an unquoted string by top-level operators (;, &&, ||, &)
 */
export function splitCommandList(input, isWindows = false) {
  const commands = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let isEscaped = false;

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (isEscaped) {
      cur += char;
      isEscaped = false;
      i++;
      continue;
    }

    if (char === '\\' && !inSingle && !isWindows) {
      isEscaped = true;
      cur += char;
      i++;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += char;
      i++;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += char;
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      // Check for && or ||
      if (char === '&' && input[i + 1] === '&') {
        if (cur.trim()) {
          commands.push({ raw: cur.trim(), op: '&&' });
          cur = '';
        }
        i += 2;
        continue;
      }
      if (char === '|' && input[i + 1] === '|') {
        if (cur.trim()) {
          commands.push({ raw: cur.trim(), op: '||' });
          cur = '';
        }
        i += 2;
        continue;
      }
      if (char === ';') {
        if (cur.trim()) {
          commands.push({ raw: cur.trim(), op: ';' });
          cur = '';
        }
        i++;
        continue;
      }
      if (char === '&' && input[i + 1] !== '&' && isWindows) {
        // Windows cmd single & is command separator
        if (cur.trim()) {
          commands.push({ raw: cur.trim(), op: ';' });
          cur = '';
        }
        i++;
        continue;
      }
    }

    cur += char;
    i++;
  }

  if (inSingle || inDouble) {
    return { error: 'syntax error: unmatched quote detected', list: [] };
  }

  if (cur.trim()) {
    commands.push({ raw: cur.trim(), op: null });
  }

  return { list: commands };
}

/**
 * Splits a command string on top-level pipes '|'
 */
export function splitPipes(input, isWindows = false) {
  const stages = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  let isEscaped = false;

  let i = 0;
  while (i < input.length) {
    const char = input[i];

    if (isEscaped) {
      cur += char;
      isEscaped = false;
      i++;
      continue;
    }

    if (char === '\\' && !inSingle && !isWindows) {
      isEscaped = true;
      cur += char;
      i++;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      cur += char;
      i++;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      cur += char;
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      // Check for 2>&1 |
      if (char === '2' && input.slice(i, i + 5) === '2>&1|') {
        if (!cur.trim()) return { error: "syntax error near unexpected token '|'", stages: [] };
        stages.push({ raw: cur.trim(), pipeBoth: true });
        cur = '';
        i += 5;
        continue;
      }

      if (char === '|' && input[i + 1] !== '|') {
        if (!cur.trim()) return { error: "syntax error near unexpected token '|'", stages: [] };
        stages.push({ raw: cur.trim(), pipeBoth: false });
        cur = '';
        i++;
        continue;
      }
    }

    cur += char;
    i++;
  }

  if (inSingle || inDouble) {
    return { error: 'syntax error: unmatched quote detected', stages: [] };
  }

  if (cur.trim()) {
    stages.push({ raw: cur.trim(), pipeBoth: false });
  } else if (stages.length > 0) {
    return { error: "syntax error near unexpected token '|'", stages: [] };
  }

  return { stages };
}

function unquoteTarget(raw) {
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw.replace(/['"]/g, '');
}

/**
 * Parses a single command stage into tokens and redirection descriptors
 */
export function parseSingleStage(raw, isWindows = false) {
  const rawTokens = [];
  let curPart = '';
  let inSingle = false;
  let inDouble = false;
  let isEscaped = false;

  let currentWordParts = []; // array of { type: 'unquoted'|'single'|'double', value: string }

  let redirectOut = null; // { file: string, append: boolean }
  let redirectErr = null; // 'null' | 'stdout' | { file: string, append: boolean }
  let redirectIn = null;  // { file: string } | { type: 'heredoc', content: string }

  const flushPart = (type) => {
    if (curPart.length > 0 || type === 'single' || type === 'double') {
      currentWordParts.push({ type, value: curPart });
      curPart = '';
    }
  };

  const pushWord = () => {
    if (curPart.length > 0) {
      currentWordParts.push({ type: 'unquoted', value: curPart });
      curPart = '';
    }
    if (currentWordParts.length > 0) {
      rawTokens.push(currentWordParts);
      currentWordParts = [];
    }
  };

  let i = 0;
  while (i < raw.length) {
    const char = raw[i];

    if (isEscaped) {
      curPart += char;
      isEscaped = false;
      i++;
      continue;
    }

    if (char === '\\' && !inSingle && !isWindows) {
      const nextChar = raw[i + 1];
      if (inDouble) {
        if (nextChar === '"' || nextChar === '\\' || nextChar === '$' || nextChar === '`') {
          curPart += nextChar;
          i += 2;
        } else {
          curPart += char;
          i++;
        }
      } else {
        if (nextChar) {
          curPart += nextChar;
          i += 2;
        } else {
          curPart += char;
          i++;
        }
      }
      continue;
    }

    if (char === "'" && !inDouble && !isWindows) {
      if (inSingle) {
        flushPart('single');
        inSingle = false;
      } else {
        flushPart('unquoted');
        inSingle = true;
      }
      i++;
      continue;
    }

    if (char === '"' && !inSingle) {
      if (inDouble) {
        flushPart('double');
        inDouble = false;
      } else {
        flushPart('unquoted');
        inDouble = true;
      }
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      // Stderr redirection: 2>&1, 2>/dev/null, 2>nul, 2> file, 2>> file
      if (char === '2' && raw[i + 1] === '>' && curPart === '' && currentWordParts.length === 0) {
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
          return { error: "syntax error near unexpected token 'newline'" };
        }
        const file = unquoteTarget(targetMatch[1]);
        redirectErr = (file === '/dev/null' || file.toLowerCase() === 'nul') ? 'null' : { file, append };
        i += offset + targetMatch[0].length;
        continue;
      }

      // Stdout redirection: > file, >> file, >/dev/null, >nul
      if (char === '>') {
        pushWord();
        let append = false;
        let offset = 1;
        if (raw[i + 1] === '>') {
          append = true;
          offset = 2;
        }
        const targetMatch = raw.slice(i + offset).match(/^\s*("[^"]*"|'[^']*'|\S+)/);
        if (!targetMatch) {
          return { error: "syntax error near unexpected token 'newline'" };
        }
        const file = unquoteTarget(targetMatch[1]);
        redirectOut = { file, append };
        i += offset + targetMatch[0].length;
        continue;
      }

      // Stdin redirection: < file or << delimiter
      if (char === '<') {
        pushWord();
        let offset = 1;
        let isHeredoc = false;
        if (raw[i + 1] === '<') {
          isHeredoc = true;
          offset = 2;
        }
        const targetMatch = raw.slice(i + offset).match(/^\s*("[^"]*"|'[^']*'|\S+)/);
        if (!targetMatch) {
          return { error: "syntax error near unexpected token 'newline'" };
        }
        const fileOrDelim = unquoteTarget(targetMatch[1]);
        if (isHeredoc) {
          redirectIn = { type: 'heredoc', content: '' };
        } else {
          redirectIn = { file: fileOrDelim };
        }
        i += offset + targetMatch[0].length;
        continue;
      }

      // Whitespace delimiter
      if (/\s/.test(char)) {
        pushWord();
        i++;
        continue;
      }
    }

    curPart += char;
    i++;
  }

  pushWord();

  if (rawTokens.length === 0 && !redirectOut && !redirectIn) {
    return { error: 'syntax error: empty command' };
  }

  return {
    raw,
    rawTokens,
    redirectOut,
    redirectErr,
    redirectIn
  };
}

/**
 * Parses full command line into AST with lists and pipelines
 */
export function tokenizeCommandLine(input, isWindows = false) {
  if (!input || typeof input !== 'string') {
    return { lists: [] };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { lists: [] };
  }

  const splitListRes = splitCommandList(trimmed, isWindows);
  if (splitListRes.error) {
    return { error: splitListRes.error, lists: [] };
  }

  const lists = [];

  for (const cmdItem of splitListRes.list) {
    const pipeRes = splitPipes(cmdItem.raw, isWindows);
    if (pipeRes.error) {
      return { error: pipeRes.error, lists: [] };
    }

    const stages = [];
    for (const stageObj of pipeRes.stages) {
      const stageRes = parseSingleStage(stageObj.raw, isWindows);
      if (stageRes.error) {
        return { error: stageRes.error, lists: [] };
      }
      stages.push({
        ...stageRes,
        pipeBoth: stageObj.pipeBoth
      });
    }

    lists.push({
      op: cmdItem.op,
      stages
    });
  }

  return { lists };
}

/**
 * Backward-compatible helper for quote-aware argument splitting
 */
export function splitArgsRespectingQuotes(input) {
  const parsed = parseSingleStage(input || '', true);
  if (parsed.error || !parsed.rawTokens) return [];
  return parsed.rawTokens.map(parts => parts.map(p => p.value).join(''));
}

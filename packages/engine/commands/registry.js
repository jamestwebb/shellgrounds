// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Unified Command Registry for Linux Bash and Windows CMD

import { ALL_LINUX_COMMANDS } from './linux/index.js';
import { ALL_WINDOWS_COMMANDS } from './windows/index.js';
import { isRealFlag } from './realFlags.js';

/**
 * Parses arguments against a command's flag specification.
 * Supports:
 * - short flags: -a, -la (combined), -n 5, -n5
 * - long flags: --all, --lines=5, --lines 5
 * - Windows switches: /a, /b, /s, /c:STRING
 *
 * Three-state honesty:
 * - 'implemented' -> parsed into flags object
 * - 'notSimulated' -> returns error explaining feature is unsimulated
 * - 'unknown' -> returns invalid option error (exit 2)
 *
 * The middle state was unreachable for years: all 138 declared flags said
 * 'implemented', so every REAL flag this simulator lacks fell through to
 * "invalid option -- 'e'". `grep -e` is POSIX; telling a student it is invalid
 * teaches them to distrust something they knew correctly. Passing `command`
 * lets the parser consult realFlags.js and give the middle answer where it is
 * the true one.
 */
export function parseCommandArgs(argv, flagSpecs = {}, isWindows = false, command = '') {
  const flags = {};
  const operands = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    // Double dash terminates options
    if (arg === '--') {
      operands.push(...argv.slice(i + 1));
      break;
    }

    if (isWindows && arg.startsWith('/')) {
      // Windows switch e.g. /a, /b, /s, /c:text, /hashfile
      const switchBody = arg.slice(1);
      const colonIdx = switchBody.indexOf(':');
      let switchName = colonIdx !== -1 ? switchBody.slice(0, colonIdx) : switchBody;
      let switchVal = colonIdx !== -1 ? switchBody.slice(colonIdx + 1) : true;

      // Lookup case-insensitively in flagSpecs
      let specKey = Object.keys(flagSpecs).find(k => k.toLowerCase() === switchName.toLowerCase());
      let spec = specKey ? flagSpecs[specKey] : null;

      // cmd.exe also attaches a value with no colon: `dir /ah` is `/a:h`, and
      // `dir /a-d` excludes directories. Recognise a one-letter switch whose
      // spec takes a value followed by the value itself.
      if (!spec && switchName.length > 1 && colonIdx === -1) {
        const head = Object.keys(flagSpecs).find(k => k.toLowerCase() === switchName[0].toLowerCase());
        if (head && flagSpecs[head].type === 'string') {
          specKey = head;
          spec = flagSpecs[head];
          switchVal = switchBody.slice(1);
        }
      }

      if (!spec) {
        // Unknown switch
        return {
          error: `Invalid switch - "${arg}".`,
          status: 1
        };
      }

      if (spec.status === 'notSimulated') {
        return {
          error: `Switch /${switchName} is not simulated here (see the Reference tab).`,
          status: 1
        };
      }

      // A cmd.exe switch takes its value ATTACHED — `/a:h`, `/ah`, `/c:text` —
      // never as the following word. Swallowing the next word made
      // `dir /a Documents` list the current directory instead of Documents,
      // because "Documents" was read as the attribute filter for /a.
      // A spec may opt back in with separateValue when a real tool works that way.
      if (spec.type === 'string' && spec.separateValue
          && colonIdx === -1 && switchVal === true
          && i + 1 < argv.length && !argv[i + 1].startsWith('/')) {
        switchVal = argv[++i];
      }

      flags[specKey] = switchVal;
      i++;
      continue;
    }

    if (!isWindows && arg.startsWith('--') && arg.length > 2) {
      // Long option: --lines=5 or --lines 5 or --all
      const eqIdx = arg.indexOf('=');
      const name = eqIdx !== -1 ? arg.slice(2, eqIdx) : arg.slice(2);
      let val = eqIdx !== -1 ? arg.slice(eqIdx + 1) : true;

      const specKey = Object.keys(flagSpecs).find(k => k === name || flagSpecs[k]?.long === name);
      const spec = specKey ? flagSpecs[specKey] : null;

      if (!spec) {
        // No claim is made about long options. realFlags.js holds SHORT option
        // letters, and `--bogus` shares its first letter with `ls -b`, so
        // checking it there reported an invented option as real. A guess
        // dressed as a fact is worse than the plain refusal.
        return {
          error: `unrecognized option '--${name}'`,
          status: 2
        };
      }

      if (spec.status === 'notSimulated') {
        return {
          error: `--${name} is not simulated here (see the Reference tab).`,
          status: 2
        };
      }

      if (spec.type === 'string' || spec.type === 'number') {
        if (eqIdx === -1 && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          val = argv[++i];
        }
        flags[specKey] = spec.type === 'number' ? Number(val) : String(val);
      } else {
        flags[specKey] = true;
      }
      i++;
      continue;
    }

    if (!isWindows && arg.startsWith('-') && arg.length > 1) {
      const body = arg.slice(1);

      // 0. All-digit body, e.g. -3, -1, -9. Decide in this order:
      //    a. The command declares those digits as flags (ls -1) -> fall through
      //       and let the normal short-option parse below handle them.
      //    b. The command counts lines with -n (head, tail) -> this is GNU's
      //       obsolete -NUM form, so `head -3 f` means `head -n 3 f`.
      //    c. Neither (kill -9 1234) -> keep the word as an operand.
      if (/^\d+$/.test(body)) {
        const digitsAreFlags = body.split('').every(ch => flagSpecs[ch]);
        if (!digitsAreFlags) {
          const lineSpec = flagSpecs.n;
          const countsLines = lineSpec
            && lineSpec.status === 'implemented'
            && lineSpec.long === 'lines'
            && (lineSpec.type === 'string' || lineSpec.type === 'number');

          if (countsLines) {
            flags.n = lineSpec.type === 'number' ? Number(body) : body;
          } else {
            operands.push(arg);
          }
          i++;
          continue;
        }
      }

      // 1. Check if the entire body matches a single-dash multi-character option (e.g. -name, -type in find)
      const multiSpecKey = Object.keys(flagSpecs).find(k => k === body || flagSpecs[k]?.long === body);
      if (multiSpecKey) {
        const spec = flagSpecs[multiSpecKey];
        if (spec.status === 'notSimulated') {
          return {
            error: `-${body} is not simulated here (see the Reference tab).`,
            status: 2
          };
        }
        let val = true;
        if (spec.type === 'string' || spec.type === 'number') {
          if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
            val = argv[++i];
          }
          flags[multiSpecKey] = spec.type === 'number' ? Number(val) : String(val);
        } else {
          flags[multiSpecKey] = true;
        }
        i++;
        continue;
      }

      // 2. Short option(s) e.g. -la, -n 5, -n5, -n+2, -n-2

      for (let j = 0; j < body.length; j++) {
        const char = body[j];
        const spec = flagSpecs[char];

        if (!spec) {
          return {
            // A real option this simulator has not built is not the student's
            // mistake, and must not be reported as one.
            error: isRealFlag(command, char, isWindows)
              ? `-${char} is real, but it is not simulated here (see the Reference tab).`
              : `invalid option -- '${char}'`,
            status: 2
          };
        }

        if (spec.status === 'notSimulated') {
          return {
            error: `-${char} is not simulated here (see the Reference tab).`,
            status: 2
          };
        }

        if (spec.type === 'string' || spec.type === 'number') {
          const remainder = body.slice(j + 1);
          let val = '';
          if (remainder.length > 0) {
            val = remainder;
          } else if (i + 1 < argv.length) {
            val = argv[++i];
          }
          flags[char] = spec.type === 'number' ? Number(val) : String(val);
          // The break below is what stops the cluster; nothing ever read the
          // flag that used to be set here alongside it.
          break;
        } else {
          flags[char] = true;
        }
      }

      i++;
      continue;
    }

    // Positional operand
    operands.push(arg);
    i++;
  }

  return { flags, operands };
}

export class CommandRegistry {
  constructor() {
    this.commandsByPlatform = {
      linux: new Map(),
      windows: new Map()
    };
    this.allCommandsList = [];
    this.registerDefaults();
  }

  registerDefaults() {
    for (const cmd of ALL_LINUX_COMMANDS) {
      this.register(cmd);
    }
    for (const cmd of ALL_WINDOWS_COMMANDS) {
      this.register(cmd);
    }
  }

  register(cmdDef) {
    if (!cmdDef || !cmdDef.name) {
      throw new Error('Command definition must have a name');
    }
    this.allCommandsList.push(cmdDef);
    const platforms = cmdDef.platforms || ['linux'];
    for (const plat of platforms) {
      const map = this.commandsByPlatform[plat] || (this.commandsByPlatform[plat] = new Map());
      map.set(cmdDef.name.toLowerCase(), cmdDef);
      if (Array.isArray(cmdDef.aliases)) {
        for (const alias of cmdDef.aliases) {
          map.set(alias.toLowerCase(), cmdDef);
        }
      }
    }
  }

  get(name, platform = 'linux') {
    if (!name) return null;
    const map = this.commandsByPlatform[platform];
    if (map && map.has(name.toLowerCase())) {
      return map.get(name.toLowerCase());
    }
    // Cross platform fallback if applicable
    const otherPlat = platform === 'linux' ? 'windows' : 'linux';
    const otherMap = this.commandsByPlatform[otherPlat];
    if (otherMap && otherMap.has(name.toLowerCase())) {
      const otherCmd = otherMap.get(name.toLowerCase());
      if (otherCmd.platforms && otherCmd.platforms.includes(platform)) {
        return otherCmd;
      }
    }
    return null;
  }

  getAll(platform = 'linux') {
    const map = this.commandsByPlatform[platform];
    if (!map) return [];
    const list = [];
    const seen = new Set();
    for (const cmd of map.values()) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      list.push(cmd);
    }
    return list;
  }

  getCompletions(prefix = '', platform = 'linux') {
    const pLower = prefix.toLowerCase();
    const map = this.commandsByPlatform[platform];
    if (!map) return [];
    const completions = [];
    for (const [name] of map.entries()) {
      if (name.startsWith(pLower)) {
        completions.push(name);
      }
    }
    return Array.from(new Set(completions)).sort();
  }

  getManPage(name, platform = 'linux') {
    const cmd = this.get(name, platform);
    return cmd?.man || null;
  }

  getBoundaryReport() {
    const report = {
      linux: [],
      windows: []
    };

    const seenLinux = new Set();
    const seenWin = new Set();

    for (const cmd of this.allCommandsList) {
      const entry = {
        name: cmd.name,
        usage: cmd.usage || cmd.name,
        flags: cmd.flags || {},
        platforms: cmd.platforms || ['linux'],
        description: cmd.man?.description || ''
      };

      if (entry.platforms.includes('linux') && !seenLinux.has(cmd.name)) {
        seenLinux.add(cmd.name);
        report.linux.push(entry);
      }
      if (entry.platforms.includes('windows') && !seenWin.has(cmd.name)) {
        seenWin.add(cmd.name);
        report.windows.push(entry);
      }
    }

    report.linux.sort((a, b) => a.name.localeCompare(b.name));
    report.windows.sort((a, b) => a.name.localeCompare(b.name));
    return report;
  }
}

export const registry = new CommandRegistry();


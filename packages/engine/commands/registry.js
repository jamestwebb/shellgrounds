// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Unified Command Registry for Linux Bash and Windows CMD

import { ALL_LINUX_COMMANDS } from './linux/index.js';
import { ALL_WINDOWS_COMMANDS } from './windows/index.js';

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
 */
export function parseCommandArgs(argv, flagSpecs = {}, isWindows = false) {
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
      const specKey = Object.keys(flagSpecs).find(k => k.toLowerCase() === switchName.toLowerCase());
      const spec = specKey ? flagSpecs[specKey] : null;

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

      if (spec.type === 'string' && colonIdx === -1 && i + 1 < argv.length && !argv[i + 1].startsWith('/')) {
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
      let stopParsing = false;

      for (let j = 0; j < body.length; j++) {
        const char = body[j];
        const spec = flagSpecs[char];

        if (!spec) {
          return {
            error: `invalid option -- '${char}'`,
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
          stopParsing = true;
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


// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Master Shell Execution Engine: Pipelines, Lists, Redirections, and Exit Codes

import { tokenizeCommandLine } from './tokenizer.js';
import { expandWord } from './expand.js';
import { applyRedirections } from './streams.js';
import { parseCommandArgs, registry } from '../commands/registry.js';
import { unknownCommandMessage } from '../unknown-command.js';
import { resolvePath } from '../vfs/path.js';
import { readFile, writeFile } from '../vfs/ops.js';

// The simulated machine identity. systeminfo and whoami already print this
// name, so COMPUTERNAME agrees with them. It is a property of the simulator,
// not of a content pack; a pack can still override it through context.env.
const SIM_COMPUTERNAME = 'DESKTOP-WIN10';

/**
 * Builds the starting environment for a session.
 *
 * Windows gets a cmd.exe-shaped block. Every pack-specific value is DERIVED
 * from the home directory and user the caller supplies (pack.json
 * windows.home / windows.user reach us as `cwd` and `context.user`), so each
 * pack seeds its own USERPROFILE and USERNAME and no pack's values are
 * written into this file.
 *
 * `overrides` (context.env) wins over every default, which is how a session
 * carries variables the student set with `set` into the next command.
 */
export function seedEnvironment(isWindows, home, user, cwd, overrides = {}) {
  if (!isWindows) {
    return {
      HOME: home,
      USER: user,
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: cwd,
      '?': '0',
      ...overrides
    };
  }

  const drive = /^[A-Za-z]:/.test(home) ? home.slice(0, 2) : 'C:';
  const homePath = home.slice(drive.length) || '\\';
  const localAppData = `${home}\\AppData\\Local`;

  return {
    ALLUSERSPROFILE: `${drive}\\ProgramData`,
    APPDATA: `${home}\\AppData\\Roaming`,
    // CD is a live variable: runPipeline rewrites it whenever the cwd moves.
    CD: cwd,
    COMPUTERNAME: SIM_COMPUTERNAME,
    COMSPEC: `${drive}\\Windows\\system32\\cmd.exe`,
    HOMEDRIVE: drive,
    HOMEPATH: homePath,
    LOCALAPPDATA: localAppData,
    NUMBER_OF_PROCESSORS: '1',
    OS: 'Windows_NT',
    PATH: `${drive}\\Windows\\system32;${drive}\\Windows;${drive}\\Windows\\System32\\Wbem`,
    PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.JS',
    PROCESSOR_ARCHITECTURE: 'AMD64',
    PROMPT: '$P$G',
    SYSTEMDRIVE: drive,
    SYSTEMROOT: `${drive}\\Windows`,
    TEMP: `${localAppData}\\Temp`,
    TMP: `${localAppData}\\Temp`,
    USERDOMAIN: SIM_COMPUTERNAME,
    USERNAME: user,
    USERPROFILE: home,
    WINDIR: `${drive}\\Windows`,
    '?': '0',
    ...overrides
  };
}

/**
 * Bash opens every output redirection target BEFORE it forks the command, so
 * `rm important.txt > /nodir/out.txt` never deletes the file: the open fails
 * and the command is never run. This probes each target with the same
 * writeFile() the redirection itself will use and throws the resulting fs
 * away, so the check and the later write can never disagree.
 *
 * Returns a shell-formatted error string, or null when every target opens.
 */
function probeRedirectTargets(stage, cwd, fs, isWindows, user) {
  const targets = [];
  if (stage.redirectOut && stage.redirectOut.file) targets.push(stage.redirectOut.file);
  if (stage.redirectErr && typeof stage.redirectErr === 'object' && stage.redirectErr.file) {
    targets.push(stage.redirectErr.file);
  }

  for (const file of targets) {
    if (file === '/dev/null' || file.toLowerCase() === 'nul') continue;

    const resolved = resolvePath(cwd, file, isWindows);
    // append:true with empty content never truncates an existing file, so the
    // probe is side-effect free once its returned fs is discarded.
    const probe = writeFile(fs, resolved, '', isWindows, { append: true, user });
    if (!probe.ok) {
      // writeFile reports "<reason>: <path>"; bash reports "bash: <path>: <reason>"
      const reason = String(probe.error).replace(/:\s*[^:]*$/, '');
      return isWindows ? probe.error : `bash: ${file}: ${reason}`;
    }
  }

  return null;
}

/**
 * Runs a command string through full tokenization, expansion, pipeline & list execution.
 */
/**
 * The single entry point the browser calls, wrapped so it can never throw.
 *
 * src/App.jsx calls this from a React event handler and there is no error
 * boundary anywhere in the app, so an exception here does not surface as an
 * error — the terminal silently swallows the student's command and they cannot
 * tell whether they typed something wrong. A malformed glob (`echo [`) and a
 * malformed sed expression (`sed 's/(/x/'`) both did exactly that.
 *
 * A real shell answers a bad expression with a message and a non-zero status,
 * so that is what an unexpected failure becomes here.
 */
export function runPipeline(input, cwd, fs, platform = 'linux', context = {}) {
  try {
    return runPipelineInner(input, cwd, fs, platform, context);
  } catch (err) {
    const isWin = platform === 'windows';
    const nl = isWin ? '\r\n' : '\n';
    const message = isWin
      ? `The command could not be processed.${nl}`
      : `bash: ${String(err && err.message ? err.message : err)}${nl}`;
    console.error('runPipeline failed:', err);
    return {
      output: message,
      stdout: '',
      stderr: message,
      status: 2,
      newCwd: cwd,
      fs,
      env: context.env,
      hasError: true,
      executedCommand: input
    };
  }
}

function runPipelineInner(input, cwd, fs, platform = 'linux', context = {}) {
  const isWindows = platform === 'windows';

  if (!input || !input.trim()) {
    return {
      output: '',
      stdout: '',
      stderr: '',
      status: 0,
      newCwd: cwd,
      fs,
      // Nothing ran, so the session env is unchanged. Echoing it back keeps
      // the caller's "persist res.env" rule true on every return path.
      env: context.env,
      hasError: false,
      executedCommand: input
    };
  }

  const {
    env = {},
    user = isWindows ? 'Student' : 'student',
    history = [],
    installedPackages = new Set(),
    packCommands = {},
    packHelp = {},
    packTools = {},
    unsimulatedMessage,
    unsupportedSyntaxMessage
  } = context;

  const inferredHome = isWindows
    ? (env.USERPROFILE || (cwd.includes('\\Users\\') ? cwd.split('\\').slice(0, 3).join('\\') : 'C:\\Users\\Student'))
    : (cwd.startsWith('/home/') ? '/' + cwd.split('/').slice(1, 3).join('/') : `/home/${user}`);

  // Mutable for the whole run: `set`/`export` results are folded back in so a
  // variable survives to the next stage, the next list entry, and — because
  // the final value is returned to the caller — the next command line.
  let currentEnv = seedEnvironment(isWindows, inferredHome, user, cwd, env);

  const tokenized = tokenizeCommandLine(input, isWindows);
  if (tokenized.error) {
    // Syntax the tokenizer refused because this shell does not implement it is
    // not a syntax error the student made, so it does not get bash's
    // syntax-error voice. A pack replaces the wording through
    // context.unsupportedSyntaxMessage, the same seam unsimulatedMessage uses
    // for a real command the simulator does not run; with none supplied the
    // tokenizer's own engine wording stands.
    const errorMsg = tokenized.unsupportedSyntax
      ? `${unsupportedSyntaxMessage || tokenized.error}${isWindows ? '\r\n' : '\n'}`
      : (isWindows ? `'${input.trim()}' is not recognized.\r\n` : `bash: ${tokenized.error}\n`);
    return {
      output: errorMsg,
      stdout: '',
      stderr: errorMsg,
      status: 2,
      newCwd: cwd,
      fs,
      env: currentEnv,
      hasError: true,
      executedCommand: input
    };
  }

  let currentCwd = cwd;
  let workingFs = { ...fs };
  let lastStatus = 0;
  let finalOutput = '';
  let finalStdout = '';
  let finalStderr = '';
  let clear = false;
  let installedPackage = null;
  let submitFlag = null;
  let uiNote = null;

  for (const listEntry of tokenized.lists) {
    const stages = listEntry.stages;
    let currentStdin = '';
    let stageStdout = '';
    let stageStderr = '';
    let stageStatus = 0;

    for (let sIdx = 0; sIdx < stages.length; sIdx++) {
      const stage = stages[sIdx];
      const isLastStage = sIdx === stages.length - 1;

      // 1. Expand each raw token part
      const expandedArgv = [];
      for (const tokenParts of stage.rawTokens) {
        for (const part of tokenParts) {
          const expandedParts = expandWord(part, currentCwd, workingFs, currentEnv, lastStatus, isWindows);
          expandedArgv.push(...expandedParts);
        }
      }

      if (expandedArgv.length === 0) {
        continue;
      }

      // 1b. Input redirection: `cmd < file` and heredocs feed this stage's stdin.
      // Parsed by the tokenizer as stage.redirectIn; without this wiring the
      // operator was silently ignored and `cat < file` returned nothing.
      let stageInputError = null;
      if (stage.redirectIn) {
        if (stage.redirectIn.type === 'heredoc') {
          currentStdin = stage.redirectIn.content || '';
        } else {
          const target = stage.redirectIn.file;
          const resolved = resolvePath(currentCwd, target, isWindows);
          const res = readFile(workingFs, resolved, isWindows, { user });
          if (!res.ok) {
            // readFile reports "<reason>: <path>"; bash reports "bash: <path>: <reason>"
            const reason = String(res.error).replace(/:\s*[^:]*$/, '');
            stageInputError = isWindows ? res.error : `bash: ${target}: ${reason}`;
          } else {
            currentStdin = res.content;
          }
        }
      }

      if (stageInputError) {
        // The command never runs: bash fails the redirection before exec.
        finalStderr += isWindows ? `${stageInputError}\r\n` : `${stageInputError}\n`;
        lastStatus = 1;
        stageStatus = 1;
        currentStdin = '';
        if (isLastStage) finalStdout = '';
        continue;
      }

      // 1c. Output redirection: bash opens the target BEFORE running the
      // command. If it cannot be opened the command must not run at all,
      // otherwise `rm important.txt > /nodir/out.txt` destroys the file and
      // only then reports the redirection error.
      const redirectOpenError = probeRedirectTargets(stage, currentCwd, workingFs, isWindows, user);
      if (redirectOpenError) {
        finalStderr += isWindows ? `${redirectOpenError}\r\n` : `${redirectOpenError}\n`;
        lastStatus = 1;
        stageStatus = 1;
        stageStdout = '';
        stageStderr = '';
        currentStdin = '';
        if (isLastStage) finalStdout = '';
        continue;
      }

      const commandName = expandedArgv[0];
      const commandArgs = expandedArgv.slice(1);

      // 2. Lookup command implementation
      let cmdDef = packCommands[commandName.toLowerCase()] || registry.get(commandName, platform);

      let cmdRes;
      if (!cmdDef) {
        // Unknown command honest messaging
        const msg = unknownCommandMessage(commandName, platform, { packTools, unsimulatedMessage });
        cmdRes = {
          stdout: '',
          stderr: isWindows ? `${msg}\r\n` : `${msg}\n`,
          status: 127
        };
      } else {
        // Wrapper commands (sudo, env, xargs, time...) take another command as
        // their argument. Their flags belong to the wrapped command, so parsing
        // them here would reject e.g. `sudo apt-get install pkg -y`.
        const parseRes = cmdDef.passthroughArgs
          ? { flags: {}, operands: commandArgs }
          : parseCommandArgs(commandArgs, cmdDef.flags || {}, isWindows, cmdDef.name || commandName);

        if (parseRes.error) {
          const formattedErr = isWindows
            ? `${parseRes.error}\r\n`
            : `${commandName}: ${parseRes.error}\nTry '${commandName} --help' for more information.\n`;

          cmdRes = {
            stdout: '',
            stderr: formattedErr,
            status: parseRes.status || 2
          };
        } else {
          // Execute command
          cmdRes = cmdDef.run({
            argv: [commandName, ...commandArgs],
            flags: parseRes.flags,
            operands: parseRes.operands,
            stdin: currentStdin,
            cwd: currentCwd,
            fs: workingFs,
            env: currentEnv,
            user,
            isTTY: isLastStage && !stage.redirectOut,
            context: {
              ...context,
              registry,
              packHelp,
              history,
              installedPackages
            }
          });
        }
      }

      // Update state from command execution
      if (cmdRes.newCwd) currentCwd = cmdRes.newCwd;
      if (cmdRes.fs) workingFs = cmdRes.fs;
      // A command that edits the environment (`set NAME=value`) returns the
      // whole new env. Threading it here is what makes a variable persist for
      // the rest of the session; without it `set` was a no-op.
      if (cmdRes.env) currentEnv = { ...cmdRes.env };
      // CD (cmd) and PWD (bash) always report the current directory.
      if (isWindows) currentEnv.CD = currentCwd;
      else currentEnv.PWD = currentCwd;
      if (cmdRes.clear) clear = true;
      if (cmdRes.installedPackage) installedPackage = cmdRes.installedPackage;
      if (cmdRes.submitFlag) submitFlag = cmdRes.submitFlag;
      if (cmdRes.uiNote) uiNote = cmdRes.uiNote;

      stageStdout = cmdRes.stdout || '';
      stageStderr = cmdRes.stderr || '';
      stageStatus = cmdRes.status !== undefined ? cmdRes.status : (stageStderr ? 1 : 0);

      // 3. Apply Redirections
      const redirRes = applyRedirections({
        stage,
        cwd: currentCwd,
        fs: workingFs,
        isWindows,
        user,
        stdinText: currentStdin,
        stdoutText: stageStdout,
        stderrText: stageStderr
      });

      workingFs = redirRes.fs;
      stageStdout = redirRes.stdout;
      stageStderr = redirRes.stderr;
      // A redirection that could not be opened fails the stage.
      if (redirRes.redirectFailed) {
        stageStatus = 1;
        lastStatus = 1;
      }

      if (stage.pipeBoth) {
        currentStdin = `${stageStdout}${stageStderr}`;
      } else {
        currentStdin = stageStdout;
      }
    }

    lastStatus = stageStatus;
    currentEnv['?'] = String(lastStatus);

    if (stageStderr) finalStderr = finalStderr ? `${finalStderr}${stageStderr}` : stageStderr;
    if (stageStdout) finalStdout = finalStdout ? `${finalStdout}${stageStdout}` : stageStdout;

    // Evaluate list operator (&&, ||)
    if (listEntry.op === '&&' && lastStatus !== 0) {
      break; // Short-circuit on failure
    }
    if (listEntry.op === '||' && lastStatus === 0) {
      break; // Short-circuit on success
    }
  }

  // Combine stdout and stderr for terminal presentation
  if (finalStderr && finalStdout) {
    finalOutput = `${finalStderr}${finalStdout}`;
  } else if (finalStderr) {
    finalOutput = finalStderr;
  } else {
    finalOutput = finalStdout;
  }

  const isDiffOrFindNonMatch = (lastStatus === 1 && /^(diff|findstr|find|grep)\b/i.test(input.trim()));
  const isClean = lastStatus === 0 || isDiffOrFindNonMatch;

  return {
    output: finalOutput,
    stdout: finalStdout,
    stderr: finalStderr,
    status: lastStatus,
    newCwd: currentCwd,
    fs: workingFs,
    // The caller must persist this and pass it back as context.env on the next
    // command, exactly as it already does for fs and newCwd. Without that the
    // session forgets every variable the student set.
    env: currentEnv,
    clear,
    installedPackage,
    submitFlag,
    uiNote,
    hasError: !isClean,
    executedCommand: input
  };
}

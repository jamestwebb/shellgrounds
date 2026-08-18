// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Master Shell Execution Engine: Pipelines, Lists, Redirections, and Exit Codes

import { tokenizeCommandLine } from './tokenizer.js';
import { expandWord } from './expand.js';
import { applyRedirections } from './streams.js';
import { parseCommandArgs, registry } from '../commands/registry.js';
import { unknownCommandMessage } from '../unknown-command.js';
import { ERROR_MARKERS } from '../constants.js';
import { resolvePath } from '../vfs/path.js';
import { readFile } from '../vfs/ops.js';

/**
 * Runs a command string through full tokenization, expansion, pipeline & list execution.
 */
export function runPipeline(input, cwd, fs, platform = 'linux', context = {}) {
  const isWindows = platform === 'windows';

  if (!input || !input.trim()) {
    return {
      output: '',
      stdout: '',
      stderr: '',
      status: 0,
      newCwd: cwd,
      fs,
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
    unsimulatedMessage
  } = context;

  const inferredHome = isWindows
    ? (env.USERPROFILE || (cwd.includes('\\Users\\') ? cwd.split('\\').slice(0, 3).join('\\') : 'C:\\Users\\Student'))
    : (cwd.startsWith('/home/') ? '/' + cwd.split('/').slice(1, 3).join('/') : `/home/${user}`);

  const currentEnv = {
    HOME: inferredHome,
    USER: user,
    SHELL: isWindows ? 'cmd.exe' : '/bin/bash',
    PATH: isWindows ? 'C:\\Windows\\system32;C:\\Windows' : '/usr/local/bin:/usr/bin:/bin',
    PWD: cwd,
    '?': '0',
    ...env
  };

  const tokenized = tokenizeCommandLine(input, isWindows);
  if (tokenized.error) {
    const errorMsg = isWindows ? `'${input.trim()}' is not recognized.\r\n` : `bash: ${tokenized.error}\n`;
    return {
      output: errorMsg,
      stdout: '',
      stderr: errorMsg,
      status: 2,
      newCwd: cwd,
      fs,
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
          : parseCommandArgs(commandArgs, cmdDef.flags || {}, isWindows);

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
    clear,
    installedPackage,
    submitFlag,
    uiNote,
    hasError: !isClean,
    executedCommand: input
  };
}

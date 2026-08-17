// Copyright (c) 2026 Rational Mystic LLC. All rights reserved.
// Pipeline and redirection engine for The Gauntlet

import { tokenizeCommandLine, splitArgsRespectingQuotes } from './tokenizer.js';
import { executeLinuxCommand } from './exec.linux.js';
import { executeWindowsCommand } from './exec.windows.js';
import { normalizePath, file as createFileNode } from './fs-builder.js';
import { md5, sha256Sync } from './crypto-utils.js';

/**
 * Writes or appends content to the virtual filesystem
 */
function writeToVFS(fs, targetPath, content, append = false, isWindows = false) {
  const normPath = normalizePath(targetPath, isWindows);
  const sep = isWindows ? '\\' : '/';
  const parts = normPath.split(sep).filter(Boolean);
  const fileName = parts.pop();
  const parentPath = isWindows
    ? (parts.length > 0 ? parts.join('\\') : 'C:')
    : (parts.length > 0 ? '/' + parts.join('/') : '/');

  // Ensure parent exists. Replace the parent node instead of mutating it in place:
  // the caller only shallow-copies the map, and the original node objects are shared
  // with React state — in-place pushes would corrupt the previous state snapshot.
  const existingParent = fs[parentPath];
  const parentNode = existingParent
    ? { ...existingParent, contents: [...(existingParent.contents || [])] }
    : { type: 'dir', contents: [], attrib: isWindows ? 'D' : undefined };
  if (!parentNode.contents.includes(fileName)) {
    parentNode.contents.push(fileName);
  }
  fs[parentPath] = parentNode;

  const existingNode = fs[normPath];
  const finalContent = append && existingNode ? `${existingNode.content || ''}${content}` : content;

  fs[normPath] = {
    type: 'file',
    content: finalContent,
    fileType: 'ASCII text',
    md5: md5(finalContent),
    sha256: sha256Sync(finalContent),
    attrib: isWindows ? 'A' : undefined
  };

  return fs;
}

/**
 * Runs a command line string through tokenization, multi-stage pipeline, and redirection.
 */
export function runPipeline(input, cwd, fs, platform = 'linux', context = {}) {
  const isWindows = platform === 'windows';

  if (!input || !input.trim()) {
    return {
      output: '',
      newCwd: cwd,
      fs,
      executedCommand: input
    };
  }

  // Windows top-level CMD execution (simplistic or via tokenizer)
  if (isWindows) {
    // Quote-aware: naive space-splitting destroyed `cd "Program Files"`
    const parts = splitArgsRespectingQuotes(input.trim());
    const result = executeWindowsCommand(parts, cwd, fs, '', context);
    return {
      output: result.stdout || result.stderr || '',
      newCwd: result.newCwd || cwd,
      fs,
      clear: result.clear,
      submitFlag: result.submitFlag,
      hasError: !!result.stderr,
      executedCommand: input
    };
  }

  // Linux execution with full tokenizer, pipes, and redirection
  const tokenized = tokenizeCommandLine(input);

  if (tokenized.error) {
    return {
      output: tokenized.error,
      newCwd: cwd,
      fs,
      hasError: true,
      executedCommand: input
    };
  }

  const stages = tokenized.pipeline;
  if (stages.length === 0) {
    return {
      output: '',
      newCwd: cwd,
      fs,
      executedCommand: input
    };
  }

  let currentStdin = '';
  let finalStdout = '';
  let finalStderr = '';
  let currentCwd = cwd;
  let workingFs = { ...fs };
  let installedPackage = null;
  let submitFlag = null;
  let clear = false;

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const isLastStage = i === stages.length - 1;

    // Execute this stage command
    const res = executeLinuxCommand(
      stage.argv,
      currentCwd,
      workingFs,
      currentStdin,
      {
        ...context,
        installedPackages: context.installedPackages || new Set()
      }
    );

    currentCwd = res.newCwd || currentCwd;
    if (res.clear) clear = true;
    if (res.installedPackage) installedPackage = res.installedPackage;
    if (res.submitFlag) submitFlag = res.submitFlag;

    let stageStdout = res.stdout || '';
    let stageStderr = res.stderr || '';

    // Handle stderr redirection
    if (stage.redirectErr === 'null') {
      stageStderr = '';
    } else if (stage.redirectErr === 'stdout') {
      stageStdout = stageStdout ? `${stageStdout}\n${stageStderr}` : stageStderr;
      stageStderr = '';
    } else if (typeof stage.redirectErr === 'object' && stage.redirectErr !== null) {
      const errTarget = stage.redirectErr.file.startsWith('/') ? stage.redirectErr.file : `${currentCwd}/${stage.redirectErr.file}`;
      workingFs = writeToVFS(workingFs, errTarget, stageStderr + '\n', stage.redirectErr.append, false);
      stageStderr = '';
    }

    // Handle stdout redirection
    if (stage.redirectOut) {
      const outTarget = stage.redirectOut.file.startsWith('/') ? stage.redirectOut.file : `${currentCwd}/${stage.redirectOut.file}`;
      workingFs = writeToVFS(workingFs, outTarget, stageStdout ? stageStdout + '\n' : '', stage.redirectOut.append, false);
      stageStdout = ''; // Suppressed from pipeline downstream and terminal
    }

    if (stageStderr) {
      finalStderr = finalStderr ? `${finalStderr}\n${stageStderr}` : stageStderr;
    }

    if (isLastStage) {
      finalStdout = stageStdout;
    } else {
      currentStdin = stageStdout;
    }
  }

  // Combine stdout and stderr for terminal presentation
  let combinedOutput = '';
  if (finalStderr && finalStdout) {
    combinedOutput = `${finalStderr}\n${finalStdout}`;
  } else if (finalStderr) {
    combinedOutput = finalStderr;
  } else {
    combinedOutput = finalStdout;
  }

  return {
    output: combinedOutput,
    newCwd: currentCwd,
    fs: workingFs,
    installedPackage,
    submitFlag,
    clear,
    hasError: !!finalStderr,
    executedCommand: input
  };
}

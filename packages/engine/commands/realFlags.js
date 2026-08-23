// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Which flags are real, whether or not this simulator implements them.
//
// The parser has always had three honest answers available:
//
//   implemented   -> parse it
//   notSimulated  -> "not simulated here (see the Reference tab)"
//   unknown       -> "invalid option -- 'x'"
//
// and it only ever gave two of them, because all 138 declared flags said
// 'implemented' and nobody ever declared the middle state. So every real flag
// this simulator does not implement fell through to "invalid option".
//
// That is not a small wording problem. `grep -e PATTERN` is POSIX and is the
// only way to search for a pattern beginning with a dash; a student who has met
// real grep reaches for it and is told the option is invalid. It is not
// invalid. The simulator told them they were wrong, when the truth was that the
// simulator was incomplete. A learner has no way to tell those apart, and the
// wrong one teaches them to distrust what they already know.
//
// This table is what the REAL tool accepts. A flag in here that the command
// does not implement gets the middle answer. A flag in neither is genuinely a
// mistake, and still says so.
//
// It does not need to be exhaustive to be worth having: every entry moves one
// more true statement out of the "you are wrong" bucket. Entries are the short
// option letters from each tool's own manual page.

/** Short option letters accepted by the real GNU/POSIX tools. */
export const REAL_LINUX_FLAGS = {
  ls: 'aAbcCdDfFgGhHiIklLmnNopqQrRsStuUvwxXZ1',
  cat: 'AbeEnstTuv',
  grep: 'abcdDefFGhHiIJlLmnoPqrRsuUvwxyzZ',
  egrep: 'abcdDefFGhHiIJlLmnoPqrRsuUvwxyzZ',
  fgrep: 'abcdDefFGhHiIJlLmnoPqrRsuUvwxyzZ',
  head: 'cnqvz',
  tail: 'cfFnqsvz',
  sort: 'bcCdfghiklmMnorRsStuVz',
  uniq: 'cdDfisuwz',
  cut: 'bcdfnsz',
  wc: 'clLmw',
  find: 'HLPDOdfhilnprsxE',
  cp: 'abdfHilLnpPrRstTuvxZ',
  mv: 'bfinStTuvZ',
  rm: 'dfirRvI',
  mkdir: 'mpvZ',
  rmdir: 'pv',
  chmod: 'cfvR',
  chown: 'cfhLPRvHh',
  ln: 'bdfFinLPrsStTv',
  sed: 'nsuzEirle',
  awk: 'FvfV',
  tr: 'cCdst',
  tee: 'aip',
  diff: 'abBcdDeEfFhHilLnNpPqrsStuvwxXyZ',
  du: 'abcdhHklLmPsSxX',
  df: 'ahHiklPtTvx',
  ps: 'aAcdefgGhHjlLmnNoOpPqrsStTuUvwxXZ',
  tar: 'AcdfhjJkKlmMOpPrStuUvwWxzZ',
  file: 'bCdEefFhiklLmNnprsvzZ',
  stat: 'cfLtZ',
  touch: 'acdfhmrt',
  echo: 'neE',
  xargs: 'a0dEeIiLlnPprstx',
  which: 'aps',
  man: 'aCdDfhkKlLMpPrStwWZ',
  history: 'acdnprsw',
  strings: 'adfhnostvV',
  md5sum: 'bctwz',
  sha256sum: 'bctwz',
  chgrp: 'cfhRv',
  basename: 'asz',
  dirname: 'z',
  realpath: 'eLmPqRsz',
  pwd: 'LP'
};

/** Switch letters accepted by the real cmd.exe commands (used after `/`). */
export const REAL_WINDOWS_FLAGS = {
  dir: 'ABCDLNOPQRSTWX4',
  copy: 'ABDLNVYZ',
  xcopy: 'ABCDEFGHIJKLNOPQRSTUVWXYZ',
  move: 'Y',
  del: 'PFSQA',
  erase: 'PFSQA',
  findstr: 'BELSIXVNMOPFCGDARZ',
  find: 'VCNI',
  type: '',
  tree: 'FA',
  attrib: 'SDLR',
  certutil: '',
  tasklist: 'SUPMSVFI',
  systeminfo: 'SUPFONH',
  ipconfig: '',
  where: 'RQFT',
  more: 'ECPSTN',
  sort: 'RO'
};

/**
 * Is this a flag the real tool accepts, even though this simulator does not?
 *
 * @param {string} command   the command name, lower-cased
 * @param {string} letter    a single option character
 * @param {boolean} isWindows
 */
export function isRealFlag(command, letter, isWindows = false) {
  const table = isWindows ? REAL_WINDOWS_FLAGS : REAL_LINUX_FLAGS;
  const known = table[String(command || '').toLowerCase()];
  if (typeof known !== 'string') return false;
  return isWindows
    ? known.includes(String(letter).toUpperCase())
    : known.includes(String(letter));
}

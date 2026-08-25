// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// A map of where the student is standing.
//
// This used to hardcode one pack's directory tree, so the moment a second pack
// existed the map described somewhere the student had never been. It now reads
// the live filesystem, which means it is correct for every pack — including
// packs a teacher writes later — and it updates as the student creates and
// removes directories.

import { useMemo } from 'react';
import { FolderOpen, Folder, FileText, CornerDownRight, Home } from 'lucide-react';

const SEP = (isWindows) => (isWindows ? '\\' : '/');

/** Directory nodes only, sorted, with their depth relative to the root. */
function collectTree(fs, root, isWindows, maxDepth = 3) {
  const sep = SEP(isWindows);
  const norm = (p) => (isWindows ? p.replace(/\//g, '\\') : p);
  const rootPath = norm(root);
  const same = (a, b) =>
    isWindows ? a.toLowerCase() === b.toLowerCase() : a === b;

  const under = Object.keys(fs).filter(key => {
    const k = norm(key);
    if (same(k, rootPath)) return true;
    const prefix = rootPath.endsWith(sep) ? rootPath : rootPath + sep;
    return isWindows
      ? k.toLowerCase().startsWith(prefix.toLowerCase())
      : k.startsWith(prefix);
  });

  const rows = [];
  for (const key of under) {
    const node = fs[key];
    if (!node || node.type !== 'dir') continue;
    const rel = norm(key).slice(rootPath.length).replace(/^[\\/]/, '');
    const depth = rel === '' ? 0 : rel.split(/[\\/]/).length;
    if (depth > maxDepth) continue;
    rows.push({ path: key, depth, name: rel === '' ? rootPath : rel.split(/[\\/]/).pop() });
  }
  rows.sort((a, b) => a.path.localeCompare(b.path));
  return rows;
}

function fileCount(fs, dirPath) {
  const node = fs[dirPath];
  if (!node?.contents) return 0;
  return node.contents.filter(name => {
    const child = Object.keys(fs).find(k => k.endsWith(name) && fs[k]?.type === 'file');
    return !!child;
  }).length;
}

export const SystemMap = ({
  fs = {},
  currentCwd = '',
  home = '',
  platform = 'linux',
  packName = 'Shellgrounds',
  onNavigate
}) => {
  const isWindows = platform === 'windows';
  const root = home || currentCwd || (isWindows ? 'C:\\' : '/');

  const rows = useMemo(
    () => collectTree(fs, root, isWindows),
    [fs, root, isWindows]
  );

  const isCurrent = (p) =>
    isWindows
      ? String(p).toLowerCase() === String(currentCwd).toLowerCase()
      : p === currentCwd;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="space-y-1">
          <h2 className="text-sm font-bold text-term-green tracking-wider">
            System map
          </h2>
          <p className="text-xs text-neutral-400">
            {packName} · every directory you can reach from home. Click one to go there.
          </p>
        </header>

        <div className="rounded-xl border border-term-border bg-term-panel divide-y divide-term-border/50">
          {rows.length === 0 && (
            <p className="p-4 text-xs text-neutral-400">
              Nothing to show yet — the filesystem has not loaded.
            </p>
          )}

          {rows.map(row => {
            const current = isCurrent(row.path);
            const files = fileCount(fs, row.path);
            return (
              <button
                key={row.path}
                onClick={() => onNavigate?.(row.path)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                  current
                    ? 'bg-term-green/10 text-term-green'
                    : 'hover:bg-term-gray text-neutral-300'
                }`}
                style={{ paddingLeft: `${0.75 + row.depth * 1.15}rem` }}
                aria-current={current ? 'location' : undefined}
              >
                {row.depth > 0 && (
                  <CornerDownRight size={12} className="shrink-0 text-neutral-600" />
                )}
                {row.depth === 0
                  ? <Home size={13} className="shrink-0" />
                  : current
                    ? <FolderOpen size={13} className="shrink-0" />
                    : <Folder size={13} className="shrink-0" />}
                <code className="text-xs truncate">{row.depth === 0 ? row.path : row.name}</code>
                {files > 0 && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-neutral-500 shrink-0">
                    <FileText size={10} /> {files}
                  </span>
                )}
                {current && (
                  <span className="ml-auto text-[10px] font-bold tracking-wider shrink-0">
                    you are here
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-neutral-500">
          You are in <code className="text-term-green">{currentCwd}</code>.
          Type <code>pwd</code> in the terminal to print it, or <code>cd ..</code> to move up one level.
        </p>
      </div>
    </div>
  );
};

export default SystemMap;

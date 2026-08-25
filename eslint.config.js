// Copyright (c) 2026 Rational Mystic LLC. PolyForm Noncommercial 1.0.0 — see LICENSE.md
// Flat ESLint config, Phase 0 of the improvement plan: "a linter in front of
// the door". Deliberately small — four rules, each earning its place, not a
// preset ruleset the team would spend the next month tuning around.
//
// react-hooks/exhaustive-deps is a WARNING, not an error, on purpose. The
// session-initialisation effect in src/App.jsx has a deliberately incomplete
// dependency list (it must run once on mount, not on every state change it
// reads); making this rule an error would force either a lint suppression
// or a behaviour-changing rewrite of code that is already correct.

import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.netlify/**', 'packs/registry.gen.js']
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      // 'latest' rather than a pinned year: several files use import
      // attributes (`with { type: 'json' }`), which espree only parses
      // under a recent enough ecmaVersion. Pinning to 2022 produced
      // "Unexpected token with" parse errors on those files.
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        // Injected at build time by vite.config.js's `define`, so it exists
        // only after the Vite compile step — not as a real global at
        // authoring time. See vite.config.js for why.
        __ENABLED_PACKS__: 'readonly'
      }
    },
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      'no-undef': 'error',
      // An underscore prefix already means "deliberately unused" in this
      // codebase -- packages/engine/vfs/builder.js was written that way long
      // before there was a linter to read it. Honour the convention rather
      // than churn the code to satisfy a rule that arrived later.
      'no-unused-vars': ['error', {
        args: 'after-used',
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];

# Third-party notices

Shellgrounds is licensed under PolyForm Noncommercial 1.0.0 — see [LICENSE.md](LICENSE.md).
It includes the following third-party material.

## List of Dirty, Naughty, Obscene, and Otherwise Bad Words

`packages/engine/sfw-words.json` contains the English word list from the
**List of Dirty, Naughty, Obscene, and Otherwise Bad Words**, by Shutterstock.

- Source: <https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words>
- Licence: [Creative Commons Attribution 4.0 International (CC-BY-4.0)](https://creativecommons.org/licenses/by/4.0/)

Modified: multi-word entries were removed, since a handle is a single token and
a multi-word entry could never match one. The remaining terms are matched as
whole tokens only, never as substrings — see the reasoning in
`packages/engine/sfw-filter.js`.

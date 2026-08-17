# Prior art: browser-based CLI training tools

Distilled from a Gemini deep-research report (2026-08-17). Load-bearing claims spot-checked by web search; unverified items are marked.

## Landscape

The field splits three ways: SSH wargames (OverTheWire Bandit) with real depth but real Day-1 friction; commercial VM platforms (TryHackMe, HTB Academy) with classroom dashboards behind institutional pricing; and free browser simulators (Terminus, Linux Survival) that are beginner-friendly but single-player and untracked. Every tool with classroom tracking runs real backend compute; every zero-infrastructure tool has no tracking. picoCTF is the one free platform combining both — via CMU-hosted servers, not yours.

## Tools

| Tool | Cost | Beginner fit | Classroom features | Weakness |
|---|---|---|---|---|
| OverTheWire Bandit | Free | Poor (SSH on Day 1) | None | Friction; campus firewalls may block SSH |
| picoCTF (CyLab Security Academy) | Free ✓verified | Excellent | Free classrooms, per-class scoreboard, CSV export ✓verified | CMU backend; webshell provisioning; not course-aligned |
| cmdchallenge | Free, open source ✓verified | Good | None | Self-host needs Docker + Terraform/AWS ✓verified; no flags/points |
| Terminus (MIT) | Free ✓verified | Excellent (game framing) | None | Single-player, no scoring, dated (2013) |
| Linux Survival | Free | Excellent | None *(unverified detail)* | Textbook feel, no gamification |
| TryHackMe | EDU $25/seat/mo, $2,000 min order ✓verified | Good | Yes (paid) | Cost; overkill for `ls`/`cd` |
| HTB Academy | ~$490+/yr *(pricing unverified)* | Poor (too advanced) | Enterprise licensing | Cost and difficulty |
| killercoda / sadservers | Freemium *(pricing unverified)* | Poor–moderate | None | VM boot times; assumes sysadmin skill |

Report also names "Terminal Playground" and "Hacker Simulator" GitHub repos — existence unverified; treat as noise.

## Gap analysis

The Gauntlet's combination appears genuinely novel. No verified tool offers all five of: static/zero-infrastructure hosting, simulated shell (no real execution, no container risk), per-user HMAC anti-cheat flags, private class leaderboard, and course-aligned curriculum. The nearest neighbors each miss decisively: picoCTF has free classrooms and a leaderboard but needs its backend, generic content, and shared (shareable) flags; Terminus proves the simulated-shell pedagogy but has zero tracking; TryHackMe has everything except the price. Per-user HMAC flags on a static site is the differentiator no surveyed tool has. The honest caveat: novelty here is a niche intersection, not a new mechanism — and picoCTF remains the free fallback if The Gauntlet were abandoned.

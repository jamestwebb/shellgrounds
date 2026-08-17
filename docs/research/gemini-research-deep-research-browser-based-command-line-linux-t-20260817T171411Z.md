# Executive Summary

This report evaluates the 2024–2026 landscape of command-line interface (CLI) and Linux terminal training tools, specifically focusing on their suitability for an absolute beginner audience in a university-level cyber-forensics or cybersecurity course. The analysis covers traditional wargames, commercial training platforms, and browser-based simulators. 

Overall, the landscape is heavily fragmented. Commercial platforms like **TryHackMe** and **HackTheBox Academy** offer robust infrastructure but introduce cost and onboarding friction. Open-source or free platforms like **OverTheWire Bandit** and **cmdchallenge** provide excellent technical depth but lack native, out-of-the-box classroom management and leaderboard features. **picoCTF** currently stands as the closest comprehensive free solution for educators, though it relies on backend infrastructure.

The report concludes with a gap analysis comparing existing solutions to a hypothetical stateless, browser-simulated terminal application hosted on a static platform (like Netlify) with per-user HMAC flags. Such a tool uniquely solves the "First-Day-of-Class" problem by providing zero-friction onboarding, zero infrastructure cost, and absolute security, a combination not perfectly fulfilled by any single existing platform today.

---

# CLI Training Tools & Games: 2024–2026 Landscape

## 1. Traditional Wargames & CTFs

### OverTheWire Bandit
* **What it is:** A legendary, level-based Linux wargame accessed via SSH, designed to teach basic commands and security concepts [1].
* **Cost:** 100% Free [2].
* **Accounts/Infra:** No user accounts required (authentication is via level passwords). Requires a local terminal or SSH client.
* **Beginner Fit:** Moderate to poor for absolute Day-1 beginners. The requirement to use real SSH and understand key concepts immediately can be highly intimidating [3].
* **Classroom/Leaderboards:** None natively built-in. Instructors must hack together custom scripts to track student progress [4].
* **Weakness:** Too much friction for the first 15 minutes of class; real SSH can be blocked by university firewalls.

### picoCTF
* **What it is:** A premier cybersecurity education platform by Carnegie Mellon University, offering year-round beginner challenges (picoGym) [5].
* **Cost:** 100% Free [6].
* **Accounts/Infra:** Requires account registration. Provides a browser-based "webshell" connected to real backend containers.
* **Beginner Fit:** Excellent. Designed specifically for high school and early college students [7].
* **Classroom/Leaderboards:** Yes, robust native classroom management and tracking [8].
* **Weakness:** The webshell can sometimes be slow to provision, and the sheer volume of challenges can lack a linear, guided narrative for a day-one Linux primer.

## 2. Browser-Simulated & Sandbox Playgrounds

### cmdchallenge
* **What it is:** An open-source, web-based tool prompting users to solve specific CLI tasks using real bash commands [9].
* **Cost:** Free to use; open-source [10].
* **Accounts/Infra:** No accounts needed for the public site. If self-hosted, requires Docker/container orchestration [10].
* **Beginner Fit:** Good, but drops users straight into a blank prompt with a task, assuming some prior intuition.
* **Classroom/Leaderboards:** No native classroom tracking or leaderboards without custom development.
* **Weakness:** Lacks narrative and gamification (flags/points). Self-hosting requires maintaining Docker infrastructure securely.

### Terminus (MIT)
* **What it is:** A web-based text adventure game that uses real terminal commands (`ls`, `cd`, `grep`) to navigate a dungeon crawler [11].
* **Cost:** Free (Open Source) [12].
* **Accounts/Infra:** Completely stateless/static; no accounts required [13].
* **Beginner Fit:** Exceptional. It turns intimidating terminal navigation into a familiar game mechanic [14].
* **Classroom/Leaderboards:** None. It is a single-player, untracked experience [12].
* **Weakness:** Purely educational and linear; no scoring system, competitive aspect, or instructor dashboard.

### Linux Survival
* **What it is:** A free, web-based interactive tutorial using a simulated Linux console [15].
* **Cost:** Free [16].
* **Accounts/Infra:** Accounts optional (only for tracking progress). Uses a simulated web terminal [15].
* **Beginner Fit:** Excellent for fundamental learning. Very gentle learning curve [17].
* **Classroom/Leaderboards:** No classroom management or competitive leaderboards.
* **Weakness:** Feels like a textbook rather than a game. Lacks the "hacker" aesthetic that engages cybersecurity students.

## 3. Commercial Training Environments

### TryHackMe
* **What it is:** A massive commercial platform offering guided virtual machine labs (AttackBox) [18].
* **Cost:** Free tier available; Premium is ~$14-$17/month. Classroom features are typically ~$25/seat/month [19].
* **Accounts/Infra:** Requires accounts. Uses heavy cloud infrastructure (browser-based VMs).
* **Beginner Fit:** Good, though the interface and boot-up times can be overwhelming on day one.
* **Classroom/Leaderboards:** Yes. Global leaderboards are free; private classroom tracking is paid [20].
* **Weakness:** High cost for academic cohorts. Overkill for just teaching basic `ls` and `cd` commands.

### HackTheBox Academy
* **What it is:** The structured, educational wing of HackTheBox, using a "Cube" currency system for modules [21].
* **Cost:** Complex. A basic free tier exists (Tier 0), but annual subs range from ~$490 to $1,200+ [22].
* **Accounts/Infra:** Requires accounts and uses backend cloud VMs [21].
* **Beginner Fit:** Steep curve. Aimed more at serious aspiring penetration testers [23].
* **Classroom/Leaderboards:** Yes, via Enterprise/Academic licensing [22].
* **Weakness:** Expensive and too advanced for an introductory 100-level course day one.

### KodeKloud & Codecademy (LearnShell)
* **What it is:** General IT and programming education platforms with interactive, containerized prompts [24][25].
* **Cost:** Codecademy Pro is ~$15-$40/month; KodeKloud is ~$16/month [26][27].
* **Beginner Fit:** Good, but highly sanitized and guided.
* **Classroom/Leaderboards:** Codecademy offers "Teams" [26]. Neither has gamified CTF-style leaderboards.
* **Weakness:** Lacks the security/forensics focus. Not a "game."

## 4. Ephemeral Container Services

### sadservers & killercoda
* **What it is:** Platforms that spin up temporary Linux VMs to solve specific scenarios (sadservers for troubleshooting, killercoda for generic tech/K8s) [28][29].
* **Cost:** Both have free tiers; sadservers Pro is ~$9/mo [30]. Killercoda allows free public scenarios [31].
* **Beginner Fit:** Poor to Moderate. sadservers assumes sysadmin knowledge [30].
* **Classroom/Leaderboards:** No built-in classroom management. Killercoda allows sharing scenarios but lacks private grading dashboards [32].
* **Weakness:** Boot times for VMs, infrastructure overhead, and lack of gamified scoreboards.

## 5. Newer Open-Source Self-Hosted (2024-2026)

* **Terminal Playground:** A browser-based UI backing into Docker containers for teaching. Excellent sandbox but requires backend compute [33].
* **Hacker Simulator:** A Python CLI tool to simulate hacking. Requires local installation, eliminating the browser convenience [34].

---

# Comparison Matrix

| Platform | Cost | Infra Needed | Account Required | Day-1 Beginner Fit | Classroom / Leaderboard |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bandit** | Free | SSH Client | No | Poor (Intimidating) | No / No |
| **cmdchallenge** | Free / Open | Docker (if self) | No | Good | No / No |
| **Terminus** | Free / Open | None (Static) | No | Excellent | No / No |
| **picoCTF** | Free | None (Web) | Yes | Excellent | Yes / Yes |
| **Linux Survival**| Free | None (Simulated)| Optional | Excellent | No / No |
| **TryHackMe** | $$ Paid | None (Web VM) | Yes | Good | Yes (Paid) / Yes |
| **HTB Academy** | $$$ Paid | None (Web VM) | Yes | Poor (Too Deep) | Yes (Paid) / Yes |
| **Codecademy** | $$ Paid | None (Web) | Yes | Good | Yes (Paid) / No |
| **sadservers** | Free / $ | None (Web VM) | Yes | Poor (Advanced) | Custom / No |
| **killercoda** | Free / $ | None (Web VM) | Yes | Moderate | No / No |

---

# Gap Analysis: The Stateless, Browser-Simulated Paradigm

### The Proposed Tool
A self-hosted Netlify app featuring a purely JS-simulated terminal (e.g., using `xterm.js` or `jquery.terminal`), no real shell, per-user HMAC-signed CTF flags, and a simple class leaderboard.

### Gaps Filled by This Approach

**1. The "Zero-Infrastructure, Zero-Risk" Gap**
Platforms like `cmdchallenge`, `TryHackMe`, and `picoCTF` rely on spinning up real backend Docker containers or VMs. This introduces compute costs, potential security vulnerabilities (container escapes), and latency (waiting for environments to provision). A stateless Netlify app executes entirely in the user's browser JS engine. It costs exactly $0 to host for thousands of students and carries zero security risk because no real code is ever executed on a server.

**2. The "Instant Onboarding" Gap**
For absolute beginners on Day 1, even creating an account or learning how to use an SSH key (OverTheWire) takes up valuable class time. A simulated browser app can allow a student to enter their name, instantly receive a JWT/HMAC token, and begin typing `ls` within 5 seconds of opening the URL. 

**3. The "Gamified Simulation" Gap**
While **Terminus** and **Linux Survival** are stateless and perfect for beginners, they *lack leaderboards and verifiable completion metrics*. A tool that generates per-user HMAC flags (to prevent students from sharing answers) and posts them to a lightweight serverless leaderboard bridges the gap between the educational safety of a simulation and the competitive engagement of a real CTF.

### Conclusion
Currently, **picoCTF** is the closest existing tool that fills this educational gap for free, but it relies on heavy backend infrastructure. **Terminus** proves that browser simulations work brilliantly for beginners but lacks academic tracking. 

A static, browser-simulated terminal game with HMAC flags fills a genuinely novel gap: **It offers the gamification of a CTF and the tracking of a classroom platform, combined with the zero-cost, instant-loading, zero-risk architecture of a static webpage.** This makes it the ideal, frictionless "Day 1" introductory tool for a cyber-forensics course before transitioning students to real, infrastructure-backed environments like TryHackMe or OverTheWire.

---

# Sources & Citations

*   [1] OverTheWire Official Site. *Bandit Wargame*. [overthewire.org](https://overthewire.org/wargames/bandit/)
*   [2] Medium. *OverTheWire Bandit Walkthrough*. (Verifying cost and access).
*   [3] Reddit `/r/cybersecurity`. *Discussions on classroom use of OverTheWire*.
*   [4] OverTheWire Community constraints and lack of official classroom infrastructure.
*   [5] Carnegie Mellon University. *CyLab Security Academy / picoCTF*. [cylabacademy.org](https://cylabacademy.org/)
*   [6] Veritas AI. *Guide to picoCTF for Beginners*.
*   [7] Hackerdna. *Getting started with picoCTF Primer*.
*   [8] Fortinet. *Cybersecurity Education Platforms: picoCTF Classroom features*.
*   [9] Jarv. *cmdchallenge Official Repository*. [github.com/jarv/cmdchallenge](https://github.com/jarv/cmdchallenge)
*   [10] cmdchallenge Architecture and Docker requirements (GitHub Repository).
*   [11] M. Prat. *Terminus Project Page*. [mprat.org/projects/terminus/](https://www.mprat.org/projects/terminus/)
*   [12] Terminus Official Source Code. [github.com/mprat/Terminus](https://github.com/mprat/Terminus)
*   [13] Terminus Web Hosting specifications (MIT Web).
*   [14] Medium. *Learning Linux via Terminus Text Adventure*.
*   [15] Linux Survival. *Free Interactive Linux Tutorial*. [linuxsurvival.com](https://linuxsurvival.com/)
*   [16] MakeUseOf. *Best ways to learn Linux online*.
*   [17] It's FOSS. *Interactive portals to learn Linux*.
*   [18] TryHackMe. *Platform Overview*. [tryhackme.com](https://tryhackme.com/)
*   [19] TryHackMe Pricing structure and educational cohort costs (Reddit/Infosec writeups).
*   [20] TryHackMe Leaderboard functionality rules.
*   [21] HackTheBox. *HTB Academy Overview*.
*   [22] Hackerdna / InfoSecWriteups. *HTB Academy Cube Pricing Model and Subscriptions*.
*   [23] Reddit `/r/HackTheBox`. *Beginner ROI and tier structures*.
*   [24] Codecademy. *Learn Bash and IT basics*. [codecademy.com](https://www.codecademy.com/)
*   [25] KodeKloud. *Standard and Pro platform features*. [kodekloud.com](https://kodekloud.com/)
*   [26] Codecademy pricing tiers and Teams/Classroom discounts.
*   [27] KodeKloud annual vs standard pricing reviews.
*   [28] SadServers. *Troubleshooting Scenarios*. [sadservers.com](https://sadservers.com/)
*   [29] Killercoda. *Interactive Scenarios*. [killercoda.com](https://killercoda.com/)
*   [30] SadServers Business accounts and Pro tier pricing (Direct inquiries/info).
*   [31] Killercoda Pricing and Creator limits.
*   [32] Educates.dev. *Using Killercoda for teaching limitations*.
*   [33] GitHub. *joegsuero/terminal-playground*. [github.com/joegsuero/terminal-playground](https://github.com/joegsuero/terminal-playground)
*   [34] GitHub. *DlopedDtorred/hacker-simulator*. [github.com/DlopedDtorred/hacker-simulator](https://github.com/DlopedDtorred/hacker-simulator)

*(Note: Exact pricing models for commercial platforms [TryHackMe, HTB Academy, Codecademy, KodeKloud] are subject to frequent promotional changes and institutional licensing negotiations; figures provided reflect median 2024–2025 consumer and baseline B2B reporting).*

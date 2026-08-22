# The Gauntlet — Multi-Curriculum CLI Proving Ground

> **The definitive zero-infrastructure, multi-curriculum CLI training and CTF platform for Linux and Windows.**

The Gauntlet is a high-fidelity, pedagogical terminal simulator and challenge engine. It enables instructors to deploy interactive command-line courses in an afternoon without Docker, VMs, or complex infrastructure. Every student receives unique cryptographically generated flags, challenges are verified by an automated machine-solvability engine, and the shell simulation maintains strict honesty.

---

## 🚀 Key Differentiators

| Capability | The Gauntlet | Traditional CTF / Simulators |
| :--- | :--- | :--- |
| **Zero Infrastructure** | Static web app + serverless functions + blob storage | Requires heavy Docker containers or VMs |
| **Anti-Cheat Flags** | Deterministic HMAC-SHA256 flags per student | Static flags easily shared among students |
| **Machine-Proved Solvability** | Automated validator proves every challenge path | Manual verification prone to broken challenges |
| **Simulation Honesty** | Declared boundaries; never claims real tools don't exist | Silently ignores flags or gives wrong error messages |
| **Multi-Curriculum** | Pluggable, declarative content packs | Single hardcoded curriculum |

---

## 📦 Flagship Content Packs (`packs/`)

1. **`forensics-cli-101`** *(Warren & Topside)*:
   - 30 progressive challenges across 6 Acts.
   - Comprehensive investigation covering bash pipelines, forensic hashing, search filters, and Windows CMD parity.
2. **`linux-fundamentals`**:
   - 40 challenges covering core navigation, file management (`mkdir`, `cp`, `mv`, `rm`), text manipulation (`grep`, `sort`, `cut`, `uniq`, `tr`, `sed`, `awk`, `tee`), permissions (`chmod`, `chown`, `sudo`), and shell redirection.
3. **`windows-cmd-essentials`**:
   - 27 challenges covering directory navigation, file operations (`copy`, `move`, `del`, `ren`, `md`, `rd`), text search (`find`, `findstr`), environment variables (`set %VAR%`), and system inspection (`systeminfo`, `ipconfig`, `certutil`).

---

## 🛠️ CLI Pack Validator

The Gauntlet includes a dedicated CLI tool to validate curriculum packs, verify VFS integrity, prove canonical solutions, and check act progression math:

```bash
# Validate all packs
node bin/gauntlet.js validate

# Validate a specific pack with JSON output for CI
node bin/gauntlet.js validate packs/linux-fundamentals --json
```

---

## 💻 Local Development & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite (Vitest)
```bash
# Runs Unit, De-branding Lint, and Differential Fidelity tests
npm test
```

### 3. Run Pack Validation
```bash
npm run validate
```

### 4. Start Development Server
```bash
npm run dev
```

### 5. Build for Production
```bash
npm run build
```

---

## ☁️ Deployment & Instructor Configuration

Deploy directly to Netlify or any compatible JAMstack host with serverless functions.

### Environment Variables:
- `SESSION_SECRET`: Long random secret for HMAC token and flag signing (e.g. `openssl rand -hex 32`).
- `COHORT_PASSWORD` (or `CLASS_PASSWORD`): Password announced to students in lecture.
- `ADMIN_HANDLES`: Comma-separated list of handles granted instructor privileges (e.g. `prof_smith,ta_alex`).
- `GAUNTLET_STORE` (optional): Netlify Blobs store namespace (default: `gauntlet-fall2026`).

---

## 📜 License

**PolyForm Noncommercial License 1.0.0** — full text in [LICENSE.md](LICENSE.md).

Plain English. This summary is not a substitute for the licence itself:

- **Teachers and schools may use this, free of charge.** The licence names educational
  institutions as a permitted use *"regardless of the source of funding"*. Public schools,
  private schools, colleges, and universities are all covered, as are non-profits and
  government bodies.
- **You may change it and share your changes.** Fork it, write your own content packs,
  deploy it for your class, hand it to a colleague.
- **Keep the attribution.** Anyone who gets a copy from you must also get the licence and
  the `Required Notice:` line that names the copyright holder.
- **No commercial use.** You may not sell this, or sell a service built on it, without a
  separate licence from the copyright holder.

This is a *source-available* licence, not an OSI-approved open-source one. The
non-commercial restriction is deliberate. If you need commercial terms, ask.

Copyright (c) 2026 Rational Mystic LLC.

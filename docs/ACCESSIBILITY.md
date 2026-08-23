# Accessibility review — Shellgrounds

Reviewed 23 August 2026 against **WCAG 2.1 Level AA**, the standard US public
schools and public universities are held to. Findings are measured where they
can be measured and marked as unverified where they cannot.

---

## 1. Why this applies to a free teaching site

Shellgrounds is deployed *by* schools and universities, which makes it their
web content. Three separate obligations land on the institution running it, and
in practice a procurement officer will ask about all three.

| Obligation | Applies to | Standard |
|---|---|---|
| **ADA Title II** (DOJ final rule, April 2024) | every public school district, community college and public university | **WCAG 2.1 Level AA** |
| **Section 504** / OCR enforcement | any institution receiving federal funds, including K-12 | equal access; OCR resolution agreements have named WCAG 2.0 AA and now cite 2.1 |
| **Section 508** and state "mini-508" laws | federal purchasers, and most state university procurement | WCAG 2.0 AA, evidenced by a **VPAT / ACR** |

**Deadlines.** The DOJ extended them by one year on 20 April 2026:

- **26 April 2027** — public entities serving 50,000 or more
- **26 April 2028** — smaller entities and special districts

The substance did not change, only the dates. The exceptions in the rule
(archived content, pre-existing documents, third-party content) **do not help
here**: this is live, first-party, student-facing courseware.

**Private schools** are Title III, where there is no adopted technical
standard — but courts routinely use WCAG as the yardstick, so the target is the
same.

**Aim at WCAG 2.2 AA, not 2.1.** 2.2 is a superset: it keeps every 2.1
criterion but one and adds four at AA. Building to 2.2 satisfies the rule today
and survives the next revision. The four extra AA criteria are Focus Not
Obscured, Dragging Movements, Target Size (24px), and Accessible
Authentication — and this codebase has no drag interactions and no CAPTCHA, so
two of them are free.

---

## 2. How this review was done, and what it cannot tell you

**Done:** the colour palette was extracted from `tailwind.config.js` and every
foreground/background pair actually used in the components was computed against
the WCAG contrast formula. The component tree was read for semantics, keyboard
handling, ARIA and motion.

**Not done, and it matters:** nothing was tested with a real screen reader, a
real magnifier, or a real keyboard-only user. There is no headless browser in
this project, so no automated axe/Lighthouse pass has been run either. **A
static review finds broken markup; it does not find a confusing experience.**
Everything below marked *unverified* needs a person.

The hardest question here cannot be answered by inspection at all: **a terminal
emulator is an unusual thing for a screen reader.** Whether a blind student can
actually work through Act I is a question for a blind student, and it is the
single most valuable thing you could commission.

---

## 3. Findings

Ordered by how much they cost a real student.

### A1 — The site refuses to run below 768px wide *(fails 1.4.10 Reflow)*

`src/components/KeyboardGuard.jsx:21` blocks the entire interface under 768px
with a full-screen overlay.

The intent is sound: this is a command line, and a phone keyboard has no Tab,
no arrows and no pipe. But **1.4.10 requires content to reflow to 320px without
loss**, and the block catches somebody it was never aimed at: a low-vision user
who zooms to 400%. Browser zoom reduces the effective CSS viewport, so a
1280px screen at 400% reports 320px and gets the "you need a real keyboard"
wall — a magnifier user on a desktop with a real keyboard attached, told to go
and find one.

There is a bypass button, which is what keeps this from being a total barrier,
but the user must first read a screen telling them they are on the wrong
device.

**Fix:** trigger on a coarse pointer plus a small viewport, not on width alone
— or drop the overlay to a dismissable banner. `(pointer: coarse)` is the
property actually being detected.

### A2 — The class picture is invisible and unreachable *(fails 1.1.1, 2.1.1, 4.1.2)*

`src/components/Reveal.jsx:160-176`. Every tile is a `<div>`. Attribution — who
uncovered which square — lives only in a `title` attribute, which is not
reliably announced and is unreachable by keyboard entirely.

So the cooperative reveal, the screen that carries the whole social point of
the product, currently conveys **nothing** to a screen-reader user: no
progress, no contributors, no picture. The `<img>` also carries `alt=""`,
correct while it is a decorative backdrop, wrong once it is the payoff.

**Fix:** the numbers are already in the response. A short text summary — "72%
uncovered, 143 of 200 finds, 9 people contributing" — in a live region costs
almost nothing and delivers most of the value. Make tiles `<button>`s only if
attribution is worth the tab stops; a list beneath the grid may serve better.

### A3 — Solved-but-stale is signalled by colour alone *(fails 1.4.1)*

`src/components/ChallengeSidebar.jsx:315`. A challenge worth revisiting is
shown with an amber tick instead of a green one. Same icon, same text, same
position — **hue is the only difference**, which is exactly what 1.4.1
prohibits, and roughly 1 in 12 men cannot see it.

Introduced by this codebase today, which is a fair illustration of how easily
it happens.

**Fix:** change the glyph as well as the colour, or add text.

### A4 — Four text colours fail the contrast minimum *(fails 1.4.3)*

Measured against the surfaces they are actually drawn on:

| Colour | On | Ratio | Needs | Uses |
|---|---|---|---|---|
| `neutral-600` | `term-gray` | **2.42** | 4.5 | 10 |
| `neutral-500` | `term-gray` | **3.98** | 4.5 | 67 |
| `neutral-500` | `term-void` | **4.25** | 4.5 | — |
| `emerald-600` | `term-black` | 5.26 | 4.5 | passes |

`neutral-500` is the biggest problem by volume — 67 uses, all of it the
tertiary text that carries timestamps, counts and "N of M finds". `neutral-600`
at 2.42 is the feed's timestamps and is the worst single value in the palette.

**Fix:** raise `neutral-500` → `neutral-400` (7.49, passes) and `neutral-600` →
`neutral-500` at minimum. This is a find-and-replace, not a redesign.

### A5 — No status messages are announced *(fails 4.1.3)*

Solving a challenge, a wrong answer, a revealed hint and the "Still right"
practice reply are all rendered into ordinary elements
(`ChallengeSidebar.jsx:457`, `:538`). A sighted user sees them appear; a screen
reader user is told nothing unless they happen to be reading that region.

The terminal itself **does** have `aria-live="polite"`
(`Terminal.jsx:263`), so command output is announced. It is the grading
feedback — the part that says whether you got it right — that is silent.

**Fix:** one `role="status"` container for feedback.

### A6 — No skip link, and one landmark short

`App.jsx` has `<header>` and `<main>` but no `<nav>`, and no skip link. The tab
order therefore runs the whole header and the act list before reaching the
terminal, on every page load. Not a 2.1 AA failure on its own — 2.4.1 Bypass
Blocks is met by the landmarks — but it is a daily tax on a keyboard user.

### A7 — The terminal input has no visible focus *(risks 2.4.7)*

`Terminal.jsx:320` sets `outline-none ... focus:ring-0` with no replacement.
It is `autoFocus`, and the caret is coloured, so in practice focus is usually
obvious. It is the one control in the codebase where focus is removed and
nothing is put back — every other `focus:outline-none` in `src/` (10 of them)
is paired with a `focus:ring` or `focus:border`.

*Unverified:* whether the caret alone satisfies a reviewer.

### A8 — Answers are unreachable to a screen reader user at their own pace *(unverified)*

The interface assumes the student can see the terminal and the brief at once.
Whether the reading order, the act list and the live region combine into
something workable is exactly what static review cannot answer. **Flagged, not
assessed.**

---

## 4. What is already right

Worth stating, because a review that lists only failures gives a false picture
and because these are the things not to break:

- **`prefers-reduced-motion` is honoured globally** (`src/index.css:59`) —
  animations and transitions collapse to 0.01ms. The scanline effect, which
  would otherwise be a genuine problem for photosensitivity and for motion
  sensitivity, stops. Scanlines are also user-switchable.
- **Focus is replaced, not just removed** — all ten `focus:outline-none`
  declarations pair with a visible `focus:ring` or `focus:border`.
- **The terminal is a labelled live region** — `role="region"`,
  `aria-label="Interactive CLI Terminal"`, `aria-live="polite"`, and the input
  carries `aria-label="Shell input"`.
- **Most text passes comfortably** — 19 of 23 measured pairs pass 4.5:1, most
  of them above 10:1.
- **Headings are used, and `<h1>` exists on every screen.**
- **No drag interactions, no CAPTCHA, no time limits** — three whole classes of
  barrier that simply do not arise here, and two WCAG 2.2 AA criteria met for
  free.
- **It is a keyboard application by nature.** The core interaction is typing,
  which is the one thing that never needs an accessibility retrofit.

---

## 5. Not covered by this review

- Screen reader behaviour, on any platform. Nothing was tested.
- Magnification beyond the reflow finding.
- Cognitive load and reading level of the briefs and hints.
- The **content packs**, which are author-supplied. A pack can ship a
  briefing with no structure and art with no description; `presentation.js`
  caps sizes and formats but says nothing about comprehensibility.
- Colour-blind simulation of the palette as a whole.
- Any automated tooling — no axe, no Lighthouse, no pa11y.

---

## 6. Order to fix in

1. **A4 contrast** — a find-and-replace, and it removes the largest count of
   individual failures in one commit.
2. **A3 colour-only signal** — one glyph.
3. **A5 status messages** — one container.
4. **A2 the reveal** — a text summary gets most of the value cheaply.
5. **A1 reflow** — needs a decision about what is really being detected.
6. **A8 screen reader testing** — the expensive one, and the only one that
   tells you whether any of the above worked.

A **VPAT 2.5** should not be written until at least 1–5 are done and a person
has tested with a screen reader. An ACR that claims "Supports" on the strength
of a static review is worse than no ACR, because a procurement officer will
rely on it.

---

## 7. User-adjustable presentation

`src/components/Terminal.jsx` supports switchable colour schemes, chosen by the
student and remembered in their browser. This is not itself a WCAG requirement
— the default palette has to pass on its own, and A4 above says it does not
quite — but it covers real needs that a single compliant palette does not:

- **Low vision** beyond what 4.5:1 provides: a high-contrast scheme.
- **Irlen syndrome and scotopic sensitivity**, where a coloured background
  reduces visual stress. This is why the light and blue schemes exist.
- **Colour vision deficiency**, where a green-on-black terminal is the worst
  possible pairing for a deuteranope reading green accents.
- **Personal preference**, which is not a lesser reason. A student who can
  stand to look at the screen for an hour learns more than one who cannot.

Every shipped scheme is checked against 4.5:1 for body text by a test, so a new
one cannot be added below the line.

---

## Sources

- [ADA Title II web rule summary — ADA.gov](https://www.ada.gov/resources/2024-03-08-web-rule/)
- [Extension of compliance dates — Federal Register, 20 April 2026](https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web)
- [DOJ extends Title II compliance deadlines — Reed Smith](https://www.reedsmith.com/articles/doj-extends-digital-accessibility-compliance-dates-under-title-ii-of-the-ada/)
- [First steps toward complying — ADA.gov](https://www.ada.gov/resources/web-rule-first-steps/)
- [OCR disability enforcement trends, 2025 resolutions](https://grandriversolutions.com/ocr-demonstrates-robust-enforcement-overview-of-2025-resolutions-on-disability/)
- [Section 508 compliance and VPAT/ACR — Level Access](https://www.levelaccess.com/compliance-overview/section-508-compliance/)
- [VPATs and accessibility statements — CUNY Libraries](https://guides.cuny.edu/accessibility/vpats)
- [What's new in WCAG 2.2 — TetraLogical](https://tetralogical.com/blog/2023/10/05/whats-new-wcag-2.2/)

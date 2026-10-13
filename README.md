# 🎁 Secret Santa — a private gift-exchange organiser that runs entirely in your browser

Organise a Secret Santa for your family, office or friends without accounts, email addresses, servers or subscriptions.
You set everything up in your own browser, the app draws names according to your house rules, and each person gets
their **own encrypted link** that opens a festive, animated reveal of who they're buying for.

The app is a static website, so it can be hosted for free on **GitHub Pages**.

---

## Contents

1. [Features](#features)
2. [Quick start for organisers](#quick-start-for-organisers)
3. [Putting it on GitHub Pages](#putting-it-on-github-pages-step-by-step)
4. [Running it on your own computer](#running-it-on-your-own-computer)
5. [How the pieces work](#how-the-pieces-work)
   - [Participant reveal links & encryption](#participant-reveal-links--encryption)
   - [Forced and forbidden rules](#forced-and-forbidden-rules)
   - [Relationship exclusions & households](#relationship-exclusions--households)
   - [History & repeat prevention](#history--repeat-prevention)
   - [The draw algorithm](#the-draw-algorithm)
   - [Smart conflict suggestions](#smart-conflict-suggestions)
   - [Draw versions & fingerprints](#draw-versions--fingerprints)
   - [Wishlists](#wishlists-version-2)
   - [Anonymous questions](#anonymous-questions-version-2)
   - [Withdrawals](#withdrawals-version-2)
   - [Backups](#backup-export-and-restoration)
6. [Privacy and security limitations](#privacy-and-security-limitations-please-read)
7. [Automated tests](#automated-tests)
8. [Project structure](#project-structure)
9. [Troubleshooting](#troubleshooting)
10. [Future upgrades & data compatibility](#future-upgrades--data-compatibility)
11. [Verification results](#verification-results)

---

## Features

**Version 1: core product**

- Multiple independent **event series** (e.g. *Family Christmas*, *Office Secret Santa*), each with yearly exchanges.
- **People with stable IDs.** Same-name people are kept apart, and an optional label ("Mum's side") tells them apart on screen.
- Bulk add (paste a list), CSV import, and re-using people from earlier years.
- **Forced pairings** ("Simba must buy for Nala") and **forbidden pairings** (one-way or both ways).
- **Relationship-aware rules**: partners, parent/child, siblings, same household and custom relationships, each with a
  configurable policy (none / one-way / mutual) plus per-pair exceptions.
- **Households and groups**, which can be kept from drawing each other.
- **History**: confirmed draws automatically become history. You can also add older years by hand or by CSV.
- **Repeat prevention**: previous year, 2 or 3 years, all years, or a custom window, either *hard* ("never repeat") or
  *soft* ("avoid if possible", with a documented scoring model).
- An optional **"no direct swaps"** rule (no A→B and B→A).
- A **constraint-aware solver** with **smart diagnostics**: when a draw is impossible you get plain-English reasons and
  *tested* fixes.
- **Review before confirming**, then the draw is **frozen** as a version with a **SHA-256 fingerprint**.
- **Version history** with comparison, superseded versions kept, and warnings when you redraw after sharing links.
- **Encrypted per-person reveal links** (AES-256-GCM, a unique key per link, the key kept in the URL fragment).
- **Four interactive reveal themes**: Classic Christmas Letter, Mystery Present, Advent Calendar and Elegant Christmas.
- **Secret Santa codenames** ("Welcome back, Agent Snowflake").
- A **distribution dashboard** with copy link, copy invitation, preview, QR code, CSV/text export and manual
  "shared" tracking.
- **Visual privacy mode** that hides who-buys-for-whom on organiser screens.
- **Save the revealed card as an image**.
- **Backups**: plain or password-encrypted, a "setup only" option, and merge or replace on import.
- Mobile-friendly and keyboard-accessible, with support for reduced motion and no third-party scripts.

**Version 2: participant experience**

- **Wishlists**: entered by the organiser, or sent in by participants as an encrypted message.
- **Replacement links** when a wishlist changes (the app tells you which givers need one).
- **Withdrawals** with a **minimal-change repair**, saved as a new draw version.
- **Anonymous gift questions** through a manual, encrypted relay via the organiser.
- A private **gift checklist** on each participant's reveal page.
- A **history heatmap** and per-person fairness statistics.

---

## Quick start for organisers

1. Open the app and press **Create your first exchange**.
2. **Details**: name, year, budget (AUD by default), date, theme and a greeting.
3. **Participants**: add names one by one, paste a list, or import a CSV.
4. **Relationships**: e.g. mark Simba & Nala as partners. By default partners can't draw each other.
5. **Rules**: optional forced/forbidden pairings, "no direct swaps", and how far back to avoid repeats.
   The **Who can buy for whom** grid explains every blocked pairing; press **Check these rules** to test them.
6. **Draw & confirm**: generate, review the checks, then **Confirm**. The draw is now frozen as *version 1*.
7. **Share links**: press **Create links**, then **Copy invite** for each person and paste it into WhatsApp, Discord,
   email, SMS or anything else. Tick **Shared** as you go.
8. Back up your workspace from **Backups & imports**.

Next year, open the exchange's **Settings** and choose **Create next year's exchange**. People, relationships, rules
and theme are copied, and this year's draw becomes history.

---

## Putting it on GitHub Pages (step by step)

You don't need to know how to program for this, only how to use the GitHub website.

1. **Create a GitHub account** at <https://github.com> if you don't have one.
2. **Create a new repository**: click **+ → New repository** and name it, e.g. `secret-santa`. It can be public or private
   (private repositories need a paid plan for Pages). Don't add a README.
3. **Upload the project**: on the empty repository page, click **uploading an existing file** and drag in *everything*
   in this folder **except** `node_modules`, `dist`, `test-results` and `screenshots`. Make sure the hidden
   `.github` folder is included (see Troubleshooting if your computer hides it). Commit the upload.
   *(If you use git: `git remote add origin https://github.com/<you>/secret-santa.git` then `git push -u origin main`.)*
4. **Turn on Pages**: go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. **Wait for the build**: open the **Actions** tab. The workflow *Test and deploy to GitHub Pages* runs the tests, builds
   the site and publishes it, which takes about 3–5 minutes. A green tick means it worked.
6. **Open your site** at `https://<your-username>.github.io/secret-santa/` (the address is also shown in Settings → Pages).

Every time you push changes to `main`, the site is tested and redeployed automatically.

**Base path:** the build uses relative paths (`base: './'`) and hash-based routing, so it works under any repository name
with no extra configuration. To force an absolute base, set the `BASE_PATH` environment variable at build time, e.g.
`BASE_PATH=/secret-santa/ npm run build`.

---

## Running it on your own computer

You'll need [Node.js](https://nodejs.org) version 20 or newer (22 recommended).

```bash
npm install
```

```bash
npm run dev
```

Then open the address it prints (usually <http://localhost:5173>).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with instant reload |
| `npm run build` | Type-checks and builds the production site into `dist/` |
| `npm run preview` | Serves the built site locally |
| `npm run serve:subpath` | Serves `dist/` at `http://localhost:4173/secret-santa/`, exactly like GitHub Pages |
| `npm run typecheck` | TypeScript strict type check |
| `npm test` | Unit, integration, component and compatibility tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) against the production build on a sub-path |

Before the first `npm run test:e2e`, install the test browser once:

```bash
npx playwright install chromium
```

---

## How the pieces work

### Participant reveal links & encryption

A reveal link looks like this:

```
https://you.github.io/secret-santa/#r=1.<encrypted data>.<secret key>
```

- Everything after `#` is the **URL fragment**. Browsers **never send it to the web server** (GitHub never sees it) and
  don't include it in `Referer` headers. The page also sets `referrer-policy: no-referrer`.
- `<encrypted data>` is the person's payload, encrypted with **AES-256-GCM** (authenticated encryption, so any change is
  detected). It uses a **fresh random 96-bit IV**, and the payload is compressed first.
- `<secret key>` is a **random 256-bit key used for this one link only**, so one person's link can't decrypt anyone else's.
- The payload contains **only** what that giver needs: event and draw IDs, the draw version, the link number, the
  giver's name and codename, the recipient's name, event details, the theme, the recipient's public wishlist (optional)
  and the organiser's public "relay" key for anonymous questions. It **never** contains the full assignment list,
  other people's data or your private notes.
- Opening a link needs **nothing from your browser**: it works on any phone or computer, even after you clear your
  data. Refreshing just decrypts the same link again. Nothing is ever redrawn.
- Damaged, truncated or tampered links show a friendly error and never a partial result. Link contents are validated
  even after decryption.
- Every participant link type (reveal, question, answer, wishlist request) uses a different label in the authenticated
  data, so one type can't be passed off as another.

Base64 is only used to fit the encrypted bytes into a URL. It is not the protection; the encryption is.

### Forced and forbidden rules

- **Forced** pairings are hard constraints and are never broken. Contradictions (someone forced to buy for two people,
  two people forced onto one recipient, self-pairing, a forced pairing that's also forbidden or blocked by a
  relationship/household/history rule, or a forced pair that would be a swap when swaps are off) are reported and must be
  resolved by you.
- **Forbidden** pairings are either **one-way** ("Simba can't buy for Nala", while Nala may still buy for Simba) or
  **mutual**. They can be disabled without deleting them.

### Relationship exclusions & households

Relationships (partner, parent/child, sibling, same household, custom) are **defined once** and reused every year.
**Whether they block anything is set per exchange**: each relationship type has a policy, and individual pairs can have
exceptions.

| Policy | Effect |
| --- | --- |
| No exclusion | The relationship is recorded but doesn't restrict the draw |
| One-way | The first person can't buy for the second (for parent/child: the parent can't buy for the child) |
| Mutual | Neither can buy for the other |

Defaults: partners and same-household relationships are mutual; the others are "no exclusion".
**Households / groups** block everyone inside them from drawing each other, with an on/off switch per exchange and
per household.

### History & repeat prevention

History is built from **the confirmed draw of every exchange** plus **records you add or import**. You choose which
series count, so unrelated exchanges don't affect each other by default.

*Event years* are the years that actually have history, newest first. So "the previous event year" means the last
exchange, even if a year was skipped.

**Hard** mode forbids any pairing within the window. **Soft** mode allows repeats but minimises this score:

```
for each pairing g → r that happened inside the window:
    base    = Σ round(100 × recencyDecay ^ rank)      rank 0 = most recent earlier year, 1 = the one before…
    penalty = round(base × (1 + frequencyWeight × (timesPaired − 1)))
    + 25 if "discourage reverse" is on and r → g happened in the most recent year
```

The defaults are recencyDecay 0.6 and frequencyWeight 0.5. The solver minimises the **total** penalty, so it repeats a
pairing only when no repeat-free arrangement exists, and then prefers old, rare repeats.

### The draw algorithm

1. Every rule is turned into a giver × recipient matrix, and each blocked pairing records the reasons it's blocked.
2. A **minimum-cost perfect matching** (Hungarian algorithm, O(n³)) finds an arrangement where everyone gives and
   receives once, while minimising the soft history penalty. Each allowed pairing gets a tiny **cryptographically
   random** tie-break, chosen so it can never outweigh a real penalty. Equally good draws are therefore picked at random.
3. If "no direct swaps" is on and the best matching contains a swap, a **branch-and-bound search** takes over. It
   assigns the most-constrained person first, prunes using a maximum-matching feasibility check and cost lower bounds,
   and runs within node and time limits.
4. Every result is **validated independently** before being accepted. The app reports whether the result is *proven
   optimal*, *proven impossible*, or *stopped at the limit* (inconclusive). It never "shuffles until it works".

Heavy work runs in a **Web Worker** so the page stays responsive. In testing, 100–120 people with dense rules solve in
well under a second.

**Honesty note:** draws are randomised among the fairest options, but they are *not* proven to be a uniformly random
sample of every possible valid draw.

### Smart conflict suggestions

When no draw is possible, the app shows:

- **Direct contradictions** between forced pairings and other rules.
- **People with no possible match**, naming the reason for every candidate (e.g. *"Simba cannot be assigned a recipient.
  Nala is excluded by the partner relationship, Timon is excluded because of last time's assignment (2025), and Pumbaa
  is already required as Rafiki's recipient."*).
- **Group-level shortages**, proven with Hall's theorem from a maximum matching (e.g. *"4 participants belong to
  Household A, but only 3 eligible recipients exist outside that household"*).
- **Swap-only failures**, shown only when an exhaustive search proves them.
- **Suggested fixes**: candidate rule changes are taken from *your* rules, applied to a copy, and re-solved. **Only
  fixes that actually produce a valid draw are shown.** Single changes are tried first, then pairs. Fixes are ranked by
  number of changes, then how "intentional" the rule is (history is relaxed before relationships, which come before
  explicit forbidden or forced rules), then the repeat count. "Smallest possible fix" is only claimed when it's proven.
  Nothing changes until you press **Review & apply** and confirm.

### Draw versions & fingerprints

- Generating creates a **draft**. Regenerating replaces the draft. Confirming creates a **frozen version**.
- Statuses: *Draft → Confirmed → Active* (links created) *→ Superseded* (a newer version was confirmed) or *Archived*.
- The storage layer **refuses** any change to a frozen snapshot; only sharing metadata can change. A redraw or repair
  always creates a **new** version.
- **Fingerprint** = SHA-256 of a canonical JSON form of the snapshot (participants, assignments, rule configuration,
  solver info). Set-like lists are sorted by ID, object keys are sorted, and there is no whitespace
  (`ss-canonical-json-v1`, documented in `src/utils/canonicalJson.ts`). It's shown as e.g. `8A73-C21D-9F44`, with the
  full digest available.
- A fingerprint shows a draw is **unchanged** compared with a value you recorded and trust. It is **not a signature** and
  doesn't prove who made or approved the draw.
- Reveal pages show "*Family Christmas 2026 — Draw Version 2*" but never claim to be the latest version, because a
  static link can't know that.

### Wishlists (Version 2)

- **Workflow A (simplest):** you enter wishlists on the **Wishlists** page before creating links. Each giver's link
  includes only **their own recipient's** wishlist, never organiser-only notes.
- **Workflow B:** press **Request link** for a person and send it to them. They fill in a form, and the page gives them an
  **encrypted message**, encrypted to your exchange's key so only your browser can read it. They send it back to you by
  any chat app, and you paste it into the **Inbox**.
- Links don't update themselves. When a wishlist changes after links were sent, the Share page flags the affected
  givers and creates **replacement links** for them.

### Anonymous questions (Version 2)

1. A giver opens their reveal, presses **Create question message**, and sends the encrypted message to you.
2. You paste it into **Questions → Inbox**, then press **Create link for {recipient}** and forward that link.
3. The recipient sees only the question (never who asked) and creates an encrypted reply for you.
4. You paste the reply, press **Create answer link**, and forward it to the giver.

*Who can see what:* question and reply messages are encrypted with ECDH P-256 and AES-256-GCM to the organiser's key.
Questions are anonymous **to the recipient**, but **not to you**: the message identifies the giver so you can route the
answer, and your chat app shows who sent each message. Nothing is sent automatically.

### Withdrawals (Version 2)

On **Withdrawals**, pick who dropped out. The repair solver keeps every hard rule and minimises **the number of people
whose recipient changes** first, then historical repeats. You get a before/after view (removed, changed and unchanged),
and applying it creates a **new version**. Unchanged people's old links stay correct, and the Share page creates
**replacement links** only for those whose assignment changed. Old links **cannot be revoked**, so tell the affected
people which link is current.

The app doesn't promise that only one or two assignments change: rules may force more, and the screen says when a
repair is proven minimal.

### Backup export and restoration

- **Backups & imports → Download backup**:
  - *Include draws and history (sensitive)* is needed for a full restore. Turn it off for a "setup only" copy.
  - *Protect with a password* uses PBKDF2-SHA-256 (600 000 iterations) and AES-256-GCM. Lose the password and the file
    can't be opened.
- **Restore** validates the whole file against strict schemas first (lengths, types, references), then lets you choose:
  - **Add to my workspace**: adds only new records. Existing ones are never overwritten.
  - **Replace my workspace**: wipes and restores, after you type `REPLACE`.
- Older backup formats are migrated on import (see *Future upgrades*).

---

## Privacy and security limitations (please read)

- **Anyone with a person's link can see their assignment.** The link *is* the secret, so send it privately.
- **Links can't be revoked** once sent. A redraw doesn't switch old links off; they keep showing the old assignment,
  labelled with their draw version.
- **No identity checks:** a static website can't verify who opens a link.
- **No syncing:** your organiser data lives only in this browser on this device. Back it up, and restore it to move
  devices.
- **Fingerprints aren't signatures:** they detect changes against a trusted recorded value, not authorship.
- **"Hide who is buying for whom" is visual only.** It can't stop you, the organiser, from seeing data stored in your
  own browser.
- **Codenames are decorative**, not anonymity. Screenshots or printed cards can link codenames to people.
- **No tracking:** the app can't know whether anyone opened a link, viewed an assignment, bought a gift or filled in a
  wishlist. "Shared" is a manual tick.
- **Anonymous questions** are anonymous to the recipient, not to the organiser.
- **Browser storage can be cleared** by the browser or the user. The app asks for persistent storage, but keep backups.
- No analytics, ads, trackers, external fonts or third-party scripts are loaded. Production builds ship a strict
  Content-Security-Policy. All names, notes and wishlists are rendered as text (never HTML), and wishlist links are
  restricted to `http(s)`.

---

## Automated tests

| Suite | Tool | Covers |
| --- | --- | --- |
| `src/services/assignmentEngine.test.ts` | Vitest | 2, 3, 6 and 100–150 people; self-assignment; uniqueness; forced/forbidden (one-way and mutual); partner, parent-child and override policies; households; no-swaps (including proven-impossible cases); hard and soft history; series isolation; joiners and leavers; duplicate names; performance |
| `src/services/conflictAnalyzer.test.ts` | Vitest | Contradictory forced rules, no-match explanations, Hall-violation household message, swap-only failures, history remedies, *every remedy re-verified*, rules unchanged without approval, two-change fallback, minimality reporting |
| `src/services/cryptography.test.ts` | Vitest | AES-GCM round trip, unique keys and IVs, wrong key, modified ciphertext, truncated data and missing IV, kind binding, not-base64 check, ECDH relay, password encryption, per-participant isolation, malformed URLs, no organiser-storage dependency |
| `src/services/drawLifecycle.test.ts` | Vitest + fake IndexedDB | Fingerprint determinism and tamper detection, immutable snapshots, new versions and superseding, comparison, link issuing and sharing, next-year history, deletion keeping history, withdrawal repair and carried links, question/reply relay, wishlist submission and replacement links, encrypted backup round trip preserving versions, merge never overwriting, hostile backup files |
| `src/services/misc.test.ts` | Vitest | CSV parsing and formula-injection protection, name resolution (no guessing), codename uniqueness, URL safety, secure random, repair minimality |
| `src/tests/components.test.tsx` | React Testing Library | Reveal requires interaction, keyboard and focus, animation versus reduced motion, every theme, long names, XSS-safe rendering, matrix explanations, concealment, remedies requiring confirmation |
| `src/tests/compat.test.ts` | Vitest | **Frozen v1 link and backups must keep working** |
| `tests/e2e/organiser.spec.ts` | Playwright | Full organiser flow on the built site under `/secret-santa/`: draw, confirm, links, every link opened in a fresh browser, refresh stability, redraw warning, persistence, impossible rules with applied fix, deep links, CSP |
| `tests/e2e/reveal.spec.ts` | Playwright (desktop + Pixel 7) | All four themes, keyboard, reduced motion, long names without overflow, card image download, corrupted links, question packet, checklist persistence |
| `tests/e2e/v2.spec.ts` | Playwright | Withdrawal → minimal repair → v2 → replacement link; full anonymous question round trip across three browsers |

---

## Project structure

```
secret-santa/
├── .github/workflows/deploy.yml   # test → build → deploy to GitHub Pages
├── public/favicon.svg
├── scripts/serve-subpath.mjs      # serves dist/ at /secret-santa/ like GitHub Pages
├── src/
│   ├── app/                       # organiser shell + hash router
│   ├── components/                # UI kit, matrix, diagnosis, distribution, history heatmap…
│   ├── hooks/                     # live IndexedDB queries, constraint model hook
│   ├── pages/                     # dashboard, people, history, backups, help, event workspace steps
│   ├── reveal/                    # participant app: reveal, questions, wishlist form, checklist, card export
│   ├── services/                  # framework-free business logic (all unit-tested)
│   │   ├── assignmentEngine.ts    # solver (Hungarian + branch-and-bound)
│   │   ├── hungarian.ts
│   │   ├── constraintModel.ts     # rules → matrix with reasons
│   │   ├── constraintValidator.ts # independent draw validation
│   │   ├── conflictAnalyzer.ts    # diagnostics + verified remedies
│   │   ├── historicalFairness.ts  # history windows + soft scoring model
│   │   ├── relationshipRules.ts
│   │   ├── cryptography.ts        # AES-GCM, ECDH relay, PBKDF2, SHA-256
│   │   ├── revealLinks.ts         # link formats + payload schemas
│   │   ├── drawVersions.ts / drawIntegrity.ts / drawRepair.ts
│   │   ├── storage.ts             # IndexedDB (Dexie) + immutability guard
│   │   ├── backups.ts / schemas.ts / csvImport.ts
│   │   ├── wishlist.ts / anonymousQuestions.ts / invitations.ts
│   │   └── eventOps.ts / solverClient.ts / solverTasks.ts
│   ├── themes/                    # classic, present, advent, elegant
│   ├── types/                     # data models (models.ts) and link payloads (reveal.ts)
│   ├── utils/
│   ├── workers/solver.worker.ts
│   └── tests/                     # setup, fixtures, component and compat tests
├── tests/e2e/                     # Playwright
├── index.html · vite.config.ts · tailwind.config.js · tsconfig.json · playwright.config.ts
```

Key modelling decisions: participant identity is separate from yearly membership; relationship definitions are separate
from exclusion policies; history is separate from the current draw; confirmed snapshots are immutable; reveal payloads
don't depend on the organiser database; display names are never used as keys.

---

## Troubleshooting

| Problem | What to do |
| --- | --- |
| A link "could not be opened" | Chat apps sometimes cut long links. Resend it, use the QR code, or create a fresh link on Share links (same assignment, new link). |
| My exchanges disappeared | You may be in another browser, a private window, or your browser cleared site data. Restore a backup. |
| "No valid draw is possible" | Read the explanation and use one of the tested fixes. Small groups with many rules are the usual cause; two people can never avoid a direct swap. |
| The Actions build failed | Open the failed run in the **Actions** tab. Test failures show their names. Make sure you uploaded `package-lock.json` and the `.github` folder. |
| The site shows 404 | Check Settings → Pages → Source is **GitHub Actions**, and use the full address including `/secret-santa/`. |
| I can't see the `.github` folder to upload it | On macOS press <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd> in Finder; on Windows enable *View → Hidden items*. |
| Image export looks plain | The festive fonts load the first time the page opens; try again after the page has fully loaded. |

---

## Future upgrades & data compatibility

- Every stored record has a `schemaVersion`; link payloads carry `v` and the link format carries a version prefix (`#r=1.`).
- Browser storage uses Dexie's append-only versioning: new releases add `db.version(n).upgrade(...)` steps that
  **migrate** data. History and confirmed draws must never be dropped.
- Backups from older versions go through `MIGRATIONS` in `src/services/backups.ts` before validation. A backup from a
  *newer* app version is refused with a clear message instead of being misread.
- Links: a future format would use `#r=2.`. The decoder for `1.` must be kept so links already sent keep working.
  `src/tests/compat.test.ts` holds frozen v1 fixtures that must keep passing.
- Ideas that would need a server, and so are deliberately not included: automatic notifications, revocable links,
  "has opened" tracking, and real-time sync between organiser devices.

---

## Verification results

These were run on Windows 11, Node 22.18, Chromium (Playwright) on 13 October 2026:

| Check | Result |
| --- | --- |
| `npm run typecheck` (strict) | ✅ no errors |
| `npm test` | ✅ 95 tests passed, 7 files |
| `npm run build` | ✅ built; the reveal page loads a separate, smaller bundle than the organiser |
| `npm run test:e2e` (built site served at `/secret-santa/`) | ✅ 25 tests passed (desktop + mobile) |
| GitHub Pages deployment | ⚠️ **Not verified here.** It needs your GitHub repository; the workflow is included and the sub-path behaviour is tested locally with `scripts/serve-subpath.mjs`. |

Known limitations of this release:

- Draws are randomised but not proven uniformly distributed (see *The draw algorithm*).
- In extremely constrained cases with "no direct swaps", the search may stop at its time limit. The app then says the
  result is inconclusive or not proven optimal, instead of guessing.
- QR codes for very long links (for example with large wishlists) may fail; the app tells you and you can share the link
  as text.
- Links are compressed with the browser's built-in `CompressionStream`. Very old browsers without it (e.g. Safari before 16.4, released 2023) show an "update your browser" message instead of the reveal.

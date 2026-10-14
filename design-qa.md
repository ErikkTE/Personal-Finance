# Design QA — Personal Finance PWA

Date: 2026-10-11
Branch: `Demo`
Scope: responsive dashboard/navigation, upcoming-payment ordering, reversible delete/undo flows, and mobile viewport behavior. Existing Sheets/Drive storage remains in use; server restore actions were added for single-item Undo.

## Previous device-profile checks (2026-10-05)

| Device profile | Viewport | Result |
| --- | ---: | --- |
| iPhone | 390 × 844 | Pass. Bottom navigation fits without horizontal overflow. The “More” menu exposes upload, subscriptions, and AI. Subscription navigation works. |
| iPad Pro portrait | 1024 × 1366 | Pass. The icon rail and content stay separate; no sidebar overlap. Dashboard cards and transaction area remain readable. |
| Mac | 1440 × 900 | Pass. Labeled sidebar, month controls, summary cards, due list, and transaction area have room to breathe. |

## Interaction checks

- Overview navigation and month selector render and respond.
- iPhone “More” menu opens and can navigate to subscriptions.
- Installment and subscription forms open, show their fields and actions, and cancel without creating data.
- Dialogs cover the viewport correctly; their footer actions remain visible above mobile navigation.
- Upload, history, installments, subscriptions, and AI remain reachable through the responsive navigation.
- Empty demo state remained empty; no test transactions were saved.
- At that time, existing Google Sheets/Drive APIs were not modified as part of the visual redesign; single-item restore endpoints were added later for Undo.

## Issues found and corrected

- At the iPad breakpoint, the collapsed navigation rail initially overlapped the content. The rail width and main offset now match.
- Page-entry transforms created stacking contexts that placed subscription dialogs behind the header/navigation. Route and page transitions now fade without retaining those transforms; dialogs layer above navigation.
- The upload banner button inherited browser button borders. Its native border and font defaults are reset.

## Reference alignment

The dashboard uses a monthly budget hierarchy inspired by YNAB, a concise upcoming-payments list inspired by Monarch, and a searchable transaction-ledger direction inspired by Copilot. These informed information hierarchy and interaction patterns; the app keeps its own visual style and existing feature set.

## Verification on 2026-10-11

- `npm run build`: passed.
- `node --check` on the three changed API handlers and Apps Script source: passed.
- `git diff --check`: passed.
- Local Vite Preview: Overview rendered at the available 552 × 847 browser surface; mobile navigation opened the More menu and navigated to Subscriptions; the subscription form opened and canceled without saving data.
- No Playwright package or configured automated test suite is present. The local preview was checked through the available browser UI; exact iPhone Air and desktop viewport profiles were not re-tested in this pass.
- A previous environment note (2026-10-05): direct Vite development startup was blocked because Vite scanned parent-directory `/Users/et/package.json` and `/Users/et/tsconfig.json`, which contained merge-conflict markers. Those files are outside this repository; the production build and local Preview worked.

## Verification on 2026-10-11 — playful pastel theme (Concept 1)

- Responsive visual review used explicit browser viewports: iPhone Air 420 × 912, iPad portrait 1024 × 1366, and Mac desktop 1440 × 900.
- No horizontal document overflow at any of the three viewports. The iPhone bottom navigation stayed fixed while the subscription page scrolled to its end; the page content remained visible above it.
- iPhone navigation interaction passed: “More” opened its menu, “Subscriptions” reached the subscription screen, and the central add action opened its bottom sheet. The empty demo data remained unchanged; no form was submitted and no file was uploaded.
- iPad portrait retained a separate compact icon rail and content area; desktop retained the labeled sidebar. Neither layout overlapped the dashboard.
- Browser console: no errors or warnings observed.
- `npm run build`: passed. `git diff --check`: passed. No automated test suite is configured.
- Dependency note: `npm audit --omit=dev` reports one high advisory for `source-map-js@1.2.1`, reached through PostCSS/Vite. The same version is present in the committed base lockfile, so it predates this theme change; it was not auto-updated as part of this UI task.

Final result: passed

## Security follow-up on 2026-10-11

- Root cause confirmed: `source-map-js@1.2.1` was selected under `Vite → PostCSS → source-map-js`; the vulnerable parser can block the Node.js event loop when given a crafted indexed source map.
- Updated only the resolved transitive package in `package-lock.json` to patched `source-map-js@1.2.2`. The existing PostCSS semver range accepts the patched release, so no override or Vite upgrade was necessary; this security fix did not change `package.json`.
- `npm explain source-map-js`: resolves to `1.2.2`. `npm audit --omit=dev`: 0 vulnerabilities. `npm run build`: passed. `git diff --check`: passed.

## Responsive design QA — monthly commitments (Concept 3)

Date: 2026-10-14
Reference: `/Users/erik/.codex/generated_images/01a0f16a-1169-7710-9833-9f6327992be0/exec-f2442205-5fda-4d70-930a-7a71e111cc94.png` (853 × 1844)
Preview: `http://localhost:4173/`

### Visual and responsive review

- Compared the live page with the selected reference: monthly total first, clear blue add action, then three color-coded groups for fixed expenses, installments, and services. Reused the existing wallet illustration and Phosphor icons to stay consistent with the app.
- iPhone-sized 390 × 844 and iPhone Air target 420 × 912: groups stack in one column, the fixed bottom navigation remains visible, and the add action and expanded empty state remain reachable. Inputs remain 16 px to avoid Safari's automatic focus zoom; small mobile labels and end-term choices were enlarged for readability.
- iPad portrait 834 × 1194: compact icon rail remains separate from the content; groups use a two-column grid and wrap cleanly.
- Mac 1440 × 1000: labeled sidebar remains visible and the three groups fit in one row.
- At all checked widths, `documentElement.scrollWidth` and `body.scrollWidth` matched the viewport; no horizontal overflow was observed.

### Interaction and data checks

- Accordion groups open and close accessibly; empty groups expose the relevant next action. The installment shortcut navigated to installment management and returned to the summary.
- The fixed-expense form shows amount, category, due day, start month, and ongoing/end-month choices. Selecting an end month reveals the month field and inclusive duration; cancel closed the form without saving.
- The current local demo state contains no commitment records. No fixture or test record was saved. Representative fixed-expense, installment, subscription, end-date, and paid-installment calculations are covered by the helper tests; the populated row layout was not visually exercised against live data in this pass.
- Browser console showed no errors after loading the production build in the local Preview.

### Verification

- `npm test`: passed (4/4).
- `npm run build`: passed.
- `git diff --check`: passed.
- The reference image and live browser screenshots were inspected during this session. The browser screenshots were not exported as standalone files.

Final result: passed

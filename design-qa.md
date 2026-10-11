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

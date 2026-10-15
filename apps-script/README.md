# Google Apps Script setup

`Code.gs` is the server-side bridge between the Vercel API, one Google Sheet, and one Drive folder. Requests require a shared secret and only the Vercel server should know it.

## Configure Script Properties

Open **Project Settings → Script Properties** and add:

| Property | Value |
| --- | --- |
| `SPREADSHEET_ID` | ID of the spreadsheet that contains the `Transactions` tab |
| `DRIVE_FOLDER_ID` | ID of the top-level Drive folder for receipt files |
| `API_SHARED_SECRET` | A private random value of at least 32 characters |

The `Transactions` header row must contain the exact names in `REQUIRED_HEADERS` at the top of `Code.gs`. Other columns can remain in place; the script maps by header name.

## Deploy

1. Save the project and run a deployment as a web app.
2. Set **Execute as** to the script owner so Drive/Sheets access uses that Google account.
3. The Vercel server needs to call the `/exec` URL. Apps Script web apps may require a public invocation setting; if enabled, the endpoint is publicly reachable but rejects calls without the secret. Keep the URL and secret private, and only use a high-entropy shared secret.
4. Copy the `/exec` URL to `GOOGLE_APPS_SCRIPT_URL` in Vercel.
5. Set the same value from `API_SHARED_SECRET` as `GOOGLE_APPS_SCRIPT_SECRET` in Vercel, then redeploy.
6. Verify the app's connection status. The health action checks that the spreadsheet, tab, headers, and Drive folder can be opened.

### Deploy from the repository with the Apps Script API

The repository includes a small, dependency-free API client at `scripts/apps-script-api.mjs`. It reads the live project before writing and preserves every existing script file and the live manifest. It updates only versioned web-app deployments and verifies that their `/exec` URL stays the same. Every write requires the explicit `--apply` flag.

The local helper can sign in directly with a Google Desktop OAuth client and save tokens outside the repository. Create a Desktop app OAuth client in the `Personal Finance Script Tools` Cloud project, download its JSON file, and save it as:

```text
~/.config/personal-finance/apps-script-oauth-client.json
```

Then run:

```sh
npm run apps-script:auth
npm run apps-script:inspect
```

The sign-in requests these Google OAuth scopes:

- `https://www.googleapis.com/auth/script.projects`
- `https://www.googleapis.com/auth/script.deployments`

The first sign-in opens Google's consent page. Review the app name and requested Apps Script permissions there before approving. Tokens are saved under `~/.config/personal-finance/` with file mode `0600`, outside the repository. The OAuth client JSON and token files must never be committed or put in a client-side `VITE_*` variable. If needed, set `APPS_SCRIPT_OAUTH_CLIENT_FILE` or `APPS_SCRIPT_OAUTH_TOKEN_FILE` to use different local paths. The Apps Script API must be enabled for the Google Cloud project associated with this script. The connected Google Drive tools can edit Sheet cells and Drive files, but do not grant permission to update Apps Script source.

Commands:

```sh
npm run apps-script:inspect
npm run apps-script:auth
npm run apps-script:sync -- --apply
npm run apps-script:deploy -- <existing-deployment-id> --apply
```

`inspect` is read-only and lists existing deployment IDs and URLs. `sync` updates only `Code.gs` in the Apps Script project's HEAD content while preserving its other files. The Apps Script HEAD deployment always tracks saved source changes; use it only for testing. Existing versioned deployments stay unchanged until updated. `deploy` creates a new immutable version and updates the specified versioned deployment, retaining its URL and access configuration. The helper refuses to update the read-only HEAD deployment. Without `--apply`, `sync` and `deploy` only show what they would change.

The first OAuth grant is a required account-level step; after it, the client can be used from this repository without copying source through the Apps Script editor. Updating source changes the HEAD deployment immediately, while versioned deployments require `deploy` after syncing.

Do not place the shared secret in browser code, a `VITE_*` variable, a public document, or a committed `.env` file. To rotate it, update both Script Properties and Vercel, then redeploy.

## Supported actions

- `health`: validates access to the configured spreadsheet, `Transactions` tab, expected headers, and Drive folder.
- `listTransactions`: reads transaction rows, including hidden ones; the PWA keeps hidden rows out of its normal lists.
- `saveTransaction`: writes a recoverable row, uploads and links optional evidence, and resumes retries with the same transaction ID without appending a duplicate.
- `softDeleteTransaction`: stores the previous status in an additional `สถานะก่อนซ่อน` column and changes the row status to `ลบแล้ว`; it does not remove the row or the evidence file.
- `restoreMonthTransactions`: restores every hidden row in the selected budget month and returns the refreshed transaction list.
- `restoreTransaction`: restores one hidden transaction and its saved status for the delete toast's Undo action.
- `restoreInstallment` and `restoreSubscription`: clear the soft-delete timestamp for one plan or subscription.
- `listRecurringExpenses`, `saveRecurringExpense`, `softDeleteRecurringExpense`, and `restoreRecurringExpense`: manage fixed monthly expenses in the `Recurring Expenses` tab, including their inclusive start/end months and undoable soft deletion.
- `listDebts`, `saveDebt`, `recordDebtPayment`, `recordDebtEvent`, and `getDebtEvidence`: track loan records in `Debts` and append repayment, early-close, clarification, correction, and cancellation events in `Debt Events`. Corrections preserve before/after values and a reason in the event ledger; once any payment is recorded, changes to the amount, date, interest, and installment terms are blocked. Existing rows in `Debt Payments` remain readable for compatibility. The script creates the tabs and a private `04_ทวงหนี้/DEBT-…` folder tree under the configured Drive folder automatically. Each loan stores up to three photos and an optional signature; each repayment event stores up to three photos plus the required signature. Direct update and delete actions are not supported.

`Debt Events` is an append-only ledger with one row per received payment, correction, or clarification/cancellation record. A correction shows the before/after values and reason while retaining the original row and evidence. Partial payments can be recorded against an installment; an early-close event settles the remaining schedule. The PWA can print or save an individual history report as PDF, including principal, contract total, actual received, remaining balance, schedule, and a filename index of Drive evidence. The report indexes evidence files; original images remain in Drive.

Rows hidden before this restore feature was added do not have a saved previous status, so restoring those rows sets their status to `ยืนยันแล้ว`.

The listCategories and saveCategory actions store custom category names in an App Categories tab. The tab is created automatically and keeps transaction, recurring-expense, and subscription categories separate.

### Receipt storage and retry behavior

Set `DRIVE_FOLDER_ID` to the top-level folder. Evidence is first placed in `99_รอตรวจสอบ`; after the transaction row and Drive link are saved, the script moves it into `01_รายรับ`, `02_รายจ่ายประจำ`, or `03_รายจ่ายผันแปร` according to transaction type and nature. Missing subfolders are created automatically.

When a request includes evidence, the sheet row is written with status `รอตรวจสอบ` before the Drive upload. It changes to `ยืนยันแล้ว` only after the evidence link is saved and the file is moved. If a request fails partway through, the PWA keeps the transaction ID for an immediate retry; after reopening the app, choose the pending row and continue it with the same ID. The script finds and reuses the transaction-named file, including when a previous attempt created the file but did not save its link, instead of appending a duplicate. If the upload never created a file, attach the receipt again from the pending-row dialog.

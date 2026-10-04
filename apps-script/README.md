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

Do not place the shared secret in browser code, a `VITE_*` variable, a public document, or a committed `.env` file. To rotate it, update both Script Properties and Vercel, then redeploy.

## Supported actions

- `health`: validates access to the configured spreadsheet, `Transactions` tab, expected headers, and Drive folder.
- `listTransactions`: reads transaction rows, including hidden ones; the PWA keeps hidden rows out of its normal lists.
- `saveTransaction`: writes a recoverable row, uploads and links optional evidence, and resumes retries with the same transaction ID without appending a duplicate.
- `softDeleteTransaction`: stores the previous status in an additional `สถานะก่อนซ่อน` column and changes the row status to `ลบแล้ว`; it does not remove the row or the evidence file.
- `restoreMonthTransactions`: restores every hidden row in the selected budget month and returns the refreshed transaction list.
- `restoreTransaction`: restores one hidden transaction and its saved status for the delete toast's Undo action.
- `restoreInstallment` and `restoreSubscription`: clear the soft-delete timestamp for one plan or subscription.

Rows hidden before this restore feature was added do not have a saved previous status, so restoring those rows sets their status to `ยืนยันแล้ว`.

### Receipt storage and retry behavior

Set `DRIVE_FOLDER_ID` to the top-level folder. Evidence is first placed in `99_รอตรวจสอบ`; after the transaction row and Drive link are saved, the script moves it into `01_รายรับ`, `02_รายจ่ายประจำ`, or `03_รายจ่ายผันแปร` according to transaction type and nature. Missing subfolders are created automatically.

When a request includes evidence, the sheet row is written with status `รอตรวจสอบ` before the Drive upload. It changes to `ยืนยันแล้ว` only after the evidence link is saved and the file is moved. If a request fails partway through, the PWA keeps the transaction ID for an immediate retry; after reopening the app, choose the pending row and continue it with the same ID. The script finds and reuses the transaction-named file, including when a previous attempt created the file but did not save its link, instead of appending a duplicate. If the upload never created a file, attach the receipt again from the pending-row dialog.

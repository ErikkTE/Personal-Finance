# Google Apps Script setup

`Code.gs` is the server-side bridge between the Vercel API, one Google Sheet, and one Drive folder. Requests require a shared secret and only the Vercel server should know it.

## Configure Script Properties

Open **Project Settings → Script Properties** and add:

| Property | Value |
| --- | --- |
| `SPREADSHEET_ID` | ID of the spreadsheet that contains the `Transactions` tab |
| `DRIVE_FOLDER_ID` | ID of the Drive folder for receipt files |
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
- `listTransactions`: reads visible transaction rows.
- `saveTransaction`: uploads optional evidence, appends a transaction row, and avoids duplicate IDs.
- `softDeleteTransaction`: changes the row status to `ลบแล้ว`; it does not remove the row or the evidence file.

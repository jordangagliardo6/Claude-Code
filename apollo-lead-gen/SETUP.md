# Apollo HVAC Lead Gen — Setup & First-Run Guide

Pulls up to 25 owner-contact leads per day from Apollo.io for HVAC / plumbing companies
in Southwest Michigan and appends them to a Google Sheet. Runs automatically at 7am Eastern.

---

## What you need

| Item | Where to get it |
|---|---|
| Apollo.io API key | app.apollo.io → Settings → Integrations → API |
| Google Cloud project | console.cloud.google.com |
| Google Sheet (new or existing) | sheets.google.com |
| Node.js 18+ | nodejs.org |

---

## Step 1 — Clone and install dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first tab to exactly: **Leads**
3. Copy the sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
   ```
4. Keep the spreadsheet open — you'll share it with the service account in Step 4.

The script writes these column headers on the first run automatically:
`Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes`

---

## Step 3 — Set up Google Cloud credentials (service account)

This is a one-time setup. A service account lets the script write to your sheet
without requiring you to be logged in.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable
4. Create a Service Account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Name: `lead-gen-bot` (or anything)
   - Skip role assignment — click Done
5. Click the service account → Keys → Add Key → JSON
   - Download the JSON file
   - Save it as `apollo-lead-gen/google-service-account.json`
6. Copy the service account email address (looks like `name@project.iam.gserviceaccount.com`)
7. Open your Google Sheet → Share → paste the service account email → set role to **Editor**

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_SHEETS_ID=your_sheet_id_from_step_2
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
GMAIL_USER=your_gmail@gmail.com
GMAIL_PASS=your_16_char_app_password
MAX_LEADS_PER_RUN=25
TIMEZONE=America/New_York
```

**Gmail App Password** (for error notification emails):
1. Go to myaccount.google.com → Security
2. Enable 2-Step Verification if not already on
3. Search "App passwords" → Create one for "Mail" + "Other (Lead Gen)"
4. Paste the 16-character password into `GMAIL_PASS`

---

## Step 5 — Verify both connections before going live

```bash
npm run test-connection
```

You should see:

```
── Apollo.io ────────────────────────────────────
✓ PASS  Apollo API key is valid

── Google Sheets ────────────────────────────────
✓ PASS  Connected to spreadsheet: "My Leads"
✓ PASS  Column headers verified
✓ PASS  Test row written (1 row)
✓ PASS  Test row cleaned up

All checks passed. Safe to start the scheduler.
```

Fix any failures before continuing.

---

## Step 6 — Do a manual test pull

```bash
npm run run-now
```

This runs the full workflow immediately and adds up to 25 leads to your sheet.
Check the sheet — you should see new rows appear within ~30 seconds.

---

## Step 7 — Start the daily scheduler

```bash
npm start
```

The process stays running and fires at **7:00 AM Eastern** every morning.

To keep it running after you close the terminal, use `pm2` or `screen`:

```bash
# Option A — pm2 (recommended, auto-restarts on crash)
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 save
pm2 startup   # follow the printed command to survive reboots

# Option B — screen (simpler, no auto-restart)
screen -S lead-gen
npm start
# Ctrl+A then D to detach; screen -r lead-gen to re-attach
```

---

## Customizing the search

All editable settings are in `src/config.js`:

| Setting | Description |
|---|---|
| `CITIES` | Target city list — add or remove cities here |
| `INDUSTRIES` | Apollo keyword tags — change to target a different niche |
| `JOB_TITLES` | Decision-maker titles to search for |
| `EMPLOYEE_RANGE` | `'1,25'` = 1–25 employees; `'1,50'` = 1–50, etc. |

Changes take effect on the next run — no restart needed for cron mode.

---

## Apollo plan requirement

> **Important:** The People Search API (`/mixed_people/search`) requires an Apollo **paid plan**.
> The Free plan does not include API-level prospecting access.
>
> Upgrade at [apollo.io/pricing](https://www.apollo.io/pricing) — the **Basic plan** ($49/mo) includes
> 1,000 export credits/month and full API access. Your existing credits (lead credits,
> direct-dial credits) carry over after upgrading.

Your account currently has:
- **75 lead credits** remaining
- **160 direct-dial credits** remaining (used to reveal phone numbers)

Each daily run of 25 leads uses up to 25 direct-dial credits.
At 25 leads/day that's ~160 days of runs on your current direct-dial balance.

To check remaining credits anytime: app.apollo.io → Settings → Credits

---

## Error notifications

If Apollo returns no results or the Google Sheets write fails, the script:
1. Logs the full error to the console
2. Sends an alert email to `NOTIFICATION_EMAIL` (if configured)

The email subject is: `Apollo Lead Gen — Run Failed (timestamp)`

---

## Troubleshooting

**Apollo returns 0 results**
- Check that your API key is correct and active
- SW Michigan is a smaller market — some runs may return fewer leads
- You can broaden the search by adding more cities or removing the employee size filter in `src/config.js`

**Google Sheets 403 error**
- The service account email must be added as an Editor on the sheet
- Double-check you shared the sheet with the right email from the JSON key file

**"No space" in credentials file path**
- Use an absolute path in `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` if the relative path isn't resolving

**Leads not in SW Michigan**
- Apollo's location data comes from LinkedIn and company profiles — it isn't always precise
- The city filter in `isInTargetArea()` (index.js) accepts leads where city is unknown
  to avoid discarding valid Michigan contacts. You can tighten this if you're getting too many off-target results.

**Duplicate leads appearing**
- The dedup check is case-insensitive on Business Name
- If the same company appears under two slightly different names it will slip through
- Add the duplicate to your sheet manually and it'll be caught on future runs

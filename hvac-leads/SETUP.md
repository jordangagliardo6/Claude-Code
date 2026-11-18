# HVAC Lead Generator — Setup Guide

Automated daily lead pulls from Apollo.io → Google Sheets, targeting HVAC
owner-operators in Southwest Michigan.

---

## Prerequisites

- Node.js 18+ installed
- An Apollo.io account (free tier works; paid gives more results)
- A Google account with the spreadsheet you want to write into

---

## Step 1 — Install dependencies

```bash
cd hvac-leads
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in to https://app.apollo.io
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets access

Follow the instructions in `credentials/README.md`. In short:

1. Create a Google Cloud project
2. Enable the Google Sheets API
3. Create a service account and download the JSON key
4. Save it as `credentials/service-account.json`
5. Share your target spreadsheet with the service account email (Editor access)

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | What to put |
|----------|-------------|
| `APOLLO_API_KEY` | Your Apollo.io API key |
| `GOOGLE_SPREADSHEET_ID` | The ID from your spreadsheet URL |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to your service account JSON (default: `./credentials/service-account.json`) |
| `GOOGLE_SHEET_TAB` | Tab name in the spreadsheet (default: `Sheet1`) |
| `MAX_LEADS_PER_RUN` | Max new leads to pull per run (default: `25`) |
| `CRON_SCHEDULE` | Cron expression (default: `0 7 * * *` = 7am) |

**Finding your Spreadsheet ID:**
Open the spreadsheet in your browser. The URL looks like:
```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_ID/edit
```

---

## Step 5 — Test your connections (do this first!)

```bash
TZ=America/New_York node test-connection.js
```

This will:
- Ping Apollo.io and confirm your key works + show how many results exist
- Connect to Google Sheets, create the header row if needed, and confirm access

Expected output:
```
Testing Apollo.io connection... OK (143 total results available in Apollo for this query)
Testing Google Sheets connection... OK (sheet has 0 existing lead row(s))

--- Summary ---
Apollo.io:    ✓ Connected
Google Sheets: ✓ Connected

All systems go.
```

If either test fails, fix it before continuing.

---

## Step 6 — Do a manual test run

```bash
TZ=America/New_York node run-once.js
```

This pulls up to `MAX_LEADS_PER_RUN` leads immediately and writes them to your sheet.
Open the spreadsheet and verify the data looks correct.

---

## Step 7 — Start the daily scheduler

```bash
TZ=America/New_York node scheduler.js
```

The job will fire every day at 7:00 AM Eastern Time.

To keep it running in the background on a Linux server:
```bash
# Using PM2 (recommended):
npm install -g pm2
TZ=America/New_York pm2 start scheduler.js --name hvac-leads
pm2 save
pm2 startup  # Follow the printed command to auto-start on reboot

# Or with nohup:
TZ=America/New_York nohup node scheduler.js > leads.log 2>&1 &
```

---

## Customization

**Change target cities:** Edit `TARGET_CITIES` in `src/config.js`

**Change job titles:** Edit `TARGET_JOB_TITLES` in `src/config.js`

**Change industry tags:** Edit `TARGET_INDUSTRIES` in `src/config.js`

**Change employee range:** Edit `EMPLOYEE_RANGE` in `src/config.js`

**Add email alerts on failure:** In `src/leadGenerator.js`, find the `logError` function
and add a call to your preferred email/webhook service (Mailgun, SendGrid, etc.)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `APOLLO_API_KEY` invalid | Double-check in Apollo Settings → API |
| 0 results from Apollo | Try relaxing filters; Apollo free tier has rate limits |
| Sheets 403 error | Re-share the sheet with the service account email as Editor |
| `service-account.json` not found | Check the path in `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` |
| Duplicate leads | The script checks the Business Name column; near-duplicates won't be caught |

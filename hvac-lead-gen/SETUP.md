# HVAC Lead Generator — Setup Guide

This script searches Apollo.io for HVAC business owners in Southwest Michigan and
appends up to 25 new leads per day to your Google Sheet.

---

## Prerequisites

- Node.js 18+
- An Apollo.io account with API access (Basic plan or higher)
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `APOLLO_API_KEY` | Apollo → Settings → Integrations → API |
| `SPREADSHEET_ID` | From the Google Sheet URL: `…/spreadsheets/d/<ID>/edit` |
| `SHEET_NAME` | The tab name at the bottom of your sheet (default: `Untitled`) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the JSON key file you'll create in Step 3 |
| `ALERT_EMAIL` | Your email for error notifications |

---

## Step 3 — Set up Google Sheets access (Service Account)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → Search "Google Sheets API" → Enable
4. Create a **Service Account**:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name it `hvac-lead-gen` and click Create
5. Grant it the **Editor** role (or just Sheets Editor)
6. Open the service account → Keys tab → Add Key → JSON → Download
7. Save the downloaded file to `hvac-lead-gen/credentials/service-account.json`
8. **Share your Google Sheet** with the service account email
   (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
   — give it **Editor** access

---

## Step 4 — First run (verify connections)

```bash
node index.js --run-now
```

You should see:
```
✅ Apollo.io — connected successfully.
✅ Google Sheets — connected. Spreadsheet: "HVAC Leads — SW Michigan (Master)"
```

If either check fails, fix the error before continuing.

---

## Step 5 — Start the scheduler

```bash
node index.js
```

This keeps the process running and fires the job every morning at 7 am Eastern.
To keep it alive after closing your terminal, use a process manager:

**Using PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

**Using nohup:**
```bash
nohup node index.js &> leads.log &
```

---

## Customizing

| What to change | Where |
|---|---|
| Add/remove cities | `SW_MICHIGAN_CITIES` array in `index.js` |
| Change max leads per run | `MAX_LEADS_PER_RUN` in `.env` |
| Change the schedule | `CRON_SCHEDULE` in `.env` (cron syntax, UTC) |
| Add/remove job titles | `TARGET_TITLES` array in `index.js` |
| Change column order | `appendRows()` function in `index.js` |

---

## Apollo Plan Notes

- **People Search** (`/api/v1/mixed_people/search`) requires a **Basic plan or higher**.
- **Phone number enrichment** (`/api/v1/people/bulk_match`) consumes enrichment credits.
  Each batch of 10 contacts costs credits — check your plan's monthly limit.
- If you're on the free plan, the search will return an error. Upgrade at:
  https://app.apollo.io/#/settings/plans/upgrade

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Add the key to your `.env` file |
| `Apollo search failed — HTTP 401` | Key is wrong or expired — regenerate in Apollo settings |
| `Apollo plan limit` | Upgrade your Apollo plan |
| `Google Sheets key not found` | Check `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env` |
| `The caller does not have permission` | Share the spreadsheet with the service account email |
| `No new leads this run` | All results were duplicates — the sheet is fully caught up |

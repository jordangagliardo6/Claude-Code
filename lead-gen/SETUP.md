# HVAC Lead Gen — First-Run Setup Guide

This script pulls up to 25 HVAC leads per day from Apollo.io and appends them
to a Google Sheet, deduplicating automatically. It runs at 7:00 AM Eastern Time.

---

## Step 1 — Install Node.js dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API Key

---

## Step 3 — Set up Google Sheets access

You need a **service account** so the script can write to your spreadsheet
without interactive login.

### 3a. Create a Google Cloud project (skip if you have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (name it anything, e.g. `hvac-lead-gen`)

### 3b. Enable the Google Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** and click **Enable**

### 3c. Create a service account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it `hvac-lead-gen`, click **Done**
4. Click the new service account → **Keys** tab → **Add Key → JSON**
5. A `credentials.json` file downloads — move it into this `lead-gen/` folder

### 3d. Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet
2. Name it something like `HVAC Leads — Southwest Michigan`
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit
   ```

### 3e. Share the sheet with the service account

1. In the spreadsheet, click **Share**
2. Paste the service account email (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
   — it's in your `credentials.json` under `client_email`
3. Give it **Editor** access, click **Send**

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key from Step 2 |
| `GOOGLE_SPREADSHEET_ID` | The spreadsheet ID from Step 3d |
| `GOOGLE_CREDENTIALS_PATH` | `./credentials.json` (or full path) |
| `ALERT_EMAIL` | Your email (optional — for error alerts) |
| `SMTP_*` | Gmail SMTP settings (optional) |

---

## Step 5 — Verify both connections

```bash
npm run verify
```

Expected output:
```
  Apollo.io ............. OK  (5 result(s) returned)
  Google Sheets ......... OK  ("HVAC Leads — Southwest Michigan")

  ✓ Both connections successful.
```

If either check fails, re-read the error message — it will tell you exactly what's missing.

---

## Step 6 — Initialize the spreadsheet header row

Run this **once** on a blank sheet to write the column headers:

```bash
npm run init-sheet
```

Your sheet will now have this header row:
```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

---

## Step 7 — Do a test run

```bash
npm run run-now
```

Check your Google Sheet — you should see up to 25 new rows added.

---

## Step 8 — Start the daily scheduler

```bash
npm start
```

The process will stay running and fire every day at **7:00 AM Eastern Time**.

To keep it running after you close your terminal, use a process manager:

```bash
# Using PM2 (install once with: npm install -g pm2)
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # auto-restart on reboot
```

---

## Customizing the workflow

| What to change | Where |
|---|---|
| Target cities / regions | `src/apolloSearch.js` → `SW_MICHIGAN_LOCATIONS` array |
| Industries to search | `src/apolloSearch.js` → `INDUSTRY_KEYWORDS` array |
| Job titles to target | `src/apolloSearch.js` → `TARGET_TITLES` array |
| Max leads per day | `index.js` → `MAX_LEADS_PER_RUN` constant |
| Sheet tab name | `src/googleSheets.js` → `SHEET_NAME` constant |
| Column layout | `src/googleSheets.js` → `HEADER_ROW` array + `src/leadProcessor.js` → `mapLeadToRow()` |
| Schedule time | `index.js` → cron string `'0 7 * * *'` (minute hour day month weekday) |

---

## Error handling

- If Apollo returns 0 results → logged to console + email alert (if configured)
- If Google Sheets write fails → logged to console + email alert (if configured)
- All errors include the full stack trace in the log

For Gmail app passwords (required if using Gmail for alerts):  
[myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

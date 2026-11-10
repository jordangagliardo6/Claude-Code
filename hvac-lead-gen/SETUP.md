# HVAC Lead Gen — Setup & First Run Guide

Automated daily workflow: pulls HVAC leads from Apollo.io, deduplicates, and
appends to your Google Sheet every morning at 7am Eastern.

---

## What You Need

- Node.js 18 or later (`node --version` to check)
- An Apollo.io account with API access ([apollo.io](https://app.apollo.io))
- A Google Cloud project with the Sheets API enabled
- A Google Sheets spreadsheet to append leads into

---

## Step 1 — Get Your Apollo API Key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 2 — Set Up Google Sheets Access (Service Account)

This workflow uses a **service account** so it can write to your sheet
without opening a browser window every day.

### A. Create a Google Cloud Project (skip if you already have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project**, name it anything (e.g. `hvac-lead-gen`)
3. Select the project

### B. Enable the Google Sheets API

1. In the left menu: **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

### C. Create a Service Account

1. **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name it (e.g. `hvac-lead-gen-bot`), click **Done**
4. Click the service account you just created
5. Go to the **Keys** tab → **Add Key → Create new key → JSON**
6. Download the JSON file → save it as `credentials.json` in this folder
   - **Keep this file secret — never commit it to git**

### D. Share Your Spreadsheet With the Service Account

1. Open your Google Sheet in a browser
2. Click **Share**
3. Enter the service account's email (found in `credentials.json` as `client_email`,
   e.g. `hvac-lead-gen-bot@your-project.iam.gserviceaccount.com`)
4. Set permission to **Editor** → click **Send**

### E. Get Your Spreadsheet ID

The spreadsheet ID is the long string in the URL between `/d/` and `/edit`:

```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SPREADSHEET_ID/edit
```

---

## Step 3 — Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=paste_your_apollo_key_here
SPREADSHEET_ID=paste_your_spreadsheet_id_here
SHEET_NAME=Sheet1          # change if your tab has a different name
GOOGLE_CREDENTIALS_PATH=./credentials.json
NOTIFY_EMAIL=              # optional — your email for error alerts
```

**For 7am Eastern Time:**
- During EST (Nov–Mar): `CRON_SCHEDULE=0 12 * * *`  (12:00 UTC = 7:00 EST)
- During EDT (Mar–Nov): `CRON_SCHEDULE=0 11 * * *`  (11:00 UTC = 7:00 EDT)

---

## Step 4 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 5 — Verify Both Connections

Before the first scheduled run, confirm everything is wired up:

```bash
npm run verify
```

You should see:

```
1. Testing Apollo.io API...
   ✓ Apollo connected. Query matched 47 total results.
   ✓ Sample contact: John Smith at Smith's HVAC (Kalamazoo) — (269) 555-1234

2. Testing Google Sheets connection...
   ✓ Google Sheets authenticated successfully.
   ✓ Spreadsheet is accessible. Found 0 existing business entries.

 ✓ All checks passed — ready to run!
```

---

## Step 6 — Run Once Manually (Optional)

Do a live test pull before trusting the scheduler:

```bash
npm run test-run
```

Check your Google Sheet — you should see up to 25 new rows with today's date.

---

## Step 7 — Start the Scheduler

```bash
npm start
```

The process will stay alive and fire at the configured time each day.
To keep it running after you close your terminal, use **PM2**:

```bash
npm install -g pm2
pm2 start src/index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```

---

## Customizing

### Change the target cities

Edit `src/apollo.js` → `SW_MICHIGAN_LOCATIONS` array.
Each entry should be `"City, Michigan, United States"`.

### Change the number of leads per run

Set `MAX_LEADS_PER_RUN=50` in `.env` (Apollo's max per page is 100).

### Add or remove job titles

Edit `src/apollo.js` → `TARGET_TITLES` array.

### Change the spreadsheet columns

Edit `src/sheets.js` → `HEADER_ROW` and the row-building section in `appendLeads`.

---

## Error Alerts

If a run fails (Apollo error, Sheets write error, missing API keys), the
error is printed to the console and — if you configured `NOTIFY_EMAIL` and
Gmail credentials in `.env` — emailed to you.

**To enable email alerts:**
1. Enable 2-Step Verification on your Google account
2. Go to **myaccount.google.com → Security → App Passwords**
3. Generate an app password for "Mail"
4. Set in `.env`:
   ```
   NOTIFY_EMAIL=you@example.com
   GMAIL_USER=you@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

---

## Files

```
hvac-lead-gen/
  src/
    index.js        — entry point, cron scheduler, orchestration
    apollo.js       — Apollo.io API client + contact normalization
    sheets.js       — Google Sheets read/write
    notify.js       — console + email error alerts
    verify.js       — pre-flight connection checks
  package.json
  .env.example      — copy to .env and fill in your values
  credentials.example.json  — shape of the Google service account file
  SETUP.md          — this file
```

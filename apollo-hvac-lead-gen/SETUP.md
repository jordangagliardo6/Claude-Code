# Apollo HVAC Lead Gen — First-Run Setup Guide

Complete this guide once. After that, start the scheduler and it runs itself every morning at 7 AM ET.

---

## What you need before starting

| Requirement | Where to get it |
|---|---|
| Apollo.io account | [apollo.io](https://www.apollo.io) — free tier works for testing; Basic ($49/mo) gives 1,000 exports/month |
| Google account | Any Google account |
| Node.js 18+ | [nodejs.org](https://nodejs.org) |

---

## Step 1 — Clone and install dependencies

```bash
cd apollo-hvac-lead-gen
npm install
```

---

## Step 2 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Rename **Sheet1** to **Leads** (right-click the tab → Rename)
3. Leave it empty — the workflow writes the header row automatically on first run
4. Copy the **Spreadsheet ID** from the URL bar:
   ```
   https://docs.google.com/spreadsheets/d/  ← THIS PART HERE →  /edit
   ```
   Example: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`

---

## Step 3 — Set up Google Service Account credentials

A **service account** lets the script write to your sheet without you having to be logged in — perfect for a scheduled job.

### 3a. Create a Google Cloud project (skip if you already have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it anything (e.g. `apollo-lead-gen`) → **Create**

### 3b. Enable the Google Sheets API

1. In the left menu: **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

### 3c. Create a service account

1. **APIs & Services → Credentials → Create Credentials → Service Account**
2. Name it `lead-gen-bot` (or anything you like)
3. Skip the optional role/access steps and click **Done**

### 3d. Download the credentials JSON

1. Back on the **Credentials** page, click your new service account
2. Go to the **Keys** tab → **Add Key → Create new key → JSON** → **Create**
3. A JSON file downloads to your computer
4. Move that file into the `credentials/` folder of this project:
   ```
   apollo-hvac-lead-gen/
   └── credentials/
       └── google-service-account.json   ← place it here
   ```

### 3e. Share your spreadsheet with the service account

1. Open your new JSON file and copy the `client_email` value — it looks like:
   ```
   lead-gen-bot@your-project.iam.gserviceaccount.com
   ```
2. Open your Google Sheet → **Share** (top-right)
3. Paste that email address → set role to **Editor** → **Send**

---

## Step 4 — Set up Apollo.io API key

1. Log in to [apollo.io](https://www.apollo.io)
2. Go to **Settings → Integrations → API** (or visit [developer.apollo.io](https://developer.apollo.io))
3. Copy your API key

---

## Step 5 — Configure your .env file

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in:

```env
APOLLO_API_KEY=paste_your_apollo_key_here

GOOGLE_SPREADSHEET_ID=paste_your_spreadsheet_id_here

GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/google-service-account.json

MAX_LEADS_PER_RUN=25
```

**Optional — email alerts on errors:**
If you want an email when something breaks, also add:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password   # see note below
ALERT_EMAIL=where-to-send-alerts@gmail.com
```

> **Gmail App Password:** Regular Gmail passwords won't work here.
> Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
> create a new App Password for "Mail", and paste that 16-character code as `SMTP_PASS`.

---

## Step 6 — Verify both connections

Run this before starting the scheduler:

```bash
node verify.js
```

Expected output (all green):

```
── Environment Variables ────────────────────────────────
  ✓ APOLLO_API_KEY is set
  ✓ GOOGLE_SPREADSHEET_ID is set
  ✓ GOOGLE_SERVICE_ACCOUNT_KEY_PATH is set
  ✓ Service account key file found at ./credentials/google-service-account.json

── Apollo.io API ────────────────────────────────────────
  ✓ API key is valid — Apollo connection successful

── Google Sheets API ────────────────────────────────────
  ✓ Connected to spreadsheet: "HVAC Leads SW Michigan"
  ✓ Found "Leads" tab in the spreadsheet
  ✓ Read access confirmed — service account has the correct permissions

══════════════════════════════════════════════════
  All checks passed — ready to run the scheduler!
```

Fix any `✗` failures before continuing.

---

## Step 7 — Do a manual test run

```bash
node index.js --run-now
```

This runs the full workflow immediately — Apollo search, dedup check, and Sheets write — and exits. Check your Google Sheet. You should see up to 25 leads appended with today's date.

---

## Step 8 — Start the scheduler

```bash
node index.js
```

Leave this running. The cron job fires every day at **7:00 AM Eastern Time** (handles EST/EDT automatically via the `America/New_York` timezone).

To keep it running in the background on a server:

```bash
# Using PM2 (recommended for servers)
npm install -g pm2
pm2 start index.js --name apollo-leads
pm2 save         # persist across reboots
pm2 startup      # generate startup script

# Using nohup (quick & simple)
nohup node index.js &
```

---

## Customising the workflow

| What to change | Where |
|---|---|
| Add/remove cities | `src/config.js` → `CITIES` array |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Change job titles | `src/config.js` → `TITLES` array |
| Change industry keywords | `src/config.js` → `INDUSTRY_KEYWORDS` array |
| Change column names/order | `src/config.js` → `SPREADSHEET_COLUMNS` array |
| Change spreadsheet tab name | `src/config.js` → `SHEET_TAB` |
| Change employee size range | `src/config.js` → `EMPLOYEE_RANGES` array |

---

## Troubleshooting

**Apollo returns 0 results**
- Verify your API key in `.env`
- Check that your Apollo plan includes the People Search API (free tier has limits)
- The Southwest Michigan cities are small — Apollo's database coverage there may be sparse; try adding nearby cities like Grand Rapids

**"Permission denied" on Google Sheets**
- Re-confirm you shared the sheet with the service account email (Editor, not Viewer)
- The `client_email` in your JSON file must match exactly what you typed in the share dialog

**"Spreadsheet not found"**
- Double-check `GOOGLE_SPREADSHEET_ID` — copy only the ID portion of the URL, not the full URL

**Cron job fires at the wrong time**
- The scheduler uses `America/New_York` which automatically adjusts for daylight saving time
- Run `node -e "console.log(new Date().toLocaleTimeString('en-US', {timeZone:'America/New_York'}))"` to confirm your machine's timezone conversion is working

**Duplicate entries appear**
- The dedup check is case-insensitive on Business Name. If Apollo returns the same company under slightly different names (e.g. "Smith HVAC" vs "Smith H.V.A.C."), those will both be added. This is a data quality issue on Apollo's side.

---

## Files overview

```
apollo-hvac-lead-gen/
├── index.js              Scheduler entry point (cron) + --run-now flag
├── verify.js             Pre-flight connection checker
├── package.json
├── .env.example          Template — copy to .env and fill in
├── .gitignore            Keeps secrets and node_modules out of git
├── src/
│   ├── config.js         All tunable settings in one place
│   ├── apollo.js         Apollo.io API search and data mapping
│   ├── sheets.js         Google Sheets read / write
│   ├── workflow.js       Orchestrates the end-to-end flow
│   └── logger.js         Console + file logging, email alerts
└── credentials/
    └── google-service-account.json   (you create this — gitignored)
```

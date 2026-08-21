# HVAC Lead Gen — Setup Guide

Automated daily lead generation for SW Michigan HVAC companies.  
Searches Apollo.io and appends up to 25 new leads per day to your Google Sheet.

---

## Target Sheet

**SW Michigan HVAC Leads**  
https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit

Columns: Date Added · Business Name · Owner First · Owner Last · Phone · City · Website · Called · Notes

---

## One-Time Setup

### Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the two required values (see below).

---

### Step 3 — Get your Apollo.io API Key

1. Go to https://app.apollo.io/#/settings/integrations/api
2. Click **Create New API Key** → copy it
3. Paste it into `.env` as `APOLLO_API_KEY=...`

> **Plan note:** The people search endpoint requires a **paid Apollo plan** (Basic or higher).
> Free plans return `API_INACCESSIBLE`. Upgrade at https://www.apollo.io/pricing

---

### Step 4 — Set up Google Sheets access (service account)

The script uses a Google **service account** for authentication — this is the best approach for automated/cron jobs because it never expires.

1. Open https://console.cloud.google.com → select or create a project
2. Go to **APIs & Services → Library** → enable the **Google Sheets API**
3. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
   - Give it any name (e.g. `hvac-lead-gen`)
   - Role: **Editor** (or Sheets Editor)
4. Open the service account → **Keys** tab → **Add Key → JSON**
   - A `.json` file downloads — save it as `lead-gen/service-account-key.json`
5. **Share the Google Sheet with the service account email** (looks like `name@project.iam.gserviceaccount.com`)
   - Open the sheet → Share → paste the service account email → Editor access

Set in `.env`:
```
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account-key.json
```

Alternatively, paste the entire JSON contents as a single line into:
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

---

### Step 5 — Verify everything works

```bash
node test-connection.js
```

Expected output:
```
1. Checking Apollo.io API key... ✅  OK
   Logged in as: Jordan Gagliardo (jgagliardo98@gmail.com)
   Apollo plan:  basic

2. Checking Google Sheets access... ✅  OK
   Existing leads: 0

  ✅  ALL CHECKS PASSED (2/2)
  You're ready to run: node workflow.js
```

Fix any ❌ errors before continuing.

---

### Step 6 — Run once manually to confirm end-to-end

```bash
node run-now.js
```

Check your Google Sheet — new leads should appear in seconds.

---

### Step 7 — Start the daily scheduler

```bash
node workflow.js
```

This keeps the process running and fires every morning at **7:00 AM Eastern Time**.

To run it as a background service that survives reboots, use **PM2**:

```bash
npm install -g pm2
pm2 start workflow.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to enable auto-start
```

Check PM2 logs anytime with: `pm2 logs hvac-lead-gen`

---

## Customization

| What to change | Where |
|---|---|
| Target cities | `apollo-client.js` → `TARGET_CITIES` array |
| Job titles | `apollo-client.js` → `TARGET_TITLES` array |
| Industry keywords | `apollo-client.js` → `INDUSTRY_KEYWORDS` |
| Max leads per run | `.env` → `MAX_LEADS_PER_RUN=25` |
| Run time | `workflow.js` → `SCHEDULE = '0 7 * * *'` (standard cron syntax) |
| Sheet tab name | `sheets-client.js` → `SHEET_NAME = 'Sheet1'` |
| Sheet column order | `run-workflow.js` → the `rows` mapping at the bottom |

---

## Error Handling

All errors are:
1. Printed to the console with `[ERROR]` prefix
2. Written to `lead-gen.log` (auto-rotates at 5 MB)
3. Printed prominently with `=====NOTIFICATION=====` borders

To add **email alerts**, open `logger.js` and uncomment the nodemailer block at the bottom of `sendErrorNotification`. You'll need `npm install nodemailer` and a Gmail App Password.

---

## Files

```
lead-gen/
├── workflow.js          # Cron scheduler — start this for daily runs
├── run-now.js           # Manual one-shot trigger
├── test-connection.js   # First-run verification
├── run-workflow.js      # Core logic (Apollo → deduplicate → Sheet)
├── apollo-client.js     # Apollo.io REST API calls & normalization
├── sheets-client.js     # Google Sheets read/write helpers
├── logger.js            # Logging + notification hook
├── package.json
├── .env.example         # Copy to .env and fill in your keys
└── SETUP.md             # This file
```

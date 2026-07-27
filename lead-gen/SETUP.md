# HVAC SW Michigan Lead Gen — First-Run Setup Guide

Pulls up to 25 HVAC/plumbing/mechanical company owners from Apollo.io every morning
at 7am ET and appends new ones to your Google Sheet. Skips duplicates automatically.

Your Google Sheet is already created:
**[HVAC SW Michigan Leads](https://docs.google.com/spreadsheets/d/1Ox2uM8KR-_Fe-CIFrkGRdXMLQFnASqXXSaVCrzzao2o/edit)**

---

## Prerequisites

- Node.js 18 or later
- An Apollo.io account on a paid plan (the People Search API requires it)
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Get your Apollo API key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets auth (Service Account)

A service account lets the script write to your sheet without an interactive OAuth login.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Navigate to **APIs & Services → Library**, search for **Google Sheets API**, enable it
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
5. Give it any name, click **Done**
6. Open the service account → **Keys → Add Key → Create new key → JSON**
7. Save the downloaded file as `lead-gen/google-service-account.json`
8. Copy the `client_email` value from that file (looks like `name@project.iam.gserviceaccount.com`)
9. Open your Google Sheet and click **Share**
10. Paste the service account email and give it **Editor** access

---

## Step 4 — Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_key_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-service-account.json
SPREADSHEET_ID=1Ox2uM8KR-_Fe-CIFrkGRdXMLQFnASqXXSaVCrzzao2o
ALERT_EMAIL=jgagliardo98@gmail.com
```

The `SPREADSHEET_ID` is already set to the sheet that was created for you.

---

## Step 5 — Verify connections before the first scheduled run

```bash
TZ=America/New_York node index.js --test
```

This will:
1. Check that all env vars are set
2. Confirm Google Sheets is accessible
3. Confirm your Apollo API key is valid
4. Do a live pull and write real leads to the sheet

You should see output like:
```
✓ Environment variables look good.
✓ Google Sheets connected — spreadsheet: "HVAC SW Michigan Leads"
✓ Apollo.io API key is valid.
Running a live workflow pull now...
✓ Done — added 12 new lead(s), skipped 0 duplicate(s).
✓ Test run complete. All systems go.
```

If you see errors, the output explains exactly what to fix.

---

## Step 6 — Start the scheduler

```bash
TZ=America/New_York node index.js
```

The scheduler fires every day at 7:00am ET. Keep this terminal open, or use a
process manager (see below) to run it in the background.

---

## Running in the background (recommended)

### Option A — PM2 (easiest)

```bash
npm install -g pm2
cd lead-gen
TZ=America/New_York pm2 start index.js --name lead-gen
pm2 save
pm2 startup   # prints a command to run so it survives reboots
```

### Option B — System cron (no Node scheduler needed)

Instead of running `node index.js` as a long-running process, add a system cron:

```bash
crontab -e
```

Add this line (adjust the path to wherever you cloned the repo):

```
0 7 * * * cd /path/to/Claude-Code/lead-gen && /usr/bin/node workflow-runner.js >> /var/log/lead-gen.log 2>&1
```

Create `lead-gen/workflow-runner.js` (one-shot, no cron inside):

```js
require('dotenv').config();
const { runWorkflow } = require('./workflow');
const { notifyError } = require('./notify');
runWorkflow().catch((err) => notifyError('system cron', err));
```

---

## Customizing

### Change cities or add more

Edit `apollo.js` → `SW_MICHIGAN_LOCATIONS` array. Add or remove city strings.

### Change max leads per run

Edit `workflow.js` → `MAX_LEADS_PER_RUN` constant (default 25).

### Change the schedule

Edit `index.js` → `CRON_EXPRESSION` constant. Uses standard cron syntax.

### Add industries

Edit `apollo.js` → `KEYWORD_TAGS` and `NAICS_CODES` arrays.

### Enable email alerts on errors

1. Run `npm install nodemailer`
2. Fill in `SMTP_*` variables in `.env`
3. Uncomment the nodemailer block in `notify.js`

---

## Sheet columns

| Column | Field | Notes |
|--------|-------|-------|
| A | Date Added | Auto-filled by the script |
| B | Business Name | Dedup key — duplicates are skipped |
| C | Owner First Name | |
| D | Owner Last Name | |
| E | Phone Number | Mobile preferred over direct |
| F | City | |
| G | Website | |
| H | Called | **Left blank — fill this yourself** |
| I | Notes | **Left blank — fill this yourself** |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Apollo API error: API_INACCESSIBLE` | Your Apollo plan doesn't include the People API. Upgrade at apollo.io/pricing |
| `Google Sheets connection failed` | Make sure you shared the sheet with the service account email (Step 3.10) |
| `APOLLO_API_KEY is not set` | Your `.env` file is missing or not loaded — run from inside the `lead-gen/` folder |
| `Apollo returned 0 results` | The search returned results but none had phone numbers; try broadening filters in `apollo.js` |

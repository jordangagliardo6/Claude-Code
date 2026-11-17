# HVAC Lead Gen — Setup Guide

Automated daily lead generation: Apollo.io → Google Sheets, 7 AM Eastern.

---

## Prerequisites

- Node.js 18+ installed
- An Apollo.io account (free tier works for testing; paid tier gives phone numbers)
- A Google account with Google Drive / Sheets access

---

## Step 1 — Get your Apollo.io API Key

1. Log in at https://app.apollo.io
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 2 — Set up Google Service Account

This lets the script write to your spreadsheet automatically, with no browser login.

1. Go to https://console.cloud.google.com
2. Create a new project (or reuse one)
3. Enable **Google Sheets API**: APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - IAM & Admin → Service Accounts → **Create Service Account**
   - Name it something like `hvac-lead-gen`
   - Click **Done** (no extra roles needed)
5. Download credentials:
   - Click on the service account you just created
   - **Keys** tab → **Add Key** → **Create new key** → **JSON**
   - Save the downloaded file as `google-credentials.json` inside the `hvac-leads/` folder
6. **Share your spreadsheet** with the service account email:
   - Open your Google Sheet (or create a new one)
   - Click **Share** in the top right
   - Paste the service account email (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
   - Set permission to **Editor** → Share

---

## Step 3 — Get your Google Sheet ID

Your Sheet ID is the long string in the URL:
```
https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
```

If you don't have a spreadsheet yet, create a blank one — the script will write the header row automatically.

---

## Step 4 — Configure environment variables

```bash
cd hvac-leads
cp .env.example .env
```

Edit `.env` and fill in:
```
APOLLO_API_KEY=your_key_here
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-credentials.json
```

---

## Step 5 — Install dependencies

```bash
cd hvac-leads
npm install
```

---

## Step 6 — Test the connections (do this first!)

```bash
node index.js --test
```

This will:
- Ping Apollo.io and confirm your API key works + show how many results come back
- Connect to your Google Sheet and confirm it can read/write
- Write the header row if it's missing

You should see:
```
✓ Apollo connected — X result(s) returned for search filters.
✓ Google Sheets connected — sheet has 0 existing business(es).
✓ All connections OK — ready to run.
```

Fix any errors shown before continuing.

---

## Step 7 — Run it

**Run once manually** to confirm it populates leads:
```bash
node index.js
```

**Run as a persistent scheduled process** (stays running and fires at 7 AM ET daily):
```bash
# Simple: keep terminal open
node index.js

# Better: use pm2 so it survives terminal close / server reboots
npm install -g pm2
TZ=America/New_York pm2 start index.js --name hvac-leads
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

---

## Customization

| What to change | Where |
|---|---|
| Add/remove cities | `SW_MICHIGAN_LOCATIONS` array near top of `index.js` |
| Change job titles | `TARGET_TITLES` array |
| Change industry keywords | `INDUSTRY_KEYWORDS` string |
| Change max leads per run | `MAX_LEADS_PER_RUN` constant |
| Add more columns | `SHEET_COLUMNS` / `SHEET_HEADER` / `mapPersonToRow()` |

---

## Error handling

- All errors are printed to console **and** appended to `hvac-leads/errors.log`
- If Apollo returns 0 results or the Sheets write fails, the error is logged
- To add email alerts: install `nodemailer` and uncomment the `sendAlertEmail` call in `logError()`

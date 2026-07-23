# HVAC Lead Gen — First-Run Setup Guide

Automated workflow: **Apollo.io → Google Sheets**, runs daily at **7 AM Eastern**.

---

## What you need before starting

- Node.js 18 or later (`node --version`)
- An [Apollo.io](https://app.apollo.io) account (free tier works for testing; paid for phone numbers)
- A Google account with access to Google Cloud Console

---

## Step 1 — Get your Apollo API key

1. Log into Apollo.io
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 2 — Set up Google Sheets access

Apollo needs to write to a Google Sheet. The safest way is a **service account** (a bot account that never expires).

### 2a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → name it anything (e.g. `lead-gen`)
3. Select the project

### 2b. Enable the Sheets API

1. In the left menu: **APIs & Services → Library**
2. Search **Google Sheets API** → click it → **Enable**

### 2c. Create a service account

1. **APIs & Services → Credentials → Create Credentials → Service Account**
2. Name it (e.g. `lead-gen-bot`) → **Done**
3. Click the new service account → **Keys** tab → **Add Key → JSON**
4. A JSON file downloads — save it as `service-account.json` inside this folder

### 2d. Create your spreadsheet and share it

1. Create a new Google Sheet at [sheets.google.com](https://sheets.google.com)
2. Name the first tab **Leads** (or whatever you'll set `GOOGLE_SHEET_NAME` to)
3. Copy the **spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
   ```
4. Open `service-account.json`, find the `"client_email"` field, copy that email
5. Back in your spreadsheet: **Share → paste the service account email → Editor → Send**

---

## Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_key_here
GOOGLE_SPREADSHEET_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account.json
GOOGLE_SHEET_NAME=Leads
MAX_LEADS_PER_RUN=25
```

**Optional — email alerts on errors:**
```
ALERT_EMAIL=your@email.com
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password   # https://myaccount.google.com/apppasswords
```

---

## Step 4 — Install dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 5 — Test both connections

```bash
node test-connection.js
```

You should see:
```
✓ Apollo connected
✓ Google Sheets connected — Tab "Leads" found ✓
✓ All connections OK — safe to start the scheduler
```

Fix any errors reported before continuing.

---

## Step 6 — Run once manually (confirm end-to-end)

```bash
node index.js --run-now
```

Check your Google Sheet — you should see new rows with today's date, business names, phone numbers, etc.

---

## Step 7 — Start the daily scheduler

```bash
node index.js
```

The process stays running and fires at **7:00 AM Eastern** every morning.

**To run it in the background (Linux/Mac):**
```bash
nohup node index.js > lead-gen.log 2>&1 &
echo $! > lead-gen.pid   # save the PID so you can kill it later
```

**To stop it:**
```bash
kill $(cat lead-gen.pid)
```

**Or with PM2 (recommended for always-on):**
```bash
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing the workflow

| What to change | Where |
|---|---|
| Add / remove cities | `src/config.js` → `SW_MICHIGAN_CITIES` |
| Change industries | `src/config.js` → `TARGET_INDUSTRIES` |
| Change job titles | `src/config.js` → `TARGET_TITLES` |
| Add sheet columns | `src/config.js` → `SHEET_HEADERS` and `COLUMN_MAP` |
| Max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Change schedule | `.env` → `CRON_SCHEDULE` (cron format: `minute hour * * *`) |

---

## Apollo plan notes

- **Free plan**: People search is available but phone numbers require a paid plan
- **Basic plan**: ~50 mobile exports/month
- **Professional/Custom**: Unlimited or high-volume exports

If you see leads with no phone numbers, your Apollo plan may need upgrading.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Check `.env` file exists and has the key |
| `401 from Apollo` | API key is wrong — regenerate at Apollo Settings |
| `403 from Google Sheets` | Share the sheet with the service account email |
| `Tab "Leads" not found` | Rename the tab in Google Sheets, or update `GOOGLE_SHEET_NAME` in `.env` |
| `service-account.json not found` | Move the downloaded JSON into this folder |
| `No leads found` | Try widening `SW_MICHIGAN_CITIES` or `TARGET_INDUSTRIES` in `src/config.js` |

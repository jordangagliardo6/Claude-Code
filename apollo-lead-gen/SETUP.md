# Apollo Lead Gen — First-Run Setup Guide

Generates up to 25 HVAC leads per day for Southwest Michigan and appends them to your Google Sheet, deduplicated, every morning at 7 AM ET.

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js ≥ 18 | `node -v` to check |
| Apollo.io Professional+ | People Search + phone reveal are paid features |
| Google Cloud project | Free tier is fine |

---

## Step 1 — Install dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Configure Apollo

1. Log into [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API Keys**
3. Click **+ Create API Key**, copy it
4. Confirm you're on **Professional plan or higher** (Settings → Billing)

---

## Step 3 — Configure Google Sheets

### 3a. Enable the Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. **APIs & Services → Enable APIs → search "Google Sheets API" → Enable**

### 3b. Create a service account

1. **IAM & Admin → Service Accounts → + Create Service Account**
2. Name it anything (e.g. `lead-gen-bot`)
3. Skip optional role/user grant steps → **Done**
4. Click the service account → **Keys tab → Add Key → Create new key → JSON**
5. Save the downloaded file as `apollo-lead-gen/service-account.json`

### 3c. Share your spreadsheet

1. Open [your leads spreadsheet](https://docs.google.com/spreadsheets/d/1AeBxj0lE86Bkn7w00B5SW_z0DZsaho3shJoKddMKqqE)
2. Click **Share**
3. Paste the service account email (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
4. Set permission to **Editor** → Send

---

## Step 4 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account.json
GOOGLE_SPREADSHEET_ID=1AeBxj0lE86Bkn7w00B5SW_z0DZsaho3shJoKddMKqqE
GOOGLE_SHEET_NAME=Sheet1
ALERT_EMAIL_TO=jgagliardo98@gmail.com
```

For email alerts, also add `ALERT_EMAIL_FROM` + `GMAIL_APP_PASSWORD`. Leave those blank to use console logging only.

---

## Step 5 — Test connections BEFORE scheduling

```bash
node src/index.js --test
```

Expected output:
```
=== Apollo Lead Gen — Connection Test ===

1. Testing Apollo API key...   OK
   Account: your@email.com
   Plan: professional

2. Testing Google Sheets access... OK
   Spreadsheet: "SW Michigan HVAC Leads — New Sept 17 2026"

✓ Both connections verified. Safe to start the scheduler.
```

If Apollo shows `Plan: free` — upgrade before running. The People Search API is gated.

---

## Step 6 — Run once manually to verify end-to-end

```bash
node src/index.js --run-now
```

This runs the full fetch+append immediately. Check your Google Sheet — new rows should appear at the bottom (skipping any businesses already present).

---

## Step 7 — Start the scheduler

```bash
# Set Eastern Time and start (keep this terminal open, or use PM2/systemd)
TZ=America/New_York node src/index.js

# Or with PM2 (recommended for always-on):
npm install -g pm2
TZ=America/New_York pm2 start src/index.js --name lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

The scheduler runs at **7:00 AM ET every day**, pulls up to 25 new leads, and appends only businesses not already in column B.

---

## Customization

| File | What to change |
|---|---|
| `src/config.js` | Cities, job titles, industries, max leads/run, cron schedule |
| `.env` | API keys, spreadsheet ID, sheet tab name |
| `src/apolloService.js` | Apollo search payload, phone type priority |
| `src/sheetsService.js` | Column order, header row |

---

## Error handling

- If Apollo returns 0 results or fails → error logged to console + optional email alert
- If Google Sheets write fails → error logged + optional email alert  
- The script never crashes the scheduler on a single failed run
- Check logs with: `pm2 logs lead-gen` (if using PM2)

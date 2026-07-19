# HVAC Lead-Gen Workflow

Pulls up to **25 HVAC leads per day** from Apollo.io and appends them to a Google Sheet — automatically, every morning at 7 AM Eastern.

---

## What It Does

1. Queries Apollo.io for HVAC / Plumbing / Mechanical Contracting companies in Southwest Michigan (St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven)
2. Filters to companies with 1–25 employees and decision-maker titles (Owner, President, Founder, Co-Founder, General Manager) — in that priority order
3. Excludes any contact with no phone number
4. Appends new results to your Google Sheet — never re-adds a business already in the sheet
5. Runs on a cron schedule at 7 AM Eastern every day

**Sheet columns written automatically:**

| Column | Value |
|---|---|
| Date Added | Today's date |
| Business Name | Company name |
| Owner First Name | First name |
| Owner Last Name | Last name |
| Phone Number | Best available number (direct → mobile → other) |
| City | City, State |
| Website | Company URL if available |
| Called | *(blank — fill in manually)* |
| Notes | *(blank — fill in manually)* |

---

## Setup

### 1. Install Node.js

You need Node.js 18 or later. Check with:

```bash
node --version
```

Download from [nodejs.org](https://nodejs.org) if needed.

### 2. Install Dependencies

```bash
cd lead-gen
npm install
```

### 3. Set Up Apollo.io

1. Log in to [developer.apollo.io](https://developer.apollo.io) (or your Apollo dashboard)
2. Go to **Settings → API Keys**
3. Copy your API key

### 4. Set Up Google Sheets (Service Account)

This workflow uses a **Google Service Account** so it can write to your sheet without requiring a browser login each time.

**Step-by-step:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**: search "Sheets API" in the search bar → Enable
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `lead-gen-writer` (or anything)
   - Click **Create and Continue → Done**
5. Click the service account you just created → **Keys → Add Key → Create new key → JSON**
6. Save the downloaded JSON file as **`credentials.json`** inside the `lead-gen/` folder
7. Open the JSON file and copy the `client_email` value (looks like `lead-gen-writer@your-project.iam.gserviceaccount.com`)
8. Open your Google Sheet → click **Share** → paste that email → set role to **Editor** → Share

### 5. Create Your Google Sheet

Create a new Google Sheet. You can name it anything.

The workflow will automatically write headers on the first run — you don't need to add them manually.

Copy the **Sheet ID** from the URL:
```
https://docs.google.com/spreadsheets/d/  THIS_IS_THE_ID  /edit
```

### 6. Configure Your .env File

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_actual_apollo_key
SPREADSHEET_ID=your_actual_sheet_id
SHEET_NAME=Sheet1
GOOGLE_CREDENTIALS_PATH=./credentials.json
NOTIFICATION_EMAIL=you@youremail.com
```

---

## First Run — Confirm Connections

Before starting the scheduler, verify both APIs are working:

```bash
node test-connection.js
```

Expected output:
```
═══════════════════════════════════════════════════════════
  HVAC Lead-Gen — Connection Check
═══════════════════════════════════════════════════════════

── Apollo.io ─────────────────────────────────────────────
  ✓  APOLLO_API_KEY env var set
  ✓  Apollo account connected  (user: you@youremail.com)

── Google Sheets ─────────────────────────────────────────
  ✓  SPREADSHEET_ID env var set
  ✓  credentials.json found at ./credentials.json
  ✓  Google Sheets connected  (spreadsheet: "My HVAC Leads")

─────────────────────────────────────────────────────────
  Results: 5 passed, 0 failed

  Everything looks good! Start the scheduler with:
    node index.js
```

### Run One Batch Right Now (No Waiting)

```bash
node index.js --run-now
```

This pulls leads immediately and exits — useful for testing before the first scheduled run.

---

## Start the Daily Scheduler

```bash
node index.js
```

The process stays running and fires the workflow at **7:00 AM Eastern** every morning. To keep it alive in production use [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup    # follow the printed command to auto-start on reboot
```

---

## Customizing

Everything you'd want to change lives in **`config.js`**:

| What to change | Where |
|---|---|
| Add/remove cities | `TARGET_CITIES` array |
| Change industries | `TARGET_INDUSTRIES` array |
| Change job titles | `TARGET_TITLES` array |
| Max leads per run | `MAX_LEADS_PER_RUN` |
| Run time | `CRON_SCHEDULE` + `CRON_TIMEZONE` |
| Sheet column layout | `SHEET_COLUMNS` array |

---

## Error Handling

If Apollo returns zero results **or** the Google Sheet write fails, the workflow logs a clear error block to the console:

```
╔══════════════════════════════════════════════════════════╗
║              LEAD-GEN WORKFLOW ERROR                     ║
╚══════════════════════════════════════════════════════════╝
  Time      : 2025-01-15T12:00:00.000Z
  Context   : Apollo.io fetch
  Error     : Apollo API request failed (HTTP 401): Unauthorized
  Notify    : you@youremail.com
  ...
```

If you're using PM2, pipe logs to a file:
```bash
pm2 logs hvac-lead-gen --lines 50
```

---

## File Overview

```
lead-gen/
├── index.js          ← Scheduler + workflow runner
├── apollo.js         ← Apollo.io API client
├── sheets.js         ← Google Sheets API client
├── config.js         ← All tuneable settings (cities, filters, schedule)
├── test-connection.js← Pre-flight connection check
├── package.json
├── .env.example      ← Copy to .env and fill in
└── credentials.json  ← Your Google service account key (not committed)
```

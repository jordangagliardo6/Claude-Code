# HVAC Lead Workflow — Setup Guide

Automated lead generation: Apollo.io → Google Sheets, 25 leads/day, 7 AM Eastern.

---

## What You Need Before Starting

| Requirement | Details |
|---|---|
| **Apollo.io account** | Basic plan ($49/mo) minimum — free plan blocks the People Search API |
| **Google Cloud project** | Free — needed to create a service account for Sheets access |
| **Node.js 18+** | `node --version` to check |

---

## Step 1 — Clone and install

```bash
cd apollo-leads-workflow
npm install
```

---

## Step 2 — Get your Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets access (service account)

This is the only complex step. Follow it carefully once — you won't need to redo it.

### 3a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project**
3. Name it anything (e.g. "HVAC Lead Workflow")

### 3b. Enable the Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → click **Enable**

### 3c. Create a service account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name it anything (e.g. "hvac-lead-bot") → click **Create and Continue**
4. Skip role assignment → click **Done**

### 3d. Download the credentials JSON

1. Click your new service account in the list
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**
3. A file downloads — rename it `credentials.json`
4. Move it into this directory (`apollo-leads-workflow/credentials.json`)

### 3e. Share the Google Sheet with the service account

1. Open `credentials.json` — find the `client_email` field (looks like `hvac-lead-bot@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet:
   [https://docs.google.com/spreadsheets/d/1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI/edit](https://docs.google.com/spreadsheets/d/1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI/edit)
3. Click **Share** → paste the service account email → set role to **Editor** → click **Send**

---

## Step 4 — Configure your environment file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_actual_key_here
GOOGLE_SHEET_ID=1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI
GOOGLE_CREDENTIALS_PATH=./credentials.json
NOTIFICATION_EMAIL=jgagliardo98@gmail.com   # optional

# Gmail SMTP for error alerts (optional — use an App Password):
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
```

> **Gmail App Password**: Go to myaccount.google.com → Security → 2-Step Verification → App Passwords. Generate one for "Mail".

---

## Step 5 — First-run test (confirm both connections work)

```bash
node lead-workflow.js --run-now
```

You should see output like:

```
──────────────────────────────────────────────────────────
[2026-07-30T12:00:00.000Z] Starting HVAC Lead Workflow
──────────────────────────────────────────────────────────
✓ Google Sheets client initialized.
  Header row written to sheet.
✓ Loaded 0 existing business name(s) for dedup.
✓ Apollo returned 24 candidate(s).

Processing candidates:
  + Kalamazoo Heating & Cooling | John Smith | 269-555-0001 | Kalamazoo
  + West Michigan HVAC | ...
  ...

12 new lead(s) to append.
✓ Appended 12 row(s) to Google Sheet.

[2026-07-30T12:00:01.000Z] Workflow complete.
```

Then check your spreadsheet — rows should be populated.

### Troubleshooting the first run

| Error message | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Check your `.env` file |
| `API_INACCESSIBLE` from Apollo | You need Apollo Basic plan or above |
| `Google credentials file not found` | Make sure `credentials.json` is in this directory |
| `The caller does not have permission` | Share the sheet with the service account email (Step 3e) |
| `Apollo returned 0 results` | Try broadening the city list or industry tags in `lead-workflow.js` |

---

## Step 6 — Start the daily scheduler

Once the test run succeeds:

```bash
node lead-workflow.js
```

Keep this process running. You'll see:

```
HVAC Lead Workflow — Scheduler started.
Will run every day at 7:00 AM Eastern Time.
To run immediately, use: node lead-workflow.js --run-now
```

### Running it persistently (recommended)

Use **PM2** so it survives terminal closures and reboots:

```bash
npm install -g pm2
pm2 start lead-workflow.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

View logs: `pm2 logs hvac-leads`

---

## Customizing the workflow

All tweakable settings are at the top of `lead-workflow.js`:

| Variable | What it controls |
|---|---|
| `TARGET_CITIES` | Which cities to search |
| `TARGET_INDUSTRIES` | Apollo keyword tags for industry |
| `TARGET_TITLES` | Job titles to target (in priority order) |
| `EMPLOYEE_RANGES` | Company size filter |
| `MAX_LEADS_PER_RUN` | Max new leads appended per daily run |
| `COLUMNS` | Column order, names, and which fields they map to |

---

## Your Google Sheet

Direct link: [HVAC Leads - Southwest Michigan](https://docs.google.com/spreadsheets/d/1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI/edit)

Columns created automatically on first run:

| Column | Purpose |
|---|---|
| Date Added | Auto-filled by script |
| Business Name | Used for duplicate checking |
| Owner First Name | From Apollo enrichment |
| Owner Last Name | From Apollo enrichment |
| Phone Number | Mobile → Direct → Sanitized (best available) |
| City | From Apollo person or company location |
| Website | Company website if available |
| Called | Fill in manually after calling |
| Notes | Your call notes |

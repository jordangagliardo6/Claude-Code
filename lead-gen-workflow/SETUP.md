# Apollo HVAC Lead Gen — First-Time Setup

A step-by-step guide to get from zero to a running scheduler in ~15 minutes.

---

## Overview

The script runs every morning at **7:00 AM Eastern Time**, pulls up to **25 HVAC leads** from Apollo.io for Southwest Michigan, and appends new entries (skipping duplicates) to your Google Sheet.

---

## Step 1 — Install Node.js dependencies

```bash
cd lead-gen-workflow
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in at [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets access

### 3a — Create or open your spreadsheet

Either create a new Google Sheet or open the one you already use. Copy the **Spreadsheet ID** from the URL:

```
https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
```

### 3b — Enable the Google Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Click **"Enable APIs and Services"** and search for **"Google Sheets API"** — enable it

### 3c — Create a Service Account (recommended for cron jobs)

1. In Google Cloud Console → **IAM & Admin → Service Accounts**
2. Click **"Create Service Account"**, give it a name like `lead-gen-bot`
3. Click through to the end (no special roles needed here)
4. Click on the service account → **Keys tab → Add Key → Create new key → JSON**
5. Download the JSON file, rename it `google-service-account.json`, and place it in the `lead-gen-workflow/` folder
6. **Share your spreadsheet** with the service account email address (it looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`) — give it **Editor** access

> **Alternative (OAuth2):** If you prefer to authenticate as your own Google account, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` in your `.env` file instead. Use [Google OAuth Playground](https://developers.google.com/oauthplayground/) with scope `https://www.googleapis.com/auth/spreadsheets` to get a refresh token.

---

## Step 4 — Configure your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | What to put |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key from Step 2 |
| `GOOGLE_SPREADSHEET_ID` | The ID from your spreadsheet URL |
| `GOOGLE_SHEET_TAB` | Name of the sheet tab (default: `Sheet1`) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | `./google-service-account.json` |
| `NOTIFY_FROM_EMAIL` | Your Gmail address (for sending error alerts) |
| `NOTIFY_EMAIL_PASSWORD` | Your **Gmail App Password** (not your regular password!) |
| `NOTIFY_TO_EMAIL` | Where alerts should land (can be same as above) |

> **Gmail App Password:** Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create a new app password for "Mail", and paste it in `NOTIFY_EMAIL_PASSWORD`. This only works if 2-Step Verification is enabled on your Google account.

---

## Step 5 — Verify connections before going live

```bash
npm run check
```

Expected output:
```
═══ Connection Check ═══

Apollo.io API key … ✓  Connected (Jordan Gagliardo, jg@example.com, plan: basic)
Google Sheets access … ✓  Connected (spreadsheet: "HVAC Leads", tabs: Sheet1)

✓  All connections verified. Safe to start the scheduler.
```

If either check fails, the error message will tell you exactly what to fix.

---

## Step 6 — Do a test run

```bash
npm run run-now
```

This runs the full workflow immediately (without waiting for 7am). Check your Google Sheet — you should see a header row and up to 25 new leads.

---

## Step 7 — Start the scheduler

```bash
node index.js
```

Leave this running in a terminal or use a process manager like **PM2** to keep it alive:

```bash
npm install -g pm2
pm2 start index.js --name "hvac-lead-gen"
pm2 save
pm2 startup   # auto-start on reboot
```

---

## Customizing the workflow

| What you want to change | Where to edit |
|---|---|
| Add/remove cities | `apollo.js` → `SW_MICHIGAN_CITIES` array |
| Add/remove job titles | `apollo.js` → `TARGET_TITLES` array |
| Add/remove industries | `apollo.js` → `INDUSTRY_KEYWORDS` array |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Change run time | `index.js` → cron expression `'0 7 * * *'` |
| Add/remove spreadsheet columns | `sheets.js` → `HEADERS` array and `appendLeads()` |

---

## Spreadsheet column layout

The script writes (and expects) these columns in order A → I:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

If your existing sheet has a different column order, update the `appendLeads()` function in `sheets.js` to match.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Check your `.env` file |
| `Apollo API key invalid (401)` | Regenerate key at apollo.io → Settings → API |
| `Apollo returned 0 results` | Filters may be too narrow; check Apollo plan credits |
| `Service account key file not found` | Ensure `google-service-account.json` is in the `lead-gen-workflow/` folder |
| `The caller does not have permission` | Share the spreadsheet with the service account email address |
| `Email not sending` | Make sure you're using a Gmail App Password, not your login password |
| Duplicate entries appearing | Ensure `GOOGLE_SHEET_TAB` matches the exact tab name in your sheet |

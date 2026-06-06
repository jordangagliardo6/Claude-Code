# HVAC Leads Workflow — Southwest Michigan

Automatically pulls HVAC business owner leads from Apollo.io every morning at
7:00 AM Eastern Time and appends them to a Google Sheet — deduped, phone-only,
max 25 per run.

---

## What it does

| Step | Description |
|------|-------------|
| **Search** | Queries Apollo.io for HVAC/plumbing/mechanical contracting companies in Michigan with 1–25 employees |
| **Filter** | Keeps only Owner / President / Founder / Co-Founder / General Manager contacts **with a phone number** |
| **City bias** | Prefers contacts in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven |
| **Dedup** | Reads existing Business Names from the sheet; skips any business already present |
| **Append** | Writes up to 25 new rows (Date Added, Business Name, First, Last, Phone, City, Website, Called, Notes) |
| **Alert** | Logs errors to console; optionally emails you if something breaks |

---

## Project structure

```
hvac-leads-workflow/
├── src/
│   ├── config.js          ← All adjustable settings (cities, titles, limits)
│   ├── apollo.js          ← Apollo.io API client
│   ├── sheets.js          ← Google Sheets client
│   ├── logger.js          ← Console logger + optional email alerts
│   ├── index.js           ← Cron scheduler (npm start)
│   ├── run-now.js         ← One-shot manual run (npm run run-now)
│   └── test-connection.js ← Pre-flight check (npm run test-connection)
├── .env.example           ← Copy this to .env and fill in your keys
├── package.json
└── README.md
```

---

## Prerequisites

- **Node.js 18+** — check with `node --version`
- An **Apollo.io account** with API access (any paid plan)
- A **Google Cloud project** with the Sheets API enabled

---

## First-time setup (step by step)

### Step 1 — Clone and install

```bash
cd hvac-leads-workflow
npm install
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in:

| Variable | Where to get it |
|----------|----------------|
| `APOLLO_API_KEY` | Apollo.io → Settings → Integrations → API → Generate key |
| `GOOGLE_SPREADSHEET_ID` | Already pre-filled (`1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your service account JSON (see Step 3) |

### Step 3 — Set up Google Sheets API access

**3a. Create a Google Cloud project** (skip if you already have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown (top-left) → **New Project** → give it a name → **Create**

**3b. Enable the Google Sheets API**

1. In the left menu: **APIs & Services → Library**
2. Search for `Google Sheets API` → click it → **Enable**

**3c. Create a Service Account**

1. **APIs & Services → Credentials → + Create Credentials → Service Account**
2. Name it anything (e.g., `hvac-leads-bot`) → **Create and Continue** → **Done**

**3d. Download the JSON key**

1. Click the service account you just created
2. Go to the **Keys** tab → **Add Key → Create new key → JSON** → **Create**
3. A `.json` file downloads automatically — move it into the project folder and rename it `credentials.json`
4. In your `.env`, set: `GOOGLE_APPLICATION_CREDENTIALS=./credentials.json`

**3e. Share the spreadsheet with the service account**

1. Open `credentials.json` and copy the `client_email` value (looks like `hvac-leads-bot@your-project.iam.gserviceaccount.com`)
2. Open the Google Sheet: [HVAC Leads — Southwest Michigan](https://docs.google.com/spreadsheets/d/1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE)
3. Click **Share** → paste the `client_email` → set role to **Editor** → **Send**

### Step 4 — Verify both connections

Run the connection test — this confirms everything is wired up before the first
scheduled run fires:

```bash
npm run test-connection
```

Expected output:

```
════════════════════════════════════════════════
  HVAC Leads Workflow — Connection Test
════════════════════════════════════════════════

[1/3] Checking required environment variables...
  ✓ All required environment variables are set.

[2/3] Testing Apollo.io connection...
  ✓ Connected to Apollo.io
  ✓ API key is valid
  ✓ Search query matches ~1,240 total people in Apollo's database

[3/3] Testing Google Sheets connection...
  ✓ Connected to Google Sheets
  ✓ Spreadsheet found: "HVAC Leads - Southwest Michigan"
  ✓ URL: https://docs.google.com/spreadsheets/d/1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE

════════════════════════════════════════════════
  ✓ All checks passed! You're ready to go.

  Next steps:
    • Run a one-off pull now:    npm run run-now
    • Start the daily scheduler: npm start
════════════════════════════════════════════════
```

### Step 5 — Do a manual test pull

```bash
npm run run-now
```

This runs the full workflow immediately (no waiting for 7 AM). Check the
spreadsheet to confirm rows were added.

### Step 6 — Start the scheduler

```bash
npm start
```

The process stays running and fires at **7:00 AM Eastern Time every morning**.
Use a process manager to keep it alive on a server:

```bash
# Using PM2 (recommended for VPS/server use)
npm install -g pm2
pm2 start src/index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customization

All tunable settings live in `src/config.js`. No other files need to change.

### Add or remove cities

```js
targetCities: [
  'St. Joseph, Michigan',
  'Portage, Michigan',    // ← add a new city here
  // Remove a city by deleting its line
],
```

### Change the job titles

```js
targetTitles: [
  'Owner',
  'President',
  // Add 'Operations Manager' here if you want to widen the net
],
```

### Change the run schedule

Edit `CRON_SCHEDULE` in your `.env`:

```bash
CRON_SCHEDULE=0 8 * * *    # 8:00 AM Eastern instead
CRON_SCHEDULE=0 7 * * 1-5  # Weekdays only
```

### Change the max leads per run

```js
maxLeadsPerRun: 25,   // increase or decrease as needed
```

### Add column headers to the sheet

The sheet was created with these headers already in row 1:

```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

To add a new column, update the `appendLeads` function in `src/sheets.js` and
extend the row array (e.g., push a new field at the end and update the range
from `A:I` to `A:J`).

---

## Email alerts

To receive an email when the workflow errors, set these in `.env`:

```bash
EMAIL_ENABLED=true
ALERT_EMAIL=you@youremail.com
EMAIL_FROM=alerts@yourdomain.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # Gmail App Password (16 chars, spaces OK)
```

For Gmail App Passwords: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `APOLLO_API_KEY is not set` | Add the key to `.env` and restart |
| `401 Unauthorized` from Apollo | Regenerate your API key at apollo.io/settings |
| `PERMISSION_DENIED` from Google | Share the sheet with the service account's `client_email` |
| `Could not load the default credentials` | Check `GOOGLE_APPLICATION_CREDENTIALS` path in `.env` |
| 0 new leads added (all duplicates) | Normal — the sheet already has all the contacts Apollo returned. They will rotate as Apollo's database updates. |
| 0 leads with phone numbers | Your Apollo plan may not include phone unlocks for this segment. Contact Apollo support or upgrade your plan. |

---

## Security notes

- **Never commit** `credentials.json` or `.env` to git. Both are in `.gitignore`.
- Keep `APOLLO_API_KEY` private — it can consume credits if leaked.
- The service account has write access only to the specific sheet it was shared on.

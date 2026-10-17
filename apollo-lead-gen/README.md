# Apollo Lead Gen — HVAC Southwest Michigan

Automated daily lead generation that searches Apollo.io for HVAC owner-operators
in Southwest Michigan and appends new contacts to a Google Sheet every morning at 7 AM ET.

---

## What it does each run

1. Calls the Apollo.io People Search API for HVAC decision-makers in:
   St. Joseph · Benton Harbor · Kalamazoo · Holland · Grand Haven · Muskegon · South Haven
2. Reads your Google Sheet to check which businesses are already there
3. Filters out duplicates and any contact with no phone number
4. Appends up to **25 new rows** in this column order:

   | Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

---

## First-Time Setup

### Step 1 — Install Node.js dependencies

```bash
cd apollo-lead-gen
npm install
```

Requires Node.js 18 or later. Check with `node --version`.

---

### Step 2 — Apollo.io API key

1. Log into [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Click **Create API key**
4. Copy it — you'll paste it into `.env` below

**Plan note:** The free tier gives ~50 enrichment credits/month.
The Basic plan ($49/mo) gives 1,000 credits. Each person search costs credits.
A run of 25 leads typically costs ~25–50 credits depending on phone enrichment.

---

### Step 3 — Google Service Account (one-time)

This is how the script authenticates to Google Sheets without a browser pop-up.

#### 3a. Create a project in Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a project → New Project** → name it anything (e.g. `apollo-lead-gen`)
3. Click **Create**

#### 3b. Enable the Google Sheets API

1. In your new project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → click **Enable**

#### 3c. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name: `lead-gen-bot` (or anything you like)
4. Role: **Editor** → Continue → Done
5. Click the service account you just created
6. Go to the **Keys** tab → **Add Key → Create new key → JSON**
7. A `.json` file downloads — rename it `google-credentials.json`
8. Move it into the `apollo-lead-gen/` folder

#### 3d. Share your Google Sheet with the service account

1. Open the `google-credentials.json` file
2. Find the `client_email` value — it looks like:
   `lead-gen-bot@your-project.iam.gserviceaccount.com`
3. Open your Google Sheet
4. Click **Share** → paste that email address → set role to **Editor** → Send

---

### Step 4 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → create a new spreadsheet
2. Name the first tab **Sheet1** (or whatever you set `GOOGLE_SHEET_TAB` to)
3. **Leave row 1 empty** — the script writes the headers automatically on the first run
4. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/ **THIS_IS_THE_ID** /edit`

---

### Step 5 — Create your .env file

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=your_google_sheet_id_here
GOOGLE_SHEET_TAB=Sheet1
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./google-credentials.json
MAX_LEADS_PER_RUN=25
NOTIFICATION_EMAIL=your_email@gmail.com
CRON_SCHEDULE=0 12 * * *
```

**CRON_SCHEDULE** is in UTC:
- `0 12 * * *` = 7:00 AM Eastern Standard Time (Nov–Mar)
- `0 11 * * *` = 7:00 AM Eastern Daylight Time (Mar–Nov)

---

### Step 6 — Test the connections

Before the first scheduled run, verify both APIs work:

```bash
node test-connection.js
```

Expected output:

```
── Environment variables ───────────────────────────────
  ✓  APOLLO_API_KEY is set
  ✓  GOOGLE_SHEET_ID is set
  ✓  GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set

── Apollo.io API ───────────────────────────────────────
  ✓  Apollo API responded — returned 1 contact(s) for test query
  ✓  Pagination visible — total matching records: 47

── Google Sheets API ───────────────────────────────────
  ✓  Service account credentials loaded
  ✓  Read access confirmed — row 1: (empty)
  ✓  Write access confirmed — appended test row at Sheet1!A2:I2
  ✓  Test row deleted — sheet is clean

── Result ──────────────────────────────────────────────
   Passed: 7   Failed: 0

   All checks passed. You're ready to run the scheduler.
   Start with:  npm start
   Or run once: npm run run-once
```

If any step fails, fix it before starting the scheduler.

---

### Step 7 — Run once to confirm everything works end-to-end

```bash
npm run run-once
```

Check your Google Sheet — you should see up to 25 new rows with real HVAC leads.

---

### Step 8 — Start the daily scheduler

```bash
npm start
```

The process runs in the foreground. To keep it running after you close your terminal,
use a process manager:

**PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name apollo-lead-gen
pm2 save
pm2 startup    # follow the printed command to auto-start on reboot
```

**Or nohup (simple):**
```bash
nohup node index.js > lead-gen.log 2>&1 &
```

---

## Customizing the search

All search parameters live in `config.js`. You can edit:

| Variable | What it controls |
|---|---|
| `SOUTHWEST_MICHIGAN_CITIES` | Display labels (not used in API call directly) |
| `LOCATION_FILTERS` | Passed to Apollo — add/remove city strings |
| `TARGET_INDUSTRIES` | Industry keyword tags — add plumbing, electrical, etc. |
| `TARGET_JOB_TITLES` | Job titles to target — order matters (Owner first) |
| `EMPLOYEE_RANGE` | `"1,25"` for small businesses — change to `"1,50"` to go wider |

No restart needed for `.env` changes — but `config.js` changes require a restart.

---

## Changing the spreadsheet columns

1. Edit `SHEET_COLUMNS` in `config.js`
2. Edit the row-builder array in `leadgen.js` → `runLeadGen()` to match
3. Clear your sheet's header row so the script rewrites it on the next run

---

## Error handling

- If Apollo returns 0 results → error logged + email sent to `NOTIFICATION_EMAIL`
- If Google Sheets write fails → error logged + email sent
- If env vars are missing → immediate error + email before any API calls
- All errors are also printed to console/log files

---

## File structure

```
apollo-lead-gen/
├── index.js              Scheduler — entry point
├── leadgen.js            Core workflow (fetch → dedupe → append)
├── apollo.js             Apollo.io API wrapper
├── sheets.js             Google Sheets API wrapper
├── notify.js             Error logging + email alerts
├── config.js             Search parameters — edit here
├── test-connection.js    Pre-flight connection test
├── package.json
├── .env.example          Template — copy to .env
└── README.md             This file
```

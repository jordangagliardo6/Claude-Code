# Apollo Lead Gen — Setup Guide

Pulls up to 25 owner/decision-maker contacts from HVAC, plumbing, and mechanical
companies in Southwest Michigan each morning at 7 AM ET and appends them to your
Google Sheet — skipping duplicates automatically.

---

## What You Need

| Requirement | Where to get it |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Apollo.io account (Basic or higher) | https://apollo.io |
| Google account | You already have one |
| Google Cloud project (free) | https://console.cloud.google.com |

> **Apollo plan note:** The People Search API with phone numbers requires at
> least the **Basic plan** (~$49/mo). The free tier does not export phone numbers.
> Check your credit balance at apollo.io → Settings → Credits.

---

## Step 1 — Install dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Get your Apollo API key

1. Log in to [apollo.io](https://apollo.io)
2. Click your avatar → **Settings** → **Integrations** → **API**
3. Copy the key (starts with `ak_…`)

---

## Step 3 — Create and configure the Google Sheet

### 3a. Create the spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Rename the first tab to **Leads** (or whatever you want — you can set `GOOGLE_SHEET_TAB` in `.env`)
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_LONG_ID_HERE/edit
   ```
   The script will write the header row automatically on first run.

### 3b. Set up a Google Cloud service account

This is a one-time setup so the script can write to your sheet without needing
a browser.

1. Open [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one) — name it anything
3. **Enable the Sheets API:**
   - Go to **APIs & Services → Library**
   - Search "Google Sheets API" → click it → **Enable**
4. **Create a service account:**
   - Go to **APIs & Services → Credentials**
   - Click **+ Create Credentials → Service Account**
   - Name: `lead-gen-bot` (or anything)
   - Click **Done** (skip the optional role/permission steps)
5. **Download the JSON key:**
   - Click the service account you just created
   - Go to the **Keys** tab → **Add Key → Create new key → JSON**
   - A `credentials.json` file downloads — move it into this folder
6. **Share your spreadsheet with the service account:**
   - Open the `credentials.json` file and copy the `client_email` value
     (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
   - Open your Google Sheet → click **Share**
   - Paste that email, set role to **Editor**, click **Send**

---

## Step 4 — Configure your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=ak_your_key_here
GOOGLE_SPREADSHEET_ID=your_sheet_id_here
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_SHEET_TAB=Leads
MAX_LEADS_PER_RUN=25
CRON_SCHEDULE=0 7 * * *
```

### Optional: email error alerts

Add your Gmail SMTP settings if you want an email when the script fails:

```
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youraddress@gmail.com
SMTP_PASS=your_app_password_here
```

To create a Gmail App Password:
1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Select "Mail" + your device → **Generate**
3. Copy the 16-character password into `SMTP_PASS`

---

## Step 5 — Verify both connections

```bash
npm run verify
```

You should see:

```
══════════════════════════════════════════════════════
  Apollo Lead Gen — Connection Verification
══════════════════════════════════════════════════════

1. Apollo.io API
   → Searching for 3 sample leads…
   ✓  Connected — got 3 sample result(s)
      Example: John Smith | Smith HVAC LLC | Kalamazoo | +12695550100

2. Google Sheets
   → Connecting to spreadsheet…
   ✓  Connected — sheet currently has 0 lead(s)
      Tab: "Leads"

══════════════════════════════════════════════════════
  ✓  All systems go!
```

**If Apollo returns 0 results:** your plan may not cover phone-number exports, or
the search filters are too narrow. Try loosening the city list or industry keywords
in `apollo.js`.

**If Sheets returns a permissions error:** make sure you shared the spreadsheet
with the service account email from `credentials.json`.

---

## Step 6 — Do a test run

This writes real leads to your sheet immediately so you can confirm the whole
pipeline works before trusting it to run unattended:

```bash
npm run run-now
```

Open your Google Sheet — you should see up to 25 new rows with today's date.

---

## Step 7 — Start the daily scheduler

```bash
npm start
```

The process must stay running (don't close the terminal). To run it permanently
in the background on a Mac or Linux server, use **PM2**:

```bash
# Install PM2 globally once
npm install -g pm2

# Start the lead gen process
pm2 start index.js --name lead-gen

# Make it restart automatically after reboots
pm2 save
pm2 startup   # follow the printed instruction

# Check logs any time
pm2 logs lead-gen
```

---

## Customizing the search

All search parameters are at the top of `apollo.js` in clearly labeled constant arrays:

| Constant | What it controls |
|---|---|
| `SW_MICHIGAN_LOCATIONS` | Cities to target |
| `TARGET_TITLES` | Job titles (Owner, President, etc.) |
| `INDUSTRY_KEYWORDS` | Industry tags (hvac, plumbing, etc.) |
| `EMPLOYEE_RANGE` | Company size filter (default `["1,25"]`) |

To add Grand Rapids or Lansing, append to `SW_MICHIGAN_LOCATIONS`:
```js
'Grand Rapids, Michigan, United States',
```

To also target electricians, append to `INDUSTRY_KEYWORDS`:
```js
'electrical contractor',
```

---

## Column structure

The sheet is written with these columns in order A–I:

| Col | Field | Notes |
|---|---|---|
| A | Date Added | Auto-filled (MM/DD/YYYY ET) |
| B | Business Name | Used for duplicate detection |
| C | Owner First Name | |
| D | Owner Last Name | |
| E | Phone Number | Mobile preferred, then direct |
| F | City | |
| G | Website | Empty if not in Apollo |
| H | Called | Left blank — fill in yourself |
| I | Notes | Left blank — fill in yourself |

To add or rename columns, update the `HEADERS` array in `sheets.js` and the
`rows.map()` inside `appendLeads()` to match.

---

## Troubleshooting

**"Apollo returned 0 results"**
- Your API plan may not include People Search with phone numbers
- Check apollo.io → Settings → Credits to see your export balance
- Try widening the location list or removing `INDUSTRY_KEYWORDS` temporarily

**"invalid_grant" or "credentials not valid"**
- Re-download the `credentials.json` from Google Cloud Console
- Make sure the service account email is shared on the spreadsheet as Editor

**Duplicate leads appearing**
- The deduplication matches on Business Name (case-insensitive)
- If the same company appears with slightly different names (e.g. "Smith HVAC" vs
  "Smith HVAC LLC"), it won't be caught — this is normal

**Schedule isn't firing**
- Make sure `npm start` is still running (or the PM2 process is alive)
- Verify the timezone: `CRON_SCHEDULE=0 7 * * *` fires at 7 AM **America/New_York**

---

## Files at a glance

```
apollo-lead-gen/
├── index.js          ← scheduler + main workflow
├── apollo.js         ← Apollo.io search (edit cities/industries here)
├── sheets.js         ← Google Sheets read/write
├── notify.js         ← console + email error alerts
├── verify.js         ← connection test (run before first use)
├── package.json
├── .env.example      ← copy to .env and fill in
├── .gitignore        ← keeps .env and credentials.json out of git
└── SETUP.md          ← this file
```

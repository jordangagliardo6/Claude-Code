# HVAC Lead Workflow — Setup Guide

Automated Apollo.io → Google Sheets lead generation for Southwest Michigan HVAC companies.
Runs daily at 7 AM Eastern, pulls up to 25 new leads per run, and skips duplicates automatically.

---

## What You Need Before Starting

| Requirement | Notes |
|---|---|
| **Node.js 18+** | `node --version` to check |
| **Apollo.io Basic plan** ($49/mo) | Free plan blocks the People prospecting API |
| **Google Cloud project** with Sheets API enabled | Free |
| **Google service account** with edit access to your sheet | Free |

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-workflow
npm install
```

---

## Step 2 — Apollo API Key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Confirm your account is on **Basic plan or higher** — the People prospecting
   endpoint (`/api/v1/mixed_people/search`) is not available on the free plan.

---

## Step 3 — Google Credentials

This workflow uses a **service account** (recommended for automation — no browser
OAuth flow needed, runs headlessly).

### 3a. Enable the Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Search for **"Google Sheets API"** and click **Enable**

### 3b. Create a Service Account

1. In your Google Cloud project, go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Give it a name like `hvac-lead-bot`
4. Click **Done** (no roles needed at the project level)
5. Click on the service account you just created
6. Go to the **Keys** tab → **Add Key → Create new key → JSON**
7. A `.json` file downloads — save it as:
   ```
   hvac-lead-workflow/credentials/google-service-account.json
   ```
   (create the `credentials/` folder if it doesn't exist)

> ⚠️ Never commit this file to git. It's in `.gitignore` by default.

### 3c. Share the Spreadsheet with the Service Account

1. Open your Google Sheet (the SW Michigan HVAC Leads sheet)
2. Click **Share**
3. Paste the service account email — it looks like:
   `hvac-lead-bot@your-project-id.iam.gserviceaccount.com`
4. Set permission to **Editor**
5. Click **Send**

---

## Step 4 — Configure Your .env File

```bash
cp .env.example .env
```

Open `.env` and fill in every value:

```env
APOLLO_API_KEY=your_real_apollo_key_here

GOOGLE_SERVICE_ACCOUNT_JSON=./credentials/google-service-account.json

# The ID from your sheet URL:
# https://docs.google.com/spreadsheets/d/THIS_PART/edit
SPREADSHEET_ID=1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo

SHEET_NAME=Sheet1

# Optional — email yourself on errors (uses Gmail App Password, not your real password)
NOTIFY_EMAIL=jgagliardo98@gmail.com
GMAIL_USER=your_gmail@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

### Gmail App Password (for error emails)

If you want email alerts when something fails:

1. Make sure 2-Factor Authentication is on for your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create an App Password for "Mail" → copy the 16-character code
4. Paste it as `GMAIL_APP_PASSWORD` in `.env`

Leave `GMAIL_USER` and `GMAIL_APP_PASSWORD` blank to use console-only logging instead.

---

## Step 5 — First Run (Verify Everything Works)

Run the connection check + one immediate fetch:

```bash
node index.js --run-now
```

You should see output like:

```
[2026-09-02T07:00:00.000Z] Starting HVAC lead generation run
[2026-09-02T07:00:00.000Z] Sheet has 25 existing business(es) — will skip these
[2026-09-02T07:00:00.000Z] Searching Apollo.io for HVAC owners in Southwest Michigan…
[2026-09-02T07:00:02.000Z] Apollo returned 42 candidate(s)
[2026-09-02T07:00:04.000Z] Enriching 42 record(s) to reveal phones…
[2026-09-02T07:00:07.000Z]   + Acme HVAC | John Smith | (269) 555-0100 | Kalamazoo
[2026-09-02T07:00:07.000Z]   + ...
[2026-09-02T07:00:07.000Z] ✓ Appended 12 new lead(s) to the sheet
```

Then open your Google Sheet and confirm the new rows appear.

---

## Step 6 — Start the Scheduler

```bash
node index.js
```

The process will:
1. Print a connection verification summary
2. Register a cron job for 7:00 AM Eastern every day
3. Keep running in the background

To run it 24/7 on a server, use **PM2**:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Modifying the City List

Open `index.js` and find the `TARGET_CITIES` array (around line 30):

```js
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  'Kalamazoo, Michigan',
  // add or remove cities here
];
```

---

## Modifying the Column Structure

Find the `COLUMNS` object (around line 55). Change the number on the right to
match your sheet's column positions (0 = column A, 1 = B, etc.):

```js
const COLUMNS = {
  DATE_ADDED:    0,  // A
  BUSINESS_NAME: 1,  // B
  OWNER_FIRST:   2,  // C
  // ...
};
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to Apollo Basic plan ($49/mo) |
| `403 PERMISSION_DENIED` from Google | Share the spreadsheet with your service account email (Step 3c) |
| `The caller does not have permission` | Sheets API not enabled — check Step 3a |
| `ENOENT: no such file` for credentials | Check the path in `GOOGLE_SERVICE_ACCOUNT_JSON` |
| Apollo returns 0 results | Filters may be too narrow; try removing `organization_num_employees_ranges` temporarily |
| Leads added but no phone shown | Apollo may not have a phone for that contact; these are filtered out automatically |

---

## Your Spreadsheet

Target sheet: **SW Michigan HVAC Leads**
ID: `1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo`

The sheet already has 25 entries from 2026-08-23. Each new run will check the
**Business Name** column (B) and skip any company already listed before inserting.

Columns written by this workflow:

| Column | Field | Notes |
|---|---|---|
| A | Date Added | Today's date (Eastern time) |
| B | Business Name | From Apollo org name |
| C | Owner First Name | May be blank if Apollo doesn't have it |
| D | Owner Last Name | May require enrichment credits |
| E | Phone Number | Mobile preferred → direct → main line |
| F | City | From Apollo person or org record |
| G | Website | From Apollo org domain |
| H | Called | Left blank — fill in manually |
| I | Notes | Left blank — fill in manually |

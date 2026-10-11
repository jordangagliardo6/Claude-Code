# HVAC Lead Gen — First-Time Setup

## What this does

Runs daily at **7:00 AM Eastern**. Each run:
1. Searches Apollo.io for HVAC/plumbing/mechanical owners in SW Michigan (1–25 employees)
2. Enriches results to reveal phone numbers
3. Reads the master Google Sheet to skip any business already listed
4. Appends up to **25 new leads** with today's date

Sheet target: `HVAC Leads — SW Michigan (Master)`
— `https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8/edit`

---

## Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Apollo.io API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API Keys**
3. Create a new key and copy it

---

## Step 3 — Google Sheets service account

This is a one-time setup that lets the script write to your sheet without a browser.

### 3a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → name it `hvac-lead-gen` → **Create**
3. Make sure the new project is selected in the top dropdown

### 3b. Enable Google Sheets API

1. In the left menu: **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

### 3c. Create a service account

1. **APIs & Services → Credentials → Create Credentials → Service Account**
2. Name: `lead-gen-bot` → **Create and Continue** → **Done**
3. Click the new service account email in the list
4. Go to the **Keys** tab → **Add Key → Create new key → JSON → Create**
5. A `.json` file downloads automatically — move it into the `lead-gen/` folder
   and name it `google-service-account.json`

### 3d. Share the spreadsheet with the service account

1. Open the service account JSON file
2. Copy the `client_email` value (looks like `lead-gen-bot@...iam.gserviceaccount.com`)
3. Open the master spreadsheet
4. Click **Share** (top-right) → paste that email → set role to **Editor** → **Send**

---

## Step 4 — Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key from Step 2 |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `./google-service-account.json` |
| `GOOGLE_SHEET_ID` | `1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8` |
| `ALERT_EMAIL_TO` | Your email (for error alerts) |
| `ALERT_EMAIL_FROM` | Same Gmail address |
| `GMAIL_APP_PASSWORD` | App password from [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |

> **Gmail App Password:** you need 2-Step Verification turned on first, then create an app password for "Mail".

---

## Step 5 — Verify the connection (run once)

```bash
node lead-gen.js --run-once
```

You should see output like:

```
[...] [INFO] Running immediately (--run-once flag detected)
[...] [INFO] ═══ HVAC Lead Gen run started ═══
[...] [INFO] Loaded 71 existing businesses from master sheet
[...] [INFO]   St. Joseph, Michigan: 8 results from Apollo
[...] [INFO]   Benton Harbor, Michigan: 12 results from Apollo
...
[...] [INFO] ✓ Appended 18 leads to master sheet
[...] [INFO] ═══ Run complete ═══
```

If you see errors:
- `Google service account key not found` → check `GOOGLE_SERVICE_ACCOUNT_KEY` path
- `401 Unauthorized` (Apollo) → check `APOLLO_API_KEY`
- `403 Forbidden` (Sheets) → make sure you shared the sheet with the service account email (Step 3d)

---

## Step 6 — Start the scheduler

```bash
node lead-gen.js
```

The process runs continuously and fires at 7:00 AM Eastern each day.

**To run it as a background service (so it survives terminal close):**

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start lead-gen.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot

# Or using nohup
nohup node lead-gen.js > logs/lead-gen.log 2>&1 &
```

---

## Customizing the workflow

All tunable settings are at the top of `lead-gen.js` in the `CONFIG` block:

| Setting | What it does |
|---|---|
| `targetCities` | Add/remove SW Michigan cities |
| `industryKeywords` | Apollo keyword tags to match on |
| `targetTitles` | Job titles, first = highest priority |
| `employeeRange` | Company headcount filter (`'1,25'`) |
| `maxLeadsPerRun` | Cap per scheduled run (default 25) |
| `sheetName` | Tab name inside the spreadsheet |

---

## Column layout (matches master sheet)

| Col | Header | Source |
|---|---|---|
| A | Date Added | Today's date (YYYY-MM-DD) |
| B | Business Name | Apollo `organization.name` |
| C | Owner First Name | Apollo `first_name` |
| D | Owner Last Name | Apollo `last_name` (unmasked after enrichment) |
| E | Phone Number | Apollo enriched mobile → direct → first available |
| F | City | Apollo `city` |
| G | Website | Apollo `organization.website_url` |
| H | Called | Left blank — fill in manually |
| I | Notes | Left blank — fill in manually |

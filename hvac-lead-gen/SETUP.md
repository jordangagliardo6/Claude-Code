# HVAC Lead Gen — Setup & First Run Guide

This script searches Apollo.io daily for HVAC owner contacts in Southwest Michigan
and appends up to 25 new leads per day to your Google Sheet.

---

## Prerequisites

- Node.js 18 or later (`node --version`)
- An Apollo.io account with **at minimum a Basic paid plan** (free plan blocks the People Search API)
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Apollo.io API Key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Add it to `.env`:
   ```
   APOLLO_API_KEY=your_key_here
   ```

> **Plan note:** The People Search API (`mixed_people/api_search`) requires a paid plan.
> Free accounts will see an `API_INACCESSIBLE` error. Upgrade at https://www.apollo.io/pricing.

---

## Step 3 — Google Service Account Credentials

The script uses a **Service Account** (not personal OAuth) so it can run unattended.

### 3a. Create a Google Cloud project (skip if you already have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select an existing one

### 3b. Enable the Google Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** and click **Enable**

### 3c. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Give it a name (e.g. `hvac-lead-gen`) and click **Create and Continue**
4. Skip the optional role/user steps, click **Done**

### 3d. Download the JSON key

1. Click the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key → Create New Key → JSON**
4. A `*.json` file will download — save it as `credentials.json` in this folder

### 3e. Grant the service account access to your spreadsheet

1. Open your Google Sheet:
   [SW Michigan HVAC Leads](https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus)
2. Click **Share**
3. Paste the service account email (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
4. Set the permission to **Editor** and click **Send**

---

## Step 4 — Configure .env

```bash
cp .env.example .env
```

Then edit `.env` and fill in:
- `APOLLO_API_KEY` — from Step 2
- `GOOGLE_CREDENTIALS_PATH` — `./credentials.json` (default, if you saved it there)
- Everything else can stay as-is for the defaults

---

## Step 5 — Verify Both Connections

```bash
npm run verify
```

Expected output:
```
══════════════════════════════════════════
  HVAC Lead Gen — Connection Verification
══════════════════════════════════════════

✓ Apollo.io API key is valid
  Plan: basic
✓ Google Sheets: Connected to "SW Michigan HVAC Leads"
  Spreadsheet ID: 1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus

── 2 passed  0 failed ──

✅  All connections OK — ready to run the scheduler.
```

Fix any errors shown before moving on.

---

## Step 6 — Test One Run (Immediate)

Before waiting until 7am, trigger a test run now:

```bash
npm run run-now
```

Check your Google Sheet — up to 25 rows should appear under the header row.

---

## Step 7 — Start the Daily Scheduler

```bash
npm start
```

This starts `node-cron` configured for **7:00 AM Eastern Time** and keeps running.
Keep the terminal open, or run it as a background service:

### Option A — Keep alive with PM2 (recommended)

```bash
npm install -g pm2
pm2 start "npm start" --name hvac-lead-gen
pm2 save
pm2 startup   # follow the instructions it prints to auto-start on reboot
```

### Option B — System cron (Linux/Mac)

```bash
crontab -e
```
Add this line (adjust path):
```
0 7 * * * cd /path/to/hvac-lead-gen && TZ=America/New_York node index.js --run-now >> /var/log/hvac-leads.log 2>&1
```

---

## Customization

| What to change | Where |
|---|---|
| Add/remove cities | `CONFIG.targetCities` in `index.js` |
| Change max daily leads | `MAX_LEADS_PER_RUN` in `.env` |
| Change column order | `CONFIG.columnOrder` in `index.js` |
| Change target job titles | `CONFIG.targetTitles` in `index.js` |
| Change industry tags | `CONFIG.industryTags` in `index.js` |
| Switch spreadsheet | `SPREADSHEET_ID` in `.env` |
| Add email alerts on error | Uncomment the `nodemailer` block in `index.js` |

---

## Error Handling

All errors are logged to the console with a timestamp. If you want email alerts
when something breaks:

1. Install nodemailer: `npm install nodemailer`
2. Set `SMTP_USER` and `SMTP_PASS` in `.env`
3. Uncomment the nodemailer block near the bottom of the `logError()` function in `index.js`

Gmail users: generate an **App Password** at myaccount.google.com/apppasswords
(requires 2-step verification to be enabled).

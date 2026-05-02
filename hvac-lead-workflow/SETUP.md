# HVAC Lead Workflow — Setup Guide

This guide walks you through every step from zero to your first scheduled run.

---

## Overview

| Step | What happens |
|------|-------------|
| 1    | Install Node.js dependencies |
| 2    | Create an Apollo.io API key |
| 3    | Create a Google Cloud project + service account |
| 4    | Prepare your Google Sheet |
| 5    | Configure your `.env` file |
| 6    | Run the setup check |
| 7    | Test a manual run |
| 8    | Start the daily scheduler |

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-workflow
npm install
```

Requires Node.js ≥ 18.  Check with `node -v`.

---

## Step 2 — Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io).
2. Go to **Settings → Integrations → API**.
3. Click **Create new API key** (or copy your existing key).
4. Save it — you'll paste it into `.env` shortly.

> **Free plan note:** Apollo's free tier allows limited searches per month.
> The workflow fetches ≤ 50 contacts per run and runs once per day, so
> a Basic plan should be sufficient for light use.

---

## Step 3 — Google Cloud service account

A *service account* lets the script write to your spreadsheet without
interactive login prompts, which is required for automated/scheduled runs.

### 3a. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project drop-down at the top → **New Project**.
3. Name it (e.g., `hvac-leads`), click **Create**.

### 3b. Enable the Google Sheets API

1. With your project selected, go to **APIs & Services → Library**.
2. Search for **Google Sheets API** and click **Enable**.

### 3c. Create a service account

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → Service Account**.
3. Give it a name (e.g., `hvac-leads-writer`), click **Create and Continue**.
4. Skip the optional role/user steps, click **Done**.

### 3d. Download the JSON key

1. On the **Credentials** page, click the service account you just created.
2. Go to the **Keys** tab → **Add Key → Create New Key → JSON**.
3. A `.json` file downloads automatically.
4. Create the folder and move the file:

```bash
mkdir -p hvac-lead-workflow/credentials
mv ~/Downloads/your-key-file.json hvac-lead-workflow/credentials/google-service-account.json
```

> **Security:** Never commit this file to git.  It is already in `.gitignore`.

---

## Step 4 — Prepare your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and open (or create) the
   spreadsheet you want to write to.
2. **Share it with the service account:**
   - Click **Share** (top-right).
   - Paste the service account email — it looks like
     `hvac-leads-writer@your-project.iam.gserviceaccount.com`
     (find it on the Google Cloud Credentials page).
   - Set permission to **Editor**.
   - Click **Send**.
3. **Get the Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  SPREADSHEET_ID_HERE  /edit
   ```
4. **Create a sheet tab** named `Leads` (or whatever you prefer — just
   keep it consistent with `GOOGLE_SHEET_NAME` in your `.env`).

The script will automatically write the header row the first time it runs.

---

## Step 5 — Configure `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
# Required
APOLLO_API_KEY=your_apollo_key_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/google-service-account.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Leads

# Optional — leave blank to skip email alerts
NOTIFICATION_EMAIL=you@example.com
SMTP_USER=you@gmail.com
SMTP_PASS=your_16_char_app_password

# Workflow tuning (safe to leave as defaults)
MAX_LEADS_PER_RUN=25
CRON_SCHEDULE=0 7 * * *
```

### Optional: Gmail App Password for email alerts

If you want email notifications when the workflow errors:

1. Make sure your Gmail account has 2-Step Verification turned on.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Create an App Password for "Mail" / "Other (custom name)".
4. Paste the 16-character password into `SMTP_PASS`.

---

## Step 6 — Run the setup check

```bash
node setup-check.js
```

This verifies both API connections and creates the header row in your sheet.
Fix any errors it reports before proceeding.

Expected output when everything is correctly configured:

```
──────────────────────────────────────────────────────
  HVAC Lead Workflow — Setup Check
──────────────────────────────────────────────────────

1. Checking environment variables…

  ✅  APOLLO_API_KEY is set
  ✅  GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set
  ✅  GOOGLE_SPREADSHEET_ID is set

2. Testing Apollo.io API connection…

  ✅  Apollo.io API key is valid
  ℹ️  Account can reach the people-search endpoint

3. Testing Google Sheets connection…

  ✅  Google Sheets service account authenticated
  ✅  Spreadsheet found: "My HVAC Leads"
  ✅  Target sheet "Leads" exists

4. Ensuring spreadsheet header row is set up…

  ✅  Header row is ready

──────────────────────────────────────────────────────
  🎉  All checks passed! You are ready to go.
```

---

## Step 7 — Test a manual run

```bash
node index.js --run-now
```

This runs the full workflow once immediately.  Check your spreadsheet —
you should see up to 25 new leads added.

---

## Step 8 — Start the daily scheduler

```bash
node index.js
```

This process must keep running.  Options for keeping it alive:

### Option A: PM2 (recommended for always-on machines)

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup          # follow the printed command to auto-start on reboot
```

Monitor with: `pm2 logs hvac-leads`

### Option B: System cron (simpler, no Node process to manage)

Instead of the built-in scheduler, you can call the script directly via cron.

```bash
crontab -e
```

Add (adjust the path to match your setup):

```
# Run HVAC lead workflow at 7:00 AM Eastern every day
0 12 * * * cd /path/to/hvac-lead-workflow && /usr/bin/node index.js --run-now >> logs/workflow.log 2>&1
```

> Note: `0 12 * * *` = noon UTC = 7 AM ET (adjust for DST as needed).

---

## Customising the workflow

| What to change | Where |
|---------------|-------|
| Target cities | `src/apolloClient.js` → `SW_MICHIGAN_LOCATIONS` array |
| Job titles to target | `src/apolloClient.js` → `TARGET_TITLES` array |
| Industry keywords | `src/apolloClient.js` → `HVAC_KEYWORDS` array |
| Max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Schedule | `.env` → `CRON_SCHEDULE` (node-cron syntax) |
| Spreadsheet tab | `.env` → `GOOGLE_SHEET_NAME` |
| Column layout | `src/sheetsClient.js` → `ensureHeader()` and `appendLeads()` |

---

## Troubleshooting

| Error | Likely cause |
|-------|-------------|
| `APOLLO_API_KEY is not set` | Missing or misnamed in `.env` |
| `Apollo API responded with 401` | Wrong API key |
| `Apollo API responded with 429` | Rate limit — reduce `MAX_LEADS_PER_RUN` or run less frequently |
| `Service account key file not found` | Wrong path in `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` |
| `Permission denied on the spreadsheet` | Sheet not shared with service account email |
| `Target sheet "Leads" not found` | Tab name mismatch — check `GOOGLE_SHEET_NAME` |
| Email alerts not arriving | Check `SMTP_PASS` is an App Password, not your Gmail login password |

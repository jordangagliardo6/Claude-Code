# HVAC Lead Generation Workflow — Setup Guide

Pulls owner contact info for HVAC companies in Southwest Michigan from Apollo.io
and appends new leads to a Google Sheets spreadsheet every morning at 7am Eastern.

---

## What You Need

| Requirement | Details |
|---|---|
| **Node.js ≥ 18** | [nodejs.org](https://nodejs.org) |
| **Apollo.io account** | Free tier: 50 credits/mo · Basic ($49/mo): 1,000/mo |
| **Google Cloud project** | Free — just needs Sheets API enabled |
| **Google Sheets spreadsheet** | You create it; share it with the service account |

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-workflow
npm install
```

---

## Step 2 — Get Your Apollo.io API Key

1. Sign in at [apollo.io](https://www.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set Up Google Sheets API (Service Account)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or pick an existing one)
3. Enable **Google Sheets API** (search in "APIs & Services → Library")
4. Go to **IAM & Admin → Service Accounts**
5. Click **Create Service Account**
   - Name: `hvac-lead-workflow` (or anything you like)
   - Click through — no special role needed
6. Click the service account you just created
7. Go to the **Keys** tab → **Add Key → Create new key → JSON**
8. Download the JSON file
9. Create a `credentials/` folder inside `hvac-lead-workflow/` and put the JSON there:
   ```
   hvac-lead-workflow/
   └── credentials/
       └── google-service-account.json
   ```

---

## Step 4 — Create Your Google Spreadsheet

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name the first sheet tab **Leads**
3. The workflow will auto-create the header row on first run — you don't need to add it
4. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```
5. **Share the spreadsheet** with the service account email address
   (it looks like `hvac-lead-workflow@your-project.iam.gserviceaccount.com`)
   — give it **Editor** access

---

## Step 5 — Configure Your .env File

```bash
cp .env.example .env
```

Open `.env` and fill in:

```dotenv
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEET_TAB=Leads
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/google-service-account.json

# Optional: get email alerts when something fails
ALERT_EMAIL_TO=your@gmail.com
ALERT_EMAIL_FROM=your@gmail.com
ALERT_EMAIL_APP_PASSWORD=your_gmail_app_password
```

> **Gmail App Password:** Go to myaccount.google.com → Security → 2-Step Verification → App passwords.
> Generate one for "Mail". Paste it in the .env above.

---

## Step 6 — Test the Connection

Run this before the first scheduled run to confirm both APIs work:

```bash
node scripts/test-connection.js
```

Expected output when everything is working:
```
=== HVAC Lead Workflow — Connection Test ===

  APOLLO_API_KEY is set ... ✓ PASS
  GOOGLE_SHEET_ID is set ... ✓ PASS
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH is set and file exists ... ✓ PASS
  Apollo API responds to a ping (account info) ... ✓ PASS
  Google Sheets API — authenticate ... ✓ PASS
  Google Sheets API — read spreadsheet metadata ...
    → Connected to: "HVAC Leads"
  ✓ PASS
  Google Sheets API — write a test row ... ✓ PASS
  Google Sheets API — delete the test row ... ✓ PASS

─────────────────────────────────────────────
Results: 8 passed, 0 failed

✓ All checks passed! Your workflow is ready to run.

  Start the scheduler:  node index.js
  Run once right now:   node -e "require('./src/run').runWorkflow()"
```

---

## Step 7 — Run It

**Start the scheduler (runs continuously, fires daily at 7am Eastern):**
```bash
node index.js
```

**Run the workflow once right now (for testing):**
```bash
node -e "require('./src/run').runWorkflow()"
```

---

## Running as a Background Service

To keep the workflow running after you close your terminal, use **PM2**:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

Check logs anytime:
```bash
pm2 logs hvac-leads
```

---

## Spreadsheet Column Layout

| Col | Header | Notes |
|-----|--------|-------|
| A | Date Added | Auto-filled by workflow |
| B | Business Name | Used for deduplication |
| C | Owner First Name | From Apollo |
| D | Owner Last Name | From Apollo |
| E | Phone Number | Best available (mobile preferred) |
| F | City | From Apollo |
| G | Website | From Apollo, if available |
| H | Called | Leave blank — fill in manually |
| I | Notes | Leave blank — fill in manually |

---

## Customizing the Search

Edit `src/apollo.js` to change:

- **Cities** — `SW_MICHIGAN_CITIES` array (top of file)
- **Industries** — `TARGET_INDUSTRIES` array
- **Job titles** — `TARGET_JOB_TITLES` array

Edit `.env` to change:

- **Max leads per run** — `MAX_LEADS_PER_RUN` (default: 25)
- **Schedule** — `CRON_SCHEDULE` (standard cron expression, UTC)

---

## Troubleshooting

**Apollo returns 0 results**
- Verify your API key is correct
- Check if your Apollo plan has remaining credits this month
- The free tier (50/mo) is consumed quickly — upgrade to Basic for daily runs

**Google Sheets "Permission denied" error**
- Make sure the spreadsheet is shared with the service account email address as **Editor**
- Double-check `GOOGLE_SHEET_ID` is the ID portion of the URL only (not the full URL)

**Email alerts not sending**
- You need a Gmail App Password (not your regular password)
- Go to myaccount.google.com → Security → App passwords
- Make sure 2-Step Verification is enabled first

**Cron not firing at 7am**
- The default schedule `0 12 * * *` fires at 12:00 UTC = 7am EST
- During Eastern Daylight Time (summer), 7am EDT = 11:00 UTC
- Set `CRON_SCHEDULE=0 11 * * *` in summer months, or use a hosting service that handles DST automatically

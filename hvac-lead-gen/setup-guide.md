# HVAC Lead Gen — First-Time Setup Guide

Automated daily lead generation: Apollo.io → Google Sheets  
Target: HVAC, Plumbing, Mechanical companies in Southwest Michigan  
Schedule: 7:00 AM Eastern Time, every day  

---

## What You'll Need

| Requirement | Where to Get It |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Apollo.io API key | https://developer.apollo.io → API Keys |
| Google Cloud project | https://console.cloud.google.com |
| Google service account | See Step 3 below |

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=1vC18Ek-QYf4AdtK21X1VN9cUYnPJgV_5ALPy2M-zg7c
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-credentials.json
ALERT_EMAIL=jgagliardo98@gmail.com
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password
```

**Your Google Spreadsheet has already been created:**  
https://docs.google.com/spreadsheets/d/1vC18Ek-QYf4AdtK21X1VN9cUYnPJgV_5ALPy2M-zg7c/edit

---

## Step 3 — Set Up Google Service Account

This is a one-time process. The service account is a "robot user" that the
script uses to write to your spreadsheet without requiring you to log in.

### 3a. Create the project and enable the API

1. Go to https://console.cloud.google.com
2. Click **Select a project** → **New Project** → name it anything (e.g. "hvac-leads")
3. From the left menu: **APIs & Services** → **Library**
4. Search for **Google Sheets API** → click it → click **Enable**

### 3b. Create a service account

1. **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
2. Name: `hvac-lead-gen` (or anything)
3. Click **Create and Continue** → **Done** (no roles needed)
4. Click the service account you just created → **Keys** tab
5. **Add Key** → **Create new key** → **JSON** → **Create**
6. A `.json` file downloads automatically — rename it `google-credentials.json`
7. Move it into the `hvac-lead-gen/` folder

### 3c. Share the spreadsheet with the service account

1. Open your downloaded JSON file and copy the `client_email` value  
   (looks like: `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open the spreadsheet: https://docs.google.com/spreadsheets/d/1vC18Ek-QYf4AdtK21X1VN9cUYnPJgV_5ALPy2M-zg7c/edit
3. Click **Share** (top right)
4. Paste the service account email → set role to **Editor** → click **Send**

---

## Step 4 — Set Up Error Email Alerts (Optional)

The script can email you when something goes wrong.

1. Go to https://myaccount.google.com/apppasswords
2. Sign in → **Select app**: "Mail" → **Select device**: "Other" → name it "hvac-leads"
3. Google generates a 16-character password — copy it
4. In your `.env`:
   ```
   SMTP_USER=your_gmail@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop   (paste the 16-char code, spaces optional)
   ```

If you skip this, errors still print to the console — you just won't get emailed.

---

## Step 5 — Verify Everything Works

```bash
npm run verify
```

Expected output:
```
[1/2] Apollo.io ...    ✓ CONNECTED
[2/2] Google Sheets ... ✓ CONNECTED  ("HVAC Southwest Michigan Leads")

All systems go. Starting scheduler.
```

If either check fails, see the **Troubleshooting** section below.

---

## Step 6 — Test Run (Pull Leads Right Now)

```bash
npm run run-now
```

This runs the full workflow immediately — searches Apollo, deduplicates,
and writes results to the sheet. Check the spreadsheet after it completes.

---

## Step 7 — Start the Daily Scheduler

```bash
npm start
```

The process runs continuously in the background and fires at **7:00 AM ET** every day.
Each run pulls up to **25 new leads** and appends them to the sheet.

**To keep it running after you close your terminal**, use one of:

### Option A: PM2 (recommended for a server or Mac/Linux)
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### Option B: Background process (quick test)
```bash
nohup npm start > hvac-leads.log 2>&1 &
tail -f hvac-leads.log   # watch the log
```

### Option C: Windows Task Scheduler
Create a task that runs `node index.js` daily at 6:55 AM (5 min before cron fires)
with the working directory set to this folder.

---

## Spreadsheet Columns

| Column | What It Contains |
|---|---|
| A — Date Added | Date the lead was added (MM/DD/YYYY) |
| B — Business Name | Company name from Apollo |
| C — Owner First Name | Decision-maker's first name |
| D — Owner Last Name | Decision-maker's last name |
| E — Phone Number | Best available number (mobile preferred) |
| F — City | City from Apollo person/org data |
| G — Website | Company website URL |
| H — Called | **You fill this in** — leave blank or Y/N |
| I — Notes | **You fill this in** — call notes, outcome, etc. |

---

## Customizing the Search

All search settings live at the top of `index.js` in the `CONFIG` object.

**Add or remove cities:**
```js
cities: [
  'St. Joseph, Michigan',
  'Kalamazoo, Michigan',
  // add more here
],
```

**Change the max leads per run:**
```js
maxLeadsPerRun: 25,   // change to any number
```

**Add more industry keywords:**
```js
industryKeywords: [
  'hvac',
  'electrician',    // ← add a new niche
],
```

**Change the sheet tab name** (if you rename "Sheet1"):
```js
sheetName: 'Leads',   // must match exactly
```

---

## Troubleshooting

**Apollo returns 0 leads with phone numbers**
- Apollo's free plan (50 credits/month) may not include phone data for this region
- Upgrade to Apollo Basic ($49/mo) for 1,000 phone-enriched contacts/month
- Try broadening `cities` to include all of `'Michigan, United States'`

**Google Sheets: "The caller does not have permission"**
- Make sure you shared the spreadsheet with the service account email
- The service account needs **Editor** role, not just Viewer

**Google Sheets: "Unable to parse range"**
- The `sheetName` in CONFIG must exactly match the tab name in the spreadsheet
- Default tab is "Sheet1" — rename it or update CONFIG.sheetName

**SMTP email alerts not sending**
- You must use a Gmail App Password, NOT your regular Gmail password
- 2-Factor Authentication must be enabled on your Google account first
- Generate the App Password at: https://myaccount.google.com/apppasswords

**"GOOGLE_SPREADSHEET_ID is not set"**
- Make sure `.env` exists (copy from `.env.example`) and is in the `hvac-lead-gen/` folder
- The spreadsheet ID is already pre-filled: `1vC18Ek-QYf4AdtK21X1VN9cUYnPJgV_5ALPy2M-zg7c`

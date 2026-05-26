# HVAC Leads Workflow — Setup Guide

Automated lead generation: Apollo.io → Google Sheets, runs daily at 7 AM ET.

---

## What You Need Before Starting

| Requirement | Why |
|---|---|
| Node.js 18+ | Runtime |
| Apollo.io Basic plan (or above) | Free plan blocks the People Search API |
| Google account with the leads spreadsheet | Already created — see Spreadsheet ID below |
| A Google Cloud project | Free tier is fine |

**Your spreadsheet:**
`HVAC Leads — Southwest Michigan`
URL: `https://docs.google.com/spreadsheets/d/1rJsYIBDjJT-df54VoWAsCC2Fq_UN6zc3XFVqqX8sun8`

---

## Step 1 — Install Dependencies

```bash
cd hvac-leads-workflow
npm install
```

---

## Step 2 — Get Your Apollo API Key

1. Log in to [app.apollo.io](https://app.apollo.io/)
2. Go to **Settings → Integrations → API**
3. Copy your API key

> **Plan note:** The People Search endpoint (`/api/v1/mixed_people/search`) requires
> Apollo Basic plan or above. Phone numbers in search results require a paid plan.
> If you're on Basic but phones are missing, set `ENRICH_FOR_PHONES=true` in `.env`
> (costs 1 Apollo export credit per contact enriched).

---

## Step 3 — Set Up Google Sheets Access (Service Account)

### 3a. Create a Google Cloud project
1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click **Select a project → New Project** — name it anything (e.g. "HVAC Leads")
3. Click **Create**

### 3b. Enable the Google Sheets API
1. In your new project, go to **APIs & Services → Library**
2. Search for **"Google Sheets API"** → click it → click **Enable**

### 3c. Create a Service Account
1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name it `hvac-leads-bot` (or anything) → click **Create and Continue**
4. Skip the optional role/user steps → click **Done**

### 3d. Download the JSON key
1. Click the service account you just created
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**
3. A `.json` file downloads — rename it `service-account.json`
4. Move it into the `credentials/` folder of this project

### 3e. Share the spreadsheet with the service account
1. Open the service account JSON file
2. Copy the `"client_email"` value (looks like `hvac-leads-bot@your-project.iam.gserviceaccount.com`)
3. Open [the leads spreadsheet](https://docs.google.com/spreadsheets/d/1rJsYIBDjJT-df54VoWAsCC2Fq_UN6zc3XFVqqX8sun8)
4. Click **Share** → paste the service account email → set role to **Editor** → click **Send**

---

## Step 4 — Configure Your .env File

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key_here
ENRICH_FOR_PHONES=false        # set true if phones are missing from search results
SPREADSHEET_ID=1rJsYIBDjJT-df54VoWAsCC2Fq_UN6zc3XFVqqX8sun8
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials/service-account.json
```

**Optional — email alerts on errors:**
```env
ALERT_EMAIL=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password   # create at myaccount.google.com/apppasswords
```
If SMTP is not configured, errors are logged to the console only.

---

## Step 5 — Test Both Connections

Run this before the first scheduled run to confirm everything works:

```bash
node src/testConnection.js
```

Expected output:
```
Apollo.io …    ✓  Connected
Google Sheets … ✓  Connected — spreadsheet: "HVAC Leads — Southwest Michigan"
```

Fix any failures it reports before moving on.

---

## Step 6 — Do a Manual Test Run

Pull your first batch of leads immediately (doesn't wait for 7 AM):

```bash
node src/workflow.js
```

Check the console output and then open the spreadsheet to confirm rows appeared.

---

## Step 7 — Start the Scheduler

```bash
npm start
```

The process must stay running for the cron to fire. For production use, keep it alive with **PM2**:

```bash
# Install PM2 globally (one-time)
npm install -g pm2

# Start and auto-restart on crash
pm2 start src/scheduler.js --name hvac-leads

# Auto-start on server reboot
pm2 startup
pm2 save
```

The workflow will now run every morning at **7:00 AM ET**.

---

## Daylight Saving Time

The default cron `0 12 * * *` targets 7 AM **Eastern Standard Time (UTC-5)**.
During daylight saving (March–November), ET is UTC-4, so 7 AM ET = 11:00 UTC.

Change your `.env`:
```env
# Daylight saving (March–November)
CRON_SCHEDULE=0 11 * * *

# Standard time (November–March)
CRON_SCHEDULE=0 12 * * *
```

Or run the server with `TZ=America/New_York` so it auto-adjusts:
```bash
TZ=America/New_York node src/scheduler.js
```

---

## Customization

**Change target cities** — edit `targetCities` in `src/config.js`

**Change industry keywords** — edit `industryKeywords` in `src/config.js`

**Change target job titles** — edit `targetTitles` in `src/config.js`

**Change leads per run** — set `MAX_LEADS_PER_RUN=50` in `.env`

**Add spreadsheet columns** — update the `columns` map in `src/config.js` and the row array in `sheetsClient.js > appendLeads()`

---

## Spreadsheet Structure

| Column | Field | Notes |
|---|---|---|
| A | Date Added | Auto-filled by the script |
| B | Business Name | Used for deduplication |
| C | Owner First Name | |
| D | Owner Last Name | |
| E | Phone Number | Direct or mobile |
| F | City | |
| G | Website | If available |
| H | Called | Leave blank — fill in manually |
| I | Notes | Leave blank — fill in manually |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to Apollo Basic plan |
| `No phone numbers` in results | Set `ENRICH_FOR_PHONES=true` in `.env` |
| `Service Account key not found` | Move JSON file to `credentials/service-account.json` |
| `The caller does not have permission` (Sheets) | Share the spreadsheet with the service account email as Editor |
| `Invalid CRON_SCHEDULE` | Check syntax at [crontab.guru](https://crontab.guru/) |

# Apollo HVAC Lead Gen — First-Time Setup

This workflow pulls HVAC company owner contacts from Apollo.io and appends
them to your existing **SW Michigan HVAC Leads** Google Sheet every morning at 7am ET.

**Sheet targeted:** `SW Michigan HVAC Leads`
**Sheet URL:** https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo/edit

---

## Step 1 — Install Node.js dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in at [apollo.io](https://www.apollo.io)
2. Go to **Settings → Integrations → API** (or visit https://developer.apollo.io)
3. Copy your API key

> **Important:** The People Search endpoint (`/mixed_people/search`) requires a
> **paid Apollo plan** (Basic at $49/mo or higher). The free plan returns a 403 error.
> Upgrade at https://www.apollo.io/pricing

---

## Step 3 — Set up Google Sheets access (Service Account)

A Service Account lets the script write to your sheet without you being logged in.

### 3a. Create a Google Cloud project (skip if you have one)

1. Go to https://console.cloud.google.com
2. Click **Select a project → New Project**
3. Name it (e.g. "hvac-lead-gen") and create it

### 3b. Enable the Google Sheets API

1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** and click **Enable**

### 3c. Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it (e.g. "hvac-lead-gen-bot") — copy the email address shown (ends in `@...gserviceaccount.com`)
4. Click **Create and Continue → Done**

### 3d. Download the JSON key

1. Click on the service account you just created
2. Go to the **Keys** tab → **Add Key → Create new key**
3. Choose **JSON** → **Create** — a file downloads automatically
4. Move it to: `apollo-lead-gen/credentials/service-account.json`

### 3e. Share your Google Sheet with the service account

1. Open your **SW Michigan HVAC Leads** sheet:
   https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo/edit
2. Click **Share** (top right)
3. Paste the service account email address (from step 3c)
4. Set permission to **Editor** → click **Send**

---

## Step 4 — Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_actual_api_key
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
```

---

## Step 5 — Test the connections

Before starting the scheduler, confirm both APIs connect:

```bash
node test-connection.js
```

You should see:

```
✓ APOLLO_API_KEY is set
✓ GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set
✓ Apollo API connected successfully
✓ Connected to sheet: "SW Michigan HVAC Leads"
✓ Found 25 existing leads in the sheet
✅  All connections OK — safe to start the scheduler.
```

If Apollo returns a plan error, you need to upgrade your Apollo account.

---

## Step 6 — Start the scheduler

```bash
node index.js
```

The script will start and wait for 7am ET. You'll see:

```
[9/5/2026, 9:00:00 AM ET] Apollo HVAC Lead Gen — starting up
[9/5/2026, 9:00:00 AM ET] Cron schedule: 0 7 * * * (America/New_York)
[9/5/2026, 9:00:00 AM ET] Waiting for next scheduled run...
```

### To run immediately (manual test run):

```bash
RUN_NOW=true node index.js
```

This fires one run right now AND keeps the 7am schedule running.

---

## Keeping it running (production)

For 24/7 scheduled runs, use **PM2** (process manager):

```bash
# Install PM2 globally
npm install -g pm2

# Start the script under PM2
pm2 start index.js --name hvac-lead-gen

# Auto-restart on machine reboot
pm2 startup
pm2 save
```

Check logs anytime: `pm2 logs hvac-lead-gen`

---

## Customizing the search

All search settings live in `config.js`:

| Setting | What it does |
|---|---|
| `cities[]` | Add/remove cities to search |
| `industryKeywords[]` | HVAC, Plumbing, etc. |
| `jobTitles[]` | Owner, President, etc. |
| `employeeRanges[]` | Company size filter |
| `maxLeadsPerRun` | Max new leads per run (default 25) |
| `spreadsheetId` | The Google Sheet to write to |
| `cronSchedule` | Cron expression (default 7am daily) |

---

## Troubleshooting

**Apollo returns 0 results or plan error**
- Upgrade your Apollo plan to Basic ($49/mo) or higher
- Check your API key is correct in `.env`

**Google Sheets write fails**
- Verify the service account email has Editor access to the sheet
- Confirm the sheet ID in `config.js` matches your sheet's URL

**Leads are duplicated**
- The script checks the Business Name column for dedup
- Ensure column B header is exactly "Business Name" (case-sensitive)

**Script stops running**
- Use PM2 (see above) to keep it alive and restart automatically

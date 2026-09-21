# HVAC Lead Generation Workflow

Pulls up to 25 new HVAC owner/decision-maker leads per day from Apollo.io for Southwest Michigan and appends them to a Google Sheet, skipping any businesses already in the sheet.

**Runs automatically at 7am Eastern every day.**

---

## What It Does

- Searches Apollo.io for owners, presidents, and founders of HVAC/plumbing/mechanical companies in: St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven (and surrounding cities)
- Filters to 1–25 employee companies only (owner-operated)
- Skips any contact with no phone number
- Deduplicates against the existing sheet before writing
- Appends to your Google Sheet with: Date Added, Business Name, Owner First Name, Owner Last Name, Phone Number, City, Website, Called (blank), Notes (blank)

---

## Requirements

- **Node.js 18+** — check with `node --version`
- **Apollo.io PAID plan** — Basic or higher (free plan blocks the prospecting API)
- **Google Cloud project** with Sheets API enabled

---

## Step 1 — Install Dependencies

```bash
cd hvac-leads-workflow
npm install
```

---

## Step 2 — Apollo.io API Key

1. Go to [https://app.apollo.io/#/settings/integrations/api](https://app.apollo.io/#/settings/integrations/api)
2. Click **Create API Key** and copy it
3. **Important:** Your account must be on a **paid plan** (Basic, Professional, or Organization) — the free plan cannot access the people prospecting API. Upgrade at [https://www.apollo.io/pricing](https://www.apollo.io/pricing)

---

## Step 3 — Google Sheets Setup

The workflow authenticates as a **service account** so it can run unattended without browser login.

### 3a. Create a Google Cloud project (if you don't have one)

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → give it a name like "hvac-leads"
3. Enable the **Google Sheets API**: search for it in the API Library and click **Enable**

### 3b. Create a service account

1. Go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account** → name it `hvac-leads-bot`
3. Click **Done** (no special roles needed at the project level)
4. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
5. Download the JSON file and save it as `credentials.json` in this folder

### 3c. Share your Google Sheet with the service account

1. Open the `credentials.json` file and copy the `client_email` value (looks like `hvac-leads-bot@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet
3. Click **Share** → paste the service account email → give it **Editor** access → click **Send**

---

## Step 4 — Configure .env

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key
SPREADSHEET_ID=your_google_sheet_id    # from the sheet URL
GOOGLE_CREDENTIALS_FILE=./credentials.json
```

The **Spreadsheet ID** is the long string in your sheet's URL:
`https://docs.google.com/spreadsheets/d/THIS_PART/edit`

Your current master lead sheet: `1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo`

---

## Step 5 — Test Connections

Before starting the scheduler, verify both APIs connect:

```bash
node test-connection.js
```

Expected output when everything is set up:
```
  ✓ Apollo connected
  ✓ Prospecting API accessible (paid plan confirmed)
  ✓ Google Sheets connected
  ✓ All connections verified.
```

If you see `✗ NEEDS UPGRADE` for the Prospecting API, your Apollo account is on the free plan — upgrade first.

---

## Step 6 — Run a First Pull Now

```bash
node run-once.js
```

This runs one complete cycle immediately (search → dedup → append) and exits. Check your Google Sheet to confirm rows were added.

---

## Step 7 — Start the Daily Scheduler

```bash
node index.js
```

This keeps the process running and fires at 7am Eastern every day. To keep it running permanently:

### Option A — PM2 (recommended)
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### Option B — System cron (alternative)
Instead of using node-cron, add to crontab:
```
0 7 * * * cd /path/to/hvac-leads-workflow && node run-once.js >> hvac-leads.log 2>&1
```

---

## Customizing the Workflow

All configuration lives in two places:

**`.env`** — credentials and runtime settings (API keys, spreadsheet ID, max leads)

**`config.js`** — search parameters you can edit without touching the main code:
- `targetCities` — add/remove Southwest Michigan cities
- `industryKeywords` — expand to include "Electrical" or "Roofing" etc.
- `targetTitles` — change job title priority order
- `employeeRanges` — adjust company size filter

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to a paid Apollo plan |
| `Spreadsheet not found` | Check `SPREADSHEET_ID` in `.env` and share the sheet with the service account email |
| `credentials.json not found` | Download service account JSON from Google Cloud and save as `credentials.json` |
| `0 results` from Apollo | Expand `targetCities` or `industryKeywords` in `config.js` |
| Duplicate entries in sheet | Already handled — the dedup check reads column B before writing |
| Email alerts not sending | Add `SMTP_USER` and `SMTP_PASS` to `.env`, install `nodemailer` (`npm install nodemailer`) |

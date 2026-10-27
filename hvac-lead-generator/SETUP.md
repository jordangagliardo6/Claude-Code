# HVAC Lead Generator — Setup Guide

Automated Apollo.io → Google Sheets lead pipeline for SW Michigan HVAC companies.
Runs every morning at 7:00 AM Eastern. Adds up to 25 new leads per day.

---

## Prerequisites

- Node.js 18 or newer (`node --version`)
- An [Apollo.io](https://app.apollo.io) account (free tier works)
- A Google account with Google Sheets API enabled

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-generator
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log into [apollo.io](https://app.apollo.io)
2. Click your profile → **Settings** → **Integrations** → **API**
3. Copy the API key

---

## Step 3 — Set up Google Sheets access

### 3a. Create the spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it anything (e.g. "SW Michigan HVAC Leads")
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  →THIS PART←  /edit
   ```

### 3b. Create a Google service account

1. Open [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**:
   - Go to **APIs & Services** → **Library** → search "Google Sheets API" → Enable
4. Create a service account:
   - **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Give it any name (e.g. "hvac-lead-generator")
   - Click **Done** (no role needed at project level)
5. Download the JSON key:
   - Click the service account → **Keys** tab → **Add Key** → **Create new key** → JSON
   - A `.json` file downloads — rename it `google-credentials.json` and place it in this directory

### 3c. Share the spreadsheet with the service account

1. Open the `google-credentials.json` file and find the `"client_email"` value
   (looks like `hvac-lead-generator@yourproject.iam.gserviceaccount.com`)
2. Share your Google Sheets spreadsheet with that email address (Editor access)

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
APOLLO_API_KEY=paste_your_apollo_key_here
GOOGLE_SPREADSHEET_ID=paste_your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Leads
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-credentials.json

# Optional: email alerts on errors
ALERT_EMAIL_TO=jgagliardo98@gmail.com
ALERT_EMAIL_FROM=your_gmail@gmail.com
ALERT_EMAIL_APP_PASSWORD=your_16char_app_password
```

For email alerts, generate a Gmail App Password at:
https://myaccount.google.com/apppasswords

---

## Step 5 — Test the connection

Run the connection test **before** the first scheduled run:

```bash
node test-connection.js
```

Expected output when everything works:

```
=== HVAC Lead Generator — Connection Test ===

[1] Testing Apollo.io connection...
  ✓  APOLLO_API_KEY set
  ✓  Apollo API responded — sample result count: 1

[2] Testing Google Sheets connection...
  ✓  GOOGLE_SPREADSHEET_ID set
  ✓  Google credentials file loaded
  ✓  Spreadsheet accessible — row 1: [empty]

Results: 5 passed, 0 failed

All checks passed! You are ready to run the lead generator.
```

---

## Step 6 — Run it

**One immediate run** (test before scheduling):
```bash
node index.js --run-now
```

**Start the daily scheduler** (7:00 AM ET):
```bash
node index.js
```

To keep it running as a background service, use PM2:
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing

**Add or remove cities** — edit `SW_MICHIGAN_LOCATIONS` in `apollo.js`

**Change target industries or job titles** — edit `TARGET_INDUSTRIES` and `TARGET_TITLES` in `apollo.js`

**Change max leads per run** — set `MAX_LEADS_PER_RUN=25` in `.env`

**Change the schedule** — edit `CRON_SCHEDULE` in `index.js` (standard cron syntax)

**Change column structure** — edit the `COLUMNS` array in `sheets.js` and the row-building logic in `appendLeads()`

---

## Spreadsheet columns

| Column | Field         | Notes                   |
|--------|---------------|-------------------------|
| A      | Date Added    | Set automatically       |
| B      | Business Name | Used for duplicate check|
| C      | Owner First   |                         |
| D      | Owner Last    |                         |
| E      | Phone Number  | Mobile preferred        |
| F      | City          |                         |
| G      | Website       |                         |
| H      | Called        | Leave blank — fill in manually |
| I      | Notes         | Leave blank — fill in manually |

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `401 Unauthorized` from Apollo | Check `APOLLO_API_KEY` in `.env` |
| `403` from Google Sheets | Share the spreadsheet with the service account email |
| `ENOENT google-credentials.json` | Place the downloaded JSON key in this directory |
| Apollo returns 0 results | Credits may be exhausted on free plan; check apollo.io dashboard |
| Email alerts not sending | Set all `ALERT_EMAIL_*` vars; use an App Password, not your Google password |

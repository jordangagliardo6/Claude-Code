# HVAC Lead Generator — Setup Guide

Automated daily lead pull for HVAC/plumbing/mechanical companies in Southwest Michigan.
Runs every morning at 7:00 AM Eastern, adds up to 25 new leads to your Google Sheet.

---

## Quick Start (5 steps)

### Step 1 — Install dependencies

```bash
cd hvac-leads
npm install
```

### Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the values below.

---

### Step 3 — Apollo API key

1. Go to [developer.apollo.io](https://developer.apollo.io) → API Keys
2. Copy your key and paste it into `.env`:
   ```
   APOLLO_API_KEY=your_key_here
   ```

> **Plan requirement:** The people search endpoint used by this script requires the
> **Basic plan ($49/mo)** or higher. Free accounts will see an `API_INACCESSIBLE` error.
> Upgrade at [apollo.io/pricing](https://www.apollo.io/pricing).

---

### Step 4 — Google Sheets credentials

The script writes to a single master spreadsheet. You need either a **Service Account**
(recommended for unattended cron runs) or stored **OAuth2 refresh tokens**.

#### Option A: Service Account (recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → select or create a project
2. Enable the **Google Sheets API**
3. Go to **IAM & Admin → Service Accounts** → Create service account
4. Under the service account → **Keys** → Add key → JSON → Download
5. Open the JSON file. Paste its entire contents (minified to one line) as `GOOGLE_SERVICE_ACCOUNT_JSON`:
   ```
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
   ```
6. **Share your spreadsheet** with the service account email (looks like `xxx@project.iam.gserviceaccount.com`) — Editor access

#### Option B: OAuth2

If you already have OAuth credentials:
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
```

---

### Step 5 — Spreadsheet ID

Your master spreadsheet was created automatically:

**HVAC Leads — SW Michigan (Master)**
`https://docs.google.com/spreadsheets/d/1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs/edit`

Set this in `.env`:
```
GOOGLE_SHEET_ID=1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs
```

---

## Verify before first run

```bash
node setup.js
```

This checks both API connections and prints `✓` for each. Fix any `✗` items before continuing.

---

## Run immediately (test)

```bash
node index.js --run-now
```

Watch the console output. You should see:
- Existing business count loaded from sheet
- Apollo candidate count
- New unique leads count
- "Run complete. Added: X new leads"

---

## Start the scheduler

```bash
node index.js
```

Runs until you stop it (Ctrl+C). Fires every day at 7:00 AM Eastern.

For production, run it as a background service:

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot

# Or as a simple background process
nohup node index.js > hvac-leads.log 2>&1 &
```

---

## Customizing the search

To change cities, open `apollo.js` and edit `TARGET_LOCATIONS`.
To change job titles, edit `TARGET_TITLES`.
To change industries, edit `INDUSTRY_TAGS`.
To change the max leads per run, set `MAX_LEADS_PER_RUN=25` in `.env`.

---

## Error handling

- All errors are printed to the console with timestamps
- If `NOTIFICATION_EMAIL` and SMTP settings are in `.env`, an email alert is sent
- The exit code is set to 1 on failure (useful for monitoring/cron wrappers)

---

## Column layout

| Column | Field          | Filled by          |
|--------|----------------|--------------------|
| A      | Date Added     | Script             |
| B      | Business Name  | Script (dedup key) |
| C      | Owner First    | Script (Apollo)    |
| D      | Owner Last     | Script (Apollo)    |
| E      | Phone Number   | Script (Apollo)    |
| F      | City           | Script (Apollo)    |
| G      | Website        | Script (Apollo)    |
| H      | Called         | **You** (manual)   |
| I      | Notes          | **You** (manual)   |

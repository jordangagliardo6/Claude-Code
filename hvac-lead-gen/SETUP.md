# HVAC Lead Gen — Setup & First Run Guide

Automated daily lead generation for HVAC owner-operators in Southwest Michigan.
Pulls up to 25 fresh leads from Apollo.io each morning and appends them to your
Google Sheet — no duplicates, no manual work.

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- An **Apollo.io account** with API access (Basic plan or above)
- A **Google account** with access to the target spreadsheet
- A terminal / command prompt

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in to [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets access

### Option A: Service Account (recommended — no browser needed)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a Service Account:
   - IAM & Admin → Service Accounts → **Create Service Account**
   - Name it anything (e.g. `hvac-lead-gen`)
   - Skip optional role/user steps → Done
5. Create a JSON key:
   - Click the service account → **Keys** tab → Add Key → Create new key → JSON
   - Download the file and save it as `service-account-key.json` inside the `hvac-lead-gen/` folder
6. Share your Google Sheet with the service account:
   - Open your spreadsheet in Google Sheets
   - Click **Share**
   - Paste the service account email (looks like `name@project.iam.gserviceaccount.com`)
   - Give it **Editor** access

### Option B: OAuth2 (if you prefer)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the **Google Sheets API** (same as above)
3. APIs & Services → Credentials → **Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Download the JSON
4. Run the one-time OAuth flow to get a refresh token:

```bash
# Install a helper package (one-time)
npx oauth2-cli --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET \
  --scope https://www.googleapis.com/auth/spreadsheets
```

Copy the `refresh_token` from the output into your `.env` file.

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in:

| Variable | What to put |
|---|---|
| `APOLLO_API_KEY` | Your Apollo.io API key |
| `GOOGLE_SPREADSHEET_ID` | The ID from your sheet's URL |
| `GOOGLE_SHEET_NAME` | Tab name in the sheet (default: `Leads`) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | `./service-account-key.json` (Option A) |
| `ALERT_EMAIL` | Your email for error alerts (optional) |
| `SMTP_*` | Your SMTP/Gmail credentials (optional) |

**Finding your Spreadsheet ID:**
Your sheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
The ID is the long string between `/d/` and `/edit`.

---

## Step 5 — Create the Google Sheet

1. Open Google Sheets and create a new spreadsheet (or use an existing one)
2. Rename the default tab to `Leads` (or whatever you set `GOOGLE_SHEET_NAME` to)
3. The header row will be **created automatically** on the first run

The columns will be written in this order:
```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

---

## Step 6 — Test connections before the first scheduled run

```bash
npm run test-connection
```

You should see three green checkmarks:
```
[1/3] Checking environment variables…
  ✓  APOLLO_API_KEY
  ✓  GOOGLE_SPREADSHEET_ID
  ✓  GOOGLE_SERVICE_ACCOUNT_KEY_FILE

[2/3] Testing Apollo.io connection…
  ✓  Apollo.io authenticated as: you@youremail.com

[3/3] Testing Google Sheets connection…
  ✓  Connected to spreadsheet: "SW Michigan HVAC Leads"
  ✓  Target sheet tab: "Leads"

 All checks passed — safe to start the scheduler.
```

If any check fails, the error message will tell you exactly what to fix.

---

## Step 7 — Run manually (optional test run)

Before starting the scheduler, you can trigger one immediate run to confirm
leads actually land in your sheet:

```bash
npm run run-once
```

Check your Google Sheet — you should see new rows appended with today's date.

---

## Step 8 — Start the scheduler

```bash
npm start
```

The scheduler starts and waits for 7:00 AM Eastern Time. It runs every day
and pulls up to 25 new leads. Keep the terminal/process running (see below
for running it as a background service).

---

## Running as a background service (optional)

### Using PM2 (recommended for VPS/servers)

```bash
npm install -g pm2
pm2 start src/index.js --name hvac-lead-gen
pm2 save           # persist across reboots
pm2 startup        # follow the printed command to enable auto-start
```

Useful PM2 commands:
```bash
pm2 logs hvac-lead-gen     # view live logs
pm2 status                 # check if it's running
pm2 restart hvac-lead-gen  # restart after config changes
pm2 stop hvac-lead-gen     # stop the scheduler
```

### Using system crontab (alternative)

Instead of the built-in node-cron scheduler, you can run `run-once.js`
from your system crontab:

```bash
crontab -e
```

Add this line (adjust paths to match your system):
```
0 7 * * * cd /path/to/hvac-lead-gen && node src/run-once.js >> logs/hvac-lead-gen.log 2>&1
```

---

## Customizing the workflow

### Change target cities

Edit `CITY_LIST` in `src/apollo.js`:
```js
const CITY_LIST = [
  'St. Joseph',
  'Benton Harbor',
  // add or remove cities here
];
```

### Change the run time

Edit `CRON_SCHEDULE` in `.env`:
```
CRON_SCHEDULE=0 8 * * *    # 8:00 AM instead of 7:00 AM
```

### Change max leads per run

Edit `MAX_LEADS_PER_RUN` in `.env`:
```
MAX_LEADS_PER_RUN=10    # fewer leads, easier to work through
```

### Add more columns

Edit `COLUMNS` in `src/sheets.js`. Each column needs a `header` (displayed in
the sheet) and a `field` (the key from the Lead object, or `null` for blank).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `APOLLO_API_KEY not set` | Make sure `.env` exists and `APOLLO_API_KEY` is filled in |
| `Apollo auth failed (401)` | Your API key is invalid — regenerate it at apollo.io |
| `Sheet tab "Leads" not found` | Create a tab named exactly `Leads` in your spreadsheet |
| `Service account key not found` | Move the JSON key file to `hvac-lead-gen/service-account-key.json` |
| `The caller does not have permission` | Share the sheet with the service account email as Editor |
| No leads returned | Apollo may have rate-limited you, or there are no results — check Apollo dashboard |
| Scheduler not running at 7 AM | Confirm `TZ=America/New_York` is in `.env` and the process is still running |

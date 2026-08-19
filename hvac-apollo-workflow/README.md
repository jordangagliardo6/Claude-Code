# HVAC Lead Generation Workflow

Pulls up to **25 new HVAC leads per day** from Apollo.io and appends them to a Google Sheet.  
Targets owner-operated HVAC, plumbing, and mechanical businesses (1–25 employees) in Southwest Michigan.  
Runs automatically every morning at **7 AM Eastern** via `node-cron`.

---

## What it produces

Each lead row contains:

| Column | Description |
|--------|-------------|
| Date Added | Date the lead was pulled |
| Business Name | Company name from Apollo |
| Owner First Name | Contact's first name |
| Owner Last Name | Contact's last name |
| Phone Number | Direct, mobile, or main line |
| City | City from Apollo profile |
| Website | Company website |
| Called | *(leave blank — fill in yourself)* |
| Notes | *(leave blank — fill in yourself)* |

---

## Setup (first time only)

### 1 — Install Node.js dependencies

```bash
cd hvac-apollo-workflow
npm install
```

### 2 — Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

### 3 — Google Sheets credentials

You need a **Google Service Account** — it's a robot account that can write to your spreadsheet.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API** in *APIs & Services → Library*
4. Go to *IAM & Admin → Service Accounts* → **Create Service Account**
5. Give it any name (e.g. `hvac-leads-bot`), skip optional steps, click Done
6. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
7. Save the downloaded JSON file as `hvac-apollo-workflow/google-service-account-key.json`
8. **Share your Google Sheet** with the service account's email address  
   (found in the JSON file under `"client_email"`) — give it **Editor** access

### 4 — Create the Google Sheet

1. Create a new Google Sheet (or use an existing one)
2. The workflow will auto-write the header row on first run
3. Copy the spreadsheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`

### 5 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account-key.json
GOOGLE_SHEET_NAME=Leads          # name of the tab inside your spreadsheet
ALERT_EMAIL_TO=jgagliardo98@gmail.com    # where to email errors
ALERT_EMAIL_FROM=your_gmail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  # 16-char Gmail App Password
```

**Email alerts are optional.** If you skip them, errors still print to the console.  
To get a Gmail App Password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)

### 6 — Verify connections before first run

```bash
node setup-check.js
```

This confirms Apollo returns results, Google Sheets is writable, and your env is complete.  
Fix any ✗ failures before proceeding.

### 7 — Run once to confirm end-to-end

```bash
node workflow.js --run-once
```

Watch the console — you should see leads appended to your sheet within 30 seconds.

### 8 — Start the daily scheduler

```bash
node workflow.js
```

This process must stay running (e.g. via `pm2`, a `screen` session, or a cloud VM).  
It will execute automatically every morning at 7 AM Eastern.

---

## Keeping the scheduler running with PM2 (recommended)

```bash
npm install -g pm2
pm2 start workflow.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing

### Change target cities

Edit the `TARGET_CITIES` array at the top of `workflow.js`:

```js
const TARGET_CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  // Add or remove cities here
];
```

### Change column structure

Modify the `COLUMNS` object and `HEADER_ROW` array at the top of `workflow.js`.  
Both must stay in sync with each other.

### Change max leads per run

Set `MAX_LEADS_PER_RUN=50` in your `.env` file (default is 25).

### Change the schedule

Set `CRON_SCHEDULE` in `.env`. The value is a UTC cron expression:

| Eastern time | UTC cron |
|---|---|
| 7 AM EST (winter) | `0 12 * * *` |
| 7 AM EDT (summer) | `0 11 * * *` |

---

## Error handling

- If Apollo returns 0 results → logs a warning and optionally emails you
- If Google Sheets write fails → logs the error and optionally emails you
- If env variables are missing → throws immediately with clear message
- City-level Apollo failures are non-fatal → logs a warning and tries remaining cities

---

## Notes on phone numbers

Apollo's API returns phone numbers based on your plan's reveal credits.  
If phone numbers show as blank, you may need to:
- Upgrade to an Apollo plan that includes direct dials
- Use Apollo's "Reveal" feature to unlock numbers before exporting

The workflow captures whatever phone data Apollo exposes in the API response.

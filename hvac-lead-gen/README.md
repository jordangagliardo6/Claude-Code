# HVAC Lead Gen — Southwest Michigan

Pulls up to 25 fresh HVAC owner/decision-maker leads per day from Apollo.io and appends them to your Google Spreadsheet. Runs automatically at 7am Eastern via node-cron.

---

## What It Does

| Step | What happens |
|------|-------------|
| 1 | Searches Apollo.io for HVAC / Plumbing / Mechanical companies (1–25 employees) in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven |
| 2 | Targets Owner · President · Founder · Co-Founder · General Manager (in that order) |
| 3 | Enriches each contact to reveal a direct/mobile phone number — skips anyone with no phone |
| 4 | Appends new leads to your Google Sheet, checking Business Name for duplicates first |
| 5 | Emails you (optional) if Apollo returns nothing or if the sheet write fails |

---

## Project Structure

```
hvac-lead-gen/
├── index.js          ← Scheduler (start this with "node index.js")
├── run-now.js        ← Manual trigger ("node run-now.js")
├── setup.js          ← First-run connection test ("node setup.js")
├── .env.example      ← Copy this to .env and fill in your keys
├── src/
│   ├── apollo.js     ← Apollo.io API client (edit cities/titles here)
│   ├── sheets.js     ← Google Sheets client (edit columns here)
│   ├── workflow.js   ← Main orchestrator
│   └── notify.js     ← Email / console alerts
└── credentials/
    └── (put your service-account-key.json here)
```

---

## First-Run Setup (do this once)

### 1 · Get your Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API Key

### 2 · Set up Google Sheets access (Service Account)

A service account lets the script write to your spreadsheet without a browser login.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**:
   - In the left menu → **APIs & Services → Library**
   - Search "Google Sheets API" → **Enable**
4. Create a Service Account:
   - **APIs & Services → Credentials → Create Credentials → Service Account**
   - Name it anything (e.g. `hvac-lead-gen`)
   - Click **Create and Continue** → skip optional role → **Done**
5. Download the JSON key:
   - Click the service account you just created
   - **Keys** tab → **Add Key → Create New Key → JSON**
   - Save the downloaded file as `credentials/service-account-key.json` in this folder
6. Share your spreadsheet with the service account:
   - Open the `credentials/service-account-key.json` file
   - Find the `"client_email"` value (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
   - Open your Google Spreadsheet → **Share** → paste that email → role: **Editor** → **Send**

### 3 · Find your Spreadsheet ID

Your spreadsheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
The ID is the long string between `/d/` and `/edit`:
```
1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### 4 · Configure environment variables

```bash
cd hvac-lead-gen
cp .env.example .env
```

Open `.env` and fill in:
```
APOLLO_API_KEY=<your apollo key>
GOOGLE_SPREADSHEET_ID=<your spreadsheet id>
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./credentials/service-account-key.json
ALERT_EMAIL_TO=jgagliardo98@gmail.com
ALERT_EMAIL_FROM=<your gmail>
GMAIL_APP_PASSWORD=<your gmail app password>
```

> **Gmail App Password**: Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create a password for "Mail", and paste it here. Leave blank to disable email alerts (errors will still log to console).

### 5 · Install dependencies

```bash
npm install
```

### 6 · Run the connection test

```bash
node setup.js
```

You should see:
```
✓ Apollo.io connected
✓ Google Sheets connected — Spreadsheet: "Your Sheet Name"
All checks passed! You are ready to go.
```

### 7 · Do a manual test run

```bash
node run-now.js 5    # pull up to 5 leads right now
```

Check your spreadsheet — new rows should appear with today's date.

### 8 · Start the daily scheduler

```bash
node index.js
```

This runs until you stop it (`Ctrl+C`). For always-on operation, use PM2:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```

---

## Customization

### Change cities
Edit `SW_MICHIGAN_LOCATIONS` in `src/apollo.js`:
```js
const SW_MICHIGAN_LOCATIONS = [
  'St. Joseph, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  // add more here
];
```

### Change target job titles
Edit `TARGET_TITLES` in `src/apollo.js`:
```js
const TARGET_TITLES = ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'];
```

### Change spreadsheet columns
Edit the `COLUMNS` array in `src/sheets.js`. The order of the array = the order of columns A→I.

### Change the run schedule
Set `CRON_SCHEDULE` in `.env`. Format: `minute hour * * *`  
Default `0 12 * * *` = noon UTC = 7am ET (EST). Use `0 11 * * *` during EDT (summer).

### Change max leads per run
Set `MAX_LEADS_PER_RUN` in `.env` (default: 25).

---

## How Duplicate Prevention Works

Before appending, the script reads the entire **Business Name** column (B) from your sheet and builds a lookup set. Any business whose name already appears in the sheet is silently skipped. The check is case-insensitive and trims whitespace.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `APOLLO_API_KEY is not set` | Check your `.env` file exists and has the key |
| `Google Service Account key not found` | Verify the path in `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` points to your JSON file |
| `The caller does not have permission` | Share the spreadsheet with the service account `client_email` as Editor |
| `Apollo returned 0 results` | Apollo's DB coverage varies by region — try broadening `organization_locations` or adding `q_organization_keyword_tags` |
| Email alerts not sending | Check `GMAIL_APP_PASSWORD` — must be a 16-char App Password, not your regular password |
| Phone numbers all blank | Your Apollo plan may require credits for phone reveal — check your Apollo subscription |

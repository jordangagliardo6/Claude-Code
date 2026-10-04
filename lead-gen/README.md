# HVAC Lead Gen — SW Michigan

Pulls owner/decision-maker contacts from HVAC companies in Southwest Michigan via the Apollo.io API and appends them to your Google Sheets master lead list. Runs automatically at 7 AM Eastern every morning via `node-cron`. Adds a maximum of 25 new leads per run and skips any business already in the sheet.

---

## Prerequisites

- Node.js 18+ installed
- An Apollo.io account with API access (**Basic plan or higher required** for People Search with phone numbers)
- A Google Cloud project with the Sheets API enabled
- Your master spreadsheet: [HVAC Leads — SW Michigan (Master)](https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8/edit)

---

## Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Create a Google Service Account

This is a one-time setup that lets the script write to your spreadsheet automatically without requiring you to be logged in.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets" → Enable
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
5. Give it any name (e.g. `hvac-lead-gen`) and click Create
6. Skip the optional role/access steps, click Done
7. Click the service account you just created → **Keys** tab → **Add Key → Create new key → JSON**
8. Download the JSON file, rename it `google-service-account.json`, and put it in the `credentials/` folder:
   ```
   lead-gen/credentials/google-service-account.json
   ```
9. Open the JSON file and copy the `client_email` value (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
10. Open your [master spreadsheet](https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8/edit), click **Share**, and share it with that email address with **Editor** access

---

## Step 3 — Get your Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

> **Important about phone numbers:** Apollo only returns phone numbers in search results for accounts on the **Basic plan or higher**. On the free plan, the People Search API is blocked entirely. If you see 0 results or no phone numbers, check your plan at [app.apollo.io/#/settings/plans](https://app.apollo.io/#/settings/plans).

---

## Step 4 — Configure your .env file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8
GOOGLE_SHEET_NAME=Untitled
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/google-service-account.json
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
```

Optional (for email alerts on errors):
```
GMAIL_USER=jgagliardo98@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

To create a Gmail App Password: [myaccount.google.com → Security → 2-Step Verification → App Passwords](https://myaccount.google.com/apppasswords)

---

## Step 5 — Verify both connections

```bash
node setup.js
```

This will:
- Confirm your Apollo API key is valid
- Check whether your plan includes People Search
- Connect to your Google spreadsheet and read the current row count
- Print a clear pass/fail summary

You should see:
```
  ✓  Apollo.io:     Connected
  ✓  Google Sheets: Connected
```

Fix any errors before continuing.

---

## Step 6 — Run your first lead pull

```bash
node src/index.js --once
```

This runs the full workflow immediately (outside the scheduler) and adds up to 25 new leads to your sheet. Open the spreadsheet to confirm rows were added.

---

## Step 7 — Start the daily scheduler

```bash
node src/index.js
```

This starts the process and schedules it to run at **7:00 AM Eastern** every morning. Keep the process running (use PM2, a systemd service, or a hosting platform to keep it alive).

### Keeping it running with PM2 (recommended)

```bash
npm install -g pm2
pm2 start src/index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the command it prints to auto-start on reboot
```

---

## Customizing the search

All search parameters are in `src/config.js`:

| Setting | What it controls |
|---|---|
| `config.apollo.cities` | Which SW Michigan cities to target — add/remove cities here |
| `config.apollo.targetTitles` | Job titles to find (Owner, President, etc.) |
| `config.apollo.industryTags` | HVAC/Plumbing industry keywords |
| `config.apollo.maxLeadsPerRun` | Max leads per run (also via `MAX_LEADS_PER_RUN` in .env) |
| `config.schedule.cron` | Cron expression (also via `CRON_SCHEDULE` in .env) |

### Adding columns

To add a column to the spreadsheet:
1. Add the column header to the spreadsheet manually
2. Update `config.sheets.columns` in `src/config.js` to match
3. Update the row array in `src/sheets.js` → `appendLeads()` to include the new field

---

## Error handling

If Apollo returns 0 results or the spreadsheet write fails:
- The error is always printed to the console
- If `GMAIL_APP_PASSWORD` is set, an email alert is sent to `NOTIFICATION_EMAIL`
- The run exits cleanly without crashing the scheduler — the next scheduled run will try again

---

## File structure

```
lead-gen/
├── src/
│   ├── index.js       — entry point + scheduler
│   ├── apollo.js      — Apollo REST API search logic
│   ├── sheets.js      — Google Sheets read/append logic
│   ├── notify.js      — error email alerts
│   └── config.js      — all configuration in one place
├── credentials/
│   └── google-service-account.json   ← you place this here (not committed to git)
├── setup.js           — first-run connection verification
├── package.json
├── .env               ← you create this from .env.example (not committed to git)
└── .env.example
```

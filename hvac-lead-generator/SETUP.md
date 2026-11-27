# HVAC Lead Generator — Setup Guide

Automated daily pull from Apollo.io → Google Sheets. Runs at 7:00 AM Eastern.

---

## Prerequisites

- Node.js 18+ installed
- An Apollo.io account with API access
- A Google Cloud project (free tier is fine)

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-generator
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Set up Google Sheets API (service account)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable these APIs:
   - **Google Sheets API**
   - **Gmail API** *(only needed if you want email error notifications)*
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it a name (e.g. `hvac-lead-bot`), click Create
6. On the next screen, skip role assignment, click Done
7. Click the service account → **Keys → Add Key → Create new key → JSON**
8. Save the downloaded JSON file somewhere safe (e.g. `~/secrets/hvac-sheets-key.json`)

---

## Step 4 — Share your spreadsheet with the service account

1. Open (or create) the Google Spreadsheet you want leads appended to
2. Click **Share**
3. Add the service account email (looks like `hvac-lead-bot@your-project.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`

---

## Step 5 — Configure your environment

```bash
cp .env.example .env
# Edit .env and fill in:
#   APOLLO_API_KEY
#   GOOGLE_SHEET_ID
#   GOOGLE_APPLICATION_CREDENTIALS (absolute path to your JSON key file)
```

---

## Step 6 — Verify connections before first run

```bash
node setup-check.js
```

You should see:
```
  Apollo.io: Connected (authenticated)
  Google Sheets: Connected (spreadsheet: "Your Sheet Name")

Both connections OK. You are ready to run the scheduler.
```

Fix any errors shown before continuing.

---

## Step 7 — Pull leads right now (optional first test)

```bash
node run-now.js
```

Check your spreadsheet — you should see new rows added.

---

## Step 8 — Start the daily scheduler

```bash
node index.js
```

The process runs continuously and fires at 7:00 AM Eastern every morning.

**To run as a background service** (so it survives terminal close), use `pm2`:
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the instructions it prints to auto-start on reboot
```

---

## Customizing

All tweakable settings are in **`config.js`**:

| Setting | What it controls |
|---|---|
| `apollo.cities` | The city list to target |
| `apollo.targetTitles` | Job titles to search for |
| `apollo.maxLeadsPerRun` | Max leads pulled per run (default: 25) |
| `apollo.employeeRange` | Company size filter (default: `"1,25"`) |
| `sheets.sheetName` | Tab name inside the spreadsheet |
| `cron.schedule` | Cron expression (default: 7am daily) |

---

## Error notifications

Set `NOTIFICATION_EMAIL` in your `.env` to receive an email when Apollo or Sheets fails.

If you'd rather use a simpler email method (SMTP/nodemailer), replace the `sendEmail()` function in `lib/notify.js` with your own implementation — the interface is just `sendEmail(to, subject, text)`.

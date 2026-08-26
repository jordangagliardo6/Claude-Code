# SW Michigan HVAC Lead Gen — First-Time Setup

## Prerequisites

- Node.js 18+ installed
- An Apollo.io account on **Basic plan or higher** ($49/mo)
  - Free plan: People Search API is blocked
  - Get your API key: https://developer.apollo.io → API Keys
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Install Dependencies

```bash
cd apollo-leads-workflow
npm install
```

---

## Step 2 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | https://developer.apollo.io → API Keys |
| `GOOGLE_SHEET_ID` | Already pre-filled: `1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo` |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to the JSON file you'll create in Step 3 |
| `NOTIFICATION_EMAIL` | Your email (for error alert logging) |
| `MAX_LEADS_PER_RUN` | `25` (already set — change if needed) |

---

## Step 3 — Set Up Google Service Account

A service account lets the script write to your sheet without a browser.

1. Go to https://console.cloud.google.com
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name it something like `hvac-leads-bot`
   - Role: **Editor** (or create a custom role with Sheets read/write)
5. Download the JSON key:
   - Click the service account → Keys tab → Add Key → Create new key → JSON
   - Save as `google-credentials.json` inside the `apollo-leads-workflow/` folder
6. Share your spreadsheet with the service account:
   - Open the "SW Michigan HVAC Leads" spreadsheet
   - Click Share
   - Paste the service account email (found in `google-credentials.json` under `"client_email"`)
   - Give it **Editor** access

---

## Step 4 — Verify Both Connections

```bash
node test-connection.js
```

You should see:
```
  Apollo.io:     ✓ READY
  Google Sheets: ✓ READY
```

If Apollo shows "API_INACCESSIBLE", your account is on the free plan. Upgrade at https://www.apollo.io/pricing.

If Sheets shows "Permission denied", make sure you shared the spreadsheet with the service account email (Step 3, item 6).

---

## Step 5 — Run a Manual Test

Pull leads immediately (doesn't wait for 7am):

```bash
node index.js --run-now
```

Check your [SW Michigan HVAC Leads spreadsheet](https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo) — new rows should appear at the bottom.

---

## Step 6 — Start the Scheduler

```bash
node index.js
```

This runs the script 24/7 and fires at **7:00 AM Eastern** every morning. Keep the terminal open, or use PM2 to run it as a background service:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save      # persist across reboots
pm2 startup   # configure auto-start (follow the printed command)
```

View logs anytime:
```bash
pm2 logs hvac-leads
```

---

## Customizing

**Change the cities searched** → edit `SW_MICHIGAN_CITIES` in `src/apollo.js`

**Change target job titles** → edit `TARGET_TITLES` in `src/apollo.js`

**Change max leads per run** → edit `MAX_LEADS_PER_RUN` in `.env`

**Change the schedule time** → edit the `schedule` constant in `index.js`
(uses standard cron syntax: `'0 7 * * *'` = 7am daily)

**Add email alerts** → see the comment block in `index.js` `logError()` function;
install `nodemailer` and add your SMTP credentials

---

## Your Spreadsheet

The target spreadsheet is already set:

**SW Michigan HVAC Leads**
https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo

Columns: Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes

The script fills columns A–G and leaves Called and Notes blank for your manual tracking.

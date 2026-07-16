# First-Time Setup Guide

Step-by-step walkthrough to get the workflow running and confirm both Apollo.io and Google Sheets are connected before the first scheduled run fires.

---

## Prerequisites

- **Node.js 18+** — check with `node -v`
- An **Apollo.io account** (free tier works for testing; Basic plan recommended for daily runs)
- A **Google account** with Google Sheets access
- A **Google Cloud project** (free — just needs to be created)

---

## Step 1 — Clone / enter the project folder

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first tab to exactly **Leads** (the script uses this tab name).
3. Leave row 1 blank — the script will write the header row automatically on first run.
4. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```

---

## Step 3 — Set up a Google Cloud Service Account

A Service Account lets the script read and write your sheet without needing a browser login every time.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Search bar → "Google Sheets API" → Enable
4. Create a Service Account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Name it anything (e.g. `lead-gen-bot`)
   - Skip the role assignment step — click Done
5. Download the JSON key:
   - Click the service account → Keys tab → Add Key → JSON
   - Save the file as `service-account-key.json` inside the `apollo-lead-gen/` folder
6. **Share your Google Sheet with the service account:**
   - Open the JSON key file and copy the `client_email` value
     (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
   - In your Google Sheet, click Share → paste the service account email → set to Editor → Send

---

## Step 4 — Get your Apollo.io API key

1. Log into [app.apollo.io](https://app.apollo.io)
2. Settings → Integrations → API → Create new key
3. Copy the key — you'll paste it in Step 5

> **Plan note:** The free tier allows ~50 contact exports/month. The Basic plan ($49/mo) gives 1,000 exports — enough for 25 leads/day × ~40 days. The workflow caps each run at 25 leads so you stay within limits.

---

## Step 5 — Configure your .env file

Copy the template and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```
APOLLO_API_KEY=<your apollo key>
GOOGLE_SHEET_ID=<your sheet ID>
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json
```

Optionally set `NOTIFICATION_EMAIL`, `SMTP_USER`, and `SMTP_PASS` to receive email alerts when a run fails.

---

## Step 6 — First run (validates both connections)

```bash
npm start
```

The script **always validates before scheduling**. On startup you will see:

```
=== Validating environment ===
  ✓ APOLLO_API_KEY
  ✓ GOOGLE_SHEET_ID
  ✓ Google credentials present

--- Testing Apollo.io API ---
  ✓ Apollo connected — ~142 total contacts available for test query

--- Testing Google Sheets ---
  ✓ Google Sheets connected — spreadsheet accessible

=== All connections OK ===

=== Lead Gen Run — 2025-01-15T12:00:00.000Z ===
✓ Google Sheets connected
✓ Header row created in sheet
✓ 0 existing leads loaded for dedup check
✓ Apollo returned 50 contacts
✓ 25 new unique leads ready
✓ Appended 25 rows to "Leads"

Leads added this run:
   1. Kalamazoo Comfort HVAC          John Smith    | (269) 555-0100 | Kalamazoo
   2. West Michigan Air               ...
   ...

✓ Done — 25 new leads added

Scheduler armed — next run at 7:00am Eastern (0 7 * * * America/New_York)
```

If either connection fails, the script exits with a clear error message pointing at exactly what to fix.

---

## Step 7 — Keep it running

The scheduler only works while the Node process is alive. For a machine you keep on:

**PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

**Manual (testing only):**
```bash
npm start
# Leave the terminal open
```

**Cloud options:** Deploy to Railway, Render, or a $5/mo DigitalOcean droplet — `npm start` is all you need.

---

## Customizing the workflow

All tunables are in the `CONFIG` block at the top of `index.js`:

| Setting | Default | What it controls |
|---|---|---|
| `cities` | 7 SW Michigan cities | Add/remove target cities |
| `jobTitles` | Owner, President, Founder… | Decision-maker title filter |
| `industryKeywords` | HVAC, plumbing… | Industry search terms |
| `employeeRanges` | `['1,25']` | Company size filter |
| `maxLeadsPerRun` | `25` | Leads pulled per day |
| `sheetName` | `'Leads'` | Google Sheet tab name |
| `cronSchedule` | `'0 7 * * *'` | When to run (crontab syntax) |
| `timezone` | `'America/New_York'` | Schedule timezone |

---

## Troubleshooting

**Apollo returns 0 results**
- Your API key may have hit its monthly export limit — check usage in Apollo settings
- Try broadening `cities` to `'Michigan, United States'` temporarily to confirm the API is working

**Google Sheets 403 Forbidden**
- The sheet isn't shared with your service account email — re-do Step 3 sub-step 6

**Google Sheets 404 Not Found**
- Double-check `GOOGLE_SHEET_ID` — it should be the long alphanumeric string from the URL, not the sheet name

**"Unexpected Apollo response" error**
- Apollo's API occasionally returns errors for accounts over quota; check `error.response.data` in the console output for the raw API error message

**Email alerts not sending**
- Make sure you're using a Gmail **App Password** (not your regular password) — create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) with 2FA enabled

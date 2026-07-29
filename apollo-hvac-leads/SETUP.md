# HVAC Lead Generation — Setup Guide

Automated daily pull from Apollo.io → Google Sheets.  
Targets owner-operated HVAC companies in Southwest Michigan.  
Runs every morning at **7:00 AM Eastern**. Pulls up to **25 new leads** per run.

---

## What You Need Before Starting

| Item | Where to get it |
|---|---|
| Apollo.io account + API key | https://developer.apollo.io → API Keys |
| Google account that owns your spreadsheet | Already have one |
| Google Cloud project w/ Sheets API enabled | See Step 2 below |
| Node.js 18+ | https://nodejs.org |

---

## Step 1 — Set Up the Google Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Name the first tab exactly `Leads`.
3. Add these **exact headers** in row 1 (columns A through I):

```
A: Date Added
B: Business Name
C: Owner First Name
D: Owner Last Name
E: Phone Number
F: City
G: Website
H: Called
I: Notes
```

4. Copy the **spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```

---

## Step 2 — Enable the Google Sheets API

1. Go to https://console.cloud.google.com/
2. Create a project or select an existing one.
3. Go to **APIs & Services → Library**, search for `Google Sheets API`, and click **Enable**.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Desktop app**
   - Name: anything (e.g. "HVAC Leads")
5. Click **Download JSON** and save the file as **`credentials.json`** inside the
   `apollo-hvac-leads/` folder.

> The first time you set up OAuth you'll also need to add your Google account as a
> test user: **OAuth consent screen → Test users → Add Users**.

---

## Step 3 — Configure Environment Variables

```bash
cd apollo-hvac-leads
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=paste_your_apollo_key_here
GOOGLE_SPREADSHEET_ID=paste_your_sheet_id_here
NOTIFICATION_EMAIL=your@email.com
SHEET_NAME=Leads
```

---

## Step 4 — Install Dependencies

```bash
cd apollo-hvac-leads
npm install
```

---

## Step 5 — Authorize Google Sheets (one time only)

```bash
npm run authorize
```

This prints a URL. Open it in your browser, sign in with the Google account that
owns the spreadsheet, click Allow, copy the code, and paste it back into the terminal.
A `token.json` file is created and reused automatically on every future run.

---

## Step 6 — Verify the Connection (Test Run)

```bash
npm run run-now
```

Expected output:
```
[2025-01-01T12:00:00.000Z] Run #... — HVAC lead pull starting
────────────────────────────────────────────────────────────
Searching Apollo.io for SW Michigan HVAC leads (max 25)...
Apollo: 38 people returned, 22 have a phone number.
22 leads with phone numbers retrieved from Apollo.
Writing to Google Sheets...
Skipped 0 duplicate(s)
────────────────────────────────────────────────────────────
✓ Run complete: 22 new leads added, 0 duplicates skipped.
  Next run: tomorrow at 7:00 AM Eastern.
```

Open your spreadsheet and confirm new rows appeared.

---

## Step 7 — Start the Daily Scheduler

```bash
npm start
```

Leave this running (or set it up as a system service — see below).
It will fire automatically at **7:00 AM Eastern** every morning.

### Keep It Running with PM2 (Recommended for VPS/Mac)

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup     # follow the printed command to restart on reboot
```

### Or with a Cron Job (Alternative)

Instead of `npm start`, you can use your system's cron to run a one-shot pull:

```bash
# crontab -e
0 7 * * * /usr/bin/node /path/to/apollo-hvac-leads/index.js --run-now >> /var/log/hvac-leads.log 2>&1
```

---

## Customizing the Workflow

### Change Target Cities

Edit `src/apollo.js` → `SW_MICHIGAN_CITIES` array:

```js
const SW_MICHIGAN_CITIES = [
  'St. Joseph, Michigan, United States',
  'Kalamazoo, Michigan, United States',
  // add or remove cities here
];
```

### Change Industry Keywords

Edit `src/apollo.js` → `TARGET_KEYWORDS`:

```js
const TARGET_KEYWORDS = [
  'HVAC',
  'Plumbing',
  'Roofing',   // ← add new niches here
];
```

### Change Max Leads Per Run

Edit `index.js` → `MAX_LEADS_PER_RUN`:

```js
const MAX_LEADS_PER_RUN = 25; // change to 50 for larger batches
```

### Change Run Time

Edit `index.js` → `CRON_SCHEDULE` (standard cron syntax):

```js
const CRON_SCHEDULE = '0 7 * * *';  // "0 7" = 7:00 AM; "0 8" = 8:00 AM
```

---

## Error Handling

When something goes wrong, you'll see a `[ALERT]` block in the logs:

```json
{
  "code": "RUN_FAILED",
  "message": "Apollo API request failed (HTTP 401): ...",
  "action": "Check logs above for details..."
}
```

Common error codes:

| Code | Cause | Fix |
|---|---|---|
| `NO_RESULTS` | Apollo returned 0 matches | Check API key; widen city list or keyword filters |
| `RUN_FAILED` | General failure | Read the `message` field for specifics |

### Add Real Email Alerts

In `index.js`, find the `handleError` and `handleNoResults` functions.
Uncomment/replace the `sendEmail(...)` placeholder with a real call using
[nodemailer](https://nodemailer.com) or [SendGrid](https://sendgrid.com):

```js
// Example with nodemailer (npm install nodemailer):
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({ /* your SMTP config */ });

function sendEmail(to, subject, text) {
  transporter.sendMail({ from: 'alerts@yourdomain.com', to, subject, text });
}
```

---

## File Reference

```
apollo-hvac-leads/
├── index.js          Main entry: cron scheduler + run orchestration
├── authorize.js      One-time Google OAuth setup
├── src/
│   ├── apollo.js     Apollo.io search (edit cities, keywords, titles here)
│   └── sheets.js     Google Sheets read/write + dedup logic
├── package.json
├── .env.example      Copy to .env and fill in your keys
├── .gitignore        Keeps credentials.json, token.json, and .env out of git
└── SETUP.md          This file
```

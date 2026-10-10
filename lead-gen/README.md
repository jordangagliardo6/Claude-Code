# HVAC Lead Generation — Apollo.io → Google Sheets

Searches Apollo.io every morning at 7 AM Eastern for owner-operated HVAC companies in Southwest Michigan and appends up to 25 new leads to a Google Sheet. Skips duplicates automatically.

---

## What It Does

- Queries Apollo.io for HVAC / Plumbing / Mechanical Contracting companies (1–25 employees) across 7 Southwest Michigan cities
- Targets: Owner → President → Founder → Co-Founder → General Manager (in that priority order)
- Only pulls contacts that have a phone number
- Checks your existing Google Sheet and skips any business already there
- Appends new leads with today's date; leaves Called and Notes columns blank for your use
- Runs automatically at 7 AM Eastern via node-cron
- Emails you (optional) if Apollo returns no results or the Sheet write fails

---

## Quick Start

### 1. Copy the environment file

```bash
cd lead-gen
cp .env.example .env
```

Open `.env` and fill in your values (see sections below for how to get each one).

---

### 2. Get your Apollo.io API Key

1. Log into [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Paste it as `APOLLO_API_KEY` in `.env`

> **Free tier limits:** 50 people exports/month. Basic plan ($49/mo) gives 1,000/month — enough for ~40 daily runs of 25 leads.

---

### 3. Set up Google Sheets API access

Apollo returns the leads; Google Sheets is where they live. You need a **service account** — a bot Google identity that can write to your sheet without asking for OAuth every time.

#### a. Create a Google Cloud project (skip if you have one)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown → **New Project** → name it (e.g., "HVAC Lead Gen") → **Create**

#### b. Enable the Google Sheets API

1. In the Cloud Console, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → **Enable**

#### c. Create a service account

1. Go to **IAM & Admin → Service Accounts** → **Create Service Account**
2. Name it something like `hvac-lead-gen`
3. Click **Done** (no special roles needed at the project level)
4. Click the service account you just created → **Keys** tab → **Add Key → Create new key → JSON**
5. Download the JSON file and save it as `lead-gen/credentials.json`
6. Note the `client_email` value from that file — you'll need it in the next step

#### d. Share your Google Sheet with the service account

1. Open your Google Sheet in the browser
2. Click **Share** (top right)
3. Paste in the `client_email` from your credentials.json (looks like `name@project.iam.gserviceaccount.com`)
4. Set role to **Editor** → **Send**

#### e. Get your Spreadsheet ID

Copy the long ID from your sheet's URL:
```
https://docs.google.com/spreadsheets/d/  THIS_IS_THE_ID  /edit
```

Paste it as `GOOGLE_SPREADSHEET_ID` in `.env`.

---

### 4. Create the header row in your sheet

In row 1 of your sheet, add these exact column headers (A through I):

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

The script matches columns by position, so spelling and order matter.

---

### 5. Install dependencies

```bash
cd lead-gen
npm install
```

---

### 6. Verify everything connects

```bash
node setup-check.js
```

This checks your API key, credentials file, and sheet access before you commit to a scheduled run. Fix any failures it reports, then run it again until all checks pass.

---

### 7. Run it once manually

```bash
node index.js
```

Watch the console output. When it prints `✓ Appended N new leads`, open your Google Sheet — the leads should be there.

---

### 8. Start the daily scheduler

```bash
TZ=America/New_York node scheduler.js
```

The `TZ` variable ensures the 7 AM trigger fires in Eastern time regardless of your server's timezone. Keep this process alive with **PM2**, **systemd**, or **Docker** so it survives reboots:

```bash
# PM2 (recommended for VPS)
npm install -g pm2
TZ=America/New_York pm2 start scheduler.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing

### Change cities

Edit the `cities` array in `index.js`:

```js
const CONFIG = {
  cities: [
    'St. Joseph, Michigan',
    'Kalamazoo, Michigan',
    // add / remove cities here
  ],
  ...
};
```

### Change industries

Edit `industryKeywords` in the same `CONFIG` block:

```js
industryKeywords: [
  'HVAC',
  'Plumbing',
  'Electrical',  // add more here
],
```

### Change max leads per run

Set `maxLeadsPerRun` in `CONFIG` (default: 25).

### Change the schedule

Edit `CRON_SCHEDULE` in `scheduler.js`. node-cron format:
```
'minute hour day-of-month month day-of-week'
'0 7 * * *'   → 7:00 AM every day
'0 8 * * 1'   → 8:00 AM every Monday only
```

### Rearrange columns

Change the index values in `COLUMNS` at the top of `index.js` to match your sheet layout.

---

## Error Handling

| Scenario | What happens |
|---|---|
| Apollo returns 0 results | Logs the issue + sends email if GMAIL_* vars are set |
| Apollo API key invalid | Logs HTTP 401 error + sends email |
| credentials.json missing | Logs clear error before touching the sheet |
| Sheet write fails | Logs error + sends email; sheet is not partially written |
| All errors | Always visible in console regardless of email config |

To enable email alerts, add these to `.env`:

```
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   # App Password (not your login password)
NOTIFICATION_EMAIL=you@gmail.com
```

Get an App Password at: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (requires 2FA to be on).

---

## File Overview

```
lead-gen/
├── index.js          ← Main logic: Apollo search + Sheet write
├── scheduler.js      ← Cron job wrapper (7 AM Eastern)
├── setup-check.js    ← Pre-flight connection checks
├── package.json      ← Dependencies
├── .env.example      ← Environment variable template
└── credentials.json  ← Google service account key (YOU create this — do not commit)
```

**Never commit `credentials.json` or `.env` to version control.** Both are already in `.gitignore`.

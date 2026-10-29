# HVAC Lead Gen — Setup Guide

Automated daily lead pull from Apollo.io → Google Sheets for Southwest Michigan HVAC companies.

---

## What You Need

| Requirement | Where to get it |
|---|---|
| **Apollo.io API key** | [developer.apollo.io](https://developer.apollo.io) → API Keys |
| **Google Cloud project** | [console.cloud.google.com](https://console.cloud.google.com) |
| **Node.js 18+** | [nodejs.org](https://nodejs.org) |

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_key_here
GOOGLE_SHEET_ID=your_sheet_id_here
```

The **Sheet ID** is in the URL of your Google Sheet:
`https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`

---

## Step 3 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name the first tab **Leads** (or set `GOOGLE_SHEET_TAB` in `.env` to any name)
3. The workflow will auto-create the header row on first run

Expected columns (auto-created):

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

---

## Step 4 — Set Up Google OAuth2

### 4a. Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"

### 4b. Create OAuth2 Credentials

1. APIs & Services → **Credentials** → Create Credentials → **OAuth client ID**
2. Application type: **Desktop app**
3. Download the JSON — save it as `credentials/google-credentials.json`

### 4c. Configure OAuth consent screen (if prompted)

1. User type: **External** (or Internal if you have Workspace)
2. Add your email as a test user
3. Scopes: add `https://www.googleapis.com/auth/spreadsheets`

---

## Step 5 — Verify Both Connections

```bash
node setup.js
```

- **First run:** It will print an OAuth URL. Open it in your browser, authorize, paste the code back. The token is cached in `credentials/token.json` — you won't need to do this again.
- **Subsequent runs:** It silently reuses the cached token (auto-refreshes when expired).

Expected output when everything is connected:

```
  Apollo.io    : ✓ Connected
  Google Sheets: ✓ Connected

  All systems go!
```

---

## Step 6 — Test Run (Before Activating the Schedule)

```bash
node index.js --run-now
```

This runs the workflow once immediately. Check your Google Sheet — up to 25 new HVAC leads should appear.

---

## Step 7 — Start the Scheduler

```bash
node index.js
```

The scheduler runs silently and triggers the workflow every day at **7:00 AM Eastern Time**. Keep the process running (e.g. via `pm2`, `screen`, or a system service).

### Running with pm2 (recommended for always-on)

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save          # persist across reboots
pm2 startup       # auto-start on server reboot
```

### Checking logs

```bash
pm2 logs hvac-lead-gen
# or check daily log files:
ls logs/
cat logs/run-YYYY-MM-DD.log
```

---

## Customizing

### Change target cities

Edit the `SW_MICHIGAN_CITIES` array in `src/apollo.js`.

### Change max leads per run

Set `MAX_LEADS_PER_RUN` in `.env` (default: 25).

### Change the schedule

Edit `JOB_SCHEDULE` in `index.js`. Uses standard cron syntax. Current value `'0 7 * * *'` = 7 AM daily.

### Add more industries

Edit `INDUSTRY_KEYWORDS` in `src/apollo.js`.

---

## Error Handling

- All errors are logged to `logs/run-YYYY-MM-DD.log`
- Console output is visible via `pm2 logs`
- If Apollo returns 0 results or the Sheet write fails, an error message is printed prominently
- To add email alerts on failure, install `nodemailer` and uncomment the `sendEmailAlert` call in `index.js`

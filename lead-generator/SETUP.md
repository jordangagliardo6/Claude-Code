# Apollo HVAC Lead Generator — Setup Guide

Pulls HVAC / Plumbing decision-maker leads from Apollo.io and appends them to a
Google Sheet every morning at 7 AM Eastern Time.

---

## What Gets Added to the Sheet

| Column | Content |
|--------|---------|
| Date Added | Today's date (MM/DD/YYYY, Eastern) |
| Business Name | Company name from Apollo |
| Owner First Name | Contact's first name |
| Owner Last Name | Contact's last name |
| Phone Number | Best available number (mobile → direct → primary) |
| City | City where the company is located |
| Website | Company website or domain |
| Called | **Left blank — you fill this in** |
| Notes | **Left blank — you fill this in** |

Duplicate detection runs on the **Business Name** column — any company already
in the sheet is automatically skipped.

---

## Prerequisites

- Node.js 18 or later — [nodejs.org](https://nodejs.org)
- An Apollo.io account with API access — [apollo.io](https://app.apollo.io)
- A Google account with a Google Sheet ready to receive leads
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Get your Apollo API Key

1. Log in at [app.apollo.io](https://app.apollo.io).
2. Click your avatar (top-right) → **Settings** → **Integrations** → **API**.
3. Create or copy your API key.

**Apollo plan notes**

| Plan | Monthly people-search credits | Cost |
|------|-------------------------------|------|
| Free | 50 | $0 |
| Basic | 200 | $49/mo |
| Professional | 1,000 | $99/mo |

25 leads/day = ~750/month — the **Basic** plan is the minimum recommended.

---

## Step 2 — Set Up Google Cloud & Download Credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project (or use an existing one).
2. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable.
3. Create OAuth 2.0 credentials:
   - Go to **APIs & Services** → **Credentials** → **+ Create Credentials** → **OAuth client ID**.
   - Application type: **Desktop app**.
   - Name it anything (e.g., "Lead Generator").
   - Click **Create**, then **Download JSON**.
4. Rename the downloaded file to `credentials.json` and place it in the `credentials/` folder inside this project.

> The `credentials/` folder is gitignored — these files stay on your machine only.

---

## Step 3 — Create Your Google Sheet

1. Create a new Google Sheet at [sheets.google.com](https://sheets.google.com).
2. Name the first tab **Leads** (or whatever you set `GOOGLE_SHEET_TAB` to in `.env`).
3. Leave row 1 blank — the script will create the header row automatically on first run.
4. Copy your Sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/  YOUR_SHEET_ID_IS_HERE  /edit
```

---

## Step 4 — Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Then edit `.env`:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=your_google_sheet_id_here
GOOGLE_SHEET_TAB=Leads

GOOGLE_CREDENTIALS_PATH=./credentials/credentials.json
GOOGLE_TOKEN_PATH=./credentials/token.json

NOTIFY_EMAIL_TO=jgagliardo98@gmail.com
NOTIFY_EMAIL_FROM=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=jgagliardo98@gmail.com
SMTP_PASS=your_gmail_app_password_here

MAX_LEADS_PER_RUN=25
```

**Gmail App Password** (for email alerts):

1. Make sure 2-Step Verification is on: [myaccount.google.com/security](https://myaccount.google.com/security)
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
3. Create an app password for "Mail" → "Windows Computer" (any label works).
4. Paste the 16-character code as `SMTP_PASS`.

---

## Step 5 — Install Dependencies

```bash
cd lead-generator
npm install
```

---

## Step 6 — First Run: Authorize Google Sheets

Run the connection test. Because this is your first run, Google will walk you
through a one-time authorization:

```bash
node index.js --test
```

You will see:

```
GOOGLE AUTHORIZATION REQUIRED (first run only)
1. Open this URL in your browser:

   https://accounts.google.com/o/oauth2/auth?...

2. Sign in and click Allow.
3. Copy the authorization code shown and paste it here.

Enter the authorization code: _
```

Paste the code → press Enter. A `token.json` file is saved to `credentials/` and
you will not be prompted again.

After authorization the test completes:

```
Apollo.io       ✓  Apollo connected — 347 total matches found.
Google Sheets   ✓  Google Sheets connected — found 0 column(s) in header row.

Both connections verified. You are ready to run.
```

If Apollo shows 0 matches, your API key may be invalid or the search filters
return no results for the configured cities.

---

## Step 7 — Start the Scheduler

```bash
node index.js
```

Output:

```
Apollo HVAC Lead Generator — Scheduler Starting
Schedule : 0 7 * * *  (7:00 AM Eastern Time, daily)
Max leads: 25 per run
Started  : 9/9/2026, 7:03:14 AM

Waiting for next scheduled run… (Ctrl+C to stop)
```

The process must stay running for the schedule to fire. To keep it alive:

**Option A — `pm2` (recommended, keeps running after logout)**

```bash
npm install -g pm2
pm2 start index.js --name "lead-generator"
pm2 save          # auto-restart on reboot
pm2 logs lead-generator   # watch logs
```

**Option B — `nohup` (simple background process)**

```bash
nohup node index.js >> leads.log 2>&1 &
```

**Option C — System cron** (runs the script, not the scheduler)

Add to `crontab -e`:

```
0 7 * * * cd /path/to/lead-generator && /usr/bin/node index.js --now >> /var/log/leads.log 2>&1
```

---

## Run One Batch Right Now

```bash
node index.js --now
```

Good for testing or pulling a batch on demand without waiting for 7 AM.

---

## Customizing the Search

Open `src/apollo.js` — the top section has three easy-to-edit arrays:

```js
// Add or remove cities here
const CITIES = [
  'St. Joseph, Michigan, United States',
  'Benton Harbor, Michigan, United States',
  // ... add more cities
];

// Add or remove industry keywords here
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  // ...
];

// Add or remove target job titles here
const TARGET_TITLES = [
  'Owner',
  'President',
  // ...
];
```

---

## Error Handling

If Apollo returns no results **or** the Google Sheet write fails:

1. The error is logged to the console with a full stack trace.
2. An email alert is sent to `NOTIFY_EMAIL_TO` with the error details.
3. No partial writes happen — the run aborts cleanly.

If email alerts aren't sending, verify `SMTP_*` values in `.env` and ensure
your Gmail App Password is correct.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `APOLLO_API_KEY is not set` | Check your `.env` file exists and is in the `lead-generator/` folder |
| `Google credentials not found` | Ensure `credentials/credentials.json` was downloaded and placed correctly |
| `Apollo API error: 401` | Invalid or expired Apollo API key — regenerate at apollo.io |
| `Apollo API error: 422` | Search filters returned nothing — try broadening cities or keywords |
| `Google Sheets: 403` | OAuth token expired — delete `credentials/token.json` and re-run `--test` |
| `Google Sheets: Sheet not found` | Check `GOOGLE_SHEET_ID` and `GOOGLE_SHEET_TAB` in `.env` |
| No email alerts | Check `SMTP_PASS` — must be an App Password, not your regular Gmail password |

# HVAC Lead Generator

Automated lead generation for HVAC owner-operators in Southwest Michigan.

Every morning at **7:00 AM Eastern**, the script:
1. Searches Apollo.io for HVAC company owners/presidents in SW Michigan cities
2. Filters to companies with 1–25 employees that have a phone number
3. Deduplicates against your existing Google Sheet
4. Appends up to 25 new leads with: Date Added, Business Name, First Name, Last Name, Phone, City, Website

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Apollo.io account | Any paid plan (free plans have API limits) |
| Google Cloud project | Free tier is fine |

---

## Step-by-Step Setup

### 1. Install dependencies

```bash
cd hvac-leads
npm install
```

### 2. Get your Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

### 3. Set up Google Sheets access

You need a **service account** — this lets the script write to your sheet without a browser login.

**a. Create a Google Cloud project** (skip if you already have one):
- Go to [console.cloud.google.com](https://console.cloud.google.com)
- Click the project selector → **New Project** → name it anything → **Create**

**b. Enable the Sheets API:**
- In your project, go to **APIs & Services → Library**
- Search "Google Sheets API" → Enable it

**c. Create a service account:**
- Go to **APIs & Services → Credentials**
- Click **+ Create Credentials → Service Account**
- Name it (e.g., `hvac-leads-bot`) → **Done**

**d. Download a JSON key:**
- Click your new service account → **Keys** tab → **Add Key → Create new key → JSON**
- A `.json` file downloads — keep it safe, it's your credential

**e. Place the key file in this project:**
```bash
mkdir -p hvac-leads/credentials
mv ~/Downloads/your-key-file.json hvac-leads/credentials/service-account-key.json
```

**f. Share your Google Sheet with the service account:**
- Open the `.json` key file and find the `"client_email"` field — it looks like:
  `hvac-leads-bot@your-project.iam.gserviceaccount.com`
- Open your Google Sheet → **Share** → paste that email → give **Editor** access → **Share**

**g. Get your Spreadsheet ID:**
- Your sheet URL looks like:
  `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
- The bold part is your Spreadsheet ID

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_api_key
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account-key.json
SPREADSHEET_ID=your_spreadsheet_id
SHEET_NAME=Sheet1
```

**Optional — email alerts** (if left blank, errors only log to the console):
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_gmail_app_password   # App Password, NOT your regular password
ALERT_EMAIL=jgagliardo98@gmail.com
```

> **Gmail App Password:** Go to your Google Account → Security → 2-Step Verification → App passwords. Generate one for "Mail / Other (Custom name)".

### 5. Test both connections

Run this before anything else to confirm both APIs are working:

```bash
node src/index.js --test
```

Expected output:
```
=== HVAC Lead Generator — Connection Test ===

Testing Apollo.io connection...     ✓  Connected (account: Your Name)
Testing Google Sheets connection... ✓  Connected (spreadsheet: "My HVAC Leads")

✅  Both connections are working! ...
```

If either check fails, re-read the error message and compare it to the setup steps above.

### 6. Run one cycle manually

To pull leads immediately (without waiting for 7 AM):

```bash
node src/index.js --run
```

This runs one full fetch → dedup → append cycle and exits. Good for testing end-to-end.

### 7. Start the scheduler

```bash
node src/index.js
```

The process must stay running. On a server, use a process manager:

```bash
# With PM2 (recommended)
npm install -g pm2
pm2 start src/index.js --name hvac-leads --env TZ=America/New_York
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

Or with a system cron instead of node-cron (alternative):
```bash
# Edit crontab:  crontab -e
0 7 * * * TZ=America/New_York /usr/bin/node /path/to/hvac-leads/src/index.js --run >> /var/log/hvac-leads.log 2>&1
```

---

## Spreadsheet Column Layout

| Column | Header | Notes |
|--------|--------|-------|
| A | Date Added | MM/DD/YYYY |
| B | Business Name | Used for deduplication |
| C | Owner First Name | |
| D | Owner Last Name | |
| E | Phone Number | Mobile preferred, then direct |
| F | City | From Apollo company record |
| G | Website | Company website URL |
| H | Called | **You fill this in** |
| I | Notes | **You fill this in** |

---

## Customization

### Change the target cities
Edit `src/apollo.js` → `SW_MICHIGAN_CITIES` array (at the top of the file):
```js
const SW_MICHIGAN_CITIES = [
  'St. Joseph', 'Benton Harbor', 'Kalamazoo', ...
];
```

### Change the max leads per run
Set `MAX_LEADS_PER_RUN=25` in `.env` (or any number you prefer).

### Change the schedule
Set `CRON_SCHEDULE` in `.env` using standard cron syntax:
```
0 7 * * *   = 7:00 AM every day
0 8 * * 1   = 8:00 AM every Monday only
0 7 * * 1-5 = 7:00 AM weekdays only
```

### Change the column layout
Edit `src/sheets.js` → `COLUMN_HEADERS` array and the `rowFromLead()` function directly below it.

---

## File Structure

```
hvac-leads/
├── package.json
├── .env.example           ← Copy to .env and fill in
├── README.md
├── credentials/           ← Create this; put your service account key here
│   └── service-account-key.json
└── src/
    ├── index.js           ← Main entry point & scheduler
    ├── apollo.js          ← Apollo.io API client & search logic
    ├── sheets.js          ← Google Sheets read/write
    ├── leads.js           ← Deduplication & formatting
    └── notify.js          ← Console + email error alerts
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `APOLLO_API_KEY environment variable is not set` | Add it to `.env` |
| `Service account key file not found` | Check `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` path |
| `The caller does not have permission` | Share the Google Sheet with the service account email |
| `Apollo returned 0 contacts` | Your Apollo plan may not include people search; check API limits |
| Schedule not firing | Make sure `TZ=America/New_York` is set in `.env` or system env |

# HVAC Lead Generator — First-Run Setup Guide

Searches Apollo.io for HVAC owners in Southwest Michigan and appends new leads
to your Google Sheet every morning at 7 AM Eastern. Max 25 leads per run.

---

## What You Need Before Starting

| Requirement | Details |
|---|---|
| **Apollo API key** | Requires a **paid plan** — Basic ($49/mo) or higher |
| **Google credentials** | Service Account key OR OAuth2 credentials from Google Cloud Console |
| **Node.js** | Version 18+ (`node --version` to check) |

---

## Step 1 — Clone and Install

```bash
cd apollo-lead-generator
npm install
```

---

## Step 2 — Set Up Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SHEET_ID=1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json
```

**Where to get your Apollo API key:**
1. Log in to Apollo.io → Settings → Integrations → API
2. Copy your API key
3. Upgrade to Basic ($49/mo) if you haven't — the free plan blocks the search API

---

## Step 3 — Set Up Google Sheets Access

**Option A: Service Account (recommended — works unattended)**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"
4. Create a Service Account: IAM & Admin → Service Accounts → Create Service Account
5. Download the JSON key: click the service account → Keys → Add Key → JSON
6. Save the file as `service-account-key.json` in this folder
7. **Share your spreadsheet** with the service account email (looks like `name@project.iam.gserviceaccount.com`)
   - Open the sheet → Share → paste the email → Editor access

**Option B: OAuth2 (if you prefer your personal Google account)**

1. Go to Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (type: Desktop App)
3. Download `credentials.json` and place it in this folder
4. Run the one-time authorization flow:
   ```bash
   node auth.js
   ```
5. Open the URL it prints, authorize your Google account, paste the code back

---

## Step 4 — Verify Both Connections

Before starting the scheduler, confirm everything works:

```bash
npm run test-connection
```

You should see:

```
─── CONNECTION TEST ───────────────────────────────────────
Checking Apollo.io...
  Apollo: ✅ API key valid — 47,382 matching records in database.

Checking Google Sheets...
  Google Sheets: ✅ Connected to "HVAC SW Michigan Leads"
  Spreadsheet ID: 1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk
  Existing leads in sheet: 0

─── RESULT ──────────────────────────────────────────────────
  Apollo.io:     ✅ Connected
  Google Sheets: ✅ Connected

🟢 Both connections OK. Run "npm start" to start the scheduler.
```

If Apollo fails with "API_INACCESSIBLE" → you need a paid Apollo plan.
If Google fails → check that the spreadsheet was shared with your service account email.

---

## Step 5 — Start the Scheduler

```bash
npm start
```

This will:
1. Run an immediate lead pull right now
2. Then schedule future runs every morning at 7:00 AM Eastern

**To keep it running in the background** (on a server or your Mac):

```bash
# Install pm2 (process manager)
npm install -g pm2

# Start with pm2
pm2 start index.js --name hvac-leads

# Auto-restart on reboot
pm2 startup
pm2 save

# View live logs
pm2 logs hvac-leads
```

---

## Your Google Sheet

The target spreadsheet is:  
**HVAC SW Michigan Leads** — [Open in Drive](https://docs.google.com/spreadsheets/d/1dwSkfx0AifqG4PYfiJlu36HO9-9r-30S7-IkvMKP8zk/edit)

Columns (pre-configured, do not reorder):

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

---

## Customizing the Search

**Change target cities** — edit `CITIES` in `index.js`:

```javascript
const CITIES = [
  'St. Joseph, Michigan',
  'Benton Harbor, Michigan',
  // add or remove cities here
  'Battle Creek, Michigan',
];
```

**Change max leads per run** — edit `MAX_LEADS_PER_RUN` in `index.js`:

```javascript
const MAX_LEADS_PER_RUN = 10;  // dial this down if the list grows too fast
```

**Change the schedule** — edit `CRON_SCHEDULE` in `index.js`:

```javascript
const CRON_SCHEDULE = '0 8 * * 1-5';  // 8 AM weekdays only
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to Apollo Basic plan ($49/mo) |
| `APOLLO_API_KEY not set` | Add the key to your `.env` file |
| `No Google credentials found` | Set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` or run `node auth.js` |
| `Permission denied` on sheet | Share the sheet with your service account email address |
| `0 leads returned` | Apollo has no indexed contacts in those cities — try expanding CITIES |
| Duplicates appearing | Check the Business Name column (B) — comparison is case-insensitive |

---

## Apollo Plan Note

The people search API that powers this workflow requires **Apollo Basic ($49/mo)** or higher.  
The free plan only allows 50 email exports/month and blocks API search access.

Apollo credits used per run:
- **1 lead credit** per person found in search
- **1 direct dial credit** per phone number revealed  
- With 25 leads/run × ~22 workdays = ~550 credits/month  
- Apollo Basic includes 1,000 credits/month — sufficient for this workflow.

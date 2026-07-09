# HVAC Lead Gen — Setup Guide

Runs every morning at 7 AM ET. Pulls up to 25 HVAC owner/decision-maker leads from Apollo.io
for Southwest Michigan and appends them to your Google Sheet (no duplicates).

---

## What You Need

| Requirement | Notes |
|---|---|
| Node.js v18+ | `node --version` to check |
| Apollo.io account | Basic plan ($49/mo) or higher — free tier doesn't include phone reveals |
| Google Cloud project | Free — you just need to enable the Sheets API |

---

## Step 1 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Google Sheets: Create a Service Account

A service account lets the script write to your sheet automatically without a browser popup.

### 2a. Enable the Google Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. In the left menu: **APIs & Services → Library**
4. Search for **Google Sheets API** → click it → click **Enable**

### 2b. Create the Service Account

1. In the left menu: **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service account**
3. Name it anything (e.g. `hvac-lead-gen`) → click **Create and Continue**
4. Role: **Basic → Editor** → click **Continue → Done**

### 2c. Download the JSON Key

1. Click the service account you just created
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**
3. A `.json` file downloads — rename it `service-account.json`
4. Move it into the `credentials/` folder of this project:
   ```
   hvac-lead-gen/
   └── credentials/
       └── service-account.json   ← place it here
   ```

The file is git-ignored and will not be committed.

### 2d. Share Your Spreadsheet With the Service Account

1. Open the downloaded JSON file and copy the `client_email` value
   (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open your Google Spreadsheet
3. Click **Share** (top right)
4. Paste the service account email → set role to **Editor** → click **Send**

> **Your spreadsheet can have any name.** The script writes to a tab called `Leads`
> and creates it automatically if it doesn't exist. Headers are also created on first run.

---

## Step 3 — Get Your Sheet ID

From your spreadsheet URL:
```
https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
```

Copy the part between `/d/` and `/edit`.

---

## Step 4 — Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:
```
APOLLO_API_KEY=your_key_from_apollo
GOOGLE_SHEET_ID=your_sheet_id_from_step_3

# Optional — enable email alerts on failure
NOTIFY_EMAIL=jgagliardo98@gmail.com
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
```

**Gmail App Password** (for error alerts):
1. Enable 2FA on your Google account if not already on
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create a new app password → copy the 16-character code → paste as `SMTP_PASS`

---

## Step 5 — Verify Connections

Run this before your first scheduled run to confirm both APIs are reachable:

```bash
npm run verify
```

Expected output:
```
  Apollo.io        ✓  (auth OK — 1842 total prospects available for test query)
  Google Sheets    ✓  (connected — sheet ID: 1BxiMVs0...)

Verification passed. Exiting (--verify-only mode).
```

Fix any errors shown before proceeding.

---

## Step 6 — First Run

Trigger an immediate run (in addition to starting the scheduler):

```bash
npm run run-now
```

The console will show:
1. Connection check results
2. How many Apollo candidates were found per city
3. How many were enriched and had phones
4. How many are new (not already in your sheet)
5. A summary list of every lead added

Check your Google Sheet — the `Leads` tab should have new rows.

---

## Step 7 — Keep It Running

The process needs to stay alive for the 7 AM cron to fire. Options:

### Option A — PM2 (recommended for always-on)

```bash
npm install -g pm2
pm2 start src/index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to survive reboots
```

### Option B — Screen / tmux (simple)

```bash
screen -S hvac-leads
npm start
# Press Ctrl+A then D to detach
# screen -r hvac-leads to reattach
```

### Option C — System cron (skip the built-in scheduler)

If you prefer to use your OS cron instead of node-cron:

```bash
crontab -e
```

Add this line (adjust path as needed):
```
0 7 * * * cd /path/to/hvac-lead-gen && /usr/local/bin/node src/index.js --run-now >> logs/cron.log 2>&1
```

Then remove the `cron.schedule()` call in `src/index.js` if you go this route.

---

## Customization

All search parameters are in `src/config.js`. Common changes:

| What | Where | How |
|---|---|---|
| Add/remove cities | `TARGET_CITIES` array | Add `'City, Michigan, United States'` |
| Change industries | `INDUSTRY_KEYWORDS` array | Add/remove keyword strings |
| Change target titles | `TARGET_TITLES` array | Apollo uses semantic matching |
| Change company size | `EMPLOYEE_RANGES` | e.g. `['1,10', '11,50']` for up to 50 |
| Increase leads/day | `MAX_LEADS_PER_RUN` | Each lead costs 1 Apollo export credit |
| Change run time | `CRON_SCHEDULE` | Standard cron syntax — `'0 7 * * *'` = 7 AM daily |
| Change timezone | `CRON_TIMEZONE` | IANA timezone string |

---

## Apollo Plan & Credit Notes

| Action | Credits Used |
|---|---|
| People search (finding candidates) | 0 |
| Phone reveal via bulk_match | 1 per person |
| 25 leads/day × 30 days | ~750 credits/month |

Apollo Basic plan ($49/mo) includes 1,000 export credits. That covers 25 leads/day with ~250 to spare.

If you want more leads per day, upgrade to Professional or increase `MAX_LEADS_PER_RUN` — but make sure
your credit allocation can support it.

---

## Troubleshooting

**`Apollo.io ✗ Unauthorized`**
— Check `APOLLO_API_KEY` in `.env`. Get a key from [developer.apollo.io](https://developer.apollo.io).

**`Service account file not found`**
— Make sure `credentials/service-account.json` exists. See Step 2c.

**`The caller does not have permission`** (Google error)
— The service account wasn't granted Editor access to the sheet. See Step 2d.

**`0 contacts with phone numbers` after enrichment**
— Your Apollo plan may not include phone reveals. Upgrade to Basic or check your plan limits.

**All results are duplicates**
— The script already added those companies in a previous run. It will find new ones
  as you expand the city list or more contacts appear in Apollo's database.

**Email alerts not sending**
— Make sure all three of `NOTIFY_EMAIL`, `SMTP_USER`, and `SMTP_PASS` are set,
  and that `SMTP_PASS` is a Gmail App Password (not your login password).

# HVAC Lead Generator — Setup Guide

Pulls up to 25 HVAC business owner contacts per day from Apollo.io and appends them to your Google Sheet. Runs automatically at 7:00 AM Eastern every morning.

---

## What You Need Before Starting

- Node.js 18 or newer — [nodejs.org](https://nodejs.org)
- An Apollo.io account with API access
- A Google account (already done — the spreadsheet exists in your Drive)
- ~10 minutes for first-time setup

---

## Step 1 — Get Your Apollo API Key

1. Log in to Apollo.io
2. Go to **Settings → Integrations → API**
3. Copy your **API Key**

---

## Step 2 — Set Up Google Sheets API (Service Account)

You need a Google service account so the script can write to your spreadsheet without a browser.

### 2a — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it anything (e.g. "HVAC Lead Generator") → **Create**

### 2b — Enable the Sheets API

1. With your project selected, go to **APIs & Services → Library**
2. Search for **"Google Sheets API"** → click it → **Enable**

### 2c — Create a Service Account

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → Service Account**
3. Name it (e.g. "hvac-lead-gen") → click through the optional steps → **Done**
4. Back on the Credentials page, click the service account you just created
5. Go to the **Keys** tab → **Add Key → Create new key → JSON**
6. A `.json` file downloads — keep it safe, you need it next

### 2d — Share the Spreadsheet with the Service Account

1. Open the downloaded `.json` file — find the `"client_email"` field (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open your spreadsheet: https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit
3. Click **Share** → paste the service account email → set to **Editor** → **Send**

---

## Step 3 — Install and Configure

```bash
# In the hvac-lead-generator folder:
npm install
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_key_here

# Paste the entire contents of your downloaded JSON on ONE line:
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com",...}

TZ=America/New_York
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
```

> **Tip:** To paste the JSON as one line, open the file in a text editor and remove all line breaks, or use:
> ```bash
> cat your-credentials.json | tr -d '\n'
> ```

### Optional — Email Alerts (Gmail)

To receive email when a run fails:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password   # Get at: myaccount.google.com/apppasswords
```

---

## Step 4 — Test Your Connections

```bash
npm run setup
```

Expected output:
```
1. Apollo.io  ... ✅  Connected — 2,847 matching contacts found in Apollo database
2. Google Sheets ... ✅  Connected — "SW Michigan HVAC Leads" (0 existing entries)

✅  All connections verified. You are ready to go!
```

If Google Sheets shows a permissions error, re-check Step 2d (the spreadsheet must be shared with the service account email).

---

## Step 5 — Run Your First Pull (Optional)

Pull leads immediately without waiting for 7 AM:

```bash
npm run run-now
```

This runs the same logic as the scheduled job and appends up to 25 leads to your spreadsheet right away.

---

## Step 6 — Start the Daily Scheduler

```bash
npm start
```

The process must stay running for the cron job to fire. To keep it alive on a server:

```bash
# Install pm2 (process manager)
npm install -g pm2

# Start and auto-restart on reboot
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to register it with your OS
```

---

## Customising the Workflow

All settings live in `src/config.js`. No other file needs to change for common adjustments.

| What to change | Where |
|---|---|
| Add/remove cities | `targetCities` array |
| Change max leads per run | `apollo.maxLeadsPerRun` |
| Change job titles to target | `apollo.personTitles` |
| Change company size range | `apollo.employeeRanges` (format: `'min,max'`) |
| Change schedule time | `cronSchedule` (standard cron syntax) |
| Add more industry codes | `apollo.naicsCodes` (see NAICS lookup below) |

### Useful NAICS Codes

| Code | Industry |
|------|----------|
| 23822 | Plumbing, Heating, and Air-Conditioning Contractors |
| 23821 | Electrical Contractors / Mechanical Wiring |
| 56173 | Landscaping Services |
| 23831 | Drywall and Insulation Contractors |

---

## Troubleshooting

**"Apollo returned 0 results"** — The search filters may be too narrow. Try broadening `apollo.keywords` or removing one of the NAICS codes temporarily and running again.

**"The caller does not have permission"** — The service account email was not given Editor access to the spreadsheet. Re-do Step 2d.

**Phone numbers not appearing** — Apollo only reveals phone numbers on certain plan tiers. The script will still add leads but the Phone Number column will be empty for contacts where Apollo doesn't have a number. Enrichment also consumes Apollo credits.

**"GOOGLE_CREDENTIALS_JSON parse error"** — Make sure the JSON is on a single line with no stray whitespace. Use `cat credentials.json | tr -d '\n'` to flatten it.

---

## Your Spreadsheet

https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit

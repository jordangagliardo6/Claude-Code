# HVAC Lead Generation Workflow — Setup Guide

Automated daily lead pull: Apollo.io → "HVAC Leads — SW Michigan (Master)" in Google Drive.

---

## Quick Start

```bash
cd hvac-leads
npm install
cp .env.example .env    # then fill in values
node setup.js           # verifies both APIs, optional live test run
node index.js           # start the 7 AM Eastern daily scheduler
```

---

## Step 1 — Apollo API Key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API** (or visit `/settings/integrations/api`)
3. Copy your **API Key**
4. Paste it into `.env` as `APOLLO_API_KEY=...`

**Plan note:** The People API Search and phone-number enrichment (`bulk_match`) require
an Apollo plan that includes Export Credits. If `setup.js` reports "plan limit", check
your Apollo plan at **Settings → Plans**.

---

## Step 2 — Google Service Account

The workflow writes to your existing spreadsheet using a Service Account (no browser popup needed).

### 2a. Create the Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Enable the **Google Sheets API** → APIs & Services → Library → "Google Sheets API" → Enable
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it any name (e.g. `hvac-leads-bot`), click **Done**
6. Click the service account row → **Keys → Add Key → Create new key → JSON**
7. Save the downloaded file as:

```
hvac-leads/credentials/google-service-account.json
```

### 2b. Share the Spreadsheet

1. Open [your master spreadsheet](https://docs.google.com/spreadsheets/d/1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs)
2. Click **Share**
3. Paste the service account email (looks like `hvac-leads-bot@your-project.iam.gserviceaccount.com`)
4. Set role to **Editor**, click **Send**

The spreadsheet ID is already pre-filled in `.env.example` — no change needed there.

---

## Step 3 — Run Setup

```bash
node setup.js
```

Expected output:
```
1/2  Testing Apollo.io…
     ✅ Connected — 1,240 leads available in this search

2/2  Testing Google Sheets…
     ✅ Connected
        Title     : HVAC Leads — SW Michigan (Master)
        Leads now : 56 existing entries
        URL       : https://docs.google.com/spreadsheets/d/1zLEBSyH0m0DBGw3E_...

✅ All systems go! Run the workflow now? [y/N]
```

Type `y` to run a live test pull before starting the scheduler.

---

## Step 4 — Start the Scheduler

```bash
node index.js
```

The scheduler fires every day at **7:00 AM Eastern** (respects daylight saving automatically).
It pulls up to 25 new leads, skips any business already in the sheet, and appends the rest.

To keep it running after you close the terminal, use a process manager:

```bash
# With pm2 (recommended):
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## One-off Run

```bash
npm run run-now
```

---

## Customising

| What to change | Where |
|---|---|
| Add/remove target cities | `src/config.js` → `targetCities` |
| Add/remove zip codes | `src/config.js` → `swMichiganZips` |
| Change job title filters | `src/config.js` → `personTitles` |
| Change industry keywords | `src/config.js` → `industryKeywords` |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Change run time | `.env` → `CRON_SCHEDULE` (cron format, Eastern time) |
| Enable email alerts on error | `src/workflow.js` → uncomment SMTP block + set `SMTP_*` env vars |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `401 Unauthorized` from Apollo | Check `APOLLO_API_KEY` in `.env` |
| Apollo plan limit message | Upgrade Apollo plan to include Export Credits |
| `ENOENT credentials/google-service-account.json` | Download the JSON key (Step 2a above) |
| `PERMISSION_DENIED` from Sheets | Share the spreadsheet with the service account email |
| Duplicates keep appearing | Business name comparison is case-insensitive — check for exact name mismatches |

---

## File Layout

```
hvac-leads/
├── index.js            ← scheduler entry point
├── setup.js            ← first-run test
├── package.json
├── .env.example        ← copy to .env and fill in
├── .gitignore
├── SETUP.md            ← this file
├── src/
│   ├── config.js       ← all tuneable settings
│   ├── apollo.js       ← Apollo REST API (search + enrich)
│   ├── sheets.js       ← Google Sheets API (read + append)
│   └── workflow.js     ← orchestrates both, handles errors
└── credentials/        ← git-ignored; put service account JSON here
```

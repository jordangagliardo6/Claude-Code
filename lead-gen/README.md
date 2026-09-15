# HVAC Lead Gen — Southwest Michigan

Pulls up to 25 HVAC owner/decision-maker contacts from Apollo.io every morning at 7 AM ET and appends them to your Google Sheet — no duplicates.

---

## What it does

- Searches Apollo.io for **Owner / President / Founder / Co-Founder / General Manager** contacts at HVAC, Plumbing, and Mechanical Contracting companies in Southwest Michigan (1–25 employees)
- Filters to SW Michigan cities: St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven, and surrounding areas
- Only adds contacts with a phone number
- Appends to your Google Sheet with columns: `Date Added | Business Name | Owner First | Owner Last | Phone | City | Website | Called | Notes`
- Skips any business already in the sheet
- Runs automatically at **7:03 AM Eastern** every day via node-cron

---

## First-time setup (do this once)

### 1. Install dependencies

```bash
cd lead-gen
npm install
```

### 2. Set your environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY` — from https://app.apollo.io/#/settings/integrations/api
- `GOOGLE_SPREADSHEET_ID` — the ID in your Google Sheet URL (pre-filled with your existing "SW Michigan HVAC Leads" sheet)

### 3. Set up Google OAuth (one-time browser step)

**Create Google Cloud credentials:**
1. Go to https://console.cloud.google.com/
2. Create or select a project
3. Enable **Google Sheets API** under *APIs & Services → Library*
4. Go to *APIs & Services → Credentials*
5. Click **Create Credentials → OAuth 2.0 Client ID**
6. Application type: **Desktop app**
7. Download the JSON → save it as `lead-gen/credentials.json`

**Authorise the app:**

```bash
node setup-auth.js
```

This opens a browser URL. Log in with your Google account (jgagliardo98@gmail.com), approve access, paste the code back. It saves `token.json` and you're done — you never need to do this again.

### 4. Verify connectivity — run it once right now

```bash
npm run run-now
```

This fires a single lead pull immediately and prints what it found. If Apollo returns results, they'll appear in your Google Sheet within seconds.

### 5. Start the daily scheduler

```bash
npm start
```

The process needs to stay running (use PM2, a server, or a scheduled task on your machine to keep it alive). See "Keeping it running" below.

---

## Keeping it running

**Option A — PM2 (recommended for a Mac/Linux machine):**

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # makes it survive reboots
```

**Option B — System cron (calls the script directly):**

Add to crontab (`crontab -e`):
```
3 7 * * * cd /path/to/lead-gen && node index.js --run-now >> /tmp/hvac-leads.log 2>&1
```

Note: If using system cron, remove the `node-cron` scheduler from `index.js` (the `cron.schedule(...)` call) to avoid double-runs.

---

## Customising

| What to change | Where |
|---|---|
| Target cities | `apollo.js` → `SW_MICHIGAN_CITIES` array |
| Industries | `apollo.js` → `INDUSTRY_KEYWORDS` array |
| Job titles | `apollo.js` → `TARGET_TITLES` array |
| Leads per run | `.env` → `MAX_LEADS_PER_RUN=25` |
| Sheet columns | `sheets.js` → `HEADERS` array + row mapping in `appendLeadsToSheet` |
| Schedule time | `index.js` → `CRON_EXPRESSION` |
| Target spreadsheet | `.env` → `GOOGLE_SPREADSHEET_ID` |

---

## Apollo plan note

Apollo's People Search API (`/api/v1/mixed_people/search`) returns phone numbers on **paid plans**. On a free plan, you'll get names and companies but empty phone fields. If you're seeing blank phone numbers:
1. Upgrade to a paid Apollo plan, OR
2. Export results from Apollo's web UI (which also lets you enrich contacts manually)

The script still works on free plans — it just won't be able to filter by "has phone number" since Apollo won't return that data.

---

## Your existing spreadsheet

Your "SW Michigan HVAC Leads — New Sept 8 2026" sheet is pre-configured as the target. It already has the right column headers. The `GOOGLE_SPREADSHEET_ID` in `.env.example` points to it.

Your main call tracker (`Shoreline_HVAC_CallSheet_v3`) is a separate sheet — this automation does NOT touch it. You can manually copy interesting leads from the new-leads sheet into the call tracker as usual.

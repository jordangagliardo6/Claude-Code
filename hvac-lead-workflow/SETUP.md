# HVAC Lead Workflow — Setup Guide

Automated daily lead generation: Apollo.io → Google Sheets (Southwest Michigan HVAC).

---

## What It Does

- Runs every morning at **7:00 AM Eastern Time**
- Searches Apollo.io for HVAC / plumbing / mechanical company owners in SW Michigan
- Targets: St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven + surrounding area
- Filters: 1–25 employees, Owner/President/Founder/Co-Founder/General Manager titles
- Skips contacts with no phone number
- Appends up to **25 new leads per run** to your master Google Sheet
- Skips duplicates (checks Business Name column before inserting)

**Target sheet:** `HVAC Leads — SW Michigan (Master)` (already exists in your Drive)

---

## Prerequisites

- Node.js 18 or newer (`node --version`)
- An Apollo.io account with a **paid plan** (Basic $49/mo+)
  - Free plans do not return phone numbers from the People Search API
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-workflow
npm install
```

---

## Step 2 — Get your Apollo API key

1. Go to [app.apollo.io/#/settings/integrations/api](https://app.apollo.io/#/settings/integrations/api)
2. Copy your API key

---

## Step 3 — Set up Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable **Google Sheets API**: APIs & Services → Enable APIs → search "Google Sheets API"
4. Create credentials: APIs & Services → Credentials → Create Credentials → **OAuth 2.0 Client ID**
   - Application type: **Desktop app**
   - Name: `HVAC Lead Workflow`
5. Download the JSON file, rename it `credentials.json`, and place it in the `hvac-lead-workflow/` folder

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY` — your Apollo API key from Step 2
- `GOOGLE_SHEET_ID` — already set to your master sheet: `1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs`
- Everything else can stay as defaults

---

## Step 5 — First-run authentication test

This verifies both Apollo and Google are connected before the schedule starts:

```bash
node index.js --run-now
```

**What happens:**
1. A browser opens (or a URL prints) for Google OAuth consent — approve access to Sheets
2. A `token.json` file is saved (reused on every future run, no browser needed again)
3. Apollo is queried for SW Michigan HVAC leads
4. Any new leads (not already in your sheet) are appended
5. A summary prints showing how many were added

**Expected first-run output:**
```
Connecting to Google Sheets...
Sheet has 56 existing businesses (dedup check ready).
Searching Apollo for SW Michigan HVAC leads (requesting up to 50)...
Apollo returned 30 raw results.
After dedup: 12 new leads to add, 18 skipped (no phone or duplicate).
Appended 12 rows to sheet.

─── Run Summary ───────────────────────────────
  Date:           2026-09-27
  Apollo results: 30
  Added to sheet: 12
  Skipped:        18
  Elapsed:        3.2s
───────────────────────────────────────────────
```

---

## Step 6 — Start the daily scheduler

```bash
node index.js
```

Keep this running in a terminal, tmux session, or as a system service (see below).
It will run automatically at 7:00 AM Eastern every day.

---

## Running as a background service (optional)

### Option A — PM2 (recommended for VPS/server)

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup    # follow the printed command to auto-start on reboot
```

### Option B — System cron (alternative — no Node.js scheduler needed)

Instead of running `index.js` as a persistent process, add a system cron entry
that runs `node index.js --run-now` at 7 AM ET:

```bash
# Add to crontab: crontab -e
0 7 * * * TZ=America/New_York /usr/bin/node /path/to/hvac-lead-workflow/index.js --run-now >> /var/log/hvac-leads.log 2>&1
```

---

## Customizing the city list

Edit `src/apollo.js` → `SW_MICHIGAN_CITIES` array.
Add or remove city strings in the format `"City, Michigan"`.

## Changing max leads per run

Edit `.env` → `MAX_LEADS_PER_RUN=25` (or any number 1–100).

## Changing target job titles

Edit `src/apollo.js` → `TARGET_TITLES` array.
Order matters — Apollo prioritizes the first titles in the list.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variables` | Check `.env` file is filled out |
| Apollo returns empty results | Verify paid plan; check API key; try removing NAICS/SIC filters |
| `Phone numbers []` on every result | Apollo free plan doesn't return phones — upgrade to Basic |
| Google auth fails | Delete `token.json` and re-run `--run-now` to reauthenticate |
| `invalid_grant` error | Token expired — delete `token.json` and re-run |
| 0 new leads added | All Apollo results already exist in your sheet; check next day |

---

## Sheet column reference

| Column | Field | Notes |
|---|---|---|
| A | Date Added | Auto-filled (YYYY-MM-DD) |
| B | Business Name | Used for dedup check |
| C | Owner First Name | From Apollo — may be blank on free plan |
| D | Owner Last Name | From Apollo — may be masked on free plan |
| E | Phone Number | Direct/mobile preferred; skipped if none |
| F | City | From Apollo person or company location |
| G | Website | From Apollo company record |
| H | Called | Left blank — fill in manually |
| I | Notes | Left blank — fill in manually |

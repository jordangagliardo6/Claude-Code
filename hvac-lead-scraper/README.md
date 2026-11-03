# HVAC Lead Scraper — Southwest Michigan

Automated lead generation pipeline. Searches Apollo.io daily for HVAC company
owners in Southwest Michigan and appends up to 25 new leads per run to a
Google Sheet — deduplicated, phone-verified, and with the owner's name pulled
directly from Apollo's data.

---

## What It Does

Each morning at **7:00 AM Eastern Time** the script:

1. Calls the Apollo.io People Search API filtered to HVAC/plumbing companies
   with 1–25 employees in St. Joseph, Benton Harbor, Kalamazoo, Holland,
   Grand Haven, Muskegon, and South Haven.
2. Pulls only contacts with a phone number (mobile preferred over direct dial).
3. Reads your Google Sheet to find business names already logged.
4. Appends up to 25 new (non-duplicate) leads to the **Leads** tab.

### Sheet columns (auto-created if the tab is empty)

| Column | Value |
|--------|-------|
| A — Date Added | MM/DD/YYYY (Eastern Time) |
| B — Business Name | Company from Apollo |
| C — Owner First Name | |
| D — Owner Last Name | |
| E — Phone Number | Mobile > Direct > Business |
| F — City | |
| G — Website | URL or blank |
| H — Called | **You fill this in** |
| I — Notes | **You fill this in** |

---

## First-Time Setup

### 1. Get an Apollo.io API key

1. Sign up at [apollo.io](https://www.apollo.io) if you haven't already.
2. Go to **Settings → Integrations → API** (or visit
   [developer.apollo.io](https://developer.apollo.io) → API Keys).
3. Copy your key — you'll add it to `.env` in step 4.

> Free tier: 50 credits/month. Basic plan ($49/mo): 1,000/month.
> Each search call costs credits based on the contacts returned.

### 2. Create and share a Google Sheet

1. Create a new Google Sheet and note its **Sheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_IS_THE_ID**/edit`
2. Name the first tab exactly **Leads** (the script writes to this tab).

### 3. Set up Google Sheets API credentials

**Option A — Service Account (recommended for automation)**

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project → enable the **Google Sheets API**.
3. Go to **Credentials → Create Credentials → Service Account**.
4. Give it a name, click **Done**.
5. Open the service account → **Keys** → **Add Key → JSON**.
6. Download the JSON file and save it as `credentials.json` in this directory.
7. Copy the **service account email** (looks like `name@project.iam.gserviceaccount.com`).
8. Share your Google Sheet with that email address (give it **Editor** access).

**Option B — OAuth2 (Desktop app)**

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project → enable the **Google Sheets API**.
3. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**.
4. Choose **Desktop application**, download the JSON, and save as `credentials.json`
   in this directory.
5. Run the one-time authorization flow:
   ```bash
   npm run setup-google-auth
   ```
   Open the URL it prints, authorize, paste the code back. This saves `token.json`.

### 4. Configure environment variables

```bash
cp .env.example .env
# then edit .env with your values:
APOLLO_API_KEY=your_actual_key
GOOGLE_SHEET_ID=your_actual_sheet_id
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
```

### 5. Install dependencies

```bash
npm install
```

### 6. Verify both connections before the first scheduled run

```bash
npm run test-connections
```

You should see:
```
1. Apollo.io API… ✓  (test query found X contacts in Kalamazoo)
2. Google Sheets… ✓  "Your Sheet Name"
   Headers confirmed in row 1.

All connections verified. Start the scheduler with: npm start
```

Fix any errors shown before moving on.

### 7. Start the scheduler

```bash
npm start
```

The process stays alive and fires at 7:00 AM Eastern every day.
Keep it running with `pm2`, `screen`, or a systemd service (see **Production** below).

To trigger a run immediately (without waiting for 7 AM):
```bash
npm run run-now
```

---

## Customizing Search Targets

Open `index.js` and edit the `CONFIG` object at the top — no other changes needed.

```js
const CONFIG = {
  cities: [
    'St. Joseph',
    'Benton Harbor',
    // add/remove cities freely
  ],
  industries: [
    'hvac',
    'heating and air conditioning',
    // add keywords here
  ],
  jobTitles: ['Owner', 'President', 'Founder', 'Co-Founder', 'General Manager'],
  maxEmployees: 25,
  maxLeadsPerRun: 25,
  ...
};
```

---

## Error Handling

- **Console output**: every run prints a timestamped log.
- **error.log**: any run failure is appended to `hvac-lead-scraper/error.log`
  alongside the timestamp and error detail.
- **Apollo 0 results**: logged as an alert — check your API key and credits.
- **Google Sheets failure**: logged with the exact API error message.

To receive email alerts, add a nodemailer call inside the `logError()` function
in `index.js` (see the comment block there for a template).

---

## Running in Production (keeping it alive on a server)

**Using PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # auto-start on reboot
```

**Using a system cron job instead of node-cron:**
```bash
# Add to crontab (crontab -e) — 7 AM Eastern = 12:00 UTC (Nov–Mar) / 11:00 UTC (Mar–Nov)
# Using TZ variable to handle DST automatically:
0 7 * * * TZ=America/New_York /usr/bin/node /path/to/hvac-lead-scraper/index.js --run-now >> /path/to/hvac-lead-scraper/cron.log 2>&1
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Apollo API error (HTTP 401)` | Check `APOLLO_API_KEY` in `.env` |
| `Apollo returned 0 results` | Check Apollo plan credits; try `--run-now` mid-day |
| `credentials.json not found` | Follow Setup step 3 above |
| `token.json not found` | Run `npm run setup-google-auth` (OAuth2 only) |
| `Sheet "Leads" not found` | Make sure the tab is named exactly **Leads** |
| Duplicate leads appearing | Duplicate check is on Business Name (column B) — exact match, case-insensitive |

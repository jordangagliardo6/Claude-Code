# Lead Gen Workflow — Apollo.io → Google Sheets

Pulls up to 25 HVAC/plumbing business owners per day from Apollo.io and appends them to a Google Sheet. Runs automatically at **7:00 AM Eastern Time** via node-cron.

---

## What it does

1. Searches Apollo.io for **Owner / President / Founder / GM** contacts at HVAC and plumbing companies with 1–25 employees in Southwest Michigan cities (St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven).
2. Skips any contact with no phone number.
3. Checks the Google Sheet for duplicate business names before inserting.
4. Appends new leads with columns: **Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes**.
5. Emails you an alert if anything fails.

---

## Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org)
- An **Apollo.io account** with API access (Basic plan or higher)
- A **Google Cloud project** with the Sheets API enabled and a service account

---

## Step 1 — Clone & install

```bash
git clone <your-repo-url>
cd lead-gen-workflow
npm install
```

---

## Step 2 — Apollo API key

1. Log in to [apollo.io](https://app.apollo.io).
2. Go to **Settings → Integrations → API** (direct link: `https://app.apollo.io/#/settings/integrations/api`).
3. Click **Create API Key** → copy the key.
4. Paste it in your `.env` file (see Step 4).

---

## Step 3 — Google Sheets setup

### 3a. Create your spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first tab to **Leads** (must match `sheetTabName` in `src/config.js`).
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ←  THIS PART  → /edit
   ```

### 3b. Create a Google Cloud service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**.
2. Click **Create Credentials → Service Account**. Give it any name.
3. After creation, click the service account → **Keys → Add Key → JSON**. A file downloads.
4. Rename it `google-service-account.json` and place it in the `credentials/` folder of this project.

### 3c. Enable the Sheets API

1. In Google Cloud Console → **APIs & Services → Library**.
2. Search **Google Sheets API** → click **Enable**.

### 3d. Share the spreadsheet with your service account

1. Open the credentials JSON. Find the `client_email` field — it looks like:
   ```
   my-service@my-project.iam.gserviceaccount.com
   ```
2. Open your Google Sheet → click **Share** → paste that email → set role to **Editor** → Share.

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in:

| Variable | Description |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key (Step 2) |
| `GOOGLE_SPREADSHEET_ID` | The ID from your sheet's URL (Step 3a) |
| `GOOGLE_CREDENTIALS_PATH` | Path to service account JSON (default: `./credentials/google-service-account.json`) |
| `ALERT_EMAIL_TO` | Email address to receive error alerts |
| `ALERT_EMAIL_FROM` | Your Gmail address (used to send alerts) |
| `GMAIL_APP_PASSWORD` | Gmail App Password ([how to generate](https://support.google.com/accounts/answer/185833)) |
| `MAX_LEADS_PER_RUN` | Leads per run — default 25 |
| `CRON_SCHEDULE` | Cron expression — default `0 7 * * *` (7am) |

---

## Step 5 — Verify connections before first run

```bash
node src/verify.js
```

This checks both APIs and confirms write access to your sheet. You'll see a green summary if everything is wired up correctly. Fix any issues it reports, then re-run until it passes.

---

## Step 6 — First run

**Test immediately (runs once and exits):**
```bash
node src/index.js --run-now
```

**Start the daily scheduler:**
```bash
node src/index.js
```

> **Timezone note:** The scheduler uses your server's local timezone. If your server is not set to `America/New_York`, update the cron hour in `.env`:
> - UTC: `0 12 * * *`  (noon UTC = 7am ET standard time)
> - CDT: `0 6 * * *`   (6am CDT = 7am ET)

**Keep it running permanently (Linux/Mac):**
```bash
# Using pm2 (recommended)
npm install -g pm2
pm2 start src/index.js --name lead-gen
pm2 save
pm2 startup   # follow the printed instructions
```

---

## Customizing

All search parameters live in `src/config.js`:

- **Add a city:** push to `targetLocations` array.
- **Change job titles:** edit `targetTitles` array.
- **Change company size:** edit `employeeRanges` (e.g. `['1,50']`).
- **Add an industry keyword:** push to `industryKeywords`.
- **Add a column:** add to `columnHeaders`, then add a matching slot in `buildRow()` inside `src/workflow.js`.

---

## Logs

| File | Contents |
|---|---|
| `logs/run.log` | Every run — info, warnings, lead names |
| `logs/errors.log` | Errors only — good for quick health checks |

---

## Apollo credit usage

The people search endpoint itself is free. If you enable phone enrichment (not turned on by default), each enriched contact costs 1 Apollo credit. The current setup only includes leads where Apollo already has a phone number on record in the search response — no credits consumed.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `APOLLO_API_KEY not set` | Copy `.env.example` → `.env` and fill in the key |
| Apollo returns 0 results | Broaden `targetLocations` or `industryKeywords` in `config.js` |
| Google 403 Permission Denied | Share the sheet with the service account email (Step 3d) |
| Google 404 Not Found | Double-check `GOOGLE_SPREADSHEET_ID` in `.env` |
| No leads with phones | Apollo may not have phone data for this region — try enabling enrichment (see `apollo.js`) |
| Email alerts not sending | Add `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`, `GMAIL_APP_PASSWORD` to `.env` |

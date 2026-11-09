# HVAC Lead Scraper

Searches Apollo.io every morning for HVAC owner-operators in Southwest Michigan
and appends new leads to a Google Sheet — automatically, with no duplicates.

---

## What it does

- Queries Apollo.io for HVAC, Plumbing, and Mechanical Contracting companies
  in St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon,
  and South Haven, Michigan
- Targets owners / presidents / founders (1–25 employee companies only)
- Skips any contact without a phone number
- Appends up to 25 new leads per day to your Google Sheet
- Deduplicates by business name — never adds the same company twice
- Runs automatically at **7:00 AM Eastern** via node-cron

**Sheet columns (auto-created if the sheet is empty):**

| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |
|---|---|---|---|---|---|---|---|---|

---

## First-time setup

### 1 — Install dependencies

```bash
cd hvac-lead-scraper
npm install
```

### 2 — Set up Apollo.io API key

1. Log in to [Apollo.io](https://app.apollo.io) → Settings → Integrations → API
2. Create a new API key
3. Copy it — you'll paste it in `.env` below

### 3 — Set up Google Sheets API (OAuth)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or reuse one)
3. Enable **Google Sheets API** (search for it in the library)
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
5. Choose **Desktop app**, name it anything, click Create
6. Download the JSON file — save it in this folder as `credentials.json`

### 4 — Create your Google Sheet

1. Open [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Rename the first tab to **Leads** (the script reads/writes to that tab)
3. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`SPREADSHEET_ID`**`/edit`

### 5 — Configure .env

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_key_here
GOOGLE_SPREADSHEET_ID=your_sheet_id_here
GOOGLE_CREDENTIALS_PATH=./credentials.json
ALERT_EMAIL=your_email@example.com
MAX_LEADS_PER_RUN=25
CRON_SCHEDULE=0 7 * * *
```

> **Timezone note:** `node-cron` is configured to use `America/New_York` so
> `0 7 * * *` always means 7:00 AM Eastern regardless of your server's timezone.

### 6 — Test run (verify connectivity)

```bash
node index.js --test
```

This runs **one scrape immediately** so you can confirm:

- Apollo API key works
- Google OAuth authorization completes (you'll see a URL to open in a browser the first time)
- Leads are written to your sheet

The first time you run it, it will print an authorization URL — open it, sign in
with Google, click **Allow**, copy the code, and paste it back in the terminal.
After that, the token is saved to `token.json` and you never need to do it again.

### 7 — Start the scheduler

```bash
node index.js
```

Leave this running in the background (via `screen`, `tmux`, `pm2`, or as a
system service). It will run the scrape every morning at 7am Eastern.

---

## Customizing

| What to change | Where |
|---|---|
| Add/remove cities | `SW_MICHIGAN_CITIES` array in `index.js` |
| Change max leads per run | `MAX_LEADS_PER_RUN` in `.env` |
| Change run time | `CRON_SCHEDULE` in `.env` |
| Add/remove industries | `TARGET_INDUSTRIES` array in `index.js` |
| Add/remove job titles | `TARGET_TITLES` array in `index.js` |
| Change company size filter | `organization_num_employees_ranges` in `searchApolloLeads()` |

---

## Error handling

- If Apollo returns no results for a city, the scraper logs it and moves on
- If the Google Sheet write fails, the error is logged to `error.log` and printed to the console
- Set `ALERT_EMAIL` in `.env` to get a notification (requires extending the Gmail scope — see comments in `index.js`)

---

## Running as a background service with PM2

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Files

| File | Purpose |
|---|---|
| `index.js` | Main script |
| `package.json` | Dependencies |
| `.env.example` | Template for your env vars — copy to `.env` |
| `credentials.json` | Google OAuth credentials (you download this) |
| `token.json` | Auto-generated after first auth — keep it safe |
| `error.log` | Error log written at runtime |

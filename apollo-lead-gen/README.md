# Apollo HVAC Lead Gen — Southwest Michigan

Automatically finds owner-operated HVAC / plumbing businesses in Southwest
Michigan every morning at **7:00 AM Eastern**, pulls up to 25 fresh leads from
Apollo.io, and appends them to your Google Sheet — skipping any business
already in the list.

---

## What gets written to your sheet

| Column | Content |
|---|---|
| Date Added | Today's date (MM/DD/YYYY) |
| Business Name | Company name from Apollo |
| Owner First Name | Contact first name |
| Owner Last Name | Contact last name |
| Phone Number | Best available phone (mobile > direct > main) |
| City | City of the business |
| Website | Company website URL (if available) |
| Called | Blank — fill in yourself |
| Notes | Blank — fill in yourself |

---

## First-time setup (read this once)

### 1 — Get your Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your key

### 2 — Create a Google Cloud service account

> This is what lets the script write to your spreadsheet without a browser
> pop-up each time.

1. Open [console.cloud.google.com](https://console.cloud.google.com) and
   create (or select) a project.
2. **Enable the Google Sheets API**: *APIs & Services → Library → Google
   Sheets API → Enable*.
3. **Create a service account**: *IAM & Admin → Service Accounts → Create*.
   Name it anything (e.g. `lead-gen-bot`).
4. **Download a JSON key**: open the service account, click *Keys → Add Key →
   Create new key → JSON*. Save the file as `google-service-account.json`
   inside this folder.
5. **Share your spreadsheet** with the service account's email address
   (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`) and
   grant it **Editor** access.

### 3 — Create your Google Sheet

1. Create a new blank spreadsheet at [sheets.google.com](https://sheets.google.com).
2. Copy the spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`
3. Leave the first tab named `Sheet1` (or change `SHEET_NAME` in `.env`).

### 4 — Configure your environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=<your key from step 1>
GOOGLE_SPREADSHEET_ID=<the ID from step 3>
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account.json
```

### 5 — Install dependencies

```bash
npm install
```

### 6 — Verify both connections before the first run

```bash
node setup.js
```

You should see ✓ next to every check.  Add `--write` to also test that the
sheet is writable:

```bash
node setup.js --write
```

### 7 — Start the scheduler

```bash
npm start
```

The script will print:

```
Scheduler active — next run at 7:00 AM Eastern Time (America/New_York).
```

It will sit quietly until 7 AM, then run automatically every day.

### 8 — Trigger an immediate test run

While the scheduler is running (or in a second terminal), trigger one run
right now:

```bash
npm run run-now
```

Check your Google Sheet — you should see up to 25 new rows within about
30 seconds.

---

## Customising the workflow

| Change | Where |
|---|---|
| Add / remove target cities | `TARGET_CITIES` array in `index.js` |
| Change industries | `TARGET_INDUSTRIES` array in `index.js` |
| Change job titles | `TARGET_TITLES` array in `index.js` |
| Leads per run | `MAX_LEADS_PER_RUN` in `.env` (default 25) |
| Schedule time | `cron.schedule(...)` expression in `index.js` |
| Sheet tab name | `SHEET_NAME` in `.env` |

---

## Error handling

- Errors are printed to the console with a timestamp.
- They are also appended to `error.log` (or the path set in `ERROR_LOG_PATH`).
- The script never crashes the process on a single-run failure — the next
  scheduled run will try again automatically.

---

## Running as a background service (optional)

To keep the scheduler running after you close your terminal, use
[PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name "hvac-lead-gen"
pm2 save
pm2 startup   # follow the printed command to survive reboots
```

View logs: `pm2 logs hvac-lead-gen`

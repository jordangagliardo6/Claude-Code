# HVAC Lead Generator — Setup Guide

## What it does

Every morning at 7 AM Eastern, this tool:
1. Queries Apollo.io for HVAC business owners in Southwest Michigan with phone numbers
2. Deduplicates against your Google Sheet
3. Appends up to 25 new leads (Date Added, Business Name, First Name, Last Name, Phone, City, Website)

---

## Option A — GitHub Actions (recommended, zero server required)

The workflow lives at `.github/workflows/lead-gen.yml`. GitHub runs it on the schedule automatically — no server, no cron daemon.

### Step 1 · Get your Apollo.io API key

1. Log in to [apollo.io](https://apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

### Step 2 · Set up Google Sheets access (service account)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API** (APIs & Services → Library → search "Sheets")
4. Create a **Service Account** (APIs & Services → Credentials → Create Credentials → Service Account)
5. On the service account page, go to **Keys → Add Key → JSON** — download the file
6. Open your Google Sheet and click **Share**
7. Paste the service account email (e.g. `my-bot@my-project.iam.gserviceaccount.com`) and give it **Editor** access
8. Copy your Sheet ID from its URL:
   ```
   https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
   ```

### Step 3 · Add GitHub repository secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**.

Add these four secrets:

| Secret name | Value |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key |
| `GOOGLE_SPREADSHEET_ID` | The sheet ID from the URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The **entire contents** of the JSON key file (copy-paste it all) |
| `ALERT_EMAIL` | `jgagliardo98@gmail.com` |

### Step 4 · Verify everything works

Trigger a manual run: GitHub → **Actions → HVAC Lead Generation → Run workflow**.

Watch the logs. You should see:
```
Apollo search complete. Found N contacts with phones.
Sheets update complete. Appended: N, Skipped (duplicates): 0
Run finished. New leads added: N
```

---

## Option B — Run locally with node-cron

Use this if you want the scheduler to run on your own machine or a VPS.

### Step 1 · Install dependencies

```bash
cd lead-gen
npm install
```

### Step 2 · Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (path to your downloaded JSON key)
- `ALERT_EMAIL`

### Step 3 · Test the connections

```bash
node test-connection.js
```

Expected output:
```
Testing Apollo.io connection... OK
Testing Google Sheets connection... OK  (sheet: "Your Sheet Name")

Both connections verified. You're good to run: node index.js --run-now
```

### Step 4 · Do a first live run

```bash
node index.js --run-now
```

Check your Google Sheet — you should see up to 25 new rows.

### Step 5 · Start the scheduler

```bash
node index.js
```

The process stays running and fires at 7 AM Eastern every day. Use `pm2` or `screen` to keep it alive if you close the terminal:

```bash
# With pm2:
npm install -g pm2
pm2 start index.js --name lead-gen
pm2 save
pm2 startup
```

---

## Customization

All filters live in **`config.js`** — no need to touch the API or sheet logic:

| What to change | Where |
|---|---|
| Add/remove cities | `TARGET_LOCATIONS` array |
| Change industries | `TARGET_INDUSTRIES` array |
| Adjust job titles | `TARGET_TITLES` array |
| Leads per run | `MAX_LEADS_PER_RUN` |
| Change run time | `CRON_SCHEDULE` + `CRON_TIMEZONE` |
| Rename the sheet tab | `SHEET_NAME` |
| Add/reorder columns | `SHEET_HEADERS` array (and update the row array in `sheets.js` line ~76) |

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Add it to `.env` or GitHub Secrets |
| Apollo returns 0 contacts | Broaden the city list or industry tags in `config.js` |
| `Google credentials not found` | Set `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` or `GOOGLE_SERVICE_ACCOUNT_JSON` |
| `The caller does not have permission` | Share the Google Sheet with the service account email |
| `GOOGLE_SPREADSHEET_ID is not set` | Add it to `.env` or config.js |
| Duplicates appearing | The Business Name must match exactly — check capitalization |

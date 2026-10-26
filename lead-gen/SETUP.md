# HVAC Lead Gen — First-Run Setup Guide

This walks you through connecting Apollo.io and Google Sheets, then verifying everything works before the first scheduled run.

---

## Step 1 — Install Node dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log in at [app.apollo.io](https://app.apollo.io).
2. Go to **Settings → Integrations → API**.
3. Copy your **API Key**.

---

## Step 3 — Set up Google Sheets access (service account)

A service account lets the script write to your spreadsheet automatically without you having to log in each time.

### 3a. Create a Google Cloud project & enable the Sheets API

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or use an existing one).
3. In the sidebar go to **APIs & Services → Library**.
4. Search for **Google Sheets API** and click **Enable**.

### 3b. Create a service account

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → Service Account**.
3. Give it a name like `hvac-lead-gen` and click **Done**.
4. Click the service account you just created, then go to the **Keys** tab.
5. Click **Add Key → Create new key → JSON** and save the downloaded file as `credentials.json` inside the `lead-gen/` folder.

### 3c. Share your spreadsheet with the service account

1. Open the `credentials.json` file and copy the `client_email` value (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`).
2. Open your Google Spreadsheet in the browser.
3. Click **Share** and paste that email address. Give it **Editor** access.

### 3d. Find your Spreadsheet ID

The ID is in the spreadsheet URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```
Copy that `SPREADSHEET_ID` value.

---

## Step 4 — Configure your environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key from Step 2 |
| `GOOGLE_CREDENTIALS_PATH` | `./credentials.json` (default) |
| `SPREADSHEET_ID` | The ID from Step 3d |
| `NOTIFY_EMAIL` | Your email for error alerts (e.g. `jgagliardo98@gmail.com`) |
| `NOTIFY_EMAIL_FROM` | A Gmail address to send alerts FROM |
| `NOTIFY_EMAIL_PASSWORD` | A [Gmail App Password](https://myaccount.google.com/apppasswords) (not your login password) |

The `NOTIFY_EMAIL_FROM` / `NOTIFY_EMAIL_PASSWORD` fields are optional — errors always appear in the console. They only enable email alerts.

---

## Step 5 — Verify both connections

```bash
node index.js --verify
```

You should see:
```
  ✅ Google credentials configured
  ✅ Apollo.io API key is set
  ✅ Spreadsheet ID is set

  Testing Apollo.io API...
  ✅ Apollo.io connected — test query returned 1 result(s).

  Testing Google Sheets access...
  ✅ Google Sheets connected — first cell: "(empty)"

  All connections OK. Run with --run-now to test a live pull, or --start to begin scheduling.
```

---

## Step 6 — Run once to test

```bash
node index.js --run-now
```

Check your spreadsheet — you should see up to 25 new rows with today's date.

---

## Step 7 — Start the daily scheduler

```bash
node index.js --start
```

This starts a cron job that fires at **7:00am Eastern Time every morning** and pulls up to 25 new leads.

### Keeping it running persistently (recommended)

The process must stay alive. Use **pm2**:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads -- --start
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

Or create a system service, or run it from a cloud VM / cron job host.

---

## Customizing the workflow

All tunable settings live in `config.js`:

- **Add/remove cities** → edit `SW_MICHIGAN_CITIES`
- **Change job titles** → edit `TARGET_TITLES`
- **Change industries** → edit `TARGET_INDUSTRIES`
- **Change max leads per run** → edit `MAX_LEADS_PER_RUN`
- **Change column order** → edit `SHEET_COLUMNS` and `COLUMN_MAP` together
- **Change the spreadsheet tab** → set `SHEET_TAB_NAME` in `.env`

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `APOLLO_API_KEY is not set` | You didn't copy your `.env.example` to `.env` |
| Apollo returns 401 | API key is wrong or expired |
| Apollo returns 0 results | Filters too narrow — try removing one city |
| Google Sheets 403 error | Service account wasn't shared on the spreadsheet |
| Google Sheets 404 error | `SPREADSHEET_ID` is wrong |
| `credentials.json` not found | Wrong path — confirm `GOOGLE_CREDENTIALS_PATH` in `.env` |

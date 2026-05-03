# HVAC Lead Gen — Setup Guide

## What this does
Searches Apollo.io every morning at 7am Eastern for HVAC / plumbing / mechanical
companies (1–25 employees) in Southwest Michigan, then appends up to 25 new leads
into a Google Sheet — skipping duplicates automatically.

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | apollo.io → Settings → Integrations → API |
| `GOOGLE_SPREADSHEET_ID` | From the sheet URL: `…/spreadsheets/d/THIS_PART/edit` |
| `GOOGLE_SHEET_NAME` | Tab name inside the spreadsheet (default: `Sheet1`) |
| `NOTIFY_EMAIL` | Your email for error alerts (optional) |
| `SMTP_*` | Gmail app password — see note below |

**Gmail app password (for email alerts)**
1. Go to myaccount.google.com → Security → 2-Step Verification → App passwords
2. Create a password for "Mail" + "Other device"
3. Use that 16-character password as `SMTP_PASS`

---

## Step 3 — Set up Google OAuth credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the JSON file and save it as `credentials.json` inside this folder
7. On first run you'll be prompted to authorize — paste the code and a `token.json`
   will be saved automatically. Subsequent runs are fully headless.

---

## Step 4 — Prepare your Google Sheet

1. Create a new Google Sheet (or use an existing one)
2. The script will auto-create the header row on first run:
   `Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes`
3. Copy the spreadsheet ID from the URL into your `.env`

---

## Step 5 — Test connections

Run this before the first scheduled run to confirm everything is wired up:

```bash
npm run test-connection
```

You will be prompted to authorize Google (one time only). After that you'll see:

```
Checking Apollo.io connection... OK — Authenticated as: you@domain.com
Checking Google Sheets connection... OK — Spreadsheet: "My HVAC Leads"

All connections OK. Ready to run the workflow.
```

---

## Step 6 — Run immediately (optional)

To pull the first batch of leads right now:

```bash
npm run run-once
```

---

## Step 7 — Start the daily scheduler

```bash
npm start
```

The process must stay running (e.g. in a screen session, tmux, or as a systemd
service) for the cron to fire. To run it as a background service:

**Linux systemd (recommended for VPS/server):**

```ini
# /etc/systemd/system/hvac-lead-gen.service
[Unit]
Description=HVAC Lead Gen Scheduler
After=network.target

[Service]
WorkingDirectory=/path/to/hvac-lead-gen
ExecStart=/usr/bin/node index.js
Restart=always
EnvironmentFile=/path/to/hvac-lead-gen/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable hvac-lead-gen
sudo systemctl start hvac-lead-gen
```

**Mac (launchd):** Use `launchctl` or just leave a Terminal tab running.

---

## Timezone note

The cron schedule is in **UTC**. The defaults are:

| Season | CRON_SCHEDULE | Fires at |
|---|---|---|
| Eastern Standard (Nov–Mar) | `0 12 * * *` | 7:00am ET |
| Eastern Daylight (Mar–Nov) | `0 11 * * *` | 7:00am ET |

Update `CRON_SCHEDULE` in `.env` when clocks change, or run the process on a
server that's already set to the Eastern timezone (set `TZ=America/New_York`).

---

## Customizing the city list

Edit `src/apollo.js` → `TARGET_CITIES` array. Each entry becomes its own
location query in Apollo for maximum geographic precision.

## Changing the max leads per run

Update `MAX_LEADS_PER_RUN` in `.env` (default: 25).

## Adding columns

Edit `src/sheets.js` → `COLUMNS` array and update the row-building loop in
`appendLeads()` to include the new value.

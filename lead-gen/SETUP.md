# HVAC Lead Gen — First-Run Setup Guide

This script pulls up to 25 HVAC/plumbing business owner contacts per day from Apollo.io
and appends them to your Google Sheet automatically at 7 AM Eastern.

---

## Prerequisites

- Node.js 18+ installed
- An Apollo.io account on the **Basic plan ($49/mo) or higher**
  (the People Search API is not available on the free tier)
- A Google Cloud project with the Sheets API enabled

---

## Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Set up Google Service Account credentials

This is a one-time setup. A Service Account lets the script write to your
Google Sheet automatically without re-authenticating.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" in the search bar → Enable
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `hvac-lead-gen` (anything works)
   - Click through, no extra roles needed
5. Click the service account → **Keys** tab → **Add Key → Create new key → JSON**
6. Download the JSON file and save it as `credentials.json` in the `lead-gen/` folder
7. Open `credentials.json` and copy the `client_email` value (looks like `xxx@project.iam.gserviceaccount.com`)
8. Open your Google Sheet → **Share** → paste that email → give **Editor** access

Your `credentials.json` is already in `.gitignore` so it won't be committed.

---

## Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | apollo.io → Settings → Integrations → API |
| `GOOGLE_SHEET_ID` | The long ID in your spreadsheet URL |
| `GOOGLE_CREDENTIALS_PATH` | Path to your `credentials.json` (default: `./credentials.json`) |
| `GOOGLE_SHEET_TAB` | The tab name at the bottom of your sheet (leave blank for first tab) |
| `MAX_LEADS_PER_RUN` | Default 25 — change to pull more or fewer leads per run |
| `NOTIFICATION_EMAIL` | Your email for error alerts |
| `GMAIL_USER` | Your Gmail address (for sending error emails) |
| `GMAIL_APP_PASSWORD` | A Gmail App Password — **not** your regular password. Create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) |

The Google Sheet ID for your existing "SW Michigan HVAC Leads" spreadsheet is already
pre-filled in `.env.example`:
```
GOOGLE_SHEET_ID=1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus
```

---

## Step 4 — Verify connections before the first run

```bash
node setup-check.js
```

You should see ✅ next to all four checks. If any fail, the output tells you exactly what to fix.

---

## Step 5 — Run manually to verify end-to-end

```bash
node run-once.js
```

Watch the console output. It will:
1. Read existing names from your sheet
2. Search Apollo for HVAC contacts in SW Michigan
3. Enrich phone numbers
4. Append up to 25 new rows to the sheet

Check your Google Sheet — new rows should appear within a minute.

---

## Step 6 — Start the scheduler

```bash
node index.js
```

This runs forever in the foreground and fires the workflow at **7:00 AM Eastern** every day.

### Keeping it running 24/7

If you close the terminal, the scheduler stops. Use one of these to keep it alive:

**Option A — PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

**Option B — screen:**
```bash
screen -S hvac-leads
node index.js
# Detach: Ctrl+A then D
# Reattach: screen -r hvac-leads
```

**Option C — systemd (Linux servers):**
Create `/etc/systemd/system/hvac-leads.service`:
```ini
[Unit]
Description=HVAC Lead Gen Scheduler
After=network.target

[Service]
WorkingDirectory=/path/to/lead-gen
ExecStart=/usr/bin/node index.js
Restart=always
User=your-username
EnvironmentFile=/path/to/lead-gen/.env

[Install]
WantedBy=multi-user.target
```
Then: `sudo systemctl enable hvac-leads && sudo systemctl start hvac-leads`

---

## Customizing the workflow

### Change target cities
Edit `src/apollo.js` → `SW_MICHIGAN_LOCATIONS` array. Add or remove city strings.

### Change industries
Edit `src/apollo.js` → `TARGET_SIC_CODES` and `TARGET_KEYWORD_TAGS`.
- SIC 1711 = Plumbing, Heating, Air-Conditioning (covers HVAC + plumbing)
- Add SIC 1731 = Electrical Work, or SIC 1741 = Masonry if you want to expand

### Change target job titles
Edit `src/apollo.js` → `TARGET_TITLES` array. Titles are searched in priority order.

### Change how many leads per run
Set `MAX_LEADS_PER_RUN` in your `.env`.

### Change the run time
Edit `index.js` → `SCHEDULE` constant. Format is standard cron:  `'0 7 * * *'` = 7 AM daily.
Examples: `'0 8 * * 1-5'` = 8 AM weekdays only, `'0 9 * * 1'` = 9 AM Mondays.

---

## Logs

All runs are logged to `run.log` in the `lead-gen/` folder.
To tail live output:  `tail -f run.log`

---

## Troubleshooting

| Error | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Upgrade to Apollo Basic plan or higher |
| `401 Unauthorized` from Apollo | Check `APOLLO_API_KEY` in .env |
| `403` from Google Sheets | Share the sheet with the service account email |
| `ENOENT credentials.json` | Save your Google credentials JSON as `credentials.json` in the `lead-gen/` folder |
| `No results from Apollo` | Try removing the SIC code filter or expanding the city list |
| `None have a phone number` | Phone reveal may require a higher Apollo plan (Professional+) |

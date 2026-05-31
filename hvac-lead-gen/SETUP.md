# HVAC Lead Generator — First-Time Setup

Runs every morning at **7:00 AM Eastern** and appends up to **25 new HVAC
owner contacts** from Southwest Michigan into your Google Sheet.

---

## What you need before starting

| Requirement | Where to get it |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Apollo.io account | https://www.apollo.io — Basic ($49/mo) recommended |
| Google account | sheets.google.com — create your target spreadsheet |
| Google Cloud Project | console.cloud.google.com — free |

---

## Step 1 — Get your Apollo.io API key

1. Log in to Apollo.io → click your avatar → **API Keys**
2. Copy your key (starts with something like `TF...`)
3. Keep it handy — you'll paste it into `.env`

**Apollo plan note:** The free tier allows only ~50 person exports/month.
Running at 25 leads/day × 30 days = 750 exports — you need at least the
**Basic plan ($49/mo)**. Check your limits at **Settings → Usage**.

---

## Step 2 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet**
2. Name it anything you like (e.g., "SW Michigan HVAC Leads")
3. The script will write the headers automatically on the first run.
   Your sheet will end up with these columns:

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

4. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ← COPY THIS PART →  /edit
   ```

---

## Step 3 — Create a Google Service Account

This gives the script permission to write to your sheet without a browser login.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. In the left menu → **APIs & Services** → **Enabled APIs** →
   click **+ ENABLE APIS AND SERVICES** → search for **Google Sheets API** → Enable it
4. Go to **APIs & Services** → **Credentials** →
   click **+ CREATE CREDENTIALS** → **Service account**
5. Give it any name (e.g., "hvac-lead-gen") → click **Create and continue** → **Done**
6. Click the service account you just created → **Keys** tab →
   **Add Key** → **Create new key** → **JSON** → Download
7. Rename the downloaded file to `credentials.json` and move it into
   the `hvac-lead-gen/` folder (next to `index.js`)
8. Copy the **service account email** (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)

9. **Share your Google Sheet with the service account:**
   Open your spreadsheet → click **Share** (top right) → paste the service account
   email → set role to **Editor** → click **Send**

---

## Step 4 — Configure environment variables

Inside `hvac-lead-gen/`, copy the example file:

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_key_here
GOOGLE_SPREADSHEET_ID=your_sheet_id_here
GOOGLE_CREDENTIALS_PATH=./credentials.json

# Optional — for email alerts when something goes wrong
ALERT_EMAIL=jgagliardo98@gmail.com
SMTP_USER=your.gmail@gmail.com
SMTP_PASS=your_gmail_app_password    # NOT your regular password — see note below
```

**Gmail App Password** (required if you use Gmail SMTP):
Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) →
Select app: **Mail** → Select device: **Other** → Generate → copy the 16-char password.

Leave `ALERT_EMAIL`/`SMTP_USER`/`SMTP_PASS` blank to skip email and rely on console logs only.

---

## Step 5 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 6 — Test the connection (do this before starting the scheduler)

```bash
npm run test-connection
```

Expected output:
```
╔══════════════════════════════════════════════╗
║  HVAC Lead Generator — Connection Test       ║
╚══════════════════════════════════════════════╝

1. Apollo.io API ... ✓  Connected (1240 contacts available for current filters)
2. Google Sheets ... ✓  Connected
   Spreadsheet : "SW Michigan HVAC Leads"
   Existing leads in sheet : 0

✓  All connections OK — ready to run.

  Start the scheduler : npm start
  Run one batch now   : npm run run-now
```

If either check fails, the error message will tell you exactly what is wrong
(wrong API key, missing credentials file, wrong spreadsheet ID, etc.).

---

## Step 7 — Run one batch manually to confirm everything works end-to-end

```bash
npm run run-now
```

This runs the full workflow immediately — no waiting for 7 AM.
Open your Google Sheet and you should see up to 25 new rows appear.

---

## Step 8 — Start the daily scheduler

```bash
npm start
```

The process stays running and fires at **7:00 AM Eastern Time every day**.
Keep it alive with a process manager so it survives reboots:

```bash
# Using PM2 (recommended for always-on)
npm install -g pm2
pm2 start index.js --name hvac-leads --cwd /path/to/hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to register on boot
```

Or just leave the terminal open if you only need it occasionally.

---

## Customising the search

All search settings are in `src/config.js`. No code changes required — just edit the values:

| Setting | What it controls |
|---|---|
| `targetCities` | Add/remove Southwest Michigan cities |
| `targetTitles` | Job titles to target (priority order) |
| `industryKeywords` | Industries Apollo searches for |
| `employeeRange` | Company size filter (default `['1,25']`) |
| `maxLeadsPerRun` | Leads per daily run (default `25`) |
| `sheetTabName` | Sheet tab name if yours isn't "Sheet1" |

---

## Troubleshooting

**Apollo returns 0 results**
- Check that your API key is valid and your plan has exports remaining
- Temporarily broaden the search: in `config.js` change `targetCities` to just `['Michigan, United States']`
- Check Apollo usage limits at Settings → Usage

**Google Sheets write fails**
- Make sure you shared the spreadsheet with the service account email (Step 3.9)
- Confirm `GOOGLE_SPREADSHEET_ID` matches the ID in your sheet URL
- Run `npm run test-connection` — it prints the exact error

**Scheduler runs at wrong time**
- The timezone is hardcoded to `America/New_York` in `index.js`
- If you are running the script on a server in a different timezone, this is still correct — node-cron handles the conversion

**Email alerts not arriving**
- Gmail requires an App Password, not your login password (see Step 4)
- Check your spam folder
- Email is optional — the console always logs errors even without email

---

## File structure reference

```
hvac-lead-gen/
├── index.js           ← entry point + cron scheduler
├── src/
│   ├── config.js      ← all tunable settings
│   ├── apollo.js      ← Apollo.io API client
│   ├── sheets.js      ← Google Sheets client
│   ├── workflow.js    ← main orchestration logic
│   └── notify.js      ← email + console alerts
├── credentials.json   ← your service account key (DO NOT commit)
├── .env               ← your API keys (DO NOT commit)
├── .env.example       ← template — safe to commit
├── package.json
└── SETUP.md           ← this file
```

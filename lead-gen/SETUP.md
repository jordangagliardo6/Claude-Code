# HVAC Lead Gen — Setup Guide

This tool pulls HVAC decision-makers for Southwest Michigan from Apollo.io and
appends them to a Google Sheet every morning at 7 AM Eastern — max 25 new leads
per run, no duplicates.

---

## What You Need

| Thing | Where to get it |
|---|---|
| Apollo.io account | [app.apollo.io](https://app.apollo.io) — free tier works, but Basic ($49/mo) unlocks phone numbers |
| Apollo API key | Apollo → Settings → Integrations → API |
| Google account | Any Gmail / Workspace account |
| Node.js ≥ 18 | [nodejs.org](https://nodejs.org) |

---

## Step 1 — Clone and install

```bash
cd lead-gen
npm install
```

---

## Step 2 — Create the Google Sheet and service account

### 2a. Create the spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new sheet.
2. Name the first tab **Sheet1** (default — or change `sheetTab` in `src/config.js`).
3. Add these exact headers in **row 1, columns A–I**:

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

4. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  ←THIS PART→  /edit
   ```

### 2b. Create a Google Cloud service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or use an existing one).
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Give it any name, click Done
5. Generate a JSON key:
   - Click on the service account → Keys tab → Add Key → Create new key → JSON
   - A `.json` file downloads automatically
6. Move that file into this project:
   ```bash
   mv ~/Downloads/your-project-xxxxx.json lead-gen/credentials/service-account.json
   ```

### 2c. Share the sheet with the service account

1. Open the service account JSON file and copy the `client_email` value.
   It looks like: `name@project-id.iam.gserviceaccount.com`
2. Open your Google Sheet → Share → paste that email → set role to **Editor** → Send.

---

## Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_key
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials/service-account.json
GOOGLE_SPREADSHEET_ID=your_sheet_id
ALERT_EMAIL=your_email@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
```

**Gmail App Password:** go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
create a password for "Mail", copy the 16-character code into `SMTP_PASS`.

> Email alerts are optional — if you leave them blank the workflow still runs
> and errors appear in the console.

---

## Step 4 — Test the connection

Run once immediately to confirm both APIs connect:

```bash
npm run test:connection
```

Watch the output. You should see:

```
[1/4] Searching Apollo.io...         ← Apollo connected ✓
[2/4] Connecting to Google Sheets... ← Sheets connected ✓
[3/4] Checking for duplicates...
[4/4] Writing N new lead(s)...
✓ Done — N lead(s) added
```

Check your Google Sheet — the leads should appear.

**Common errors and fixes:**

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Make sure `.env` exists and the key is correct |
| `Apollo API error (HTTP 401)` | API key is wrong or expired — regenerate in Apollo |
| `Apollo search returned 0 contacts with phone numbers` | Your Apollo plan may not include phone reveal — upgrade to Basic or enable credits |
| `GOOGLE_SERVICE_ACCOUNT_PATH is not set` | Check `.env` path matches where you put the JSON file |
| `Error: Could not load the default credentials` | The JSON file is missing or path is wrong |
| `The caller does not have permission` | You haven't shared the Google Sheet with the service account email |
| `GOOGLE_SPREADSHEET_ID is not set` | Copy the ID from the Sheet URL and paste it in `.env` |

---

## Step 5 — Start the scheduler

Once the test run succeeds:

```bash
npm start
```

The process logs `SCHEDULER RUNNING` and waits for 7 AM Eastern every day.

**Keep it running in the background (recommended):**

```bash
# Option A — PM2 (process manager, auto-restarts on crash)
npm install -g pm2
pm2 start src/index.js --name hvac-lead-gen
pm2 save          # survive reboots
pm2 startup       # generate a startup command

# Option B — nohup (simple, no auto-restart)
nohup npm start > lead-gen.log 2>&1 &

# View logs either way:
pm2 logs hvac-lead-gen
# or
tail -f lead-gen.log
```

---

## Customizing the workflow

All user-configurable settings are in **`src/config.js`**:

| Setting | What it controls |
|---|---|
| `cities` | List of Southwest Michigan cities to target |
| `jobTitles` | Decision-maker titles (Owner → President → Founder …) |
| `industryKeywords` | Industry tags Apollo matches against |
| `employeeRanges` | Company size filter (default: 1–25 employees) |
| `maxLeadsPerRun` | Max new rows added per daily run (default: 25) |
| `cronSchedule` | Cron expression for the schedule (default: `0 7 * * *`) |
| `cronTimezone` | Timezone for the schedule (default: `America/New_York`) |
| `sheetTab` | Name of the tab in your Google Sheet |
| `columns` | Column letters — update if you rearrange the sheet |

No other files need to change when you edit `config.js`.

---

## How deduplication works

Before writing, the script reads the entire **Business Name** column (column B)
from your sheet. Any candidate whose business name already appears in that column
is silently skipped. The check is case-insensitive and ignores leading/trailing spaces.

---

## A note on Apollo phone numbers

Apollo's free plan masks or omits phone numbers for most contacts.
The **Basic plan ($49/mo)** includes phone number reveals.

If your plan supports it, you can also enable **mobile number reveals** in:
Apollo → Settings → Credits → Phone Credits → turn on mobile unlocking.

The script already requests direct, mobile, corporate, and fallback numbers
in priority order — it just needs your plan to include them.

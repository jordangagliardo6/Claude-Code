# HVAC Lead Gen — Apollo.io → Google Sheets

Pulls up to 25 HVAC/plumbing decision-maker leads per day from Apollo.io and
appends them to a Google Spreadsheet. Runs automatically at **7:00am Eastern**
via node-cron. Duplicate-safe, zero dependencies on n8n.

---

## What it does

Each morning the script:

1. Searches Apollo.io for **Owners, Presidents, and Founders** of HVAC / plumbing
   companies (1–25 employees) in Southwest Michigan.
2. Filters out any contact that has no phone number.
3. Checks your spreadsheet for existing business names and skips duplicates.
4. Appends up to **25 new rows** with: Date Added, Business Name, Owner First/Last
   Name, Phone Number, City, Website, Called (blank), Notes (blank).
5. Emails you an alert (if SMTP is configured) if anything fails.

---

## Quick-start

### 1. Install dependencies

```bash
cd lead-gen
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | What to put there |
|---|---|
| `APOLLO_API_KEY` | Your Apollo.io API key |
| `GOOGLE_SPREADSHEET_ID` | The ID from your Google Sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON of your service account key *(see below)* |
| `NOTIFICATION_EMAIL` | Your email for error alerts |
| `SMTP_*` | Your SMTP credentials *(see below)* |

### 3. Set up Google Sheets access

**Option A — Service Account (recommended):**

1. In [Google Cloud Console](https://console.cloud.google.com), create a project
   (or reuse one).
2. Enable the **Google Sheets API**.
3. Go to **IAM & Admin → Service Accounts** → Create a service account.
4. Create a JSON key for the service account and download it.
5. Open your Google Sheet → **Share** → paste the service account email (ends in
   `@...iam.gserviceaccount.com`) with **Editor** permission.
6. Set the env variable:
   - Paste the raw JSON content as `GOOGLE_SERVICE_ACCOUNT_JSON` (single line), **or**
   - Save the file as `google-service-account.json` and set
     `GOOGLE_SERVICE_ACCOUNT_FILE=./google-service-account.json`

**Option B — OAuth2 (personal Google account):**

If you prefer to use your own Google account instead of a service account,
set `GOOGLE_CREDENTIALS_FILE` to the path of your OAuth2 credentials JSON
(downloaded from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0).
You will need to complete the OAuth flow once in a browser before the script
can run unattended.

### 4. Create your Google Sheet

Create a new Google Sheet. The script will write header row automatically on
the first run. Make sure the sheet tab is named **Sheet1** (or update
`sheetName` in `config.js`).

Copy the sheet ID from the URL:
```
https://docs.google.com/spreadsheets/d/[THIS_IS_YOUR_ID]/edit
```

### 5. Configure SMTP for error alerts *(optional but recommended)*

For **Gmail**, create an [App Password](https://myaccount.google.com/apppasswords)
(requires 2FA to be on). Use the 16-character App Password as `SMTP_PASS`.

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

---

## First run — verify everything works

```bash
npm run test-connection
```

This checks Apollo connectivity, phone-number access, Google Sheets access,
and SMTP config. Fix any errors before proceeding.

```
  1. Apollo.io API key         … OK  (4,821 potential leads found in Michigan)
  2. Apollo phone number access … OK  (2/3 sample contacts have phone numbers)
  3. Google Sheets connection   … OK  (connected to: "SW Michigan HVAC Leads")
  4. Notification email config  … OK  (alerts → you@gmail.com via smtp.gmail.com)

All checks passed.
```

Then do a manual run to populate the sheet before the first scheduled run:

```bash
npm run run-now
```

---

## Running the scheduler

```bash
npm start
```

The process stays alive and fires at 7:00am Eastern every morning.
For production use, run it under a process manager like **PM2**:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

Or create a system cron job that runs the script once daily and exits:

```cron
0 7 * * * cd /path/to/lead-gen && /usr/bin/node index.js --run-now >> /var/log/hvac-leads.log 2>&1
```

---

## Customization

All search parameters are in **`config.js`**:

| Setting | What it controls |
|---|---|
| `targetCities` | Add/remove Southwest Michigan cities |
| `targetTitles` | Job titles to target (priority order) |
| `companySizeRanges` | Employee count filter (default: 1–25) |
| `maxLeadsPerRun` | Max new rows added per day (default: 25) |
| `cronSchedule` | When the job runs (default: `0 7 * * *`) |
| `columns` | Spreadsheet column headers |
| `sheetName` | Name of the sheet tab (default: `Sheet1`) |

---

## Apollo plan notes

Apollo's **free tier** does not include direct/mobile phone numbers. You need
**Basic ($49/mo)** or higher to get phone data in search results. The
`test-connection` script will warn you if your plan doesn't return phone numbers.

---

## Error handling

- Every run is wrapped in try/catch. Errors are always logged to console.
- If `NOTIFICATION_EMAIL` and SMTP vars are set, an email alert is sent.
- If Apollo returns 0 leads, the script logs a detailed warning and alerts you.
- If the Sheets write fails, it alerts you — no partial writes occur.
- The scheduler keeps running even after an error; the next day's run is unaffected.

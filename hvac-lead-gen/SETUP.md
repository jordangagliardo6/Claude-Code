# HVAC Lead Generation Workflow — Setup Guide

This workflow searches Apollo.io for HVAC owner-operators in Southwest Michigan
and appends new leads to a Google Sheet every morning at 7 AM Eastern Time.

---

## Prerequisites

- Node.js 18 or newer (`node --version`)
- An Apollo.io account (free tier works; paid gives more contacts)
- A Google account with Google Sheets

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Get your Apollo.io API key

1. Log into [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your **API Key**

---

## Step 3 — Set up Google Sheets access (service account)

Google requires server-to-server auth via a **service account**.

### 3a. Create a service account

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Give it any name, click Done
5. Click the service account → **Keys** tab → **Add Key → JSON**
6. Download the JSON file and save it as `google-credentials.json` inside
   the `hvac-lead-gen/` folder

### 3b. Share your spreadsheet with the service account

1. Open (or create) the Google Spreadsheet you want to write to
2. Click **Share** and paste the service account email
   (it looks like `something@your-project.iam.gserviceaccount.com`)
3. Give it **Editor** access
4. Copy the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

---

## Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key_here
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_NAME=Leads          # or whatever your tab is named
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-credentials.json
ALERT_EMAIL=you@example.com
MAX_LEADS_PER_RUN=25
```

---

## Step 5 — Test both connections

Run this before the first scheduled execution:

```bash
node index.js --test
```

Expected output:
```
[INFO ] Running connection tests...
[OK   ] Apollo.io connection verified.
[OK   ] Google Sheets: header row found → [Date Added, Business Name, ...]
[OK   ] All connections OK — you are ready to run the workflow.
```

If the sheet is **empty**, the test will write the header row automatically.

---

## Step 6 — Do a manual test run

Pull your first batch of leads immediately (doesn't wait for 7am):

```bash
node index.js --run-once
```

Open your Google Sheet and verify rows appeared.

---

## Step 7 — Start the scheduler

```bash
node index.js
```

This keeps the process running. The workflow fires at **7:00 AM Eastern**
every day. Output is logged to the console and to `workflow.log`.

### Running as a background service (optional)

**Using pm2 (recommended for servers):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

**Using a system cron job instead of node-cron:**
If you prefer the OS scheduler over keeping the Node process alive, add this
to your crontab (`crontab -e`) and use `--run-once`:
```
0 12 * * * cd /path/to/hvac-lead-gen && node index.js --run-once >> workflow.log 2>&1
```
(12:00 UTC = 7:00 AM EST / 8:00 AM EDT — adjust for daylight saving)

---

## Customizing the workflow

| What you want to change | Where to change it |
|---|---|
| Add or remove cities | `src/config.js` → `targetCities` |
| Change job titles | `src/config.js` → `jobTitles` |
| Change industries | `src/config.js` → `industries` |
| Change employee range | `src/config.js` → `employeeRanges` |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` or `src/config.js` |
| Add a spreadsheet column | `src/config.js` → `headers`, then `src/sheets.js` → `buildRow()` |
| Change schedule time | `src/config.js` → `cronExpression` |

---

## Error handling

- If Apollo returns no results, the workflow logs the error and exits cleanly.
- If the Google Sheets write fails, the error is logged to `workflow.log`.
- All errors print a human-readable message telling you what to check.
- To add email alerts, see the commented `nodemailer` block in `src/workflow.js`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `APOLLO_API_KEY not set` | Copy `.env.example` to `.env` and fill in your key |
| `Google credentials file not found` | Make sure `google-credentials.json` is in the project folder |
| `The caller does not have permission` | Share the spreadsheet with the service account email |
| Apollo returns 0 results | Try broadening industries or removing employee range filter |
| Duplicate rows appearing | Check that `GOOGLE_SHEET_NAME` matches your actual tab name exactly |

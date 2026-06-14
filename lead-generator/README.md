# HVAC Lead Generator — Southwest Michigan

Runs every morning at 7 AM Eastern Time, searches Apollo.io for HVAC/Plumbing company owners in Southwest Michigan, and appends up to 25 new leads per day to a Google Sheet — skipping any business already in the list.

---

## What It Does

- **Searches Apollo.io** for decision-makers (Owner, President, Founder, Co-Founder, General Manager) at HVAC, Heating & Air Conditioning, Plumbing, and Mechanical Contracting companies with 1–25 employees in Southwest Michigan.
- **Targets these cities:** St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven.
- **Deduplicates** against the Business Name column in your Google Sheet — never adds the same company twice.
- **Appends rows** with: Date Added, Business Name, Owner First Name, Owner Last Name, Phone Number, City, Website, Called (blank), Notes (blank).
- **Sends you a notification** (console + optional email) if Apollo returns no results or the Sheet write fails.

---

## First-Time Setup

### 1. Install Dependencies

```bash
cd lead-generator
npm install
```

### 2. Get Your Apollo API Key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

> **Note on phone numbers:** Apollo returns phone numbers based on your plan. If numbers appear masked (e.g. `+1 616 XXX XXXX`), your plan may require Phone Credits to reveal them. The script filters out contacts with no phone data at all.

### 3. Set Up Google Sheets Access (Service Account)

This is a one-time process that lets the script write to your Sheet automatically.

**a. Create a Google Cloud project (if you don't have one):**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project**, name it anything (e.g. "Lead Generator")

**b. Enable the Google Sheets API:**
1. In your project, go to **APIs & Services → Library**
2. Search for "Google Sheets API" and click **Enable**

**c. Create a Service Account:**
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it (e.g. "lead-generator"), click **Done**
4. Click the service account you just created
5. Go to the **Keys** tab → **Add Key → Create new key → JSON**
6. A JSON file downloads — **save it as `google-service-account.json`** inside the `lead-generator/` folder

**d. Share your Google Sheet with the service account:**
1. Open the service account JSON file and copy the `client_email` value (looks like `something@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet
3. Click **Share**, paste that email, set role to **Editor**, click **Send**

**e. Get your Spreadsheet ID:**
- Open your Google Sheet. The URL looks like: `https://docs.google.com/spreadsheets/d/`**`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`**`/edit`
- Copy the bold part — that's your Spreadsheet ID.

### 4. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY` — your Apollo key
- `SPREADSHEET_ID` — the ID from the Sheet URL
- `SHEET_NAME` — tab name in the spreadsheet (default: `Sheet1`)
- `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` — path to the JSON key file (default: `./google-service-account.json`)
- `NOTIFICATION_EMAIL` — your email for error alerts
- SMTP settings — for email notifications (optional; see `.env.example`)

### 5. Verify Both Connections

```bash
node test-connection.js
```

You should see:
```
✅  Apollo connected — account: Your Name
✅  Google Sheets connected — spreadsheet: "Your Sheet Name"
     Tabs found: Sheet1
     Using tab: "Sheet1"

✅  All connections verified.
```

Fix any errors shown before proceeding.

---

## Running the Script

### Pull your first batch of leads right now:
```bash
node run-now.js
```

### Start the daily 7 AM scheduler:
```bash
node index.js
```

Keep this process running (e.g. with `pm2`, `screen`, or as a system service). It will fire automatically at 7 AM Eastern each morning.

**To keep it running in the background with pm2:**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customizing

Everything you'd want to change is near the top of each source file:

| What to change | File | Variable |
|---|---|---|
| Target cities | `src/apollo.js` | `TARGET_CITIES` |
| Job titles | `src/apollo.js` | `TARGET_TITLES` |
| Industry keywords | `src/apollo.js` | `INDUSTRY_KEYWORDS` |
| Max leads per run | `.env` | `MAX_LEADS_PER_RUN` |
| Sheet column layout | `src/sheets.js` | `HEADER_ROW` |
| Schedule time | `index.js` | cron expression `'0 7 * * *'` |

---

## File Structure

```
lead-generator/
  index.js              ← Scheduler (node-cron, 7am ET daily)
  run-now.js            ← One-shot manual trigger
  test-connection.js    ← Verify both APIs before first run
  package.json
  .env.example          ← Template — copy to .env and fill in
  .gitignore            ← Keeps .env and service account key out of git
  src/
    workflow.js         ← Main orchestration logic
    apollo.js           ← Apollo API search + lead formatting
    sheets.js           ← Google Sheets read/write
    notifier.js         ← Console + email error alerts
    state.js            ← Tracks Apollo pagination across runs
    logger.js           ← Timestamped logs to console + file
  state/
    search-state.json   ← Created at runtime (not tracked by git)
  logs/
    YYYY-MM-DD.log      ← Daily log files (not tracked by git)
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Copy `.env.example` to `.env` and add your key |
| Apollo returns 0 leads | Leads may not have phones on your plan; check Apollo's Phone Credits |
| `PERMISSION_DENIED` on Sheets | Share the Sheet with the service account `client_email` address |
| `The caller does not have permission` | Check that Sheets API is enabled in Google Cloud Console |
| Email alerts not sending | Verify SMTP settings; for Gmail use an App Password (not your real password) |

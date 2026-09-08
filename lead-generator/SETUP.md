# HVAC Lead Generator — Setup Guide

## What this does
Runs every morning at 7 AM Eastern. Searches Apollo.io for HVAC business owners
in Southwest Michigan (St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven,
Muskegon, South Haven) and appends up to 25 new leads per day to your Google Sheet.
Skips any business already in the sheet — no duplicates.

---

## Step 1 — Install Node.js dependencies

```bash
cd lead-generator
npm install
```

---

## Step 2 — Get your Apollo API key

1. Log in at https://app.apollo.io
2. Go to **Settings → Integrations → API**
3. Copy your API key

> ⚠ The People Search endpoint (`/api/v1/mixed_people/search`) requires a **paid Apollo plan**.
> The free plan will block the search. Upgrade at https://www.apollo.io/pricing

---

## Step 3 — Set up Google Sheets access (Service Account)

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API** on that project
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Name it something like `hvac-lead-writer`
6. Click **Create and Continue** (no special roles needed at project level)
7. On the service account page, go to **Keys → Add Key → Create new key → JSON**
8. Download the JSON file — this is your credentials file
9. **Share your Google Sheet** with the service account email
   (looks like `hvac-lead-writer@your-project.iam.gserviceaccount.com`)
   and give it **Editor** access

---

## Step 4 — Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key_here

GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
# The ID is the long string in the Google Sheets URL:
# https://docs.google.com/spreadsheets/d/THIS_PART/edit

GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

Your existing spreadsheet IDs (pick one to use as your master sheet):
- **SW Michigan HVAC Leads** (from Aug 23):
  `1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo`
- **SW Michigan HVAC Leads — New Sept 7 2026** (from Sept 7):
  `1bs4LBoiWC0tf1U4jImlTWO-zrs7bXPmFErTV_aBr0nM`
- **SW Michigan HVAC Leads — New Sept 8 2026** (from Sept 8 — today, starts empty):
  `15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU`

---

## Step 5 — Verify connectivity (run once manually)

```bash
node index.js --verify
```

You should see:
```
✓ Connected to Google Sheets
✓ Loaded N existing entries for duplicate check
  Fetching Apollo page 1…
✓ Found N new leads with phone numbers
✓ Appended N leads to spreadsheet
```

If you see `✓` marks for both Apollo and Google Sheets, you're ready.

---

## Step 6 — Run the scheduler

```bash
node index.js
```

This starts the cron scheduler and runs every morning at 7:00 AM Eastern.
Keep it running with a process manager:

### Option A — PM2 (recommended)
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

### Option B — systemd (Linux servers)
Create `/etc/systemd/system/hvac-leads.service` — ask Claude Code to generate
it for your system.

### Option C — macOS LaunchAgent
Ask Claude Code to generate a `.plist` file for your Mac.

---

## Customizing the workflow

Everything you'd want to change is in the `CONFIG` block at the top of `index.js`:

| What to change | Where |
|---|---|
| Cities to target | `CONFIG.cities` |
| Industry keywords | `CONFIG.industryKeywords` |
| Job titles | `CONFIG.jobTitles` |
| Company size | `CONFIG.employeeRanges` |
| Leads per run | `CONFIG.maxLeadsPerRun` |
| Sheet tab name | `CONFIG.sheetName` |

---

## Error notifications

Errors are always logged to the console. To also receive email alerts:

1. Get a [SendGrid](https://sendgrid.com) free API key (100 emails/day free)
2. Add to `.env`:
   ```
   SENDGRID_API_KEY=your_sendgrid_key_here
   ```

Alerts go to `jgagliardo98@gmail.com` (set in `CONFIG.notificationEmail`).

# HVAC Lead Gen — Setup Guide

Run this once from top to bottom before the scheduler goes live.
The connection test at the end will confirm everything is wired up correctly.

---

## What you need

| Requirement | Source |
|---|---|
| Node.js 18+ | https://nodejs.org |
| Apollo.io account | https://app.apollo.io |
| Google account with Sheets access | Already set up |
| (Optional) Gmail App Password | For error email alerts |

---

## Step 1 — Install dependencies

```bash
cd leadgen
npm install
```

---

## Step 2 — Configure Apollo API key

1. Go to **https://app.apollo.io → Settings → API Keys**
2. Create a new key (or copy an existing one)
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Open `.env` and paste your key:
   ```
   APOLLO_API_KEY=your_actual_key_here
   ```

> **Plan note:** The People Search endpoint returns phone numbers only if your
> Apollo plan includes **Phone Unlocks**. The Basic plan ($49/mo) includes 1,000
> unlocks/month, which is well above the 25-leads/day cap in this script.
> If you're on a free plan, the script will still run but will log a warning
> about missing phone numbers.

---

## Step 3 — Set up Google Sheets API access

The script uses a **Service Account** so it can write to the sheet on a schedule
without requiring you to be logged in.

### 3a. Create a Google Cloud project

1. Go to **https://console.cloud.google.com**
2. Click the project dropdown at the top → **New Project**
3. Name it anything (e.g. "Lead Gen") and click **Create**

### 3b. Enable the Google Sheets API

1. In your new project, go to **APIs & Services → Library**
2. Search for **"Google Sheets API"** and click **Enable**

### 3c. Create a service account

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Name it (e.g. "lead-gen-bot") → click **Done**
4. Click the new service account → **Keys** tab → **Add Key → Create new key**
5. Choose **JSON** → **Create** — a `.json` file downloads automatically

### 3d. Share the spreadsheet with the service account

1. Open the downloaded JSON file and copy the `client_email` value
   (looks like `lead-gen-bot@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet:
   **https://docs.google.com/spreadsheets/d/1Wm5m8AWGeZJDdBnHNxtd0SosrrEH_aQrzZmYUXnTMoE/edit**
3. Click **Share** → paste the service account email → set permission to **Editor** → **Send**

### 3e. Add the credentials to your .env

**Option A — Paste JSON as environment variable (recommended for servers):**

```bash
# On Mac/Linux:
cat ~/Downloads/your-service-account-key.json | tr -d '\n'
```

Copy the output and paste it as the value of `GOOGLE_SERVICE_ACCOUNT_JSON` in your `.env`:

```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...entire JSON on one line..."}
```

**Option B — Place the file directly (simpler for local use):**

```bash
cp ~/Downloads/your-service-account-key.json leadgen/credentials.json
```

Leave `GOOGLE_SERVICE_ACCOUNT_JSON` blank in `.env`. The script checks for the file automatically.

---

## Step 4 — (Optional) Set up email notifications

Error alerts use Gmail. A regular Gmail password won't work — you need an **App Password**.

1. Go to **https://myaccount.google.com/apppasswords**
2. Select app: **Mail**, device: **Other** → name it "Lead Gen" → **Generate**
3. Copy the 16-character password and add to `.env`:
   ```
   SMTP_USER=your_gmail@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx
   ```

If you skip this step, errors are still logged to the console — you just won't get email alerts.

---

## Step 5 — Test your connections

```bash
node test-connection.js
```

Expected output when everything is working:

```
────────────────────────────────────────────────────────────
  HVAC Lead Gen — Connection Test
────────────────────────────────────────────────────────────

[1/3] Testing Apollo.io connection...
  ✓  APOLLO_API_KEY is set
  ✓  Apollo API reachable (status 200)

[2/3] Testing Google Sheets connection...
  ✓  GOOGLE_SERVICE_ACCOUNT_JSON env var is set
  ✓  Service account: lead-gen-bot@your-project.iam.gserviceaccount.com
  ✓  Sheet accessible: "Date Added, Business Name, Owner First Name, ..."
  ✓  Current lead count: 0 row(s)

[3/3] Testing email notifications (optional)...
  ✓  SMTP verified — will send alerts from your_gmail@gmail.com

────────────────────────────────────────────────────────────
  Results: 5 passed, 0 failed
────────────────────────────────────────────────────────────

  All checks passed. You are ready to run:

    node leadgen.js --run-now   ← one immediate run
    node leadgen.js             ← scheduler only (7am ET daily)
```

Fix any ✗ failures before continuing.

---

## Step 6 — Run it

**One immediate test run (does NOT wait for 7am):**
```bash
node leadgen.js --run-now
```

Check your spreadsheet — new leads should appear within a minute.

**Start the daily scheduler:**
```bash
node leadgen.js
```

This process must stay running. On a server or always-on machine, use `pm2` to keep it alive:

```bash
npm install -g pm2
pm2 start leadgen.js --name lead-gen
pm2 save
pm2 startup   # makes it restart on reboot
```

---

## Customizing the script

All editable settings are in the `CONFIG` block at the top of `leadgen.js`:

| Setting | What it does |
|---|---|
| `cities` | Add/remove target cities (one Apollo query per city) |
| `industryKeywords` | Apollo keyword tags used to filter company type |
| `jobTitlePriority` | Title ranking — first match per company wins |
| `employeeRange` | Apollo employee-count filter (`"1,25"` = owner-operated) |
| `maxLeadsPerRun` | Rows added per daily run (default: 25) |
| `spreadsheetId` | ID of the target Google Sheet |
| `notificationEmail` | Where error alerts go |

---

## Google Sheet columns

| Col | Field | Filled by |
|---|---|---|
| A | Date Added | Script |
| B | Business Name | Script |
| C | Owner First Name | Script |
| D | Owner Last Name | Script |
| E | Phone Number | Script |
| F | City | Script |
| G | Website | Script |
| H | Called | **You** |
| I | Notes | **You** |

The script only ever appends to the bottom. It never modifies or deletes existing rows.

---

## Troubleshooting

**Apollo returns 0 results**
- Check `APOLLO_API_KEY` is correct and the account is active
- Try running with `--run-now` and watch the per-city output
- The NAICS code filter (`238220`) is narrow — remove `naicsCodes` from the payload in `leadgen.js` if needed

**Apollo results have no phone numbers**
- You need a plan that includes Phone Unlocks (Apollo Basic or higher)
- The script logs a clear warning in this case

**Google Sheets — 403 PERMISSION_DENIED**
- The service account email isn't sharing the sheet
- Go to the sheet → Share → add the service account email as Editor

**Script stops after --run-now**
- That's expected: `--run-now` triggers immediately AND keeps the scheduler running
- The process stays alive waiting for the 7am trigger — don't close the terminal

**Duplicate entries appear**
- The deduplication key is the Business Name (column B), case-insensitive
- Two companies with slightly different name spellings will both be added

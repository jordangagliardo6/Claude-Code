# HVAC Lead Gen — Setup Guide

Automated daily pull of HVAC owner leads in Southwest Michigan into your Google Sheet.

---

## Requirements

- Node.js 18 or higher
- An **Apollo.io paid plan** (Basic or above) — the People Search API is not available on the free plan
- A Google Cloud project with the **Google Sheets API** enabled

---

## Step 1 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. Paste it as `APOLLO_API_KEY` in your `.env` file

> **Important:** The people search endpoint (`/api/v1/mixed_people/api_search`) requires a **paid plan**. If you're on the free plan you'll see `API_INACCESSIBLE`. Upgrade at https://www.apollo.io/pricing (Basic plan is sufficient).

---

## Step 3 — Google Sheets credentials

### 3a. Create a Google Cloud project & service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Library → search "Google Sheets API" → Enable
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it a name (e.g. `hvac-lead-gen`) and click **Create**
6. Skip optional role/access steps, click **Done**
7. Click the service account you just created → **Keys** tab → **Add Key → Create new key → JSON**
8. A `.json` file downloads — keep it safe, it's your credentials

### 3b. Share the spreadsheet with the service account

1. Open the service account JSON file — copy the `client_email` field (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet
3. Click **Share**, paste the client email, set role to **Editor**, click **Share**

### 3c. Set environment variables

**Option A — file path (local machine):**
```
GOOGLE_SERVICE_ACCOUNT_PATH=/Users/yourname/Downloads/service-account.json
```

**Option B — inline JSON (server / CI):**
```
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":...}
```

---

## Step 4 — Configure `.env`

```bash
cp .env.example .env
# Then edit .env with your actual values
```

Key values to set:
| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key |
| `GOOGLE_SPREADSHEET_ID` | From the spreadsheet URL |
| `GOOGLE_SHEET_NAME` | The tab name (default: `Sheet1`) |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | Path to your JSON key file |

Your spreadsheet ID is already pre-filled with the most recent sheet:
`15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU`

---

## Step 5 — Verify connections before first scheduled run

Run this before leaving the scheduler on overnight:

```bash
node index.js --run-now
```

This will:
1. Verify your Apollo API key works
2. Verify your Google Sheets credentials work
3. Run one immediate pull (up to 25 leads) and write results
4. Print clearly if anything fails

If you see `✓ Apollo connected` and `✓ Google Sheets connected`, both are good.

---

## Step 6 — Start the scheduler

```bash
node index.js
```

The process stays alive and fires at **7:00 AM Eastern every morning**.
Use `pm2` or `screen` to keep it running when you close the terminal:

```bash
# Using pm2 (recommended)
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # auto-start on reboot
```

---

## Customization

All tunable settings live in **`config.js`**:

| Setting | What it controls |
|---|---|
| `SW_MICHIGAN_CITIES` | Cities to filter for |
| `JOB_TITLES` | Target job titles |
| `EMPLOYEE_RANGES` | Company size filter |
| `MAX_LEADS_PER_RUN` | Max rows added per run |
| `CRON_SCHEDULE` | Run time (cron syntax) |
| `CRON_TIMEZONE` | Timezone for the schedule |

---

## Error alerts

Currently, errors are logged to the console with a clear `ALERT:` block.

To also receive **email alerts**, install nodemailer and uncomment the email section in `index.js`:

```bash
npm install nodemailer
```

Then in `index.js`, uncomment `sendAlertEmail(...)` and implement the function using your SMTP or Gmail credentials.

---

## Spreadsheet columns

| Column | Auto-filled? |
|---|---|
| Date Added | ✓ |
| Business Name | ✓ |
| Owner First Name | ✓ |
| Owner Last Name | ✓ |
| Phone Number | ✓ |
| City | ✓ |
| Website | ✓ |
| Called | blank — you fill in |
| Notes | blank — you fill in |

# HVAC Lead Gen Workflow — Setup Guide

## What this does
Every morning at 7 AM Eastern Time this tool:
1. Queries Apollo.io for HVAC / plumbing / mechanical contractors in Southwest Michigan
2. Filters for owner-operated companies (1–25 employees) whose owners have a direct phone number
3. Appends up to 25 new leads into your Google Sheet, skipping any business already listed
4. Logs every run to `logs/workflow.log`

---

## Step 1 — Install Node.js (if needed)
You need Node.js 18 or newer.

```bash
node --version   # should print v18.x.x or higher
```

Download from https://nodejs.org if missing.

---

## Step 2 — Install dependencies

```bash
cd lead-gen
npm install
```

---

## Step 3 — Get your Apollo.io API key

1. Log in to https://app.apollo.io
2. Go to **Settings → Integrations → API**
3. Click **Generate API Key** (or copy an existing one)
4. Keep it — you'll paste it into `.env` in Step 5

> Your Apollo plan must include **people search** and **phone number** access.
> Basic free plans have limited phone data; a Professional or higher plan is recommended.

---

## Step 4 — Set up Google Sheets access (service account)

### 4a — Create a Google Cloud project (skip if you have one)
1. Go to https://console.cloud.google.com
2. Click **Select a project → New Project**, name it anything (e.g. "Lead Gen")
3. Click **Create**

### 4b — Enable the Google Sheets API
1. In your project, go to **APIs & Services → Library**
2. Search for **Google Sheets API** → click it → **Enable**

### 4c — Create a service account
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → Service Account**
3. Give it a name (e.g. "lead-gen-bot"), click **Create and Continue**
4. Skip the optional role step, click **Done**

### 4d — Download the JSON key
1. Click the service account you just created
2. Go to the **Keys** tab → **Add Key → Create new key → JSON**
3. Download the file
4. Rename it `google-service-account.json`
5. Move it into the `lead-gen/credentials/` folder

### 4e — Share your Google Sheet with the service account
1. Open (or create) the Google Sheet you want leads added to
2. Click **Share**
3. Paste the service account's email — it looks like:
   `lead-gen-bot@your-project.iam.gserviceaccount.com`
   (found on the service account's detail page in Google Cloud)
4. Give it **Editor** access → **Send**

### 4f — Copy your Sheet ID
Your sheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
The Sheet ID is the long string between `/d/` and `/edit`:
```
1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

---

## Step 5 — Create your `.env` file

Copy the example and fill it in:

```bash
cp .env.example .env
```

Open `.env` and set:

```env
APOLLO_API_KEY=paste_your_apollo_key_here
GOOGLE_SHEET_ID=paste_your_sheet_id_here
GOOGLE_SHEET_TAB=Sheet1              # change if your tab has a different name
GOOGLE_CREDENTIALS_PATH=./credentials/google-service-account.json
NOTIFICATION_EMAIL=you@example.com   # for error alerts
MAX_LEADS_PER_RUN=25
CRON_SCHEDULE=0 7 * * *              # 7:00 AM daily
TIMEZONE=America/New_York
```

---

## Step 6 — Test both connections

Run this before your first scheduled run to confirm everything is wired up:

```bash
node index.js --test-connection
```

Expected output:
```
[2025-01-15 09:00:00] INFO : Testing connections…
[2025-01-15 09:00:01] INFO :   ✓  Apollo.io — connected
[2025-01-15 09:00:02] INFO :   ✓  Google Sheets — connected
```

If either shows ✗, re-check that step and run again before continuing.

---

## Step 7 — Run the workflow once manually

Trigger a single cycle to confirm leads actually flow into your sheet:

```bash
node index.js --run-now
```

Then open your Google Sheet and verify rows were added with today's date.

---

## Step 8 — Start the scheduler

Once both tests pass, start the long-running process:

```bash
node index.js
```

The process prints the schedule and stays alive. It will run at 7 AM Eastern every day.

### Keeping it alive on a server / VPS

Use **PM2** (recommended):
```bash
npm install -g pm2
pm2 start index.js --name "lead-gen"
pm2 save
pm2 startup    # follow the printed instructions to auto-start on reboot
```

Or use a **systemd** service — ask for a template if needed.

---

## Customisation cheat-sheet

| What to change | Where |
|---|---|
| Add / remove cities | `src/apollo.js` → `TARGET_CITIES` array |
| Change job titles | `src/apollo.js` → `TITLE_PRIORITY` array |
| Change industry keywords | `src/apollo.js` → `INDUSTRY_KEYWORDS` array |
| Reorder sheet columns | `src/sheets.js` → `COLUMNS` array |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Change schedule | `.env` → `CRON_SCHEDULE` (crontab.guru for help) |
| Enable email alerts | `src/notifier.js` — uncomment the nodemailer block |

---

## Log files

| File | Contents |
|---|---|
| `logs/workflow.log` | Full info + error output, last 5 runs rotated |
| `logs/errors.log` | Error-only log for quick scanning |

---

## Troubleshooting

**Apollo returns 0 results**
- Verify your API key has People Search access
- Try widening the industry keywords or removing the city filter temporarily

**Google Sheets write fails with "403 Forbidden"**
- The service account email is not shared on the sheet (re-do Step 4e)

**Google Sheets write fails with "404 Not Found"**
- Wrong `GOOGLE_SHEET_ID` or wrong `GOOGLE_SHEET_TAB` name in `.env`

**Process exits immediately**
- Run `node index.js --test-connection` and fix whichever service shows ✗

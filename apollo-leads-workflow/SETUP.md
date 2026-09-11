# HVAC Lead Generation Workflow — Setup Guide

Pulls up to 25 new HVAC leads per day from Apollo.io and appends them to your
**SW Michigan HVAC Leads** Google Sheet every morning at 7 AM Eastern.

---

## What you need

| Requirement | Notes |
|---|---|
| Node.js 18+ | `node --version` to check |
| Apollo.io account | Basic plan ($49/mo) recommended for daily runs |
| Google Cloud project | Free — just needs Sheets API enabled |

---

## Step 1 — Get your Apollo API key

1. Log in to [apollo.io](https://www.apollo.io)
2. Go to **Settings → Integrations → API**
3. Click **Create API Key** and copy it

> **Plan note:** The People Search endpoint (`/v1/mixed_people/search`) requires
> a paid Apollo plan. On the Basic plan you get 1,000 enrichments/month —
> plenty for 25 leads × 30 days = 750/month.

---

## Step 2 — Create a Google Cloud service account

This is what lets the script write to your spreadsheet without you being logged in.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or pick an existing one)
3. **Enable the Sheets API:**
   - Search for "Google Sheets API" in the top bar
   - Click **Enable**
4. **Create a service account:**
   - Go to **IAM & Admin → Service Accounts**
   - Click **Create Service Account**
   - Name it anything, e.g. `hvac-leads-bot`
   - Click **Done** (no extra roles needed at project level)
5. **Download the key:**
   - Click your new service account → **Keys** tab
   - **Add Key → Create new key → JSON**
   - Save the downloaded file somewhere safe, e.g. `~/keys/hvac-leads-key.json`
6. **Copy the service account email** (looks like `hvac-leads-bot@your-project.iam.gserviceaccount.com`)

---

## Step 3 — Share your spreadsheet with the service account

1. Open your [SW Michigan HVAC Leads sheet](https://docs.google.com/spreadsheets/d/15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU/edit)
2. Click **Share**
3. Paste the service account email from Step 2
4. Set access to **Editor**
5. Click **Send**

> The script reads existing rows (for deduplication) and appends new ones.
> Editor access is required for both.

---

## Step 4 — Install and configure

```bash
cd apollo-leads-workflow
npm install

# Copy the example env file and fill in your values
cp .env.example .env
nano .env   # or open in your editor
```

Your `.env` should look like:

```
APOLLO_API_KEY=ak_xxxxxxxxxxxxxxxxxxxx
GOOGLE_CREDENTIALS_PATH=/Users/you/keys/hvac-leads-key.json
```

---

## Step 5 — Verify both connections

Before starting the scheduler, confirm both APIs are working:

```bash
node index.js --verify
```

Expected output:
```
── Verifying API connections ──

Apollo.io ... ✓ Connected
Google Sheets ...
  Sheet header row: Date Added, Business Name, Owner First Name, ...
✓ Connected

✓ Both APIs connected. Safe to start the scheduler.
```

If either check fails, fix the error shown before continuing.

---

## Step 6 — Run a test cycle

This runs one full pull immediately and adds real leads to the sheet:

```bash
node index.js --test
```

Open your spreadsheet and confirm new rows appeared with today's date.

---

## Step 7 — Start the daily scheduler

```bash
node index.js
```

The process must stay running for the cron to fire. To keep it alive:

**With PM2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 startup        # auto-start on reboot
pm2 save
pm2 logs hvac-leads  # tail the logs
```

**With nohup (simple):**
```bash
nohup node index.js > leads.log 2>&1 &
tail -f leads.log
```

The scheduler fires at **7:00 AM Eastern Time** every day and adds up to 25 new leads.

---

## Customizing targets

Edit `config.js` to change:

| Setting | What it controls |
|---|---|
| `TARGET_CITIES` | Add/remove cities or surrounding areas |
| `TARGET_TITLES` | Job titles to search (Owner first, then fallbacks) |
| `INDUSTRY_TAGS` | Industries Apollo will match against |
| `MAX_LEADS_PER_RUN` | Max new rows added per daily run |
| `SPREADSHEET_ID` | Which Google Sheet to write to |

---

## Troubleshooting

**Apollo returns 0 results**
- Check your `APOLLO_API_KEY` is correct
- Confirm your Apollo plan includes API access (paid plan required for people search)
- Try loosening `TARGET_CITIES` or `INDUSTRY_TAGS` in `config.js`

**Google Sheets auth error**
- Confirm the service account email has **Editor** access to the spreadsheet
- Confirm `GOOGLE_CREDENTIALS_PATH` points to the right JSON file
- Check the JSON file wasn't accidentally corrupted

**Phone numbers are empty / leads skipped**
- Apollo's free plan masks phone numbers — upgrade to Basic or higher
- The script skips contacts with no phone number (per your requirement)
- Check your Apollo enrichment credit balance at apollo.io → Settings → Usage

**Process stops overnight**
- Use PM2 (`pm2 start` + `pm2 startup`) to keep it alive through reboots

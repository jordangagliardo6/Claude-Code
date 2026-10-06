# HVAC Lead Gen — Setup Guide

Automated daily lead pull from Apollo.io → Google Sheets master tracker.

---

## Quick Start

```bash
cd hvac-lead-gen
npm install
cp .env.example .env
# fill in .env (see steps below)
node index.js --verify    # confirm both APIs connect
node index.js --test      # run one live pull right now
node index.js             # start the daily 7 AM scheduler
```

---

## Step 1 — Apollo API Key

1. Log in at [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key
4. In `.env`: `APOLLO_API_KEY=your_key_here`

**Plan note:** People phone reveal costs 1 direct-dial credit per contact.
At 25 leads/day that's 25 credits/day. Monitor usage at
**Settings → Usage & Billing**.

---

## Step 2 — Google Service Account

A Service Account lets the script write to your sheet without a browser OAuth popup.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API** for it
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it any name (e.g. `hvac-lead-gen`)
6. Click **Done** (no roles needed at project level)
7. Click the service account → **Keys → Add Key → Create new key → JSON**
8. Download the JSON file

### Share your spreadsheet with the service account

1. Open the downloaded JSON and copy the `client_email` field
   (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
2. Open your Google Sheet → **Share**
3. Paste that email → give **Editor** access → Send

### Add credentials to `.env`

Paste the entire JSON file as a single line in the `.env`:

```bash
# On macOS/Linux — converts the file to one line:
GOOGLE_SERVICE_ACCOUNT_JSON=$(cat /path/to/your-service-account.json | tr -d '\n')
```

Or manually: open the JSON, copy the whole thing, and paste it as the value
for `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env` (keep it all on one line).

---

## Step 3 — Confirm the sheet tab name

Open your spreadsheet and look at the tab name at the bottom.
If it's not `Untitled`, update `.env`:

```
SHEET_TAB_NAME=YourTabName
```

The spreadsheet ID is already pre-filled to the master sheet
(`1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8`).

---

## Step 4 — Verify before first run

```bash
node index.js --verify
```

You should see:
```
✓ Apollo connected — XXXX total matching records available
✓ Google Sheets connected — spreadsheet has 71 existing businesses
```

If either fails, the error message explains what's wrong.

---

## Step 5 — First live pull

```bash
node index.js --test
```

This runs one full pull immediately. Check your sheet — new rows should appear.

---

## Step 6 — Start the scheduler

```bash
node index.js
```

Keep this process running (use PM2, screen, or a cron job on your server).

**With PM2 (recommended for always-on):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # run the printed command to auto-start on reboot
```

---

## Customizing

**Change target cities** — edit `SW_MICHIGAN_CITIES` at the top of `index.js`.
The list controls priority sorting, not hard exclusion. Leads from those cities
float to the top; others are still included if needed to fill 25 slots.

**Change job titles** — edit `person_titles` in `APOLLO_SEARCH_BODY`.
Current priority: Owner → President → Founder → Co-Founder → General Manager.

**Change industry** — edit `organization_sic_codes`:
- `1711` = Plumbing, Heating & Air-Conditioning Contractors
- `7623` = Refrigeration & Air-Conditioning Services

**Change daily limit** — set `MAX_LEADS_PER_RUN=10` in `.env` (or any number).

**Change schedule** — edit the cron expression in `index.js`:
```js
cron.schedule('0 7 * * *', ...)   // 0 min, 7 hour, every day
```
Standard cron format: `minute hour day month weekday`.

---

## Error handling

- All errors are printed to the console with timestamps
- Errors are also appended to `error.log` in this directory
- If `NOTIFY_EMAIL` and SMTP vars are set in `.env`, a failure email is sent
- On error the process exits with code 1 (PM2 will restart it)

---

## Spreadsheet columns (in order)

| Column | Value |
|--------|-------|
| A | Date Added (YYYY-MM-DD) |
| B | Business Name |
| C | Owner First Name |
| D | Owner Last Name |
| E | Phone Number |
| F | City |
| G | Website |
| H | Called (blank — fill manually) |
| I | Notes (blank — fill manually) |

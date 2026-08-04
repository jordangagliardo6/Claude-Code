# Apollo → Google Sheets HVAC Lead Gen — Setup Guide

Runs every morning at **7:00 AM Eastern**. Pulls up to 25 new HVAC / plumbing / mechanical
contractor owner contacts from Apollo.io, filters to those with phone numbers, skips
anyone already in your sheet, and appends the rest.

---

## What You Need

| Item | Where to get it |
|---|---|
| Apollo.io API key | apollo.io → Settings → Integrations → API Keys |
| Google Cloud project | console.cloud.google.com |
| Node.js 18+ | nodejs.org |

---

## Step 1 — Install dependencies

```bash
cd apollo-lead-gen
npm install
```

---

## Step 2 — Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

- `APOLLO_API_KEY` — from apollo.io
- `GOOGLE_SPREADSHEET_ID` — already set to your existing "HVAC Leads" sheet
- `SMTP_USER` / `SMTP_PASS` — optional; used to email you if a run fails

---

## Step 3 — Set up Google authentication

You have two options. **Option A (service account) is recommended** for unattended scripts.

### Option A — Service Account (recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it a name (e.g. `hvac-lead-gen`), click Done
6. Click the service account → **Keys → Add Key → Create new key → JSON**
7. Download the JSON and save it as `credentials/service-account.json`
8. **Share your Google Sheet** with the service account email (it looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`) — give it **Editor** access

Done. No browser auth needed.

### Option B — OAuth2 (if you can't create a service account)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Sheets API**
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Desktop app**
5. Download the JSON and save it as `credentials/credentials.json`
6. Run the one-time auth flow:
   ```bash
   node auth.js
   ```
   This opens a browser, you sign in with Google, paste the code back into the terminal.
   A `credentials/token.json` file is saved — the scheduler uses this on every run.

---

## Step 4 — Test the connection

Run it manually once before scheduling:

```bash
node lead-gen.js
```

You should see output like:

```
[2026-08-04T12:00:00.000Z] ════════════════════════════════════════════════
[2026-08-04T12:00:00.000Z]   HVAC Lead Generation Run — SW Michigan
[2026-08-04T12:00:00.000Z] ════════════════════════════════════════════════
[2026-08-04T12:00:00.000Z] Connecting to Google Sheets...
[2026-08-04T12:00:00.000Z] Loading existing leads for deduplication...
[2026-08-04T12:00:00.000Z] Dedup list loaded — 0 businesses already in sheet.
[2026-08-04T12:00:00.000Z] Searching Apollo.io...
[2026-08-04T12:00:00.000Z] Apollo returned 45 candidates.
[2026-08-04T12:00:00.000Z] Enriching contacts for phone numbers...
[2026-08-04T12:00:00.000Z] 25 new leads after phone filter + dedup (cap: 25).
[2026-08-04T12:00:00.000Z] Appending leads to Google Sheet...
[2026-08-04T12:00:00.000Z] ✓ Added 25 leads:
...
```

Open your Google Sheet and confirm the rows are there.

---

## Step 5 — Start the scheduler

```bash
node scheduler.js
```

This keeps the process running and fires the job at 7:00 AM ET every day.

### Keep it running 24/7 with PM2 (recommended for a server)

```bash
npm install -g pm2
pm2 start scheduler.js --name hvac-lead-gen
pm2 save          # auto-restart on reboot
pm2 logs hvac-lead-gen   # watch logs live
```

### Or use a system cron job (alternative)

Add to `crontab -e`:

```
0 7 * * * cd /path/to/apollo-lead-gen && /usr/bin/node lead-gen.js >> /var/log/hvac-leads.log 2>&1
```

Make sure the server timezone is set to `America/New_York`, or adjust the hour.

---

## Customizing

**Change target cities** — edit `TARGET_CITIES` near the top of `lead-gen.js`

**Change job titles** — edit `TARGET_TITLES` in `lead-gen.js`

**Change industries** — edit `NAICS_CODES` in `lead-gen.js`
- `23822` = Plumbing, Heating, Air-Conditioning
- `23829` = Other Mechanical / Building Equipment

**Change daily lead cap** — set `MAX_LEADS_PER_RUN=25` in `.env`

**Change run time** — set `CRON_SCHEDULE=0 8 * * *` in `.env` (8:00 AM)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Check your `.env` file is in the same folder and has the key |
| `API_INACCESSIBLE` from Apollo | Your Apollo plan doesn't include the People Search API. Upgrade to Basic ($49/mo) or higher |
| `Google Auth Failed` | Make sure `credentials/service-account.json` or `credentials/token.json` exist |
| `Google Sheets Write Failed` | Confirm the service account email has Editor access to the sheet |
| `Apollo returned 0 results` | Try broadening the search — remove some NAICS codes or reduce title filters |
| `0 new leads (all filtered)` | All Apollo results for today may already be in your sheet — it's working correctly |
| Email notifications not arriving | Check `SMTP_USER`, `SMTP_PASS` in `.env`. For Gmail, use an App Password, not your login password |

---

## Your Target Sheet

The script writes to the **"HVAC Leads - Southwest Michigan"** spreadsheet already in your Google Drive.

Sheet ID: `1MkLyTOHTX9-GJiKi9V3_kgfFBAkPTMjyxwBJBho9ayI`

Columns written:

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

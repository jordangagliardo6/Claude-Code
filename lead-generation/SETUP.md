# HVAC Lead Gen — Setup Guide

## What this does

Runs every morning at 7am ET. Searches Apollo.io for HVAC/plumbing/mechanical company owners in Southwest Michigan (St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven + surrounding cities), deduplicates against your master Google Sheet, and appends up to 25 new rows.

**Target spreadsheet:** HVAC Leads — SW Michigan (Master)
`https://docs.google.com/spreadsheets/d/1zLEBSyH0m0DBGw3E_6yC48tYojGKBR6JoD1DwFpUjrs/edit`

---

## Requirements

| Requirement | Details |
|---|---|
| Node.js ≥ 18 | `node --version` to check |
| Apollo.io **Basic plan** ($49/mo) | Free plan blocks People Search |
| Google Service Account | One-time setup, free |
| Gmail App Password | For error email alerts |

---

## Step 1 — Apollo.io API Key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API Key
4. If you're on the free plan, upgrade at **Settings → Plans** — People Search requires Basic ($49/mo) or higher

---

## Step 2 — Google Service Account

This lets the script write to your sheet without an interactive OAuth popup.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Google Sheets API** (search for it in "APIs & Services → Library")
4. Go to **APIs & Services → Credentials → Create Credentials → Service Account**
5. Give it any name (e.g. "hvac-lead-gen"), click **Done**
6. Click the service account you just created → **Keys** tab → **Add Key → JSON**
7. Download the JSON file and save it as `lead-generation/google-credentials.json`
8. **Share your spreadsheet** with the service account email (it looks like `name@project.iam.gserviceaccount.com`) — give it **Editor** access

---

## Step 3 — Gmail App Password (for error alerts)

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Under "How you sign in to Google", enable **2-Step Verification** if not already on
3. Search for **App Passwords** → create one for "Mail" / "Other" → name it "HVAC Lead Gen"
4. Copy the 16-character password (you won't see it again)

---

## Step 4 — Configure .env

```bash
cd lead-generation
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY` — from Step 1
- `SPREADSHEET_ID` — already set to your master sheet ID
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — `./google-credentials.json`
- `NOTIFICATION_EMAIL` — your email for error alerts
- `SMTP_USER` / `SMTP_PASS` — your Gmail + App Password from Step 3

---

## Step 5 — Install dependencies

```bash
cd lead-generation
npm install
```

---

## Step 6 — Test connections before first run

```bash
node index.js --run-now
```

This will:
1. Verify Google Sheets connection (prints sheet name)
2. Verify Apollo connection (prints your plan type — warns if free plan)
3. Run one immediate lead pull and append results to your sheet

Watch the console output. You should see:
```
[✓] Google Sheets: connected to "HVAC Leads — SW Michigan (Master)"
[✓] Apollo.io: connected as "you@email.com" (plan: basic)
[INFO] 56 existing businesses loaded for duplicate check.
[INFO] Apollo returned 18 new leads after deduplication.
[SUCCESS] Appended 18 new leads to the sheet.
  + Acme Heating & Cooling | John Smith | (269) 555-1234 | Kalamazoo
  ...
```

---

## Step 7 — Start the daily scheduler

```bash
node index.js
```

Runs forever in the background, firing at 7:00am ET each morning. To keep it running after you close your terminal, use `pm2` or `nohup`:

```bash
# Option A: pm2 (recommended)
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the instructions it prints to auto-start on reboot

# Option B: nohup (simpler, no auto-restart)
nohup node index.js > lead-gen.log 2>&1 &
```

---

## Customizing

**Change the city list** — edit `TARGET_CITIES` in `index.js` (around line 38)

**Change the max leads per run** — edit `MAX_LEADS_PER_RUN` in `.env` or `index.js`

**Change the sheet tab name** — edit `SHEET_TAB` in `index.js` (line 36) if your tab isn't "Sheet1"

**Add more industries** — add SIC codes to `TARGET_SIC_CODES` in `index.js`:
- `1731` — Electrical Work
- `1521` — General Building Contractors
- `7629` — Services to Buildings

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Apollo plan limit` | Upgrade to Apollo Basic at app.apollo.io/settings/plans |
| `Google Sheets: not found` | Make sure the service account email has Editor access to the sheet |
| `Invalid API key` | Re-copy your Apollo API key from Settings → API |
| `SMTP auth failed` | Use an App Password (not your Google account password) |
| No new leads added | All Apollo results were duplicates or had no phone — try again tomorrow |

# HVAC Lead Gen — First-Time Setup

Follow these steps exactly. At the end you'll run a connection test that confirms
both Apollo and Google Sheets are working before the daily schedule kicks in.

---

## Prerequisites

- Node.js 18 or later  (`node --version` to check)
- An Apollo.io account with API access
- A Google account with a spreadsheet ready

---

## Step 1 — Install Dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Google Sheets (Service Account)

A *service account* is a bot Google account your script will log in as. It never
needs a browser or interactive sign-in, which makes it perfect for a cron job.

### 2a. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown → **New Project** → name it `hvac-lead-gen` → **Create**

### 2b. Enable Google Sheets API

1. In the left menu: **APIs & Services** → **Library**
2. Search for **Google Sheets API** → click it → **Enable**

### 2c. Create a Service Account

1. **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
2. Name it `lead-gen-bot` → **Create and Continue** → skip role → **Done**
3. Click the service account email you just created
4. Go to the **Keys** tab → **Add Key** → **Create new key** → **JSON** → **Create**
5. A `.json` file downloads automatically — this is your key file

### 2d. Save the Key File

Move the downloaded JSON file into:
```
lead-gen/credentials/service-account.json
```

> This file is gitignored — it will not be committed.

### 2e. Share Your Spreadsheet with the Service Account

1. Open the downloaded JSON file. Copy the `client_email` value.
   It looks like: `lead-gen-bot@your-project.iam.gserviceaccount.com`
2. Open your Google Spreadsheet
3. Click **Share** → paste that email → set role to **Editor** → **Send**

### 2f. Get Your Spreadsheet ID

From your sheet's URL:
```
https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
```
Copy the ID — you'll paste it into `.env` in Step 4.

> **Sheet tab name:** The script defaults to `Leads`. If your tab has a different
> name, set `GOOGLE_SHEET_TAB=YourTabName` in `.env`.

The script creates the header row automatically on the first run.
If you already have a sheet with data, make sure row 1 has these exact headers:
```
Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes
```

---

## Step 3 — Apollo.io API Key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings** → **Integrations** → **API** → **API Keys**
3. Click **Create new key** → copy it

> **Plan note:** Every phone number reveal costs 1 Apollo phone credit.
> With MAX_LEADS_PER_RUN=25 and 3× over-fetch, a run may use up to ~75 phone credits.
> The Basic plan ($49/mo) includes 1,000 phone credits — enough for ~13 daily runs.
> Check your credit balance at **Settings** → **Credits & Usage**.

---

## Step 4 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `APOLLO_API_KEY` | Apollo Settings → API Keys |
| `GOOGLE_SHEET_ID` | Your spreadsheet URL |
| `GOOGLE_SHEET_TAB` | Tab name (default: Leads) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Leave as `./credentials/service-account.json` |
| `MAX_LEADS_PER_RUN` | Default 25 — change as needed |
| `NOTIFICATION_EMAIL` | Your email for error alerts |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Gmail App Password (see below) |

### Gmail App Password (for error alerts)

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already on
3. Search for **App Passwords** → create one for "Mail" / "Other (Custom name)"
4. Copy the 16-character password → paste as `SMTP_PASS` in `.env`

> Email alerts are optional. If you skip this, errors go to the console only.

---

## Step 5 — First Run (Connection Test)

Run once immediately to confirm both services connect before relying on the schedule:

```bash
node run-now.js
```

**What you should see:**
```
────────────────────────────────────────────────────────────
HVAC Lead Gen  |  Saturday, June 7, 2026 at 9:15 AM ET
Sheet tab: "Leads"  |  Max leads this run: 25
────────────────────────────────────────────────────────────

[Sheets] Connected ✓
[Sheets] 0 existing business name(s) loaded.

[Apollo] Searching SW Michigan HVAC leads (target: 75 with phones)...
[Apollo] Page 1: 50 candidates found. Enriching for phones...
[Apollo] ✓ John Smith @ Smith HVAC Services — +12695551234
[Apollo] ✓ Mike Johnson @ Johnson Heating & Cooling — +12695558877
...
[Apollo] Done — 36 leads with phone numbers collected.

[Dedup] 36 fetched → 36 new (0 duplicate(s) skipped).

[Sheets] ✓ 25 lead(s) added to "Leads".

────────────────────────────────────────────────────────────
✓ Run complete — 25 leads added to "Leads".
────────────────────────────────────────────────────────────
```

Open your Google Sheet — you should see 25 rows of HVAC leads.

---

## Step 6 — Start the Daily Scheduler

Once the test run works, start the scheduler:

```bash
node index.js
```

It will show the next scheduled run time and stay alive. Every morning at 7:00 AM
Eastern Time it will pull up to 25 fresh leads and append them to your sheet.

### Keeping it running long-term (recommended)

Use **pm2** so the scheduler restarts automatically after reboots:

```bash
# Install pm2 globally (one time)
npm install -g pm2

# Start the scheduler
cd lead-gen
pm2 start index.js --name "hvac-lead-gen"

# Save so it restarts on reboot
pm2 save
pm2 startup   # follow the printed instructions
```

Useful pm2 commands:
```bash
pm2 logs hvac-lead-gen    # live log stream
pm2 status                # check it's running
pm2 stop hvac-lead-gen    # pause
pm2 restart hvac-lead-gen # restart after config changes
```

---

## Customization Quick Reference

| What to change | Where to change it |
|---|---|
| Add/remove target cities | `src/apollo.js` → `TARGET_LOCATIONS` array |
| Change job title priorities | `src/apollo.js` → `TARGET_TITLES` array |
| Change industry keywords | `src/apollo.js` → `INDUSTRY_KEYWORDS` array |
| Change employee size filter | `src/apollo.js` → `organization_num_employees_ranges` |
| Change run time | `index.js` → `SCHEDULE` and/or `TIMEZONE` |
| Change max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Add sheet columns | `src/sheets.js` → `HEADERS` array + `appendLeads()` row builder |

---

## Troubleshooting

**`Service account key not found`**
→ Make sure `credentials/service-account.json` exists (see Step 2d).

**`The caller does not have permission`** (Sheets error)
→ You forgot to share the spreadsheet with the service account email (Step 2e).

**Apollo returns 0 leads with phones**
→ Check your Apollo phone credit balance. If you're on the free tier, you may have
  used your monthly quota. Upgrade to Basic or wait for the monthly reset.

**Apollo 401 Unauthorized**
→ Your `APOLLO_API_KEY` is wrong or expired. Regenerate it in Apollo Settings.

**No email alerts arriving**
→ Double-check `SMTP_PASS` is the App Password (16 chars, no spaces), not your
  regular Gmail password. Also check spam.

**Scheduler stops running**
→ The Node.js process was killed (server restart, etc.). Use pm2 (Step 6) to keep
  it alive automatically.

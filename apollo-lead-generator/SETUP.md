# Apollo Lead Generator — First-Run Setup Guide

> Pulls up to 25 HVAC owner-operator leads per day from Southwest Michigan via
> Apollo.io and appends them to your Google Sheet. Runs automatically at 7 AM Eastern.

---

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **Apollo.io Basic plan** ($49/mo) or higher — the People Search API is not available on the free tier
- **Google Cloud project** with Sheets API enabled (free)

---

## Step 1 — Install dependencies

```bash
cd apollo-lead-generator
npm install
```

---

## Step 2 — Google Service Account (one-time setup)

The script uses a Google **service account** so it can write to your sheet without
OAuth prompts. This takes about 3 minutes.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or open a project.

2. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable

3. Create a service account:
   - **IAM & Admin → Service Accounts → Create Service Account**
   - Name: `lead-generator` (or anything)
   - Click **Done** (no role needed at org level)

4. Create a JSON key:
   - Click the service account → **Keys tab → Add Key → Create new key → JSON**
   - A `.json` file downloads automatically

5. Save the file:
   ```
   apollo-lead-generator/credentials/service-account.json
   ```
   *(The `credentials/` folder is gitignored — never commit this file)*

6. **Share your Google Sheet** with the service account email:
   - Open the service account JSON file and copy the `client_email` field
     (looks like `lead-generator@your-project.iam.gserviceaccount.com`)
   - Open your Google Sheet → **Share** → paste that email → set role to **Editor**

---

## Step 3 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | [developer.apollo.io](https://developer.apollo.io) → API Keys |
| `GOOGLE_SHEET_ID` | From your sheet URL: `…/spreadsheets/d/**THIS_PART**/edit` |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | Path to your JSON file (default `./credentials/service-account.json`) |
| `ALERT_EMAIL` | Your email for error notifications |
| `SMTP_USER` / `SMTP_PASS` | Optional — Gmail + App Password for email alerts |

**Current sheet IDs for reference:**

| Sheet | ID |
|---|---|
| SW Michigan HVAC Leads — New Sept 21 2026 (headers only) | `1Cd_BUAlAogk73VfJMF4tPWIhofjMjPWMfA2byy5o6II` |
| SW Michigan HVAC Leads (Aug 23 — 25 entries) | `1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo` |

---

## Step 4 — Verify connections before the first run

```bash
node lead-generator.js --verify
```

Expected output:
```
[VERIFY] ✓ Apollo connected — logged in as you@email.com
[VERIFY] ✓ Google Sheets connected — sheet: "SW Michigan HVAC Leads"
```

Fix any ✗ items before continuing.

---

## Step 5 — Test run (pulls real data immediately)

```bash
node lead-generator.js --test
```

This runs the full workflow once and exits. Check your Google Sheet to confirm
new rows were appended.

---

## Step 6 — Start the scheduler

```bash
node lead-generator.js
```

This keeps the process alive and fires at **7:00 AM Eastern** every day.

To run it persistently in the background (so it survives terminal close), use
`pm2` or `screen`:

```bash
# With pm2 (recommended)
npm install -g pm2
pm2 start lead-generator.js --name lead-gen
pm2 save              # auto-restart on reboot
pm2 logs lead-gen     # watch logs

# With screen
screen -S lead-gen
node lead-generator.js
# Ctrl+A, D to detach
```

---

## Customizing the workflow

All tuneable values are in the `CONFIG` block near the top of `lead-generator.js`:

```js
cities:        [...],   // Add/remove target cities
targetTitles:  [...],   // Change job title priority
industries:    [...],   // Change industry keywords
maxLeadsPerRun: 25,     // Leads per daily run
```

You can also change the cron schedule at the bottom of the file:

```js
cron.schedule('0 7 * * *', ...)  // 7am daily
cron.schedule('0 7 * * 1-5', ...) // 7am weekdays only
```

---

## Spreadsheet column layout

| A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|
| Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes |

The **Called** and **Notes** columns are left blank — fill them in manually
as you work through the list.

---

## Apollo API plan requirements

| Feature | Free | Basic ($49/mo) | Professional ($79/mo) |
|---|---|---|---|
| People Search | ✗ | ✓ | ✓ |
| People Enrichment | 50/mo | 1,000/mo | 2,000/mo |

The lead generator uses both Search and Enrichment. You need at minimum
the **Basic plan** for Search to work. Enrichment is what reveals phone numbers.

---

## Troubleshooting

**`API_INACCESSIBLE` error from Apollo**
Your plan doesn't include People Search. Upgrade at apollo.io/pricing.

**`403 Forbidden` from Google Sheets**
The service account email hasn't been added as an Editor to the sheet. See Step 2.6.

**`ENOENT: no such file or directory — service-account.json`**
The credentials file is missing. Re-download it from Google Cloud Console.

**0 leads after a successful run**
All candidates are either already in the sheet (duplicates) or have no phone number.
Try running again the next day — Apollo's database updates frequently.

**Leads have no phone numbers**
Enrichment credits may be exhausted. Check your Apollo credit balance at
[app.apollo.io → Settings → Credits](https://app.apollo.io/#/settings/credits/current).

# HVAC Lead Gen — Setup Guide

Runs daily at **7:00 AM Eastern** and adds up to **25 new HVAC leads** from
Southwest Michigan to your Google Sheet, skipping duplicates automatically.

---

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **Apollo.io paid plan** — Basic ($49/mo) or higher (free plan blocks API search)
- **Google Cloud project** with Sheets API enabled

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Get your Apollo API key

1. Log in to [apollo.io](https://www.apollo.io)
2. Click your avatar → **Settings** → **Integrations** → **API**
3. Copy the key — it looks like `ak_xxxxxxxxxxxxxxxx`
4. **Confirm your plan**: go to **Settings → Billing**.
   The people search API requires the **Basic plan ($49/mo)** or higher.
   Free plan will return an error on every run.

---

## Step 3 — Create a Google Cloud Service Account

This lets the script write to your sheet without prompting you to log in.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or pick an existing one)
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" in the search bar → click Enable
4. Create a Service Account:
   - Go to **IAM & Admin → Service Accounts → Create Service Account**
   - Name it anything (e.g. `hvac-lead-gen`)
   - Skip the optional role fields → click Done
5. Open the service account → **Keys** tab → **Add Key → JSON**
   - Download the JSON file
6. From the JSON file, copy two values into your `.env`:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (keep the quotes, keep `\n`)

---

## Step 4 — Share your Google Sheet with the service account

1. Open your **SW Michigan HVAC Leads** sheet:
   `https://docs.google.com/spreadsheets/d/1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo/edit`
2. Click **Share** (top right)
3. Paste your service account email (from Step 3)
4. Set permission to **Editor** → click Send

---

## Step 5 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
APOLLO_API_KEY=ak_your_key_here
GOOGLE_SHEET_ID=1Loehf0bQlNdSwvW8wFbK5VFpFt_cDSoRN8nHY50aHWo
GOOGLE_SERVICE_ACCOUNT_EMAIL=hvac-lead-gen@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
NOTIFICATION_EMAIL=jgagliardo98@gmail.com
```

> **GOOGLE_PRIVATE_KEY tip**: paste the value from the JSON file exactly,
> including the surrounding quotes. The `\n` sequences will be converted to
> actual newlines by the script.

---

## Step 6 — Verify connections before the first run

```bash
node verify.js
```

This checks:
- All env vars are present
- Apollo API key is valid and has people-search access
- Google Sheets can be read successfully

Fix any issues shown, then re-run until all 4 checks pass.

---

## Step 7 — Test a real run

```bash
node index.js --run-now
```

Watch the console output. You should see leads logged and appended to your sheet.
Open the sheet to confirm rows were added.

---

## Step 8 — Start the scheduler

```bash
node index.js
```

The process keeps running in the background and fires every morning at 7 AM ET.

**To keep it running after you close your terminal**, use one of:

### Option A — PM2 (recommended)
```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### Option B — System cron (if you prefer)
Instead of node-cron, you can run the script on a system cron and let the OS
handle scheduling:

```bash
crontab -e
# Add this line (runs at 7 AM ET = 12 PM UTC, adjust for your server timezone):
0 12 * * * cd /path/to/hvac-lead-gen && node index.js --run-now >> /var/log/hvac-leads.log 2>&1
```

Then remove the `cron.schedule(...)` block from `index.js` since it won't be needed.

---

## Customizing the script

All tunable settings are in the `CONFIG` object at the top of `index.js`:

| Setting | What it controls |
|---|---|
| `targetCities` | Add/remove cities from the search |
| `targetIndustryKeywords` | Industries to search for |
| `targetTitles` | Job titles to target |
| `companySizeMax` | Max employees (currently 25) |
| `maxLeadsPerRun` | Cap per daily run (currently 25) |
| `sheetName` | Name of the tab in your Google Sheet |

---

## Troubleshooting

**Apollo: "API_INACCESSIBLE"**
→ You're on the free plan. Upgrade to Basic at apollo.io/pricing.

**Apollo: 0 results**
→ The keyword combo returned nothing today. Try broadening `targetCities` or
  `targetIndustryKeywords` in the CONFIG.

**Google Sheets: 403 Permission Denied**
→ Share the sheet with your service account email (Editor access).

**Google Sheets: "not found"**
→ Double-check `GOOGLE_SHEET_ID` in `.env`.

**GOOGLE_PRIVATE_KEY errors**
→ Make sure the key in `.env` is wrapped in double quotes and contains literal
  `\n` sequences (not actual newlines). The script converts them automatically.

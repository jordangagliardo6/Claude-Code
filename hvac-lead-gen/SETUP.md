# HVAC Lead Gen — Setup Guide

Automated daily lead pull: Apollo.io HVAC contacts in SW Michigan → Google Sheets.

---

## What You'll Need

| Item | Where to Get It |
|---|---|
| Apollo.io API key | [developer.apollo.io](https://developer.apollo.io) → Settings → API Keys |
| Google Cloud project | [console.cloud.google.com](https://console.cloud.google.com) |
| Google Sheet | Create one at [sheets.google.com](https://sheets.google.com) |
| Node.js 18+ | [nodejs.org](https://nodejs.org) |

---

## Step 1 — Create Your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet.
2. Name it something like **HVAC Leads SW Michigan**.
3. Leave it completely blank — the script will add the header row automatically.
4. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
   ```

---

## Step 2 — Create a Google Service Account

A service account lets the script write to your sheet automatically without needing you to log in each time.

### 2a. Create a project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click the project dropdown at the top → **New Project**.
3. Name it **hvac-lead-gen** → **Create**.

### 2b. Enable the Sheets API

1. In the left menu: **APIs & Services → Library**.
2. Search for **Google Sheets API** → Click it → **Enable**.

### 2c. Create a Service Account

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → Service Account**.
3. Name: `hvac-lead-gen` → **Create and Continue** → **Done**.
4. Click the new service account email in the list.
5. Go to the **Keys** tab → **Add Key → Create new key → JSON → Create**.
6. A JSON file downloads automatically — this is your `service-account-key.json`.
7. Move it into the `hvac-lead-gen/` folder (same folder as `index.js`).

### 2d. Share the Sheet with the Service Account

1. Open your Google Sheet.
2. Click **Share** (top right).
3. Paste the service account email (looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`).
4. Set permission to **Editor** → **Send**.

---

## Step 3 — Get Your Apollo.io API Key

1. Log in to [developer.apollo.io](https://developer.apollo.io).
2. Go to **Settings → Integrations → API Keys**.
3. Copy your API key.

**Apollo plan requirements:**
- Free tier: 50 credits/month — enough for a few test runs
- Basic ($49/mo): 1,000 credits/month — ~40 runs at 25 leads each
- Professional ($99/mo): unlimited for most searches

---

## Step 4 — Configure Environment Variables

```bash
cd hvac-lead-gen
cp .env.example .env
```

Open `.env` and fill in:

```env
APOLLO_API_KEY=your_apollo_key_here
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./service-account-key.json
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEET_TAB=Sheet1

# Optional — email alerts on errors
ALERT_EMAIL_TO=jgagliardo98@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password  # Use a Gmail App Password, not your main password
```

> **Gmail App Password:** If using Gmail for alerts, go to your Google Account →
> Security → 2-Step Verification → App passwords → generate one for "Mail".

---

## Step 5 — Install Dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 6 — Test the Connection

Run this **before** the first scheduled run to confirm both APIs are working:

```bash
npm run test-connection
```

You should see:
```
── Connection Test ──────────────────────────────────────────

1. Checking Apollo.io API key...
   ✓  APOLLO_API_KEY is set (xxxxxx...)

2. Checking Google Sheets connection...
   ✓  Connected — spreadsheet: "HVAC Leads SW Michigan"

✓ All connections OK. Ready to run.
```

If you see an error, check the specific failure message — most issues are either:
- Wrong spreadsheet ID in `.env`
- Forgot to share the sheet with the service account email
- Apollo API key missing or invalid

---

## Step 7 — Do a Live Test Pull (Optional but Recommended)

This runs the full workflow right now, pulls real leads, and writes them to your sheet:

```bash
npm run run-now
```

Check your Google Sheet — you should see the header row and up to 25 new leads.

If you want to **preview leads without writing to the sheet** first:

```bash
node index.js --dry-run
```

---

## Step 8 — Start the Daily Scheduler

```bash
npm start
```

The process will stay running and fire every morning at **7:00 AM Eastern Time**.
Keep it running on a machine that's always on (your computer, a VPS, a Raspberry Pi, etc.)

To run it in the background so it survives terminal closure:

```bash
# Using nohup
nohup npm start > lead-gen.log 2>&1 &

# Using pm2 (install once: npm install -g pm2)
pm2 start index.js --name hvac-lead-gen
pm2 save       # auto-restart on reboot
pm2 logs hvac-lead-gen  # view live logs
```

---

## Customizing Cities or Industries

To change which cities are searched, open `src/apollo.js` and edit:

```js
const SW_MICHIGAN_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
  // Add more here, e.g. 'Battle Creek', 'Portage'
];
```

To change which industries are searched, edit:

```js
const TARGET_INDUSTRIES = [
  'HVAC',
  'Heating, Ventilation & Air Conditioning',
  'Plumbing',
  'Mechanical Contracting',
  // Add or remove industries here
];
```

To change the max leads per run, edit the `maxLeads` value in `index.js`:
```js
await runWorkflow({ maxLeads: 25 }); // change 25 to whatever you want
```

---

## Column Structure

The sheet will have these columns in this order:

| Col | Name | Notes |
|---|---|---|
| A | Date Added | Auto-filled (M/D/YYYY) |
| B | Business Name | Company name from Apollo |
| C | Owner First Name | Decision-maker first name |
| D | Owner Last Name | Decision-maker last name |
| E | Phone Number | Mobile preferred, then direct |
| F | City | City name |
| G | Website | Domain only (no http://) |
| H | Called | **You fill this in** |
| I | Notes | **You fill this in** |

---

## Error Handling

| Error | What Happens |
|---|---|
| Apollo returns 0 results | Logged to console + email alert (if configured) |
| Apollo API key invalid | Logged + email alert |
| Google Sheets write fails | Logged + email alert |
| Business already in sheet | Silently skipped (no error) |
| City returns 0 results | Warning logged, continues to next city |

---

## Troubleshooting

**Apollo returns 0 leads**
- Check your API key in `.env`
- Check your Apollo credit balance at [developer.apollo.io](https://developer.apollo.io)
- Try the dry-run mode to see if any results come through at all
- Apollo's data for smaller cities can be sparse — the workflow searches city by city

**Google Sheets error: "The caller does not have permission"**
- Make sure you shared the sheet with the service account email as **Editor**
- Double-check `GOOGLE_SPREADSHEET_ID` in `.env` — it's easy to copy the wrong part of the URL

**"Service account key file not found"**
- Make sure `service-account-key.json` is in the `hvac-lead-gen/` folder
- Check `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in `.env`

**Duplicate leads appearing**
- The deduplication checks the exact Business Name string from Apollo
- If Apollo returns slightly different name spellings across runs, they'll both appear
- You can manually delete duplicates from the sheet — they won't be re-added as long as the name matches exactly

---

## Running on a Server (Recommended for Reliability)

For the scheduler to run reliably every morning, the process must stay alive.
The simplest production setup:

```bash
# Install pm2 globally
npm install -g pm2

# Start the scheduler
cd hvac-lead-gen
pm2 start index.js --name hvac-lead-gen

# Make it restart automatically if the server reboots
pm2 startup
pm2 save
```

Cheap VPS options: DigitalOcean Droplet ($6/mo), Vultr ($6/mo), Linode ($5/mo).
Any of these will run this script indefinitely at virtually no cost.

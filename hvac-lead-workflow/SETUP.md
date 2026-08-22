# HVAC Lead Workflow — First-Time Setup

Follow these steps in order. The whole setup takes about 15 minutes.

---

## Step 1 — Install Node.js (if not already installed)

Download from https://nodejs.org/ (choose the LTS version).  
Verify with: `node --version` — should show v18 or higher.

---

## Step 2 — Install dependencies

```bash
cd hvac-lead-workflow
npm install
```

---

## Step 3 — Get your Apollo.io API key

1. Log in to https://app.apollo.io
2. Click your avatar (bottom-left) → **Integrations** → **API**
3. Copy your **API Key**
4. Note: People Search requires a **Basic plan or higher** (~$49/mo). Free plan will return an error.

---

## Step 4 — Create Google Cloud credentials (Service Account)

This lets the script write to your Google Sheet without requiring browser login — perfect for a cron job.

1. Go to https://console.cloud.google.com/
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API**:
   - Search "Google Sheets API" → Enable
4. Create a **Service Account**:
   - Go to **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Name it anything (e.g. `hvac-lead-bot`)
   - Skip roles for now, click Done
5. Click the service account you just created → **Keys** tab → **Add Key** → **Create new key** → **JSON**
6. Save the downloaded file as `credentials.json` inside the `hvac-lead-workflow/` folder
7. **Share your Google Sheet with the service account email**:
   - Open your sheet: https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit
   - Click **Share** (top-right)
   - Paste the service account email (looks like `hvac-lead-bot@your-project.iam.gserviceaccount.com`)
   - Set role to **Editor** → Send

---

## Step 5 — Create your .env file

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `APOLLO_API_KEY` — from Step 3
- `SPREADSHEET_ID` — already pre-filled with your "SW Michigan HVAC Leads" sheet
- `NOTIFICATION_EMAIL` — already set to jgagliardo98@gmail.com
- `GMAIL_USER` + `GMAIL_APP_PASSWORD` — optional, for email error alerts (see below)

### Optional: Gmail error alerts

To get email notifications when something breaks:
1. Go to https://myaccount.google.com/apppasswords
2. Create an App Password for "Mail"
3. Add to `.env`:
   ```
   GMAIL_USER=your_gmail@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

Errors always write to `error.log` in this folder regardless.

---

## Step 6 — Verify both connections before first scheduled run

```bash
node index.js --verify
```

You should see:
```
1. Apollo.io API ... ✓ Connected  (123 total results available for test query)
2. Google Sheets  ... ✓ Connected  (sheet: "SW Michigan HVAC Leads", 0 existing leads)

✓ All systems connected. First scheduled run will fire at 7:00 AM Eastern.
```

If either shows ✗, fix that issue before continuing.

---

## Step 7 — Run a manual test (pulls real leads right now)

```bash
node index.js --now
```

Check your Google Sheet — you should see up to 25 new rows added with today's date.

---

## Step 8 — Start the scheduler (keep it running)

```bash
node index.js
```

This runs in the foreground and fires every day at 7:00 AM Eastern. To keep it running after you close the terminal:

**Option A — pm2 (recommended):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

**Option B — screen:**
```bash
screen -S hvac-leads
node index.js
# Press Ctrl+A then D to detach
```

**Option C — System cron (instead of node-cron):**
If you prefer to let the OS handle scheduling, run the script directly via crontab:
```
# crontab -e
# 7am Eastern = 12:00 UTC (adjust for your server's timezone)
0 12 * * * cd /path/to/hvac-lead-workflow && node index.js --now >> /var/log/hvac-leads.log 2>&1
```
Then you don't need to keep `node index.js` running — just run the script once a day via cron.

---

## Customization

All the easy-to-change settings are in the `CONFIG` object at the top of `index.js`:

| Setting | What it does |
|---|---|
| `targetCities` | Add/remove cities — one per array entry |
| `targetTitles` | Change job title priority order |
| `maxLeadsPerRun` | Change the 25-lead daily cap |
| `hvacNaicsCodes` | NAICS codes: 2382 = HVAC Contractors |

---

## Files in this folder

| File | Purpose |
|---|---|
| `index.js` | Main workflow — all logic lives here |
| `package.json` | Node.js dependencies |
| `.env` | Your secrets (never commit this) |
| `.env.example` | Template showing what goes in `.env` |
| `credentials.json` | Google Service Account key (never commit this) |
| `error.log` | Auto-created; records any run failures |

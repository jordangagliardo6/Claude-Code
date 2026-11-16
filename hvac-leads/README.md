# HVAC Lead Generator — SW Michigan

Automated daily workflow: pulls HVAC decision-maker contacts from **Apollo.io** and appends them to your master Google Sheet, skipping any duplicates.

---

## What it does

- **Searches Apollo.io** for owners/presidents of HVAC, plumbing, and mechanical-contracting companies (1–25 employees) in Michigan
- **Filters by city** to SW Michigan: St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven, and 20+ surrounding towns
- **Deduplicates** against the existing sheet before writing
- **Appends up to 25 new leads** per run to the master sheet
- **Runs automatically at 7:00 AM Eastern Time** every day via node-cron
- **Sends an error notification** (console + optional email) if Apollo or Sheets fails

Target spreadsheet: `HVAC Leads — SW Michigan (Master)`  
<https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8>

---

## First-time setup (do this once)

### 1. Install dependencies

```bash
cd hvac-leads
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | <https://app.apollo.io/#/settings/integrations/api> |
| `SPREADSHEET_ID` | Already pre-filled with your master sheet ID |
| `GOOGLE_CREDENTIALS_PATH` | Path to your `credentials.json` (see below) |

### 3. Get Google OAuth credentials

1. Go to <https://console.cloud.google.com/>
2. Create or select a project
3. **Enable the Google Sheets API**: APIs & Services → Library → "Google Sheets API" → Enable
4. **Create credentials**: APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID
   - Application type: **Desktop App**
5. Download the JSON → save as `credentials.json` inside the `hvac-leads/` folder

### 4. Run setup (connects to both APIs and saves your OAuth token)

```bash
node setup.js
```

This will:
- Verify your Apollo API key with a test search
- Open a browser URL for Google sign-in
- Save `token.json` for unattended future runs
- Confirm the sheet headers and your write access

### 5. Test a manual run

```bash
node index.js --run-now
```

You should see new leads printed to the console and rows added to your sheet.

---

## Running the scheduler

```bash
node index.js
```

Runs continuously in the background. The cron fires at **7:00 AM Eastern Time** every day.

To keep it running after you close the terminal, use **PM2** (recommended):

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save          # auto-restart on reboot
pm2 logs hvac-leads
```

Or add it as a system cron job:
```
0 7 * * * cd /path/to/hvac-leads && node index.js --run-now >> /var/log/hvac-leads.log 2>&1
```

---

## Customising the search

All search parameters live in `lib/apollo.js`:

- **Cities** — edit the `SW_MICHIGAN_CITIES` array
- **Industries** — edit `TARGET_INDUSTRIES`
- **Job titles** — edit `TARGET_TITLES`
- **Company size** — edit `EMPLOYEE_RANGES`

Column layout is defined in `lib/sheets.js` → `COLUMNS`.  
Deduplication logic is in `normaliseBusinessName()` in the same file.

---

## Error notifications

Failures are always logged to the console. To also receive email alerts:

1. Create a Gmail App Password at <https://myaccount.google.com/apppasswords>
2. Add to `.env`:
   ```
   NOTIFY_EMAIL=jgagliardo98@gmail.com
   GMAIL_USER=your-gmail@gmail.com
   GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   ```

---

## File structure

```
hvac-leads/
├── index.js          — entry point + cron scheduler
├── setup.js          — first-run setup and verification
├── package.json
├── .env.example      — copy to .env and fill in
├── credentials.json  — Google OAuth client (you download this)
├── token.json        — Google OAuth token (auto-created by setup.js)
└── lib/
    ├── apollo.js     — Apollo API search + contact normalisation
    ├── sheets.js     — Google Sheets read/write helpers
    └── notify.js     — console + email error notifications
```

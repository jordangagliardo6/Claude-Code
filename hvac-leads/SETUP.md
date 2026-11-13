# HVAC Lead Generator — Setup Guide

Automated daily lead pull from Apollo.io → Google Sheets.  
Targets HVAC/Plumbing/Mechanical companies (1–25 employees) in SW Michigan.

---

## Prerequisites

- Node.js 18+ installed (`node -v`)
- An [Apollo.io](https://app.apollo.io) account with API access
- A Google account with a Sheets spreadsheet ready

---

## Step 1 — Install dependencies

```bash
cd hvac-leads
npm install
```

---

## Step 2 — Configure Apollo.io API key

1. Log in to Apollo.io → Settings → Integrations → API
2. Copy your API key
3. Create your `.env` file:

```bash
cp .env.example .env
```

4. Open `.env` and set:

```
APOLLO_API_KEY=paste_your_key_here
```

---

## Step 3 — Set up Google Sheets

### 3a. Create your spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Copy the spreadsheet ID from the URL:  
   `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`
3. Add it to `.env`:

```
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
```

The script will create the header row automatically on first run.

### 3b. Create OAuth2 credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select an existing one)
3. Enable the **Google Sheets API**:  
   APIs & Services → Library → search "Sheets" → Enable
4. Create credentials:  
   APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Desktop app**
   - Name: "HVAC Lead Generator"
5. Download the JSON file
6. Save it as `credentials.json` in the `hvac-leads/` folder

---

## Step 4 — Verify both connections

```bash
npm run verify
```

On **first run**, this will open a browser URL for Google authorization.  
Paste the resulting code back into the terminal. The token is saved to `token.json` — you won't need to do this again.

Expected output:
```
[1/3] Checking environment variables...
  ✓  APOLLO_API_KEY is set
  ✓  GOOGLE_SPREADSHEET_ID is set

[2/3] Testing Apollo.io connection...
  ✓  Apollo API key valid — test search returned 1 result(s)

[3/3] Testing Google Sheets connection...
  ✓  Google Sheets connected — spreadsheet: "HVAC Leads"

All checks passed. Run `npm run test-run` to execute the first lead pull.
```

---

## Step 5 — Run a manual test pull

```bash
npm run test-run
```

This runs the full job immediately (up to 25 leads) and appends to your sheet.  
Check your spreadsheet to confirm rows were added.

---

## Step 6 — Start the scheduler

```bash
npm start
```

The process runs in the foreground and executes the job every day at **7:00 AM Eastern Time**.  
Keep it running with a process manager:

```bash
# Using PM2 (recommended)
npm install -g pm2
pm2 start src/index.js --name hvac-leads
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

---

## Customizing

| What to change | Where |
|---|---|
| Add/remove cities | `src/apollo.js` → `SW_MICHIGAN_LOCATIONS` array |
| Change job titles | `src/apollo.js` → `TARGET_TITLES` array |
| Change industries | `src/apollo.js` → `TARGET_INDUSTRIES` array |
| Max leads per run | `.env` → `MAX_LEADS_PER_RUN` |
| Sheet tab name | `.env` → `GOOGLE_SHEET_NAME` |
| Spreadsheet columns | `src/sheets.js` → `COLUMN_ORDER` array |

---

## Error handling

- All errors are logged to `error.log` in the project folder
- Run `cat error.log` to see recent failures
- To add email alerts: see the commented block in `src/notify.js`

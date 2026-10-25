# HVAC Lead Gen — Setup Guide

Pulls owner-operated HVAC/plumbing contacts in Southwest Michigan from Apollo.io and
appends them to a Google Sheet every morning at 7 AM Eastern. Max 25 new leads per run.

---

## Prerequisites

- Node.js 18 or newer (`node --version` to check)
- An [Apollo.io](https://apollo.io) account (free tier: 50 credits/month; Basic $49/mo: 1,000/month)
- A Google account

---

## Step 1 — Clone and install

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Create your Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name the first tab **Leads** (or whatever you put in `GOOGLE_SHEET_TAB`).
3. Leave row 1 blank — the script creates the header row automatically on first run.
4. Copy the **spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_YOUR_ID`**`/edit`

---

## Step 3 — Enable Google APIs and get credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (or pick an existing one).
3. Click **Enable APIs and Services** → search for and enable:
   - **Google Sheets API**
   - **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**.
5. Application type: **Desktop app**. Give it any name.
6. Click **Download JSON** — save the file as `google-credentials.json` inside the
   `hvac-lead-gen/` folder.

> The first time you run the script it will print a URL. Open it in your browser,
> sign in, approve the permissions, and paste the code it gives you back into the
> terminal. This happens once; the token is saved to `token.json` for future runs.

---

## Step 4 — Configure the environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Value |
|---|---|
| `APOLLO_API_KEY` | From [developer.apollo.io](https://developer.apollo.io) → API Keys |
| `GOOGLE_SPREADSHEET_ID` | The ID you copied in Step 2 |
| `ALERT_EMAIL_FROM` | Your Gmail address (optional — for error alerts) |
| `ALERT_EMAIL_TO` | Where to send alerts (defaults to jgagliardo98@gmail.com) |
| `ALERT_EMAIL_PASSWORD` | A [Gmail App Password](https://support.google.com/accounts/answer/185833) |

Everything else has sensible defaults. You can leave `CRON_SCHEDULE` and `MAX_LEADS_PER_RUN` alone unless you want to change the timing or lead cap.

---

## Step 5 — Test the connection

```bash
node index.js --test
```

This checks both APIs and prints either ✓ or a clear error message. It makes **no writes** to your sheet.

If Apollo fails: double-check `APOLLO_API_KEY` in `.env`.  
If Google fails: make sure `google-credentials.json` is in the `hvac-lead-gen/` folder and your spreadsheet ID is correct.

---

## Step 6 — Run once manually

```bash
node index.js --once
```

This runs the full workflow right now (no scheduler). Check your Google Sheet — up to 25 new HVAC leads should appear within a minute.

---

## Step 7 — Start the scheduler

```bash
node index.js
```

The process stays running and fires the workflow at **7:00 AM Eastern every day**.
Ctrl+C stops it.

### Keeping it running 24/7

On a server or always-on machine, use **PM2** so it survives reboots:

```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow the printed command to enable autostart
```

View logs: `pm2 logs hvac-lead-gen`  
Stop it:   `pm2 stop hvac-lead-gen`

---

## Customising the search

Everything you'd want to tweak is at the top of `index.js`:

| Constant | What it controls |
|---|---|
| `TARGET_CITIES` | Cities to search (add/remove as needed) |
| `TARGET_INDUSTRIES` | Apollo industry keywords |
| `TARGET_TITLES` | Job titles to match (priority order) |
| `COLUMNS` | Sheet column positions — update if you rearrange columns |

---

## Sheet columns

The script writes these columns in this order:

| Col | Header | Notes |
|---|---|---|
| A | Date Added | Today's date, auto-filled |
| B | Business Name | Company from Apollo |
| C | Owner First Name | Contact first name |
| D | Owner Last Name | Contact last name |
| E | Phone Number | Best number found (mobile > direct > business) |
| F | City | City from Apollo contact |
| G | Website | Company website URL |
| H | Called | **Left blank — you fill this in** |
| I | Notes | **Left blank — you fill this in** |

---

## Error handling

| What fails | What happens |
|---|---|
| Apollo returns 0 results | Warning logged + email alert sent (if configured) |
| Google Sheets write fails | Error logged + email alert with the lead list so you don't lose data |
| Google auth fails | Error logged + email alert |
| Single city search fails | That city is skipped; other cities continue |

---

## Troubleshooting

**Apollo returns 0 contacts**  
- Verify `APOLLO_API_KEY` is correct and your account has remaining credits.  
- Apollo free tier has a monthly search cap — check your usage dashboard.

**Google Sheets error: "The caller does not have permission"**  
- Delete `token.json` and re-run to redo the OAuth consent.  
- Make sure you enabled both Google Sheets API and Google Drive API in your project.

**"Spreadsheet not found"**  
- Double-check `GOOGLE_SPREADSHEET_ID` — it's the long alphanumeric string in the URL.

**Scheduler fires but I don't see the process**  
- Run with PM2 (see Step 7) or in a `tmux`/`screen` session so it doesn't die when you close the terminal.

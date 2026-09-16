# HVAC Lead Gen Workflow

Pulls HVAC owner contacts from Apollo.io → appends new leads to a Google Sheet — runs automatically at **7am ET every day**.

**Target spreadsheet:** [SW Michigan HVAC Leads — New Sept 8 2026](https://docs.google.com/spreadsheets/d/15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU/edit)

---

## Setup (do this once)

### 1. Install Node.js dependencies

```bash
cd lead-gen
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in your credentials (see below).

---

### 3. Apollo.io API Key

1. Log in at [apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API** (or visit https://developer.apollo.io/)
3. Copy your API key
4. Add to `.env`: `APOLLO_API_KEY=your_key_here`

> **Note:** The People Search endpoint requires a **paid Apollo plan** (Basic or above). If you're on the free plan, you'll get an error — the script will email you and log the error clearly.

---

### 4. Google Sheets credentials (choose one option)

#### Option A — Service Account (recommended for always-on scripts)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**: APIs & Services → Enable APIs → search "Sheets"
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Give it any name (e.g. `hvac-lead-gen`)
6. On the service account page, go to **Keys → Add Key → JSON** — download the file
7. **Share your Google Sheet** with the service account email (looks like `name@project.iam.gserviceaccount.com`) — give it **Editor** role
8. Add to `.env`: `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json`

#### Option B — OAuth2 (if you prefer using your own Google account)

1. Go to Google Cloud Console → **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID** → choose **Desktop app**
3. Download the client secrets JSON
4. Run the one-time OAuth flow (see the snippet below) to get a refresh token
5. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` to `.env`

<details>
<summary>One-time OAuth flow snippet (run this once to get your refresh token)</summary>

```javascript
// oauth-setup.js — run once: node oauth-setup.js
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/callback';

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/spreadsheets'],
});

console.log('Open this URL in your browser:\n', authUrl);

const server = http.createServer(async (req, res) => {
  const code = new url.URL(req.url, 'http://localhost:3000').searchParams.get('code');
  if (code) {
    const { tokens } = await oAuth2.getToken(code);
    console.log('\nRefresh token:', tokens.refresh_token);
    console.log('Add this to .env as GOOGLE_REFRESH_TOKEN=...');
    res.end('Done! Close this tab.');
    server.close();
  }
});
server.listen(3000);
```

</details>

---

### 5. Gmail alerts (optional but recommended)

For email alerts when the pipeline fails:

1. Enable 2-Step Verification on your Google account
2. Go to **Google Account → Security → App passwords**
3. Create an app password for "Mail"
4. Add to `.env`: `GMAIL_USER=your@gmail.com` and `GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx`

---

## First Run — Verify Everything Works

Run this once to confirm both Apollo and Google Sheets connect correctly **before** the scheduler starts:

```bash
node lead-gen-workflow.js --now
```

You'll see output like:

```
=== HVAC Lead Gen — Manual Run (--now flag) ===

── Connectivity Check ──────────────────────────────────────
[✓] APOLLO_API_KEY is present
[✓] Google Sheets connection OK — 0 existing business names loaded
────────────────────────────────────────────────────────────

[Apollo] Found 47 people on page 1 (total: 312)
[Apollo] 31 records have a phone number
[Dedup] 31 Apollo leads → 31 after dedup
[Sheets] Appended 25 new leads
[Done] Added 25 new leads in 4.2s
```

If you see an error instead, fix the issue flagged in the output and re-run `--now`.

---

## Start the Daily Scheduler

Once `--now` succeeds, start the background process:

```bash
# Foreground (Ctrl+C to stop)
node lead-gen-workflow.js

# Background with pm2 (recommended for 24/7 operation)
npm install -g pm2
pm2 start lead-gen-workflow.js --name hvac-leads
pm2 save
pm2 startup   # follow the instructions to auto-start on reboot
```

The scheduler prints `[✓] Scheduler is live. First run at 7am ET.` and then runs silently until 7am.

---

## Customization

All settings live in `src/config.js`:

| Setting | What to change |
|---|---|
| `TARGET_CITIES` | Add/remove cities for the Apollo search |
| `TARGET_JOB_TITLES` | Add/remove contact titles (Owner, GM, etc.) |
| `MAX_LEADS_PER_RUN` | Change the 25-lead daily limit |
| `CRON_SCHEDULE` | Change the run time (default: 7am ET) |
| `SPREADSHEET_ID` | Point at a different Google Sheet |
| `COLUMNS` | Reorder or rename columns in the output |

---

## Spreadsheet columns

| Column | Source |
|---|---|
| Date Added | Auto-filled with today's date |
| Business Name | Apollo company name |
| Owner First Name | Apollo contact first name |
| Owner Last Name | Apollo contact last name (may be masked on some plans) |
| Phone Number | Mobile or direct number (preferred over main line) |
| City | Contact's city, state |
| Website | Company website URL |
| Called | Left blank — fill in manually |
| Notes | Left blank — fill in manually |

---

## Error handling

- Apollo returns 0 results → console warning + email alert
- Google Sheets write fails → console error + email alert  
- Any uncaught error → console error + email alert + process exits with code 1

Check the console output or your email at `jgagliardo98@gmail.com` if something goes wrong.

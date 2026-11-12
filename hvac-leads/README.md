# HVAC Lead Generation Workflow

Automatically pulls Southwest Michigan HVAC company owner contacts from **Apollo.io** and appends them to your master Google Sheet — every morning at 7 AM Eastern. Skips duplicates. Caps at 25 new leads per run.

---

## What it does each run

1. Calls Apollo.io People Search for HVAC / Heating & Air / Plumbing / Mechanical companies in SW Michigan (St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven, and more).
2. Filters for 1–25 employee companies and targets Owner → President → Founder → Co-Founder → General Manager, in that priority order.
3. Requires a phone number — contacts without one are skipped.
4. Checks the **Business Name** column in your Google Sheet for duplicates.
5. Appends up to 25 new rows with: `Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called (blank) | Notes (blank)`.

---

## First-time setup

### 1. Install dependencies

```bash
cd hvac-leads
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | [app.apollo.io](https://app.apollo.io) → Settings → Integrations → API Keys |
| `SPREADSHEET_ID` | Pre-filled: `1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8` |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to your credentials JSON (see step 3) |
| `ALERT_EMAIL` | Your email — optional, for console error notices |

### 3. Set up Google Sheets access (service account)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Library**.
2. Enable the **Google Sheets API**.
3. Go to **IAM & Admin** → **Service Accounts** → **Create Service Account**.
4. Name it (e.g., `hvac-leads-bot`), click **Create and Continue**, skip role assignment, click **Done**.
5. Click the new service account → **Keys** tab → **Add Key** → **Create new key** → **JSON**. Download the file.
6. Save the file as `credentials.json` inside this `hvac-leads/` folder.
7. Open your [Google Sheet](https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8) → click **Share** → paste the service account email (looks like `hvac-leads-bot@your-project.iam.gserviceaccount.com`) → give it **Editor** access → click **Send**.

> ⚠️ Never commit `credentials.json` or `.env` to git. Both are in `.gitignore`.

---

## Verify the connection before the first scheduled run

Run this once to confirm Apollo and Google Sheets are both reachable:

```bash
node index.js --run-now
```

You should see:
- `[Apollo] Searching for up to 25 HVAC leads…`
- City-by-city results lines
- `[Sheets] Done. Added: X row(s) | Skipped (duplicate): Y`
- A link to your spreadsheet

If you see an error, check the message — it will name which service failed and why.

---

## Start the daily scheduler

```bash
node index.js
```

This keeps the process running and fires every morning at **7:00 AM Eastern**. Run it inside `screen`, `tmux`, or a process manager like `pm2`:

```bash
# pm2 (recommended — restarts on crash, survives logout)
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Customising

| What to change | Where |
|---|---|
| Add/remove cities | `config.js` → `CITIES` array |
| Change job titles or priority | `config.js` → `TARGET_TITLES` |
| Adjust employee size range | `config.js` → `MIN_EMPLOYEES` / `MAX_EMPLOYEES` |
| Change max leads per run | `config.js` → `MAX_LEADS_PER_RUN` |
| Change schedule | `config.js` → `CRON_SCHEDULE` (cron syntax) |
| Add more industries | `config.js` → `INDUSTRY_KEYWORDS` |

---

## Email Alerts

The error handler in `index.js` logs to the console and prints a reminder. To activate email alerts:

1. `npm install nodemailer`
2. Uncomment and configure the `nodemailer` block at the bottom of `index.js`.
3. Use Gmail app-specific passwords or an SMTP relay (SendGrid, Mailgun, etc.).

---

## Target spreadsheet

**HVAC Leads — SW Michigan (Master)**
<https://docs.google.com/spreadsheets/d/1bTcYo6cfs2aTMbjzyD15FBMH3IQMGJP2Mt4MACJq6t8>

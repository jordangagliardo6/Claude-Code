# HVAC Lead Gen — First-Run Setup Guide

Complete these steps once before your first scheduled run.

---

## Step 1 — Install dependencies

```bash
cd hvac-lead-gen
npm install
```

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` in any text editor and fill in:

| Variable | Where to get it |
|---|---|
| `APOLLO_API_KEY` | [Apollo Settings → API](https://app.apollo.io/#/settings/integrations/api) |
| `SPREADSHEET_ID` | Already pre-filled — the ID of your *HVAC SW Michigan Leads* sheet |
| `GOOGLE_CREDENTIALS_PATH` | Path to the service account JSON file you create in Step 3 |
| `ALERT_EMAIL` | Your email address for error alerts (e.g. `jgagliardo98@gmail.com`) |
| `SMTP_*` | Gmail SMTP settings — see below |

### Gmail App Password (for error alerts)
1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Select **Mail** / **Other** and click **Generate**
3. Copy the 16-character password into `SMTP_PASS`

---

## Step 3 — Create a Google Service Account

This lets the script write to your Google Sheet without a browser OAuth flow.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.
2. Enable the **Google Sheets API** for your project:
   *APIs & Services → Library → search "Google Sheets API" → Enable*
3. Create a service account:
   *APIs & Services → Credentials → Create Credentials → Service Account*
   - Give it any name (e.g. `hvac-lead-gen`)
   - Skip the optional role/user steps
4. Open the service account, go to the **Keys** tab → **Add Key → JSON**.
   A `credentials.json` file will download.
5. Move `credentials.json` into the `hvac-lead-gen/` folder
   (or update `GOOGLE_CREDENTIALS_PATH` in `.env` to wherever you saved it).

### Share your spreadsheet with the service account

1. Open your *HVAC SW Michigan Leads* Google Sheet.
2. Click **Share** (top-right).
3. Enter the service account email address — it looks like
   `something@your-project.iam.gserviceaccount.com` and appears on the
   service account's detail page in Google Cloud Console.
4. Give it **Editor** access and click **Send**.

---

## Step 4 — Verify both connections

Run this before your first scheduled execution to confirm everything is wired up:

```bash
node index.js --verify
```

You should see:
```
✓ Apollo.io — connected. Search returned N result(s).
✓ Google Sheets — connected. 0 existing row(s) found.

All connections verified. Ready to run the scheduler.
```

If Apollo returns an error about API access, your account needs a paid plan.
Upgrade at [apollo.io/pricing](https://www.apollo.io/pricing) — the **Basic** plan unlocks people search.

---

## Step 5 — Do a manual test run

```bash
node index.js --run-now
```

This runs the full workflow immediately: searches Apollo, deduplicates, and appends
up to 25 new leads to your spreadsheet. Check the sheet after it completes.

---

## Step 6 — Start the daily scheduler

```bash
node index.js
```

The script keeps running in the foreground. To keep it alive on your server or Mac:

**Using PM2 (recommended for servers):**
```bash
npm install -g pm2
pm2 start index.js --name hvac-lead-gen
pm2 save
pm2 startup  # follow the printed command to auto-restart on reboot
```

**Using a system cron job instead of node-cron:**
If you prefer to let the OS handle scheduling, remove the `cron.schedule` block from
`index.js` and add this line to your crontab (`crontab -e`):
```
0 7 * * * cd /path/to/hvac-lead-gen && node index.js --run-now >> logs/lead-gen.log 2>&1
```

---

## Modifying city list or columns

- **Add/remove cities:** edit `SW_MICHIGAN_LOCATIONS` at the top of `lib/apollo.js`
- **Add/remove columns:** edit `HEADER_ROW` in `lib/sheets.js` and update the row-builder in `appendLeads()`
- **Change max leads per run:** edit `MAX_LEADS_PER_RUN` at the top of `index.js`
- **Change schedule time:** edit the cron string `'0 7 * * *'` in `index.js`
  (format: `minute hour * * *`, 24-hour clock, Eastern Time)

---

## Troubleshooting

| Error | Fix |
|---|---|
| `APOLLO_API_KEY is not set` | Add it to `.env` |
| `Apollo API returned 403` | Upgrade to a paid Apollo plan |
| `Error: ENOENT: credentials.json` | Check `GOOGLE_CREDENTIALS_PATH` in `.env` |
| `The caller does not have permission` | Share the spreadsheet with the service account email (Step 3) |
| No email alerts received | Double-check `SMTP_PASS` is a Gmail App Password, not your regular password |

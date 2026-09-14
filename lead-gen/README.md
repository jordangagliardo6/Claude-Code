# SW Michigan HVAC Lead Generation — Setup Guide

Searches Apollo.io every morning at **7:00 AM Eastern** for HVAC business owners in
Southwest Michigan and appends up to 25 new leads to your Google Sheet.

---

## What You Need Before Starting

- Node.js 18 or later
- An **Apollo.io account with a paid plan** (the People Search API requires it)
- A **Google Cloud project** with the Sheets API enabled

---

## Step 1 — Install Dependencies

```bash
cd lead-gen
npm install
```

---

## Step 2 — Apollo API Key

1. Log in to [apollo.io](https://www.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key

---

## Step 3 — Google Sheets Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or pick an existing one)
3. Enable the **Google Sheets API** (search "Sheets" in the API Library)
4. Go to **IAM & Admin → Service Accounts** → Create a service account
5. Name it anything (e.g. `hvac-lead-gen`)
6. Click **Manage Keys → Add Key → JSON** — this downloads `credentials.json`
7. Move that file into this folder: `lead-gen/credentials.json`
8. **Share your spreadsheet** with the service account email address
   (it looks like `hvac-lead-gen@your-project.iam.gserviceaccount.com`)
   and give it **Editor** access

---

## Step 4 — Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|---|---|
| `APOLLO_API_KEY` | Your Apollo API key |
| `GOOGLE_CREDENTIALS_PATH` | Path to your `credentials.json` (default `./credentials.json`) |
| `GOOGLE_SPREADSHEET_ID` | The ID from your sheet's URL — already pre-filled with your existing SW Michigan sheet |
| `SHEET_NAME` | Tab name inside the spreadsheet (default `Sheet1`) |
| `NOTIFICATION_EMAIL` | Where to send error alerts |
| `SMTP_*` | Optional: fill these in to receive error emails via Gmail |
| `MAX_LEADS_PER_RUN` | Max rows added per run (default `25`) |
| `DRY_RUN` | Set to `true` to test without writing |

---

## Step 5 — Confirm Connections Before First Run

```bash
npm run check
```

You should see:

```
╔══════════════════════════════╗
║   Connection Check Results   ║
╠══════════════════════════════╣
║  Apollo API   ✅ Connected    ║
║  Google Sheets ✅ Connected   ║
╚══════════════════════════════╝
```

If either shows ❌, the error above it explains what's wrong.

---

## Step 6 — Test with a Dry Run

```bash
npm run dry-run
```

This logs what would be added without touching the sheet.

---

## Step 7 — Run Once Immediately

```bash
npm run run-now
```

---

## Step 8 — Start the Daily Scheduler

```bash
npm start
```

Keep this process alive with `pm2` or a system service so it survives reboots:

```bash
npm install -g pm2
pm2 start index.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

The cron fires at **7:00 AM America/New_York** every day.

---

## Your Existing Spreadsheet

Your sheet is already pre-filled in `.env.example`:

- **SW Michigan HVAC Leads — New Sept 8 2026**
  `https://docs.google.com/spreadsheets/d/15DJVZJiMnbt6tdF6e2RMcGY6_M1JrjxomiIJJPJykhU/edit`

Columns expected (must match exactly):
`Date Added | Business Name | Owner First Name | Owner Last Name | Phone Number | City | Website | Called | Notes`

---

## Customizing

### Change the city list
Edit `CONFIG.cities` in `index.js` — one city per array entry, format `"City, Michigan"`.

### Change column order
Update the `personToRow()` function in `index.js` — each array position maps to one column.

### Change industries / titles
Edit `CONFIG.industryTags` and `CONFIG.jobTitles` in `index.js`.

---

## Error Notifications

If Apollo returns no results or the Sheets write fails, the error is:
1. Logged to the console
2. Emailed to `NOTIFICATION_EMAIL` (if SMTP vars are set)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `API_INACCESSIBLE` from Apollo | Your Apollo plan doesn't include People Search — upgrade at [apollo.io/pricing](https://www.apollo.io/pricing) |
| `403 Forbidden` from Sheets | Share the spreadsheet with the service-account email as Editor |
| `GOOGLE_SPREADSHEET_ID is not set` | Check your `.env` file |
| `credentials.json not found` | Set `GOOGLE_CREDENTIALS_PATH` or place the file at `./credentials.json` |

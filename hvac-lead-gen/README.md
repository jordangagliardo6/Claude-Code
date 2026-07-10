# HVAC Lead Gen — SW Michigan

Pulls up to 25 new HVAC / plumbing / mechanical contractor decision-maker leads from Apollo.io every morning at 7 AM Eastern and appends them to a Google Sheet — no duplicates, no manual work.

---

## What It Does

```
7:00 AM ET (daily cron)
       │
       ▼
Apollo.io Search
 • HVAC / plumbing / mechanical contractors
 • SW Michigan cities (St. Joseph, Benton Harbor, Kalamazoo,
   Holland, Grand Haven, Muskegon, South Haven)
 • Company size: 1–25 employees
 • Job titles: Owner → President → Founder → Co-Founder → General Manager
       │
       ▼
Phone Enrichment (Apollo async)
 • Reveals direct / mobile numbers
 • Skips anyone with no phone
       │
       ▼
Duplicate Check (Business Name column)
 • Skips any company already in the sheet
       │
       ▼
Append to Google Sheet (max 25 rows / run)
 Columns: Date Added | Business Name | Owner First Name | Owner Last Name
          | Phone Number | City | Website | Called | Notes
       │
       ▼
Error? → Email alert to your address
```

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| Node.js ≥ 18 | nodejs.org |
| Apollo.io account | apollo.io — Basic plan ($49/mo) recommended for phone reveals |
| Google account | Any Google account works |
| Google Cloud project | console.cloud.google.com |

---

## First-Time Setup (do this once)

### 1 — Clone and install

```bash
cd hvac-lead-gen
npm install
```

### 2 — Copy and fill in `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in:

- `APOLLO_API_KEY` — from [developer.apollo.io](https://developer.apollo.io) → API Keys
- `GOOGLE_SHEET_ID` — already set to the sheet created for you: `1i2wPT9RFCoNTN1_sT2gfJ6yaONTQeudLFg7CAvASFd8`
- `NOTIFICATION_EMAIL` — your email for error alerts
- `SMTP_USER` / `SMTP_PASS` — for Gmail, create an [App Password](https://myaccount.google.com/apppasswords)

### 3 — Set up Google OAuth

**a. Create OAuth credentials in Google Cloud Console:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (e.g., "HVAC Lead Gen") or use an existing one
3. Enable the **Google Sheets API** (APIs & Services → Library → search "Sheets")
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the JSON file
7. Rename it `credentials.json` and place it in the `hvac-lead-gen/` folder

**b. Run the setup script:**

```bash
npm run setup
```

This will:
- Open an authorization URL in your terminal — paste it into your browser
- Ask you to sign in with your Google account and allow access
- Paste the code from the redirect URL back into the terminal
- Save `token.json` (your saved OAuth session)
- Verify the spreadsheet is accessible and write column headers to row 1
- Confirm your Apollo API key works

**You only do this once.** The refresh token in `token.json` keeps the cron job running indefinitely without re-authentication.

### 4 — Confirm it works

```bash
node lead-gen.js --run-now
```

You should see output like:
```
[Lead Gen] Run started: 2026-07-10T...
[Sheets] Reading existing entries for duplicate check…
  → 0 existing entries loaded
[Apollo] Searching for HVAC decision-makers in SW Michigan…
  → 28 contacts returned from Apollo search
[Apollo] Requesting phone enrichment…
  [Apollo] Phone enrichment pending (attempt 1/12)…
  → 18 contacts enriched
  → 12 contacts have a phone number
[Sheets] Appending 12 new lead(s)…
✓ Done. 12 new lead(s) added to the sheet.
  Sheet: https://docs.google.com/spreadsheets/d/1i2wPT9RFCoNTN1_sT2gfJ6yaONTQeudLFg7CAvASFd8/edit
```

### 5 — Start the daily scheduler

```bash
npm start
```

Keep this process running (use `pm2`, `screen`, or a systemd service on a server). It will fire every morning at 7:00 AM Eastern automatically.

---

## Google Sheet

Your sheet is already created and ready:

**[SW Michigan HVAC Leads](https://docs.google.com/spreadsheets/d/1i2wPT9RFCoNTN1_sT2gfJ6yaONTQeudLFg7CAvASFd8/edit)**

Column layout:

| Column | Field | Notes |
|---|---|---|
| A | Date Added | Auto-filled |
| B | Business Name | Auto-filled |
| C | Owner First Name | Auto-filled |
| D | Owner Last Name | Auto-filled |
| E | Phone Number | Auto-filled (best available: mobile → direct → any) |
| F | City | Auto-filled |
| G | Website | Auto-filled if Apollo has it |
| H | Called | Leave blank — you fill in after calling |
| I | Notes | Leave blank — your call notes |

---

## Keeping the Scheduler Running (recommended: pm2)

```bash
npm install -g pm2
pm2 start lead-gen.js --name hvac-lead-gen
pm2 save
pm2 startup   # follow instructions to auto-start on reboot
```

To check logs: `pm2 logs hvac-lead-gen`

---

## Customization

### Change cities

In `lead-gen.js`, find the `TARGET_CITIES` array and add/remove cities:

```javascript
const TARGET_CITIES = [
  'St. Joseph',
  'Benton Harbor',
  'Kalamazoo',
  'Holland',
  'Grand Haven',
  'Muskegon',
  'South Haven',
  'Battle Creek',   // ← add more here
];
```

### Change job title priority

Edit the `TARGET_TITLES` array in `lead-gen.js`:

```javascript
const TARGET_TITLES = [
  'Owner',
  'President',
  'Founder',
  'Co-Founder',
  'General Manager',
  'Operations Manager',  // ← add here
];
```

### Change leads-per-run cap

In `.env`:

```
MAX_LEADS_PER_RUN=50
```

### Change the run time

In `lead-gen.js`, find the `cron.schedule` call and change the expression:

```javascript
cron.schedule('0 7 * * *', ...)   // 7:00 AM ET
cron.schedule('0 8 * * 1-5', ...) // 8:00 AM ET, weekdays only
```

---

## Apollo Plan Notes

- **Free plan**: 50 enrichments/month — enough for 2 test runs. Will run out quickly.
- **Basic ($49/mo)**: 1,000 enrichments/month — covers ~40 daily runs of 25 leads. Phone reveals cost additional direct-dial credits.
- If Apollo can't reveal phone numbers on your plan, the workflow logs a warning and emails you. No contacts without a phone number are added to the sheet.

---

## Troubleshooting

**"Apollo returned 0 results"**
- Your account's trial may be exhausted — check apollo.io usage dashboard
- Try broadening `TARGET_CITIES` or removing `include_similar_titles: false`

**"token.json not found"**
- Run `npm run setup` again

**"credentials.json not found"**
- Download OAuth credentials from Google Cloud Console and place in this folder

**Sheet not updating**
- Check that your Google account has editor access to the sheet
- Verify `GOOGLE_SHEET_ID` in `.env` matches the URL

**Phone enrichment times out**
- Apollo async phone enrichment sometimes takes longer on busy plans
- The script retries for 2 minutes (12 × 10s). If it still times out, check your direct-dial credit balance on apollo.io.

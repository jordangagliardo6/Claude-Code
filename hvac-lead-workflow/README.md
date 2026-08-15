# HVAC Lead Workflow — Southwest Michigan

Pulls up to 25 new HVAC owner/decision-maker leads from Apollo.io each morning at 7 AM Eastern and appends them to a Google Sheet — skipping any businesses already in the list.

---

## What it targets

| Filter | Value |
|---|---|
| Industries | HVAC / Plumbing / Heating & Air (SIC 1711, 7623) |
| Company size | 1–25 employees |
| Cities | St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, South Haven |
| Job titles | Owner → President → Founder → Co-Founder → General Manager |
| Phone required | Yes — leads without a phone number are skipped |

The Google Sheet it writes to: **SW Michigan HVAC Leads**
`https://docs.google.com/spreadsheets/d/1Z2CrAggrULqpiZSTDlG5muIxaO4SCSjdIUo-Do_sEus/edit`

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 | `node --version` to check |
| Apollo.io Basic plan | The prospecting search endpoint is not available on the free plan. Upgrade at [apollo.io/pricing](https://www.apollo.io/pricing) |
| Google Cloud project | Free tier is fine |

---

## First-time setup (do this once)

### 1 — Clone and install

```bash
git clone <repo>
cd hvac-lead-workflow
npm install
cp .env.example .env
```

### 2 — Get your Apollo API key

1. Log in to [app.apollo.io](https://app.apollo.io)
2. Go to **Settings → Integrations → API**
3. Copy your API key into `.env` as `APOLLO_API_KEY`

### 3 — Set up Google Sheets access

**Create OAuth credentials:**

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Go to **APIs & Services → Library** → search "Google Sheets API" → Enable it
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the JSON; copy `client_id` → `GOOGLE_CLIENT_ID` and `client_secret` → `GOOGLE_CLIENT_SECRET` in `.env`

**Get your refresh token:**

```bash
npm run auth
```

Open the URL it prints, sign in with the Google account that owns the sheet, click Allow, then paste the code back into the terminal. Copy the printed `GOOGLE_REFRESH_TOKEN` line into your `.env`.

### 4 — Verify everything is connected

```bash
npm run setup
```

This checks:
- All env vars are set
- Apollo API key is valid and the search endpoint works
- Google Sheet is accessible and has the correct column headers

Fix any issues it flags, then run it again until all checks pass.

### 5 — Start the scheduler

```bash
npm start
```

The process stays running and fires every morning at 7:00 AM Eastern. Use a process manager like `pm2` or a system service to keep it alive after a reboot:

```bash
npm install -g pm2
pm2 start workflow.js --name hvac-leads
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

---

## Run a single batch right now

```bash
npm run run-now
# or
node workflow.js --run-now
```

---

## Customizing

### Change cities

Edit `SW_MICHIGAN_CITIES` in `workflow.js`. Each string is passed to Apollo as-is, so use `"City, Michigan"` format.

### Change max leads per run

Edit `LEADS_PER_RUN` in `workflow.js` (default: 25).

### Add an industry

Add SIC codes to `HVAC_SIC_CODES`:
- `1711` — Plumbing, Heating, Air-Conditioning Contractors
- `7623` — Refrigeration & AC Service and Repair
- `1731` — Electrical Work (often combined with HVAC)
- `1731` — Mechanical Contracting

Look up SIC codes at [siccode.com](https://siccode.com).

### Change column layout

If you add/remove columns in the sheet, update the `appendLeads()` function in `workflow.js` to match (each array element in `rows.map()` corresponds to one column, left to right).

---

## Error handling

Errors are logged to stdout with an `[ERROR]` prefix, timestamp, and the API error detail. If the scheduler is running under `pm2`, logs are saved to `~/.pm2/logs/hvac-leads-error.log`.

### Add email alerts

1. Install nodemailer: `npm install nodemailer`
2. Add to `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=jgagliardo98@gmail.com
   SMTP_PASS=your_app_password
   ```
3. In `workflow.js`, add this function and call `sendEmail()` inside `notifyError()`:

```js
const nodemailer = require('nodemailer');

async function sendEmail(subject, body) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to:   process.env.NOTIFY_EMAIL,
    subject,
    text: body,
  });
}
```

---

## Files

| File | Purpose |
|---|---|
| `workflow.js` | Main script — cron scheduler + Apollo search + Sheets write |
| `setup.js` | First-run connection test — run before first use |
| `auth-setup.js` | Google OAuth2 helper — run once to get refresh token |
| `.env.example` | Environment variable template |
| `package.json` | Node.js dependencies |

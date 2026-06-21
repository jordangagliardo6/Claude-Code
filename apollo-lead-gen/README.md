# Apollo Lead Gen — Southwest Michigan HVAC/Plumbing/Mechanical

Automates daily lead generation: searches Apollo.io for small (1-25 employee)
HVAC, heating/air, plumbing, and mechanical contracting companies around
St. Joseph, Benton Harbor, Kalamazoo, Holland, Grand Haven, Muskegon, and
South Haven, MI — targeting owners/decision-makers — and appends new,
phone-having, non-duplicate leads to a Google Sheet every morning at 7am ET.

```
config.js            <- edit this for cities / titles / columns / schedule
src/apolloClient.js  <- Apollo.io search + phone enrichment
src/googleSheetsClient.js <- Google Sheets read/append + dedupe
src/runWorkflow.js   <- orchestrates one full run
src/logger.js        <- console logging + email alerts on failure
scheduler.js         <- node-cron, fires runWorkflow at 7am America/New_York
test-connection.js   <- verifies both API connections without writing data
scripts/google-auth.js <- one-time OAuth setup
```

---

## 1. Install

```bash
cd apollo-lead-gen
npm install
cp .env.example .env
```

## 2. Apollo.io API key

1. Log into [Apollo.io](https://app.apollo.io) → **Settings → Integrations → API**.
2. Create an API key (a paid plan is required to reveal phone numbers —
   the free tier will return contacts but most phone fields will be empty).
3. Put it in `.env`:
   ```
   APOLLO_API_KEY=your_key_here
   ```

## 3. Google Sheet

1. Create a Google Sheet (or use an existing one).
2. Rename a tab to `Leads` (or anything — just set `GOOGLE_SHEET_TAB_NAME`
   in `.env` to match).
3. Copy the spreadsheet ID out of the URL:
   `https://docs.google.com/spreadsheets/d/THIS_PART/edit` → into `.env` as
   `GOOGLE_SHEET_ID`.
4. Leave the tab empty (no header row) the first time — `test-connection`
   and the first run will create the header row for you automatically:
   `Date Added, Business Name, Owner First Name, Owner Last Name,
   Phone Number, City, Website, Called, Notes`.

## 4. Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create
   (or pick) a project.
2. **APIs & Services → Library** → enable the **Google Sheets API**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Desktop app**.
   - Copy the generated Client ID / Client Secret into `.env` as
     `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. If your Cloud project's OAuth consent screen is in "Testing" mode, add
   your own Google account as a **Test user** (Audience tab), or it'll be
   rejected when you try to authorize.
5. Run the one-time auth flow:
   ```bash
   npm run auth:google
   ```
   It prints a URL — open it, sign in with the Google account that owns/edits
   the sheet, approve access, and paste the code back into the terminal. It
   will print a `GOOGLE_REFRESH_TOKEN` — copy that into `.env`.

## 5. (Optional) Error-alert emails

Set `ALERT_EMAIL_TO` and `ALERT_EMAIL_SMTP_*` in `.env` (any SMTP provider —
a Gmail [App Password](https://myaccount.google.com/apppasswords) works
fine). If left blank, failures still get logged loudly to the console, just
no email is sent.

---

## First run: confirm everything is connected

**Before** turning on the scheduler, verify both connections:

```bash
npm run test-connection
```

You should see:

```
Testing Apollo.io connection...
  PASS: Apollo API key is valid. Sample query returned 1 result(s).

Testing Google Sheets connection...
  PASS: Connected to spreadsheet "Your Sheet Name" -> tab "Leads". Header row OK.

------------------------------------------------------------
Both connections succeeded. Safe to enable the 7am scheduler (npm start).
```

If either fails, the error message tells you exactly what's missing (bad
key, missing sheet tab, no refresh token, etc.) — fix it and re-run.

Then do one manual end-to-end run and check the sheet for new rows:

```bash
npm run run-once
```

## 6. Turn on the daily 7am schedule

Two options — pick whichever fits how you run things:

**Option A — node-cron (keeps a Node process running):**
```bash
npm start
```
Leave this running (use `pm2`, `systemd`, a `tmux`/`screen` session, or a
Docker container with `restart: always` so it survives reboots/crashes).

**Option B — a real OS cron job (no long-running process needed):**
```bash
crontab -e
```
Add:
```
0 7 * * * cd /full/path/to/apollo-lead-gen && /usr/bin/node src/runWorkflow.js >> run.log 2>&1
```
(Server's local time zone matters here — set `TZ=America/New_York` on the
line, or in the crontab's `TZ=` header, if the server isn't already in
Eastern time.)

---

## Customizing

- **Cities / industries / titles / employee size / max leads per run /
  schedule time** — all in `config.js`, with comments next to each.
- **Sheet columns** — edit the `sheet.columns` array in `config.js`. The
  order in that array becomes the column order in the sheet. `runWorkflow.js`
  always writes `Called` and `Notes` as blank strings; everything else maps
  positionally, so if you add a column you'll also want to add a
  corresponding value in the `newRows.push(...)` line in `src/runWorkflow.js`.

## Notes on phone numbers

Apollo's phone reveal is sometimes synchronous (company main lines,
previously-verified direct dials) and sometimes only delivered via an async
webhook callback (freshly-looked-up personal mobile numbers). This workflow
requests `reveal_phone_number: true` on every enrichment call and uses
whatever Apollo returns synchronously, preferring mobile > direct dial >
company main line. If you want guaranteed personal mobile reveals, set
`WEBHOOK_URL` in `.env` to a publicly reachable endpoint and extend
`enrichPhone()` in `src/apolloClient.js` to await that callback.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `test-connection` Apollo FAIL: 401/403 | Bad/expired `APOLLO_API_KEY` |
| `test-connection` Apollo PASS but 0 phone numbers ever found | Apollo plan doesn't include phone credits/reveal |
| `test-connection` Sheets FAIL: no refresh token | Run `npm run auth:google` |
| `test-connection` Sheets FAIL: no tab named "Leads" | Create the tab or fix `GOOGLE_SHEET_TAB_NAME` |
| Daily run logs "Apollo returned no results" | Filters in `config.js` may be too narrow, or Apollo credits exhausted — check the Apollo dashboard |
| Email alerts never arrive | `ALERT_EMAIL_SMTP_*` not set, or SMTP provider needs an app-specific password |

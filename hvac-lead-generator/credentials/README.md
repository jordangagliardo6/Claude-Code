# Google Service Account Setup

Store your `service-account-key.json` file in this directory (it is git-ignored).
Then set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` in your `.env` file to the absolute path.

## Steps to create the service account

1. Go to https://console.cloud.google.com/
2. Select (or create) a project.
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - IAM & Admin → Service Accounts → Create Service Account
   - Name it something like `hvac-lead-generator`
   - Role: **Editor** (or a custom role with Sheets read/write)
   - Click Done
5. Generate a JSON key:
   - Click the service account → Keys → Add Key → Create new key → JSON
   - Save the downloaded file as `credentials/service-account-key.json`
6. Share your Google Sheet with the service account:
   - Open the spreadsheet
   - Click Share → add the service account email (looks like `name@project.iam.gserviceaccount.com`)
   - Give it **Editor** access

## .env entry

```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/absolute/path/to/hvac-lead-generator/credentials/service-account-key.json
```

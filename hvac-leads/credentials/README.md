# Google Service Account Credentials

Place your Google service account JSON file in this folder and name it:

    service-account.json

## How to create a service account (5 minutes)

1. Go to https://console.cloud.google.com
2. Create a new project (or select an existing one).
3. Enable the **Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
4. Create a service account:
   - APIs & Services → Credentials → Create Credentials → Service Account
   - Name it anything (e.g. "hvac-leads-bot"), click Done
5. Create a JSON key for the service account:
   - Click the service account → Keys tab → Add Key → JSON
   - A file downloads automatically — rename it `service-account.json` and put it here
6. Share your Google Sheet with the service account email:
   - Open the spreadsheet → Share
   - Paste the service account email (looks like `name@project.iam.gserviceaccount.com`)
   - Set permission to **Editor** → Send

That's it. The script will authenticate automatically using this file.

## Security note

`service-account.json` is in `.gitignore` and must NEVER be committed to version control.

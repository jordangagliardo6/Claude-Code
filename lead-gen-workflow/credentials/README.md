# Google Service Account Credentials

Place your Google service account JSON key file in this folder and name it:

    service-account.json

## How to get it

1. Go to https://console.cloud.google.com/
2. Create a project (or select an existing one)
3. Enable the **Google Sheets API** for the project
4. Go to **IAM & Admin → Service Accounts**
5. Click **Create Service Account** — name it anything (e.g. "lead-gen-bot")
6. Click the service account → **Keys tab → Add Key → Create new key → JSON**
7. Download the JSON file and rename it `service-account.json`
8. Place it in this `credentials/` folder

## Grant the service account access to your spreadsheet

1. Open your Google Sheet
2. Click **Share**
3. Paste the service account's email address (found in the JSON as `client_email`)
4. Grant **Editor** access
5. Click **Send**

The workflow will now be able to read and write that spreadsheet.

> Keep this file out of version control — it's already listed in .gitignore.

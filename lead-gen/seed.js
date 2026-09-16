/**
 * seed.js — First-run data seed
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this ONCE to populate today's batch of leads from the Shoreline call
 * sheet. These are companies with phone numbers that haven't appeared in
 * previous automated runs. Future daily runs use the Apollo API automatically.
 *
 * Usage:
 *   node seed.js
 *
 * Requires the same .env setup as lead-gen-workflow.js (Google Sheets auth).
 */

require('dotenv').config();
const { getSheetsClient, getExistingBusinessNames, appendLeadsToSheet } = require('./src/sheets');
const config = require('./src/config');

// ─── Today's seed batch (Sept 16, 2026) ──────────────────────────────────────
// Source: Shoreline_HVAC_CallSheet_v3 — companies with phone numbers that were
// not included in the Aug 23 automated run batch.
// Owner names are extracted where available; blanks will be enriched later.
const SEED_LEADS = [
  { businessName: "Smitty's Heating and Air Conditioning", firstName: 'Mike',    lastName: 'Smith',  phone: '(269) 266-7286', city: 'Stevensville, MI',  website: '' },
  { businessName: 'Hart Heating & Air',                    firstName: 'Paul',    lastName: 'Hart',   phone: '(269) 925-0443', city: 'Benton Harbor, MI',  website: '' },
  { businessName: 'mi heating & cooling',                  firstName: 'Jeff',    lastName: '',       phone: '(616) 283-4512', city: 'Zeeland, MI',         website: '' },
  { businessName: 'Hoyle Heating & Cooling',               firstName: 'Chris',   lastName: '',       phone: '(269) 655-4019', city: 'Mattawan, MI',        website: '' },
  { businessName: 'Mead Mechanical LLC Heating And Cooling', firstName: 'Michael', lastName: '',     phone: '(269) 443-1299', city: 'South Haven, MI',     website: '' },
  { businessName: 'All Pro Heating & Cooling',             firstName: 'Chuck',   lastName: '',       phone: '(269) 639-1896', city: 'South Haven, MI',     website: '' },
  { businessName: 'Cool Breeze Mechanical',                firstName: 'Sean',    lastName: '',       phone: '(269) 254-5620', city: 'Three Rivers, MI',    website: '' },
  { businessName: 'Teed Heating & Cooling, Inc',           firstName: 'Sherri',  lastName: '',       phone: '(269) 468-9640', city: 'Coloma, MI',          website: 'https://teedguaranteed.com/' },
  { businessName: 'Infinity Mechanical Services',          firstName: '',        lastName: '',       phone: '(269) 363-3907', city: 'St Joseph, MI',       website: 'http://www.ims-hvac.net/' },
  { businessName: 'B.E.R Refrigeration, Heating, Cooling, Piping', firstName: '', lastName: '',     phone: '(269) 428-2711', city: 'St Joseph, MI',       website: 'http://berhvac.com/' },
  { businessName: 'Spitale Heating & Air Conditioning',    firstName: '',        lastName: '',       phone: '(269) 428-0069', city: 'Stevensville, MI',    website: 'http://spitalehvac.com/' },
  { businessName: 'The Furnace Guy, Inc.',                 firstName: '',        lastName: '',       phone: '(269) 544-0904', city: 'Kalamazoo, MI',       website: 'https://www.thefurnaceguyinc.com/' },
  { businessName: 'Kalamazoo Heating & Appliance Co',      firstName: '',        lastName: '',       phone: '(269) 375-2788', city: 'Kalamazoo, MI',       website: '' },
  { businessName: 'Top Flight Heating & Air Conditioning', firstName: '',        lastName: '',       phone: '(269) 873-0988', city: 'Kalamazoo, MI',       website: '' },
  { businessName: 'Adams Heating & Cooling',               firstName: '',        lastName: '',       phone: '(269) 349-7240', city: 'Kalamazoo, MI',       website: 'https://www.adamshc.com/' },
  { businessName: "Metzger's",                             firstName: '',        lastName: '',       phone: '(269) 385-3562', city: 'Kalamazoo, MI',       website: 'http://www.metzgers.biz/' },
  { businessName: 'DeHaan',                                firstName: '',        lastName: '',       phone: '(269) 343-1623', city: 'Kalamazoo, MI',       website: 'http://www.dehaanheating.com/' },
  { businessName: 'Mall City Mechanical, Inc.',            firstName: '',        lastName: '',       phone: '(269) 349-3661', city: 'Kalamazoo, MI',       website: 'http://www.mcm-team.com/' },
  { businessName: 'Preferred Plumbing & Heating',          firstName: '',        lastName: '',       phone: '(269) 903-2891', city: 'Kalamazoo, MI',       website: 'https://www.preferredplumbinghvac.com/' },
  { businessName: 'KC Heating and Cooling',                firstName: '',        lastName: '',       phone: '(269) 903-7382', city: 'Kalamazoo, MI',       website: 'https://www.kcheatingandcooling.net/' },
  { businessName: 'Home Energy Solutions',                 firstName: '',        lastName: '',       phone: '(269) 888-3982', city: 'Kalamazoo, MI',       website: 'http://www.heskzoo.com/' },
  { businessName: 'Johnson\'s Heating and Air',            firstName: '',        lastName: '',       phone: '(269) 621-4285', city: 'Hartford, MI',        website: 'https://johnsons-heating.com/' },
  { businessName: 'Advanced Heating & Cooling',            firstName: '',        lastName: '',       phone: '(269) 624-5800', city: 'Lawton, MI',          website: '' },
  { businessName: 'B & D Heating And Cooling',             firstName: '',        lastName: '',       phone: '(269) 998-6093', city: 'Marcellus, MI',       website: 'http://bdheatingcooling.com/' },
  { businessName: 'Jergens Piping Corp.',                  firstName: '',        lastName: '',       phone: '(269) 496-7030', city: 'Mendon, MI',          website: 'https://jergenspiping.com/' },
];

async function main() {
  console.log('=== HVAC Lead Gen — First-Run Seed ===');
  console.log(`Seeding ${SEED_LEADS.length} leads into the spreadsheet...`);

  const sheets = await getSheetsClient();
  const existingNames = await getExistingBusinessNames(sheets, config.SPREADSHEET_ID, config.SHEET_TAB_NAME);

  const newLeads = SEED_LEADS.filter((lead) => {
    const key = lead.businessName.trim().toLowerCase();
    return !existingNames.has(key);
  });

  console.log(`Dedup: ${SEED_LEADS.length} leads → ${newLeads.length} are new`);

  const count = await appendLeadsToSheet(
    sheets,
    config.SPREADSHEET_ID,
    config.SHEET_TAB_NAME,
    newLeads.slice(0, config.MAX_LEADS_PER_RUN),
    config.COLUMNS,
  );

  console.log(`\n[Done] Added ${count} leads to:\nhttps://docs.google.com/spreadsheets/d/${config.SPREADSHEET_ID}/edit`);
}

main().catch((err) => {
  console.error('[Error]', err.message);
  process.exit(1);
});

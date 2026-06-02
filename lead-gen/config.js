'use strict';

// ─── Target geography ─────────────────────────────────────────────────────────
// Add or remove cities freely. Each city gets its own Apollo search pass.
const CITIES = [
  'St. Joseph, MI',
  'Benton Harbor, MI',
  'Kalamazoo, MI',
  'Holland, MI',
  'Grand Haven, MI',
  'Muskegon, MI',
  'South Haven, MI',
];

// ─── Industry keywords used to filter companies in Apollo ─────────────────────
// These map to Apollo's organization keyword tags. Adjust if Apollo's taxonomy
// uses different labels for your target industries.
const INDUSTRY_KEYWORDS = [
  'hvac',
  'heating and air conditioning',
  'heating and cooling',
  'plumbing',
  'mechanical contracting',
  'air conditioning',
];

// ─── Decision-maker titles (priority order — Apollo will fuzzy-match these) ───
const TARGET_TITLES = [
  'owner',
  'president',
  'founder',
  'co-founder',
  'co founder',
  'general manager',
];

// ─── Apollo employee size filter ──────────────────────────────────────────────
// "1,25" means 1–25 employees (owner-operated small businesses)
const EMPLOYEE_RANGES = ['1,10', '11,25'];

// ─── Sheet column layout ──────────────────────────────────────────────────────
// Change the order here if you want different columns. The values map to
// Apollo response fields — don't rename the keys, only reorder the array.
// 'blank' columns are left empty for manual entry (Called, Notes).
const COLUMN_ORDER = [
  'dateAdded',       // A – today's date
  'businessName',    // B – company name
  'firstName',       // C – owner first name
  'lastName',        // D – owner last name
  'phone',           // E – best available phone number
  'city',            // F – city
  'website',         // G – website URL
  'called',          // H – blank (you fill in)
  'notes',           // I – blank (you fill in)
];

// Row 1 header labels — must match COLUMN_ORDER length and position
const HEADERS = [
  'Date Added',
  'Business Name',
  'Owner First Name',
  'Owner Last Name',
  'Phone Number',
  'City',
  'Website',
  'Called',
  'Notes',
];

module.exports = {
  CITIES,
  INDUSTRY_KEYWORDS,
  TARGET_TITLES,
  EMPLOYEE_RANGES,
  COLUMN_ORDER,
  HEADERS,
  MAX_LEADS_PER_RUN: parseInt(process.env.MAX_LEADS_PER_RUN || '25', 10),
  SHEET_TAB: process.env.GOOGLE_SHEET_TAB || 'Leads',
};

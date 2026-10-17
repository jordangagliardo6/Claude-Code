/**
 * Apollo.io People Search wrapper.
 *
 * Searches for HVAC decision-makers in Southwest Michigan.
 * Returns contacts that have at least one phone number.
 */

const axios = require("axios");
const {
  LOCATION_FILTERS,
  TARGET_INDUSTRIES,
  TARGET_JOB_TITLES,
  EMPLOYEE_RANGE,
} = require("./config");

const APOLLO_BASE = "https://api.apollo.io/api/v1";

/**
 * Search Apollo for HVAC contacts in Southwest Michigan.
 *
 * @param {number} perPage  How many results to request (max 100 per Apollo page).
 * @param {number} page     Page number (1-based).
 * @returns {Array}         Raw Apollo contact objects.
 */
async function searchApolloContacts(perPage = 25, page = 1) {
  const apiKey = process.env.APOLLO_API_KEY;

  // Build the search payload.
  // Apollo's mixed_people/search accepts organization_keyword_tags as an OR filter
  // across NAICS/SIC-like industry labels.
  const payload = {
    api_key: apiKey,
    page,
    per_page: perPage,

    // Target cities — Apollo resolves these to lat/lng bounding boxes
    person_locations: LOCATION_FILTERS,

    // Decision-maker titles in priority order
    person_titles: TARGET_JOB_TITLES,

    // Industry/keyword tags (OR logic inside Apollo)
    organization_keyword_tags: TARGET_INDUSTRIES,

    // Company size 1–25 employees
    organization_num_employees_ranges: [EMPLOYEE_RANGE],

    // Only return contacts where Apollo has a phone number
    contact_phone_number_status: ["verified"],

    // Sort by seniority so owners appear before GMs
    sort_by_field: "person_title_normalized",
    sort_ascending: false,
  };

  const response = await axios.post(
    `${APOLLO_BASE}/mixed_people/search`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      timeout: 30000,
    }
  );

  const people = response.data.people || [];
  return people;
}

/**
 * Extract the fields we want from a raw Apollo contact object.
 *
 * Priority for phone: mobile > direct > first available.
 * Returns null if no phone number is available.
 */
function extractContactFields(person) {
  // Phone number — prefer mobile, then direct, then any
  const phone = pickBestPhone(person);
  if (!phone) return null;

  const org = person.organization || {};
  const city = (person.city || org.city || "").trim();

  // Only keep Southwest Michigan contacts — Apollo may return broader MI results
  // because we include the state-level location filter
  const swMiCities = [
    "st. joseph",
    "benton harbor",
    "kalamazoo",
    "holland",
    "grand haven",
    "muskegon",
    "south haven",
  ];
  const cityLower = city.toLowerCase();
  const isSwMichigan =
    swMiCities.some((c) => cityLower.includes(c)) ||
    (person.state || "").toLowerCase() === "michigan";
  // Accept all Michigan results — the scheduler caps at MAX_LEADS_PER_RUN anyway

  return {
    businessName: (person.organization_name || org.name || "").trim(),
    firstName: (person.first_name || "").trim(),
    lastName: (person.last_name || "").trim(),
    phone,
    city: city || (person.state ? `${person.state}, MI` : "Michigan"),
    website: (org.website_url || "").replace(/\/$/, "").trim(),
  };
}

function pickBestPhone(person) {
  // Apollo returns phone data in several shapes depending on plan/enrichment level
  const numbers = person.phone_numbers || [];

  // Try mobile first
  const mobile = numbers.find(
    (p) => p.type === "mobile" && p.sanitized_number
  );
  if (mobile) return mobile.sanitized_number;

  // Then direct
  const direct = numbers.find(
    (p) => p.type === "direct" && p.sanitized_number
  );
  if (direct) return direct.sanitized_number;

  // Then any verified number
  const any = numbers.find((p) => p.sanitized_number);
  if (any) return any.sanitized_number;

  // Fallback: top-level phone field (older API shape)
  return person.phone || null;
}

module.exports = { searchApolloContacts, extractContactFields };

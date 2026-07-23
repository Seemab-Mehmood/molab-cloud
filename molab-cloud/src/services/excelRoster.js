const XLSX = require('xlsx');

/**
 * Parses an uploaded roster spreadsheet buffer into normalized rows.
 * Recognized headers (case-insensitive, order-independent):
 *   Name | Full Name
 *   MOLAB ID | Membership ID | MOLAB Membership ID
 *   Email
 *   Hospital | Institution | Hospital/Institution Affiliated
 *   Country
 *   Tier | Membership Tier   (optional — defaults to "Member")
 */
function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_MAP = {
  name: 'fullName', fullname: 'fullName',
  molabid: 'molabId', membershipid: 'molabId', molabmembershipid: 'molabId', id: 'molabId',
  email: 'email',
  hospital: 'hospital', institution: 'hospital', hospitalinstitution: 'hospital',
  hospitalinstitutionaffiliated: 'hospital', affiliation: 'hospital',
  country: 'country',
  tier: 'tier', membershiptier: 'tier',
};

function parseRosterBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const rows = [];
  const warnings = [];

  raw.forEach((rawRow, idx) => {
    const mapped = {};
    Object.keys(rawRow).forEach((key) => {
      const norm = normalizeHeader(key);
      const target = HEADER_MAP[norm];
      if (target) mapped[target] = String(rawRow[key]).trim();
    });

    const rowNum = idx + 2; // account for header row, 1-indexed
    if (!mapped.fullName || !mapped.molabId || !mapped.email || !mapped.hospital || !mapped.country) {
      warnings.push(`Row ${rowNum}: skipped — missing one of Name / MOLAB ID / Email / Hospital / Country.`);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mapped.email)) {
      warnings.push(`Row ${rowNum}: skipped — invalid email "${mapped.email}".`);
      return;
    }
    rows.push({
      fullName: mapped.fullName,
      molabId: mapped.molabId,
      email: mapped.email.toLowerCase(),
      hospital: mapped.hospital,
      country: mapped.country,
      tier: mapped.tier || 'Member',
    });
  });

  return { rows, warnings };
}

module.exports = { parseRosterBuffer };

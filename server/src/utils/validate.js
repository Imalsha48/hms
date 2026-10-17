// Small helpers for checking request input
const AppError = require('./AppError');

// Throws 400 if any of the listed fields are missing/empty
function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw new AppError(`Missing required field(s): ${missing.join(', ')}`);
}

// Copies only the allowed keys (stops clients from setting fields like id or createdAt)
function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f] === '' ? null : body[f];
  return out;
}

// Parses a route param like /:id into a number, or throws 400
function toId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Invalid id');
  return id;
}

// "2026-10-17" -> Date at local midnight (new Date("2026-10-17") would be UTC midnight)
function parseLocalDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) throw new AppError('Date must be in YYYY-MM-DD format');
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// For DATE-only columns (@db.Date: attendance, leave, expiry).
// MySQL stores just the date, and Prisma sends dates as UTC, so we build UTC midnight.
// (Local midnight in Sri Lanka is 18:30 UTC the day before, which would save the wrong day.)
function dateOnly(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) throw new AppError('Date must be in YYYY-MM-DD format');
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Today's date (hospital time zone) as a DATE-only value
function todayDateOnly() {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

// Pagination from ?page=1&pageSize=20
function paging(query, defaultSize = 20) {
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), 100);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

module.exports = { requireFields, pick, toId, parseLocalDate, dateOnly, todayDateOnly, paging };

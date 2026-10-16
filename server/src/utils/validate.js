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

// Pagination from ?page=1&pageSize=20
function paging(query, defaultSize = 20) {
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), 100);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

module.exports = { requireFields, pick, toId, parseLocalDate, paging };

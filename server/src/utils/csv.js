// Turns rows into a CSV file that opens correctly in Excel
// columns: [{ key: 'name', label: 'Name' }, ...]
function toCsv(columns, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(',')];
  for (const r of rows) lines.push(columns.map((c) => esc(r[c.key])).join(','));
  // ﻿ (BOM) tells Excel the file is UTF-8
  return '﻿' + lines.join('\r\n');
}

module.exports = { toCsv };

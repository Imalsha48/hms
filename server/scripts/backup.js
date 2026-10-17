// Creates a full backup file:  npm run backup
// Saved to server/backups/hms-backup-YYYY-MM-DD_HH-mm.json (or the folder given as the first argument)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createBackup, disconnect } = require('../src/services/backupService');

(async () => {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'backups'));
  fs.mkdirSync(dir, { recursive: true });
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const file = path.join(dir, `hms-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}.json`);

  const { json, counts } = await createBackup();
  fs.writeFileSync(file, json);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Backup saved: ${file}`);
  console.log(`${total} records in ${Object.keys(counts).length} tables, ${(json.length / 1024).toFixed(0)} KB`);
})()
  .catch((e) => { console.error('Backup FAILED:', e.message); process.exitCode = 1; })
  .finally(disconnect);

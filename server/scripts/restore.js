// Restores a backup file. THIS REPLACES ALL CURRENT DATA.
//   npm run restore -- backups/hms-backup-2026-10-17_00-00.json --yes
require('dotenv').config();
const fs = require('fs');
const { restoreBackup, disconnect } = require('../src/services/backupService');

(async () => {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) throw new Error('Give the path to a backup file, e.g. npm run restore -- backups/hms-backup-....json --yes');
  if (!process.argv.includes('--yes')) {
    const host = (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] || 'unknown';
    throw new Error(`This will DELETE all data in the database at ${host} and replace it with the backup.\nRun again with --yes to confirm.`);
  }
  console.log('Restoring... (this can take a minute)');
  const counts = await restoreBackup(fs.readFileSync(file, 'utf8'));
  console.log('Restore complete:', Object.entries(counts).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(', '));
})()
  .catch((e) => { console.error('Restore FAILED:', e.message); process.exitCode = 1; })
  .finally(disconnect);

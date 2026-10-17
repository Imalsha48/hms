// =============================================================
// Backup & recovery (spec 4 Reliability + 10 Backup and Recovery)
// A backup is ONE JSON file containing every table, so it can be
// restored into any MySQL database (local, Aiven, or a new server).
// =============================================================
const { PrismaClient } = require('@prisma/client');

// Tables in dependency order: a table only references tables above it.
// Restore inserts top-to-bottom; clearing goes bottom-to-top.
const TABLES = [
  'user', 'department', 'doctor', 'doctorSchedule', 'patient', 'patientDocument', 'ward', 'bed',
  'invoice', 'appointment', 'admission', 'medicalRecord', 'labTestType', 'medicine', 'medicineBatch',
  'prescription', 'prescriptionItem', 'labRequest', 'invoiceItem', 'payment',
  'employee', 'attendance', 'leaveRecord', 'auditLog',
];
const FORMAT_VERSION = 1;

// Own client WITHOUT the "omit file bytes" setting, so uploaded files are included
let client;
const db = () => (client ||= new PrismaClient());

// File bytes can't go into JSON directly, so they are stored as base64
const replacer = (key, value) =>
  value && value.type === 'Buffer' && Array.isArray(value.data)
    ? { __bytes: Buffer.from(value.data).toString('base64') }
    : value instanceof Uint8Array
      ? { __bytes: Buffer.from(value).toString('base64') }
      : value;
const reviver = (key, value) => (value && typeof value === 'object' && typeof value.__bytes === 'string' ? Buffer.from(value.__bytes, 'base64') : value);

async function createBackup() {
  const tables = {};
  const counts = {};
  for (const t of TABLES) {
    tables[t] = await db()[t].findMany({ orderBy: { id: 'asc' } });
    counts[t] = tables[t].length;
  }
  const backup = { app: 'HMS', formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString(), counts, tables };
  return { json: JSON.stringify(backup, replacer), counts };
}

// Replaces ALL data with the backup's data, inside one transaction:
// if anything fails, the database is left exactly as it was.
async function restoreBackup(jsonText) {
  const backup = JSON.parse(jsonText, reviver);
  if (backup.app !== 'HMS' || !backup.tables) throw new Error('This is not an HMS backup file');
  if (backup.formatVersion !== FORMAT_VERSION) throw new Error(`Unsupported backup version ${backup.formatVersion}`);

  await db().$transaction(
    async (tx) => {
      for (const t of [...TABLES].reverse()) await tx[t].deleteMany();
      for (const t of TABLES) {
        const rows = backup.tables[t] || [];
        for (let i = 0; i < rows.length; i += 500) await tx[t].createMany({ data: rows.slice(i, i + 500) });
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 }
  );
  return backup.counts;
}

async function disconnect() {
  if (client) await client.$disconnect();
}

module.exports = { createBackup, restoreBackup, disconnect, TABLES };

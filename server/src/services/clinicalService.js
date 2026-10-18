// Loads patient data from the database and runs the decision-support rules on it
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { analyzePrescription, patientInsights } = require('../clinical/decisionSupport');

const CURRENT_DAYS = 30;   // medicines prescribed in the last 30 days count as "current"
const RECENT_DAYS = 90;    // for polypharmacy

async function currentMedicines(patientId, excludePrescriptionId) {
  const since = new Date(Date.now() - CURRENT_DAYS * 86400000);
  const rxs = await prisma.prescription.findMany({
    where: { patientId, createdAt: { gte: since }, ...(excludePrescriptionId && { id: { not: excludePrescriptionId } }) },
    include: { items: { include: { medicine: true } } },
  });
  return rxs.flatMap((rx) => rx.items.map((i) => ({ medicine: i.medicine, prescribedAt: rx.createdAt })));
}

// items: [{ medicineId, dosage, frequency }]
async function checkPrescription(patientId, items, { excludePrescriptionId } = {}) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { allergies: true, dateOfBirth: true } });
  if (!patient) throw new AppError('Patient not found', 404);
  const ids = [...new Set(items.map((i) => Number(i.medicineId)).filter(Boolean))];
  const meds = await prisma.medicine.findMany({ where: { id: { in: ids } } });
  const withMeds = items.map((i) => ({ ...i, medicine: meds.find((m) => m.id === Number(i.medicineId)) })).filter((i) => i.medicine);
  const current = await currentMedicines(patientId, excludePrescriptionId);
  return analyzePrescription({ patient, items: withMeds, current });
}

async function insightsFor(patientId) {
  const since = new Date(Date.now() - RECENT_DAYS * 86400000);
  const [patient, labRequests, rxs] = await Promise.all([
    prisma.patient.findUnique({ where: { id: patientId }, select: { allergies: true, dateOfBirth: true } }),
    prisma.labRequest.findMany({ where: { patientId, status: 'COMPLETED' }, include: { testType: true } }),
    prisma.prescription.findMany({ where: { patientId, createdAt: { gte: since } }, include: { items: { include: { medicine: true } } } }),
  ]);
  if (!patient) throw new AppError('Patient not found', 404);
  const recentMeds = [...new Set(rxs.flatMap((rx) => rx.items.map((i) => i.medicine.name)))];
  return patientInsights({ patient, labRequests, recentMeds });
}

module.exports = { checkPrescription, insightsFor };

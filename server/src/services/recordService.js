// =============================================================
// Consultation / Electronic Medical Records (spec 3.5)
// One consultation saves, in a single transaction:
//   medical record + prescription (optional) + lab orders (optional)
//   and marks the appointment COMPLETED.
// If any part fails, nothing is saved.
// =============================================================
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { requireFields } = require('../utils/validate');

async function doctorForUser(userId) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError('Only doctors can write medical records', 403);
  return doctor;
}

function validateItems(items) {
  for (const [i, it] of items.entries()) {
    const n = i + 1;
    if (!it.medicineId) throw new AppError(`Prescription line ${n}: choose a medicine`);
    if (!it.dosage || !it.frequency) throw new AppError(`Prescription line ${n}: dosage and frequency are required`);
    if (!(Number(it.durationDays) > 0)) throw new AppError(`Prescription line ${n}: duration must be at least 1 day`);
    if (!(Number(it.quantity) > 0)) throw new AppError(`Prescription line ${n}: quantity must be at least 1`);
  }
}

async function createConsultation(userId, body) {
  requireFields(body, ['patientId', 'diagnosis']);
  const doctor = await doctorForUser(userId);
  const patientId = Number(body.patientId);
  const appointmentId = body.appointmentId ? Number(body.appointmentId) : null;
  const items = Array.isArray(body.prescriptionItems) ? body.prescriptionItems : [];
  const labTestIds = Array.isArray(body.labTestIds) ? body.labTestIds.map(Number) : [];
  validateItems(items);

  if (appointmentId) {
    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt || appt.patientId !== patientId) throw new AppError('Appointment does not belong to this patient');
    if (appt.doctorId !== doctor.id) throw new AppError('This appointment is assigned to another doctor', 403);
    if (appt.status === 'CANCELLED') throw new AppError('This appointment was cancelled');
    if (await prisma.medicalRecord.findUnique({ where: { appointmentId } })) {
      throw new AppError('A medical record already exists for this appointment');
    }
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.medicalRecord.create({
      data: {
        patientId,
        doctorId: doctor.id,
        appointmentId,
        symptoms: body.symptoms || null,
        diagnosis: body.diagnosis,
        treatment: body.treatment || null,
        notes: body.notes || null,
      },
    });

    if (items.length) {
      await tx.prescription.create({
        data: {
          patientId,
          doctorId: doctor.id,
          medicalRecordId: record.id,
          items: {
            create: items.map((it) => ({
              medicineId: Number(it.medicineId),
              dosage: it.dosage,
              frequency: it.frequency,
              durationDays: Number(it.durationDays),
              quantity: Number(it.quantity),
            })),
          },
        },
      });
    }

    if (labTestIds.length) {
      await tx.labRequest.createMany({
        data: labTestIds.map((testTypeId) => ({ patientId, doctorId: doctor.id, testTypeId, notes: body.labNotes || null })),
      });
    }

    if (appointmentId) {
      await tx.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED' } });
    }

    return tx.medicalRecord.findUnique({
      where: { id: record.id },
      include: { prescription: { include: { items: { include: { medicine: true } } } } },
    });
  });
}

module.exports = { createConsultation };

// =============================================================
// Appointment business logic (spec 3.4)
// Key rules:
//  - must be in the future
//  - must fall inside the doctor's weekly schedule
//  - doctor cannot be double-booked; patient cannot be double-booked
// =============================================================
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

const ACTIVE = ['BOOKED', 'RESCHEDULED'];
const MIN = 60 * 1000;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const dayBounds = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return { start, end: new Date(start.getTime() + 24 * 60 * MIN) };
};

const overlaps = (aStart, aMins, bStart, bMins) =>
  aStart < bStart.getTime() + bMins * MIN && bStart.getTime() < aStart.getTime() + aMins * MIN;

// Schedule block that contains this time, or null
async function findScheduleBlock(doctorId, at, durationMins) {
  const blocks = await prisma.doctorSchedule.findMany({ where: { doctorId, dayOfWeek: at.getDay() } });
  const startMin = at.getHours() * 60 + at.getMinutes();
  return blocks.find((b) => startMin >= toMinutes(b.startTime) && startMin + durationMins <= toMinutes(b.endTime)) || null;
}

async function assertBookable({ doctorId, patientId, scheduledAt, durationMins, ignoreId }) {
  if (isNaN(scheduledAt)) throw new AppError('Invalid date/time');
  if (scheduledAt < new Date()) throw new AppError('Cannot book an appointment in the past');

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true } });
  if (!doctor || !doctor.user.isActive) throw new AppError('Doctor not found', 404);
  if (!(await prisma.patient.findUnique({ where: { id: patientId } }))) throw new AppError('Patient not found', 404);

  if (!(await findScheduleBlock(doctorId, scheduledAt, durationMins))) {
    throw new AppError("This time is outside the doctor's working hours");
  }

  // Look at all active appointments that day for this doctor OR this patient
  const { start, end } = dayBounds(scheduledAt);
  const sameDay = await prisma.appointment.findMany({
    where: {
      status: { in: ACTIVE },
      scheduledAt: { gte: start, lt: end },
      OR: [{ doctorId }, { patientId }],
      ...(ignoreId && { id: { not: ignoreId } }),
    },
  });
  for (const a of sameDay) {
    if (overlaps(scheduledAt, durationMins, a.scheduledAt, a.durationMins)) {
      throw new AppError(
        a.doctorId === doctorId ? 'Doctor already has an appointment at this time' : 'Patient already has an appointment at this time',
        409
      );
    }
  }
  return doctor;
}

const include = {
  patient: { select: { id: true, patientNo: true, firstName: true, lastName: true, phone: true } },
  doctor: { include: { user: { select: { fullName: true } }, department: true } },
};

async function book({ patientId, doctorId, scheduledAt, reason }) {
  const at = new Date(scheduledAt);
  const block = await prisma.doctorSchedule.findFirst({ where: { doctorId, dayOfWeek: at.getDay() } });
  const durationMins = block ? block.slotMins : 15;
  await assertBookable({ doctorId, patientId, scheduledAt: at, durationMins });
  return prisma.appointment.create({ data: { patientId, doctorId, scheduledAt: at, durationMins, reason }, include });
}

async function getActive(id) {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw new AppError('Appointment not found', 404);
  if (!ACTIVE.includes(appt.status)) throw new AppError(`Appointment is already ${appt.status.toLowerCase()}`);
  return appt;
}

async function reschedule(id, scheduledAt) {
  const appt = await getActive(id);
  const at = new Date(scheduledAt);
  await assertBookable({ ...appt, scheduledAt: at, ignoreId: id });
  return prisma.appointment.update({ where: { id }, data: { scheduledAt: at, status: 'RESCHEDULED' }, include });
}

async function setStatus(id, status, notes) {
  await getActive(id);
  return prisma.appointment.update({ where: { id }, data: { status, ...(notes && { notes }) }, include });
}

// Free time slots for a doctor on a date (for the booking form)
async function availableSlots(doctorId, date) {
  const blocks = await prisma.doctorSchedule.findMany({ where: { doctorId, dayOfWeek: date.getDay() } });
  const { start, end } = dayBounds(date);
  const booked = await prisma.appointment.findMany({
    where: { doctorId, status: { in: ACTIVE }, scheduledAt: { gte: start, lt: end } },
  });

  const now = new Date();
  const slots = [];
  for (const b of blocks) {
    for (let m = toMinutes(b.startTime); m + b.slotMins <= toMinutes(b.endTime); m += b.slotMins) {
      const at = new Date(start.getTime() + m * MIN);
      if (at < now) continue;
      const taken = booked.some((a) => overlaps(at, b.slotMins, a.scheduledAt, a.durationMins));
      slots.push({ time: at, available: !taken });
    }
  }
  return slots.sort((a, b) => a.time - b.time);
}

module.exports = { book, reschedule, setStatus, availableSlots, include };

// /api/appointments  (spec 3.4 Appointment Management)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { requireFields, toId, parseLocalDate } = require('../utils/validate');
const svc = require('../services/appointmentService');

const CAN_BOOK = ['RECEPTIONIST', 'NURSE', 'DOCTOR'];

// GET /api/appointments?date=2026-10-17 | from=..&to=.. | doctorId | patientId | status
// Doctors only see their own appointments.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { date, from, to, doctorId, patientId, status } = req.query;
    const where = {};

    if (date) {
      const d = parseLocalDate(date);
      where.scheduledAt = { gte: d, lt: new Date(d.getTime() + 86400000) };
    } else if (from || to) {
      where.scheduledAt = { ...(from && { gte: new Date(from) }), ...(to && { lt: new Date(to) }) };
    }
    if (doctorId) where.doctorId = Number(doctorId);
    if (patientId) where.patientId = Number(patientId);
    if (status) where.status = status;

    if (req.user.role === 'DOCTOR') {
      const me = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
      where.doctorId = me ? me.id : -1;
    }

    const appts = await prisma.appointment.findMany({ where, include: svc.include, orderBy: { scheduledAt: 'asc' }, take: 500 });
    res.json(appts);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const appt = await prisma.appointment.findUnique({ where: { id: toId(req.params.id) }, include: svc.include });
    if (!appt) throw new AppError('Appointment not found', 404);
    res.json(appt);
  })
);

// POST /api/appointments  { patientId, doctorId, scheduledAt: "2026-10-17T09:30", reason }
router.post(
  '/',
  authorize(...CAN_BOOK),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['patientId', 'doctorId', 'scheduledAt']);
    const appt = await svc.book({
      patientId: Number(req.body.patientId),
      doctorId: Number(req.body.doctorId),
      scheduledAt: req.body.scheduledAt,
      reason: req.body.reason || null,
    });
    res.status(201).json(appt);
  })
);

router.patch(
  '/:id/reschedule',
  authorize(...CAN_BOOK),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['scheduledAt']);
    res.json(await svc.reschedule(toId(req.params.id), req.body.scheduledAt));
  })
);

router.patch(
  '/:id/cancel',
  authorize(...CAN_BOOK),
  asyncHandler(async (req, res) => {
    res.json(await svc.setStatus(toId(req.params.id), 'CANCELLED', req.body.notes));
  })
);

router.patch(
  '/:id/complete',
  authorize('DOCTOR', 'NURSE'),
  asyncHandler(async (req, res) => {
    res.json(await svc.setStatus(toId(req.params.id), 'COMPLETED', req.body.notes));
  })
);

module.exports = router;

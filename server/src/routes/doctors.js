// /api/doctors  (spec 3.3 Doctor Management)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { requireFields, pick, toId, parseLocalDate } = require('../utils/validate');
const { hashPassword } = require('../services/authService');
const { availableSlots } = require('../services/appointmentService');

const include = {
  user: { select: { id: true, username: true, fullName: true, email: true, isActive: true } },
  department: true,
  schedules: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
};
const DOCTOR_FIELDS = ['departmentId', 'specialization', 'qualification', 'phone', 'consultationFee'];

// GET /api/doctors?departmentId=2&search=perera&active=true
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { departmentId, search, active } = req.query;
    const doctors = await prisma.doctor.findMany({
      where: {
        ...(departmentId && { departmentId: Number(departmentId) }),
        ...(active === 'true' && { user: { isActive: true } }),
        ...(search && {
          OR: [{ user: { fullName: { contains: search } } }, { specialization: { contains: search } }],
        }),
      },
      include,
      orderBy: { user: { fullName: 'asc' } },
    });
    res.json(doctors);
  })
);

// GET /api/doctors/me  (the logged-in doctor's own profile)
router.get(
  '/me',
  authorize('DOCTOR'),
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id }, include });
    if (!doctor) throw new AppError('No doctor profile for this user', 404);
    res.json(doctor);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctor.findUnique({ where: { id: toId(req.params.id) }, include });
    if (!doctor) throw new AppError('Doctor not found', 404);
    res.json(doctor);
  })
);

// GET /api/doctors/:id/slots?date=2026-10-17
router.get(
  '/:id/slots',
  asyncHandler(async (req, res) => {
    res.json(await availableSlots(toId(req.params.id), parseLocalDate(req.query.date)));
  })
);

// POST /api/doctors  -> creates the login account AND the doctor profile together
router.post(
  '/',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['username', 'password', 'fullName', 'departmentId', 'specialization']);
    const { username, password, fullName, email } = req.body;
    const passwordHash = await hashPassword(password);
    const data = pick(req.body, DOCTOR_FIELDS);
    data.departmentId = Number(data.departmentId);

    const doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { username, fullName, email: email || null, passwordHash, role: 'DOCTOR' } });
      return tx.doctor.create({ data: { ...data, userId: user.id }, include });
    });
    res.status(201).json(doctor);
  })
);

router.put(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const data = pick(req.body, DOCTOR_FIELDS);
    if (data.departmentId) data.departmentId = Number(data.departmentId);
    const { fullName, email, isActive } = req.body;

    const userData = pick({ fullName, email, isActive }, ['fullName', 'email', 'isActive']);
    const doctor = await prisma.doctor.update({
      where: { id },
      data: { ...data, ...(Object.keys(userData).length && { user: { update: userData } }) },
      include,
    });
    res.json(doctor);
  })
);

// PUT /api/doctors/:id/schedules  -> replaces the whole weekly schedule
// body: [{ dayOfWeek: 1, startTime: "09:00", endTime: "13:00", slotMins: 15 }, ...]
router.put(
  '/:id/schedules',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const doctorId = toId(req.params.id);
    const items = Array.isArray(req.body) ? req.body : [];
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const s of items) {
      if (!(s.dayOfWeek >= 0 && s.dayOfWeek <= 6)) throw new AppError('dayOfWeek must be 0 (Sun) to 6 (Sat)');
      if (!time.test(s.startTime) || !time.test(s.endTime)) throw new AppError('Times must be HH:MM');
      if (s.startTime >= s.endTime) throw new AppError('Start time must be before end time');
    }
    await prisma.$transaction([
      prisma.doctorSchedule.deleteMany({ where: { doctorId } }),
      prisma.doctorSchedule.createMany({
        data: items.map((s) => ({
          doctorId, dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime, slotMins: Number(s.slotMins) || 15,
        })),
      }),
    ]);
    res.json(await prisma.doctorSchedule.findMany({ where: { doctorId }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] }));
  })
);

module.exports = router;

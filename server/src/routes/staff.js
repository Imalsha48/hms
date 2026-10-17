// /api/staff  (spec 3.9 Staff Management: employees, attendance, leave)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { requireFields, pick, toId, dateOnly, todayDateOnly } = require('../utils/validate');

const EMP_FIELDS = ['firstName', 'lastName', 'designation', 'departmentId', 'phone', 'email', 'joinedDate', 'isActive', 'userId'];
const ATT_STATUS = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'];
const LEAVE_TYPES = ['Annual', 'Sick', 'Casual'];

function cleanEmployee(body) {
  const data = pick(body, EMP_FIELDS);
  if (data.departmentId) data.departmentId = Number(data.departmentId);
  if (data.userId) data.userId = Number(data.userId);
  if (data.joinedDate) data.joinedDate = dateOnly(String(data.joinedDate).slice(0, 10));
  return data;
}

async function myEmployee(userId) {
  return prisma.employee.findUnique({ where: { userId } });
}

// ---------- Employees ----------
router.get(
  '/employees',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const { search, active } = req.query;
    res.json(
      await prisma.employee.findMany({
        where: {
          ...(active === 'true' && { isActive: true }),
          ...(search && {
            OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { employeeNo: { contains: search } }, { designation: { contains: search } }],
          }),
        },
        include: { department: true, user: { select: { username: true, role: true } } },
        orderBy: { employeeNo: 'asc' },
      })
    );
  })
);

router.post(
  '/employees',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['firstName', 'lastName', 'designation', 'joinedDate']);
    const data = cleanEmployee(req.body);
    const emp = await prisma.$transaction(async (tx) => {
      const e = await tx.employee.create({ data: { ...data, employeeNo: `TMP-${Date.now()}-${Math.random()}` } });
      return tx.employee.update({ where: { id: e.id }, data: { employeeNo: `E-${String(e.id).padStart(4, '0')}` }, include: { department: true } });
    });
    res.status(201).json(emp);
  })
);

router.put(
  '/employees/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await prisma.employee.update({ where: { id: toId(req.params.id) }, data: cleanEmployee(req.body), include: { department: true } }));
  })
);

// ---------- My own record (any logged-in staff member) ----------
// GET /api/staff/me -> my employee profile + today's attendance + my leave
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const emp = await myEmployee(req.user.id);
    if (!emp) return res.json(null); // e.g. doctors are managed under Doctors, not Employees
    const [today, leaves] = await Promise.all([
      prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: todayDateOnly() } } }),
      prisma.leaveRecord.findMany({ where: { employeeId: emp.id }, orderBy: { startDate: 'desc' }, take: 50 }),
    ]);
    res.json({ ...emp, today, leaves });
  })
);

router.post(
  '/me/check-in',
  asyncHandler(async (req, res) => {
    const emp = await myEmployee(req.user.id);
    if (!emp) throw new AppError('You do not have an employee record', 404);
    const date = todayDateOnly();
    if (await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId: emp.id, date } } })) {
      throw new AppError('You have already checked in today');
    }
    const now = new Date();
    // Arriving after 08:30 counts as LATE
    const late = now.getHours() * 60 + now.getMinutes() > 8 * 60 + 30;
    res.status(201).json(await prisma.attendance.create({ data: { employeeId: emp.id, date, checkIn: now, status: late ? 'LATE' : 'PRESENT' } }));
  })
);

router.post(
  '/me/check-out',
  asyncHandler(async (req, res) => {
    const emp = await myEmployee(req.user.id);
    if (!emp) throw new AppError('You do not have an employee record', 404);
    const key = { employeeId_date: { employeeId: emp.id, date: todayDateOnly() } };
    const rec = await prisma.attendance.findUnique({ where: key });
    if (!rec || !rec.checkIn) throw new AppError('You have not checked in today');
    if (rec.checkOut) throw new AppError('You have already checked out today');
    res.json(await prisma.attendance.update({ where: key, data: { checkOut: new Date() } }));
  })
);

// ---------- Attendance (admin) ----------
// GET /api/staff/attendance?date=2026-10-17 -> every active employee with that day's record (or null)
router.get(
  '/attendance',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const date = req.query.date ? dateOnly(req.query.date) : todayDateOnly();
    const employees = await prisma.employee.findMany({
      where: { isActive: true },
      include: { department: true, attendance: { where: { date } } },
      orderBy: { employeeNo: 'asc' },
    });
    res.json(employees.map(({ attendance, ...e }) => ({ ...e, record: attendance[0] || null })));
  })
);

// PUT /api/staff/attendance  { employeeId, date, status }  (admin marks or corrects)
router.put(
  '/attendance',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['employeeId', 'date', 'status']);
    if (!ATT_STATUS.includes(req.body.status)) throw new AppError('Invalid attendance status');
    const employeeId = Number(req.body.employeeId);
    const date = dateOnly(req.body.date);
    res.json(
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        update: { status: req.body.status },
        create: { employeeId, date, status: req.body.status },
      })
    );
  })
);

// ---------- Leave ----------
// GET /api/staff/leaves?status=PENDING  (admin: everyone)
router.get(
  '/leaves',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.leaveRecord.findMany({
        where: req.query.status ? { status: req.query.status } : {},
        include: { employee: { include: { department: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    );
  })
);

// POST /api/staff/leaves  { leaveType, startDate, endDate, reason, employeeId? }
// Staff apply for themselves; admin can also apply on behalf of someone (employeeId).
router.post(
  '/leaves',
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['leaveType', 'startDate', 'endDate']);
    if (!LEAVE_TYPES.includes(req.body.leaveType)) throw new AppError('Leave type must be Annual, Sick or Casual');

    let employeeId;
    if (req.user.role === 'ADMIN' && req.body.employeeId) employeeId = Number(req.body.employeeId);
    else {
      const emp = await myEmployee(req.user.id);
      if (!emp) throw new AppError('You do not have an employee record', 404);
      employeeId = emp.id;
    }

    const startDate = dateOnly(req.body.startDate);
    const endDate = dateOnly(req.body.endDate);
    if (endDate < startDate) throw new AppError('End date cannot be before start date');

    const clash = await prisma.leaveRecord.findFirst({
      where: { employeeId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate } },
    });
    if (clash) throw new AppError('You already have leave requested or approved for some of these days');

    res.status(201).json(
      await prisma.leaveRecord.create({ data: { employeeId, leaveType: req.body.leaveType, startDate, endDate, reason: req.body.reason || null } })
    );
  })
);

// PATCH /api/staff/leaves/:id  { status: APPROVED | REJECTED }
router.patch(
  '/leaves/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    if (!['APPROVED', 'REJECTED'].includes(req.body.status)) throw new AppError('Status must be APPROVED or REJECTED');
    const leave = await prisma.leaveRecord.findUnique({ where: { id: toId(req.params.id) } });
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.status !== 'PENDING') throw new AppError(`This request was already ${leave.status.toLowerCase()}`);
    res.json(await prisma.leaveRecord.update({ where: { id: leave.id }, data: { status: req.body.status } }));
  })
);

module.exports = router;

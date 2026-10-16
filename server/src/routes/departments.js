// /api/departments  (spec 3.3 Department Management)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const { authorize } = require('../middleware/auth');
const { requireFields, pick, toId } = require('../utils/validate');

// Everyone logged in can see departments (needed for dropdowns)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const departments = await prisma.department.findMany({
      include: { _count: { select: { doctors: true, employees: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  })
);

router.post(
  '/',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name']);
    const dept = await prisma.department.create({ data: pick(req.body, ['name', 'description']) });
    res.status(201).json(dept);
  })
);

router.put(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    const dept = await prisma.department.update({
      where: { id: toId(req.params.id) },
      data: pick(req.body, ['name', 'description']),
    });
    res.json(dept);
  })
);

// Fails with a clear message if doctors/staff still belong to it (foreign key)
router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.department.delete({ where: { id: toId(req.params.id) } });
    res.json({ message: 'Department deleted' });
  })
);

module.exports = router;

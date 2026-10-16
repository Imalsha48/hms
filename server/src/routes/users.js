// /api/users  -> User Roles & Access Control (ADMIN only)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { hashPassword } = require('../services/authService');

const ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'LAB_STAFF', 'PHARMACIST', 'ACCOUNTANT'];

// Never send passwordHash to the client
const publicFields = {
  id: true, username: true, fullName: true, email: true,
  role: true, isActive: true, lastLoginAt: true, createdAt: true,
};

router.use(authorize('ADMIN'));

// GET /api/users?role=DOCTOR&search=silva
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { role, search } = req.query;
    const users = await prisma.user.findMany({
      where: {
        ...(role && { role }),
        ...(search && {
          OR: [{ username: { contains: search } }, { fullName: { contains: search } }],
        }),
      },
      select: publicFields,
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  })
);

// POST /api/users
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { username, password, fullName, email, role } = req.body;
    if (!username || !fullName || !role) throw new AppError('username, fullName and role are required');
    if (!ROLES.includes(role)) throw new AppError('Invalid role');

    const user = await prisma.user.create({
      data: { username, fullName, email: email || null, role, passwordHash: await hashPassword(password) },
      select: publicFields,
    });
    res.status(201).json(user);
  })
);

// PUT /api/users/:id  (update details, role, activate/deactivate)
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { fullName, email, role, isActive } = req.body;
    if (role && !ROLES.includes(role)) throw new AppError('Invalid role');
    if (id === req.user.id && isActive === false) throw new AppError('You cannot deactivate yourself');

    const user = await prisma.user.update({
      where: { id },
      data: { fullName, email, role, isActive },
      select: publicFields,
    });
    res.json(user);
  })
);

// POST /api/users/:id/reset-password  (admin resets someone's password)
router.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: { passwordHash: await hashPassword(req.body.newPassword) },
    });
    res.json({ message: 'Password reset' });
  })
);

// GET /api/users/audit-logs  (view audit trail)
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      include: { user: { select: { username: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 100, 500),
    });
    res.json(logs);
  })
);

module.exports = router;

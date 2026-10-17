// /api/billing  (spec 3.8 Billing & Payments)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { toId, parseLocalDate, paging } = require('../utils/validate');
const billing = require('../services/billingService');

router.use(authorize('ACCOUNTANT', 'RECEPTIONIST'));

const patientSelect = { select: { id: true, patientNo: true, firstName: true, lastName: true, phone: true, address: true } };

// GET /api/billing/unbilled?patientId=3
router.get(
  '/unbilled',
  asyncHandler(async (req, res) => {
    res.json(await billing.getUnbilled(toId(req.query.patientId)));
  })
);

// GET /api/billing/invoices?status=UNPAID&search=P-0001&from=2026-10-01&to=2026-10-31
router.get(
  '/invoices',
  asyncHandler(async (req, res) => {
    const { status, search, from, to } = req.query;
    const p = paging(req.query);
    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { invoiceNo: { contains: search } },
          { patient: { patientNo: { contains: search } } },
          { patient: { firstName: { contains: search } } },
          { patient: { lastName: { contains: search } } },
        ],
      }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: parseLocalDate(from) }),
          ...(to && { lt: new Date(parseLocalDate(to).getTime() + 86400000) }),
        },
      }),
    };
    const [items, total] = await Promise.all([
      prisma.invoice.findMany({ where, include: { patient: patientSelect }, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.take }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ items, total, page: p.page, pageSize: p.pageSize });
  })
);

router.get(
  '/invoices/:id',
  asyncHandler(async (req, res) => {
    const inv = await prisma.invoice.findUnique({
      where: { id: toId(req.params.id) },
      include: { patient: patientSelect, items: true, payments: { orderBy: { paidAt: 'asc' } } },
    });
    if (!inv) throw new AppError('Invoice not found', 404);
    const ids = [inv.createdById, ...inv.payments.map((p) => p.receivedBy)].filter(Boolean);
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
    const name = (id) => users.find((u) => u.id === id)?.fullName || null;
    res.json({
      ...inv,
      createdBy: name(inv.createdById),
      payments: inv.payments.map((p) => ({ ...p, receivedByName: name(p.receivedBy) })),
    });
  })
);

// POST /api/billing/invoices
// { patientId, appointmentIds, labRequestIds, prescriptionIds, admissionIds,
//   extraItems: [{ description, amount }], discount, notes }
router.post(
  '/invoices',
  asyncHandler(async (req, res) => {
    res.status(201).json(await billing.createInvoice(req.body, req.user.id));
  })
);

// POST /api/billing/invoices/:id/payments  { amount, method, reference }
router.post(
  '/invoices/:id/payments',
  asyncHandler(async (req, res) => {
    res.status(201).json(await billing.recordPayment(toId(req.params.id), req.body, req.user.id));
  })
);

// Void an invoice that has no payments yet. Its charges become billable again.
router.delete(
  '/invoices/:id',
  authorize('ACCOUNTANT'),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const inv = await prisma.invoice.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } });
    if (!inv) throw new AppError('Invoice not found', 404);
    if (inv._count.payments > 0) throw new AppError('Cannot void an invoice that already has payments');
    await prisma.$transaction([
      prisma.appointment.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
      prisma.labRequest.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
      prisma.prescription.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
      prisma.admission.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
      prisma.invoice.delete({ where: { id } }),
    ]);
    res.json({ message: 'Invoice voided' });
  })
);

module.exports = router;

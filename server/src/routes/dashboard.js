// /api/dashboard  (spec 7 Dashboard Features)
// Returns all the summary numbers in one request.
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(todayStart.getTime() + 86400000);
    const in30Days = new Date(todayStart.getTime() + 30 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPatients, todaysAppointments, pendingLab, admitted, revenueToday, expiringBatches, medicines, revenueMonth, outstanding] =
      await Promise.all([
        prisma.patient.count(),
        prisma.appointment.count({
          where: { scheduledAt: { gte: todayStart, lt: tomorrow }, status: { in: ['BOOKED', 'RESCHEDULED', 'COMPLETED'] } },
        }),
        prisma.labRequest.count({ where: { status: { in: ['REQUESTED', 'SAMPLE_COLLECTED'] } } }),
        prisma.admission.count({ where: { status: 'ADMITTED' } }),
        prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: todayStart, lt: tomorrow } } }),
        prisma.medicineBatch.findMany({
          where: { expiryDate: { lte: in30Days }, quantity: { gt: 0 } },
          include: { medicine: { select: { name: true } } },
          orderBy: { expiryDate: 'asc' },
        }),
        prisma.medicine.findMany({ include: { batches: { where: { expiryDate: { gt: now } } } } }),
        prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: monthStart } } }),
        prisma.invoice.aggregate({ _sum: { totalAmount: true, paidAmount: true }, where: { status: { not: 'PAID' } } }),
      ]);

    // Low stock = total non-expired quantity at or below the reorder level
    const lowStock = medicines
      .map((m) => ({ id: m.id, name: m.name, stock: m.batches.reduce((s, b) => s + b.quantity, 0), reorderLevel: m.reorderLevel }))
      .filter((m) => m.stock <= m.reorderLevel);

    res.json({
      totalPatients,
      todaysAppointments,
      pendingLab,
      admitted,
      revenueToday: Number(revenueToday._sum.amount || 0),
      revenueMonth: Number(revenueMonth._sum.amount || 0),
      outstanding: Number(outstanding._sum.totalAmount || 0) - Number(outstanding._sum.paidAmount || 0),
      alerts: {
        lowStock,
        expiring: expiringBatches.map((b) => ({
          id: b.id, medicine: b.medicine.name, batchNo: b.batchNo, quantity: b.quantity, expiryDate: b.expiryDate,
        })),
      },
    });
  })
);

module.exports = router;

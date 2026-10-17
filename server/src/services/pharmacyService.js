// =============================================================
// Pharmacy business logic (spec 3.7)
// Stock is held in batches, each with its own expiry date.
// Dispensing uses FEFO (First Expiry, First Out): the batch that expires
// soonest is used first, and expired batches are never dispensed.
// =============================================================
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

// Pure function (no database) so the rule is easy to test and explain.
// batches: [{ id, quantity, expiryDate }]  ->  [{ batchId, take }]
function planFefo(batches, needed, today = startOfToday()) {
  const usable = batches
    .filter((b) => b.quantity > 0 && new Date(b.expiryDate) > today)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  const available = usable.reduce((sum, b) => sum + b.quantity, 0);
  if (available < needed) return { ok: false, available };

  const plan = [];
  let remaining = needed;
  for (const b of usable) {
    if (remaining === 0) break;
    const take = Math.min(b.quantity, remaining);
    plan.push({ batchId: b.id, take });
    remaining -= take;
  }
  return { ok: true, available, plan };
}

// Summary for the inventory screen
function summarise(medicine, today = startOfToday()) {
  const valid = medicine.batches.filter((b) => new Date(b.expiryDate) > today);
  const stock = valid.reduce((s, b) => s + b.quantity, 0);
  const expired = medicine.batches.filter((b) => new Date(b.expiryDate) <= today && b.quantity > 0);
  const nextExpiry = valid.filter((b) => b.quantity > 0).map((b) => b.expiryDate).sort((a, b) => new Date(a) - new Date(b))[0] || null;
  return {
    ...medicine,
    stock,
    expiredQty: expired.reduce((s, b) => s + b.quantity, 0),
    nextExpiry,
    lowStock: stock <= medicine.reorderLevel,
  };
}

async function dispense(prescriptionId, userId) {
  return prisma.$transaction(async (tx) => {
    const rx = await tx.prescription.findUnique({
      where: { id: prescriptionId },
      include: { items: { include: { medicine: { include: { batches: true } } } } },
    });
    if (!rx) throw new AppError('Prescription not found', 404);
    if (rx.status === 'DISPENSED') throw new AppError('This prescription was already dispensed');

    // Check every line first, so we never dispense half a prescription
    const plans = rx.items.map((item) => {
      const result = planFefo(item.medicine.batches, item.quantity);
      if (!result.ok) {
        throw new AppError(`Not enough stock for ${item.medicine.name}: need ${item.quantity}, have ${result.available}`);
      }
      return result.plan;
    });

    for (const plan of plans) {
      for (const { batchId, take } of plan) {
        // "quantity: { gte: take }" guards against two pharmacists dispensing the same batch at once
        const { count } = await tx.medicineBatch.updateMany({
          where: { id: batchId, quantity: { gte: take } },
          data: { quantity: { decrement: take } },
        });
        if (count !== 1) throw new AppError('Stock changed while dispensing, please try again', 409);
      }
    }

    return tx.prescription.update({
      where: { id: prescriptionId },
      data: { status: 'DISPENSED', dispensedAt: new Date(), dispensedById: userId },
    });
  });
}

module.exports = { planFefo, summarise, dispense, startOfToday };

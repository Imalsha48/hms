// =============================================================
// Billing (spec 3.8)
// Charges come from four sources, and each can be billed only ONCE:
//   completed consultations, lab tests, dispensed prescriptions, discharged admissions.
// Prices are always calculated on the server, never taken from the browser.
// =============================================================
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const METHODS = ['CASH', 'CARD', 'BANK_TRANSFER'];

// Number of days charged for a stay: any part of a day counts, minimum 1
function stayDays(admittedAt, dischargedAt) {
  return Math.max(1, Math.ceil((new Date(dischargedAt) - new Date(admittedAt)) / DAY_MS));
}

// Invoice maths in one place (pure function, easy to test)
function computeTotals(items, discount = 0) {
  const subtotal = round2(items.reduce((s, i) => s + Number(i.amount), 0));
  const disc = round2(discount || 0);
  if (disc < 0) throw new AppError('Discount cannot be negative');
  if (disc > subtotal) throw new AppError('Discount cannot be more than the subtotal');
  return { subtotal, discount: disc, totalAmount: round2(subtotal - disc) };
}

function statusFor(total, paid) {
  if (paid <= 0) return 'UNPAID';
  return paid >= total ? 'PAID' : 'PARTIAL';
}

// ---------- Turning each billable record into invoice lines ----------
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB');

const lines = {
  appointment: (a) => [{
    type: 'CONSULTATION',
    description: `Consultation - ${a.doctor.user.fullName} (${fmtDay(a.scheduledAt)})`,
    quantity: 1,
    unitPrice: round2(a.doctor.consultationFee),
  }],
  labRequest: (l) => [{
    type: 'LABORATORY',
    description: `Lab test - ${l.testType.name} (${fmtDay(l.createdAt)})`,
    quantity: 1,
    unitPrice: round2(l.testType.price),
  }],
  prescription: (p) => p.items.map((i) => ({
    type: 'PHARMACY',
    description: `${i.medicine.name}`,
    quantity: i.quantity,
    unitPrice: round2(i.medicine.unitPrice),
  })),
  admission: (a) => {
    const days = stayDays(a.admittedAt, a.dischargedAt);
    return [{
      type: 'ADMISSION',
      description: `${a.bed.ward.name} bed ${a.bed.bedNo} (${fmtDay(a.admittedAt)} - ${fmtDay(a.dischargedAt)})`,
      quantity: days,
      unitPrice: round2(a.bed.ward.dailyRate),
    }];
  },
};
const withAmount = (l) => ({ ...l, amount: round2(l.quantity * l.unitPrice) });

// What can be billed for each source, and how to load it
const SOURCES = {
  appointments: {
    model: 'appointment', key: 'appointment',
    where: { status: 'COMPLETED' },
    include: { doctor: { include: { user: { select: { fullName: true } } } } },
  },
  labRequests: {
    model: 'labRequest', key: 'labRequest',
    where: { status: { not: 'CANCELLED' } },
    include: { testType: true },
  },
  prescriptions: {
    model: 'prescription', key: 'prescription',
    where: { status: 'DISPENSED' },
    include: { items: { include: { medicine: true } } },
  },
  admissions: {
    model: 'admission', key: 'admission',
    where: { status: 'DISCHARGED' },
    include: { bed: { include: { ward: true } } },
  },
};

// Everything this patient owes that isn't on an invoice yet
async function getUnbilled(patientId) {
  const result = {};
  for (const [name, src] of Object.entries(SOURCES)) {
    const rows = await prisma[src.model].findMany({
      where: { patientId, invoiceId: null, ...src.where },
      include: src.include,
    });
    result[name] = rows.map((r) => {
      const ls = lines[src.key](r).map(withAmount);
      return { id: r.id, lines: ls, amount: round2(ls.reduce((s, l) => s + l.amount, 0)) };
    });
  }
  return result;
}

async function createInvoice(body, userId) {
  const patientId = Number(body.patientId);
  if (!patientId) throw new AppError('Choose a patient');

  const extra = (Array.isArray(body.extraItems) ? body.extraItems : [])
    .filter((e) => e.description || e.amount)
    .map((e, i) => {
      const unitPrice = round2(e.amount);
      if (!e.description || !(unitPrice > 0)) throw new AppError(`Extra charge ${i + 1}: description and an amount above 0 are required`);
      return { type: 'OTHER', description: e.description, quantity: 1, unitPrice, amount: unitPrice };
    });

  return prisma.$transaction(async (tx) => {
    const items = [];
    const toLink = [];

    for (const [name, src] of Object.entries(SOURCES)) {
      const ids = [...new Set((body[`${name.slice(0, -1)}Ids`] || []).map(Number))]; // appointmentIds, labRequestIds...
      if (!ids.length) continue;
      const rows = await tx[src.model].findMany({
        where: { id: { in: ids }, patientId, invoiceId: null, ...src.where },
        include: src.include,
      });
      if (rows.length !== ids.length) throw new AppError('Some charges were already billed or are no longer billable. Refresh and try again.', 409);
      rows.forEach((r) => items.push(...lines[src.key](r).map(withAmount)));
      toLink.push({ model: src.model, ids });
    }
    items.push(...extra);
    if (!items.length) throw new AppError('Add at least one charge to the invoice');

    const totals = computeTotals(items, body.discount);
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: `TMP-${Date.now()}-${Math.random()}`,
        patientId,
        ...totals,
        notes: body.notes || null,
        createdById: userId,
        items: { create: items },
      },
    });

    // e.g. INV-20261017-000042
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    await tx.invoice.update({ where: { id: invoice.id }, data: { invoiceNo: `INV-${ymd}-${String(invoice.id).padStart(6, '0')}` } });

    // Mark the sources as billed. "invoiceId: null" in the where stops double billing
    // if two people bill the same thing at the same moment.
    for (const { model, ids } of toLink) {
      const { count } = await tx[model].updateMany({ where: { id: { in: ids }, invoiceId: null }, data: { invoiceId: invoice.id } });
      if (count !== ids.length) throw new AppError('Some charges were billed by someone else just now. Refresh and try again.', 409);
    }
    return invoice;
  });
}

async function recordPayment(invoiceId, body, userId) {
  const amount = round2(body.amount);
  if (!(amount > 0)) throw new AppError('Payment amount must be above 0');
  if (!METHODS.includes(body.method)) throw new AppError('Choose a payment method');

  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new AppError('Invoice not found', 404);
    const balance = round2(Number(inv.totalAmount) - Number(inv.paidAmount));
    if (balance <= 0) throw new AppError('This invoice is already fully paid');
    if (amount > balance) throw new AppError(`Amount is more than the balance due (Rs. ${balance.toFixed(2)})`);

    const payment = await tx.payment.create({
      data: { invoiceId, amount, method: body.method, reference: body.reference || null, receivedBy: userId },
    });
    const paid = round2(Number(inv.paidAmount) + amount);
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount: paid, status: statusFor(Number(inv.totalAmount), paid) },
    });
    return payment;
  });
}

module.exports = { getUnbilled, createInvoice, recordPayment, computeTotals, statusFor, stayDays };

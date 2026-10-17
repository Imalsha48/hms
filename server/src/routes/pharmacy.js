// /api/pharmacy  (spec 3.7 Pharmacy Management)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { requireFields, pick, toId } = require('../utils/validate');
const { summarise, dispense } = require('../services/pharmacyService');

const MED_FIELDS = ['name', 'genericName', 'form', 'strength', 'unitPrice', 'reorderLevel'];

function cleanMedicine(body) {
  const data = pick(body, MED_FIELDS);
  if (data.unitPrice !== undefined && !(Number(data.unitPrice) >= 0)) throw new AppError('Unit price must be 0 or more');
  if (data.reorderLevel !== undefined) data.reorderLevel = Number(data.reorderLevel) || 0;
  return data;
}

// ---------- Medicines & stock ----------
// GET /api/pharmacy/medicines?search=para  (everyone: doctors need it to prescribe)
router.get(
  '/medicines',
  asyncHandler(async (req, res) => {
    const meds = await prisma.medicine.findMany({
      where: req.query.search ? { name: { contains: req.query.search } } : {},
      include: { batches: { orderBy: { expiryDate: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(meds.map((m) => summarise(m)));
  })
);

router.post(
  '/medicines',
  authorize('PHARMACIST'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'unitPrice']);
    res.status(201).json(await prisma.medicine.create({ data: cleanMedicine(req.body) }));
  })
);

router.put(
  '/medicines/:id',
  authorize('PHARMACIST'),
  asyncHandler(async (req, res) => {
    res.json(await prisma.medicine.update({ where: { id: toId(req.params.id) }, data: cleanMedicine(req.body) }));
  })
);

// POST /api/pharmacy/medicines/:id/batches  -> receive new stock
router.post(
  '/medicines/:id/batches',
  authorize('PHARMACIST'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['batchNo', 'quantity', 'expiryDate']);
    const quantity = Number(req.body.quantity);
    const expiryDate = new Date(req.body.expiryDate);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError('Quantity must be a whole number above 0');
    if (isNaN(expiryDate) || expiryDate <= new Date()) throw new AppError('Expiry date must be in the future');

    const batch = await prisma.medicineBatch.create({
      data: { medicineId: toId(req.params.id), batchNo: req.body.batchNo.trim(), quantity, expiryDate },
    });
    res.status(201).json(batch);
  })
);

// Remove an expired batch from stock (write-off)
router.delete(
  '/batches/:id',
  authorize('PHARMACIST'),
  asyncHandler(async (req, res) => {
    await prisma.medicineBatch.delete({ where: { id: toId(req.params.id) } });
    res.json({ message: 'Batch removed' });
  })
);

// ---------- Prescriptions ----------
// GET /api/pharmacy/prescriptions?status=PENDING
router.get(
  '/prescriptions',
  authorize('PHARMACIST', 'DOCTOR', 'NURSE'),
  asyncHandler(async (req, res) => {
    const list = await prisma.prescription.findMany({
      where: req.query.status ? { status: req.query.status } : {},
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, lastName: true, allergies: true } },
        doctor: { include: { user: { select: { fullName: true } } } },
        items: { include: { medicine: { include: { batches: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    // Attach available stock to each line so the pharmacist can see shortages before dispensing
    res.json(
      list.map((rx) => ({
        ...rx,
        items: rx.items.map(({ medicine, ...item }) => {
          const { batches, ...m } = summarise(medicine);
          return { ...item, medicine: m, inStock: m.stock >= item.quantity };
        }),
      }))
    );
  })
);

router.post(
  '/prescriptions/:id/dispense',
  authorize('PHARMACIST'),
  asyncHandler(async (req, res) => {
    res.json(await dispense(toId(req.params.id), req.user.id));
  })
);

module.exports = router;

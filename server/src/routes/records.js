// /api/records  (spec 3.5 Electronic Medical Records)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { toId } = require('../utils/validate');
const { createConsultation } = require('../services/recordService');

// Clinical roles only - accountants/receptionists can't read diagnoses
const CLINICAL = ['DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_STAFF'];
const include = {
  doctor: { include: { user: { select: { fullName: true } } } },
  patient: { select: { id: true, patientNo: true, firstName: true, lastName: true } },
  prescription: { include: { items: { include: { medicine: true } } } },
};

// GET /api/records?patientId=3
router.get(
  '/',
  authorize(...CLINICAL),
  asyncHandler(async (req, res) => {
    const where = req.query.patientId ? { patientId: Number(req.query.patientId) } : {};
    res.json(await prisma.medicalRecord.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 }));
  })
);

router.get(
  '/:id',
  authorize(...CLINICAL),
  asyncHandler(async (req, res) => {
    const record = await prisma.medicalRecord.findUnique({ where: { id: toId(req.params.id) }, include });
    if (!record) throw new AppError('Record not found', 404);
    res.json(record);
  })
);

// POST /api/records  -> save a consultation
// { patientId, appointmentId?, symptoms, diagnosis, treatment, notes,
//   prescriptionItems: [{ medicineId, dosage, frequency, durationDays, quantity }],
//   labTestIds: [1, 3], labNotes }
router.post(
  '/',
  authorize('DOCTOR'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createConsultation(req.user.id, req.body));
  })
);

module.exports = router;

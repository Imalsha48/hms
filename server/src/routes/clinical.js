// /api/clinical  -> decision support (spec 12: AI-Based Decision Support)
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const { authorize } = require('../middleware/auth');
const { requireFields, toId } = require('../utils/validate');
const clinical = require('../services/clinicalService');

const CLINICAL = ['DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_STAFF'];

// POST /api/clinical/check-prescription  { patientId, items: [{ medicineId, dosage, frequency }] }
// Called live while the doctor writes a prescription.
router.post(
  '/check-prescription',
  authorize('DOCTOR', 'PHARMACIST', 'NURSE'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['patientId']);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    res.json({ alerts: await clinical.checkPrescription(toId(req.body.patientId), items) });
  })
);

// GET /api/clinical/patients/:id/insights  -> risk flags from lab results & medicines
router.get(
  '/patients/:id/insights',
  authorize(...CLINICAL),
  asyncHandler(async (req, res) => {
    res.json({ flags: await clinical.insightsFor(toId(req.params.id)) });
  })
);

module.exports = router;

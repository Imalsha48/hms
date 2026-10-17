// /api/lab  (spec 3.6 Laboratory Management)
// Workflow: REQUESTED -> SAMPLE_COLLECTED -> COMPLETED  (or CANCELLED)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { upload, sendFile } = require('../middleware/upload');
const { requireFields, pick, toId } = require('../utils/validate');

const VIEW = ['LAB_STAFF', 'DOCTOR', 'NURSE'];
const include = {
  patient: { select: { id: true, patientNo: true, firstName: true, lastName: true } },
  doctor: { include: { user: { select: { fullName: true } } } },
  testType: true,
};

// ---------- Test catalogue ----------
router.get(
  '/tests',
  asyncHandler(async (req, res) => {
    res.json(await prisma.labTestType.findMany({ orderBy: { name: 'asc' } }));
  })
);

router.post(
  '/tests',
  authorize('LAB_STAFF'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'price']);
    const data = pick(req.body, ['name', 'description', 'price', 'normalRange']);
    if (!(Number(data.price) >= 0)) throw new AppError('Price must be 0 or more');
    res.status(201).json(await prisma.labTestType.create({ data }));
  })
);

router.put(
  '/tests/:id',
  authorize('LAB_STAFF'),
  asyncHandler(async (req, res) => {
    const data = pick(req.body, ['name', 'description', 'price', 'normalRange']);
    res.json(await prisma.labTestType.update({ where: { id: toId(req.params.id) }, data }));
  })
);

// ---------- Requests ----------
// GET /api/lab/requests?status=REQUESTED&patientId=2
router.get(
  '/requests',
  authorize(...VIEW),
  asyncHandler(async (req, res) => {
    const { status, patientId } = req.query;
    const requests = await prisma.labRequest.findMany({
      where: { ...(status && { status }), ...(patientId && { patientId: Number(patientId) }) },
      include,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    res.json(requests);
  })
);

// POST /api/lab/requests  (doctor orders a test outside a consultation)
router.post(
  '/requests',
  authorize('DOCTOR'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['patientId', 'testTypeId']);
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) throw new AppError('Only doctors can order lab tests', 403);
    const created = await prisma.labRequest.create({
      data: { patientId: Number(req.body.patientId), testTypeId: Number(req.body.testTypeId), doctorId: doctor.id, notes: req.body.notes || null },
      include,
    });
    res.status(201).json(created);
  })
);

// Moves a request to the next status, only if it's currently in an allowed status
async function transition(id, from, data) {
  const reqst = await prisma.labRequest.findUnique({ where: { id } });
  if (!reqst) throw new AppError('Lab request not found', 404);
  if (!from.includes(reqst.status)) {
    throw new AppError(`Cannot do this while the request is ${reqst.status.replace('_', ' ').toLowerCase()}`);
  }
  return prisma.labRequest.update({ where: { id }, data, include });
}

router.patch(
  '/requests/:id/collect',
  authorize('LAB_STAFF', 'NURSE'),
  asyncHandler(async (req, res) => {
    res.json(await transition(toId(req.params.id), ['REQUESTED'], { status: 'SAMPLE_COLLECTED', sampleCollectedAt: new Date() }));
  })
);

// PATCH /api/lab/requests/:id/result  (multipart: result text + optional report file)
router.patch(
  '/requests/:id/result',
  authorize('LAB_STAFF'),
  upload.single('report'),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['result']);
    const data = { status: 'COMPLETED', result: req.body.result, resultEnteredAt: new Date() };
    if (req.file) Object.assign(data, { reportName: req.file.originalname, reportMime: req.file.mimetype, reportData: req.file.buffer });
    res.json(await transition(toId(req.params.id), ['SAMPLE_COLLECTED'], data));
  })
);

router.patch(
  '/requests/:id/cancel',
  authorize('LAB_STAFF', 'DOCTOR'),
  asyncHandler(async (req, res) => {
    res.json(await transition(toId(req.params.id), ['REQUESTED', 'SAMPLE_COLLECTED'], { status: 'CANCELLED' }));
  })
);

// GET /api/lab/requests/:id/report  (download the uploaded report)
router.get(
  '/requests/:id/report',
  asyncHandler(async (req, res) => {
    const r = await prisma.labRequest.findUnique({ where: { id: toId(req.params.id) }, omit: { reportData: false } });
    if (!r) throw new AppError('Lab request not found', 404);
    sendFile(res, { data: r.reportData, mimeType: r.reportMime, fileName: r.reportName });
  })
);

module.exports = router;

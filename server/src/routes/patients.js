// /api/patients  (spec 3.2 Patient Management)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { upload, sendFile } = require('../middleware/upload');
const { toId, paging } = require('../utils/validate');
const patientService = require('../services/patientService');

const CAN_EDIT = ['RECEPTIONIST', 'NURSE', 'DOCTOR'];

// GET /api/patients?search=saman&page=1&pageSize=20
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const p = paging(req.query);
    const { items, total } = await patientService.list({ search: req.query.search, ...p });
    res.json({ items, total, page: p.page, pageSize: p.pageSize });
  })
);

// GET /api/patients/:id  (profile + complete history)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await patientService.getWithHistory(toId(req.params.id), req.user.role));
  })
);

router.post(
  '/',
  authorize(...CAN_EDIT),
  asyncHandler(async (req, res) => {
    res.status(201).json(await patientService.create(req.body));
  })
);

router.put(
  '/:id',
  authorize(...CAN_EDIT),
  asyncHandler(async (req, res) => {
    res.json(await patientService.update(toId(req.params.id), req.body));
  })
);

// Only admin can delete, and only if the patient has no linked records
router.delete(
  '/:id',
  authorize('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.patient.delete({ where: { id: toId(req.params.id) } });
    res.json({ message: 'Patient deleted' });
  })
);

// POST /api/patients/:id/documents  (multipart form: file + title)
router.post(
  '/:id/documents',
  authorize(...CAN_EDIT),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new AppError('No file uploaded');
    const doc = await prisma.patientDocument.create({
      data: {
        patientId: toId(req.params.id),
        title: req.body.title || req.file.originalname,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer,
      },
    });
    res.status(201).json(doc);
  })
);

// GET /api/patients/:id/documents/:docId/file  (view/download)
router.get(
  '/:id/documents/:docId/file',
  asyncHandler(async (req, res) => {
    const doc = await prisma.patientDocument.findFirst({
      where: { id: toId(req.params.docId), patientId: toId(req.params.id) },
      omit: { data: false },
    });
    if (!doc) throw new AppError('Document not found', 404);
    sendFile(res, doc);
  })
);

router.delete(
  '/:id/documents/:docId',
  authorize(...CAN_EDIT),
  asyncHandler(async (req, res) => {
    await prisma.patientDocument.delete({ where: { id: toId(req.params.docId) } });
    res.json({ message: 'Document deleted' });
  })
);

module.exports = router;

// /api/admissions  (inpatient: wards, beds, admit, transfer, discharge)
const router = require('express').Router();
const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { authorize } = require('../middleware/auth');
const { requireFields, toId } = require('../utils/validate');

const CAN_MANAGE = ['NURSE', 'DOCTOR', 'RECEPTIONIST'];
const include = {
  patient: { select: { id: true, patientNo: true, firstName: true, lastName: true, gender: true, dateOfBirth: true } },
  doctor: { include: { user: { select: { fullName: true } } } },
  bed: { include: { ward: true } },
};

// GET /api/admissions/wards  -> every ward with its beds and who is in them
router.get(
  '/wards',
  asyncHandler(async (req, res) => {
    const wards = await prisma.ward.findMany({
      include: {
        beds: {
          orderBy: { id: 'asc' },
          include: { admissions: { where: { status: 'ADMITTED' }, include: { patient: include.patient } } },
        },
      },
      orderBy: { id: 'asc' },
    });
    res.json(
      wards.map((w) => ({
        ...w,
        occupied: w.beds.filter((b) => b.isOccupied).length,
        beds: w.beds.map(({ admissions, ...b }) => ({ ...b, current: admissions[0] || null })),
      }))
    );
  })
);

// GET /api/admissions?status=ADMITTED&patientId=3
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, patientId } = req.query;
    res.json(
      await prisma.admission.findMany({
        where: { ...(status && { status }), ...(patientId && { patientId: Number(patientId) }) },
        include,
        orderBy: { admittedAt: 'desc' },
        take: 200,
      })
    );
  })
);

// POST /api/admissions  { patientId, doctorId, bedId, reason }
router.post(
  '/',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['patientId', 'doctorId', 'bedId']);
    const patientId = Number(req.body.patientId);
    const bedId = Number(req.body.bedId);

    const admission = await prisma.$transaction(async (tx) => {
      if (await tx.admission.findFirst({ where: { patientId, status: 'ADMITTED' } })) {
        throw new AppError('This patient is already admitted');
      }
      // Claim the bed only if it is still free (protects against two nurses picking the same bed)
      const { count } = await tx.bed.updateMany({ where: { id: bedId, isOccupied: false }, data: { isOccupied: true } });
      if (count !== 1) throw new AppError('That bed is no longer available', 409);

      return tx.admission.create({
        data: { patientId, doctorId: Number(req.body.doctorId), bedId, reason: req.body.reason || null },
        include,
      });
    });
    res.status(201).json(admission);
  })
);

// PATCH /api/admissions/:id/transfer  { bedId }
router.patch(
  '/:id/transfer',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const newBedId = toId(req.body.bedId);
    const updated = await prisma.$transaction(async (tx) => {
      const adm = await tx.admission.findUnique({ where: { id } });
      if (!adm || adm.status !== 'ADMITTED') throw new AppError('Patient is not currently admitted');
      if (adm.bedId === newBedId) throw new AppError('Patient is already in that bed');
      const { count } = await tx.bed.updateMany({ where: { id: newBedId, isOccupied: false }, data: { isOccupied: true } });
      if (count !== 1) throw new AppError('That bed is no longer available', 409);
      await tx.bed.update({ where: { id: adm.bedId }, data: { isOccupied: false } });
      return tx.admission.update({ where: { id }, data: { bedId: newBedId }, include });
    });
    res.json(updated);
  })
);

// PATCH /api/admissions/:id/discharge
router.patch(
  '/:id/discharge',
  authorize(...CAN_MANAGE),
  asyncHandler(async (req, res) => {
    const id = toId(req.params.id);
    const updated = await prisma.$transaction(async (tx) => {
      const adm = await tx.admission.findUnique({ where: { id } });
      if (!adm || adm.status !== 'ADMITTED') throw new AppError('Patient is not currently admitted');
      await tx.bed.update({ where: { id: adm.bedId }, data: { isOccupied: false } });
      return tx.admission.update({ where: { id }, data: { status: 'DISCHARGED', dischargedAt: new Date() }, include });
    });
    res.json(updated);
  })
);

module.exports = router;

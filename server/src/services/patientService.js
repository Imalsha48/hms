// Patient business logic (spec 3.2)
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');
const { requireFields, pick } = require('../utils/validate');

const FIELDS = [
  'firstName', 'lastName', 'dateOfBirth', 'gender', 'nic', 'phone', 'email', 'address',
  'bloodGroup', 'allergies', 'emergencyName', 'emergencyPhone',
];
const GENDERS = ['MALE', 'FEMALE', 'OTHER'];

function clean(body) {
  const data = pick(body, FIELDS);
  if (data.gender && !GENDERS.includes(data.gender)) throw new AppError('Invalid gender');
  if (data.dateOfBirth) {
    const dob = new Date(data.dateOfBirth);
    if (isNaN(dob) || dob > new Date()) throw new AppError('Invalid date of birth');
    data.dateOfBirth = dob;
  }
  if (data.phone && !/^\+?[0-9 ]{9,15}$/.test(data.phone)) throw new AppError('Invalid phone number');
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) throw new AppError('Invalid email');
  return data;
}

async function create(body) {
  requireFields(body, ['firstName', 'lastName', 'dateOfBirth', 'gender', 'phone']);
  const data = clean(body);

  // patientNo is based on the auto-increment id, e.g. id 42 -> P-000042.
  // Create with a temporary unique value, then set the real one, inside one transaction.
  return prisma.$transaction(async (tx) => {
    const p = await tx.patient.create({ data: { ...data, patientNo: `TMP-${Date.now()}-${Math.random()}` } });
    return tx.patient.update({ where: { id: p.id }, data: { patientNo: `P-${String(p.id).padStart(6, '0')}` } });
  });
}

async function update(id, body) {
  return prisma.patient.update({ where: { id }, data: clean(body) });
}

// Search by name, patient number, phone or NIC
async function list({ search, skip, take }) {
  const where = search
    ? {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { patientNo: { contains: search } },
          { phone: { contains: search } },
          { nic: { contains: search } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.patient.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.patient.count({ where }),
  ]);
  return { items, total };
}

// Who may see clinical details (diagnoses, prescriptions, lab results)
const CLINICAL_ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'PHARMACIST', 'LAB_STAFF'];

// Full medical history for the patient profile page.
// Non-clinical staff (receptionist, accountant) get the record without clinical details.
async function getWithHistory(id, role) {
  const doctorInfo = { include: { user: { select: { fullName: true } } } };
  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { uploadedAt: 'desc' } },
      appointments: { include: { doctor: doctorInfo }, orderBy: { scheduledAt: 'desc' } },
      medicalRecords: { include: { doctor: doctorInfo }, orderBy: { createdAt: 'desc' } },
      prescriptions: {
        include: { doctor: doctorInfo, items: { include: { medicine: true } } },
        orderBy: { createdAt: 'desc' },
      },
      labRequests: { include: { testType: true }, orderBy: { createdAt: 'desc' } },
      admissions: { include: { bed: { include: { ward: true } } }, orderBy: { admittedAt: 'desc' } },
      invoices: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!patient) throw new AppError('Patient not found', 404);
  if (!CLINICAL_ROLES.includes(role)) {
    return { ...patient, medicalRecords: [], prescriptions: [], labRequests: [], clinicalHidden: true };
  }
  return patient;
}

module.exports = { create, update, list, getWithHistory };

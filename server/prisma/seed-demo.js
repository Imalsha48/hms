// =============================================================
// Demo history: npm run db:seed-demo   (run AFTER npm run db:seed)
// Adds ~2 weeks of past hospital activity so the dashboard and reports
// have something to show: patients, completed consultations with diagnoses,
// prescriptions, lab results, invoices and payments, admissions, attendance, leave.
// Safe to run twice: it does nothing if invoices already exist.
// =============================================================
process.env.TZ = process.env.TZ || 'Asia/Colombo';
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DAYS_BACK = 14;
const MIN = 60000;

// Small deterministic random generator, so every run produces the same demo data
let seed = 20261017;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const at = (daysAgo, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d; };
const dateOnly = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

const FIRST = ['Kamal', 'Nimali', 'Ruwan', 'Sachini', 'Dilan', 'Hiruni', 'Chathura', 'Malsha', 'Tharaka', 'Ishani', 'Supun', 'Gayani', 'Asanka', 'Piumi', 'Nuwan', 'Sewwandi'];
const LAST = ['Perera', 'Fernando', 'Silva', 'Jayawardena', 'Bandara', 'Wijesinghe', 'Rajapaksha', 'Senanayake', 'Ekanayake', 'Gunasekara'];
const CASES = [
  { symptoms: 'Fever, headache, body aches for 2 days', diagnosis: 'Viral fever', treatment: 'Rest, fluids, paracetamol', meds: ['Paracetamol 500mg'], lab: 'Full Blood Count' },
  { symptoms: 'Productive cough, mild fever', diagnosis: 'Upper respiratory tract infection', treatment: 'Antibiotic course, review in 5 days', meds: ['Amoxicillin 250mg', 'Paracetamol 500mg'] },
  { symptoms: 'Increased thirst, frequent urination', diagnosis: 'Type 2 diabetes mellitus - follow up', treatment: 'Continue metformin, diet advice', meds: ['Metformin 500mg'], lab: 'Fasting Blood Sugar' },
  { symptoms: 'Routine check, family history of heart disease', diagnosis: 'Hyperlipidaemia', treatment: 'Statin, lifestyle changes', meds: ['Atorvastatin 10mg'], lab: 'Lipid Profile' },
  { symptoms: 'Wheezing at night', diagnosis: 'Mild asthma', treatment: 'Bronchodilator syrup, avoid triggers', meds: ['Salbutamol Syrup'] },
  { symptoms: 'Burning on urination', diagnosis: 'Urinary tract infection', treatment: 'Antibiotics, increase fluids', meds: ['Amoxicillin 250mg'], lab: 'Urine Full Report' },
  { symptoms: 'Fatigue, yellowish eyes', diagnosis: 'Suspected hepatitis - investigate', treatment: 'Avoid alcohol and fatty food, await LFT', meds: [], lab: 'Liver Function Test' },
];
const RESULTS = {
  'Full Blood Count': 'WBC 11.2 x10^9/L (slightly high), Hb 13.1 g/dL, Platelets 210 x10^9/L',
  'Fasting Blood Sugar': '142 mg/dL (high)',
  'Lipid Profile': 'Total cholesterol 238 mg/dL, LDL 160 mg/dL, HDL 42 mg/dL',
  'Urine Full Report': 'Pus cells 15-20/HPF, nitrites positive',
  'Liver Function Test': 'ALT 88 U/L, AST 74 U/L, Bilirubin 2.1 mg/dL',
};
const DOSING = {
  'Paracetamol 500mg': ['1 tablet', '3 times a day', 3, 9],
  'Amoxicillin 250mg': ['1 capsule', '3 times a day', 5, 15],
  'Metformin 500mg': ['1 tablet', 'Twice a day', 7, 14],
  'Atorvastatin 10mg': ['1 tablet', 'At night', 14, 14],
  'Salbutamol Syrup': ['5 ml', '3 times a day', 5, 1],
};

async function main() {
  if ((await prisma.invoice.count()) > 0) {
    console.log('Invoices already exist, so demo history was NOT added (it only runs on a fresh database).');
    return;
  }
  const doctors = await prisma.doctor.findMany({ include: { user: true } });
  const tests = await prisma.labTestType.findMany();
  const meds = await prisma.medicine.findMany();
  const employees = await prisma.employee.findMany({ where: { isActive: true } });
  const reception = await prisma.user.findUnique({ where: { username: 'reception' } });
  const accountant = await prisma.user.findUnique({ where: { username: 'accountant' } });
  const lab = await prisma.user.findUnique({ where: { username: 'lab' } });
  const pharmacist = await prisma.user.findUnique({ where: { username: 'pharmacist' } });
  if (!doctors.length || !tests.length || !meds.length) throw new Error('Run "npm run db:seed" first');
  const medByName = Object.fromEntries(meds.map((m) => [m.name, m]));
  const testByName = Object.fromEntries(tests.map((t) => [t.name, t]));

  // ---- More patients, registered over the last two weeks ----
  console.log('Adding patients...');
  const patients = await prisma.patient.findMany();
  for (let i = 0; i < 16; i++) {
    const created = at(Math.floor(rand() * DAYS_BACK) + 1, 8 + Math.floor(rand() * 8), Math.floor(rand() * 60));
    const year = 1950 + Math.floor(rand() * 70);
    const p = await prisma.patient.create({
      data: {
        patientNo: `TMP-${Date.now()}-${i}`, firstName: FIRST[i], lastName: pick(LAST),
        dateOfBirth: new Date(Date.UTC(year, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27))),
        gender: i % 2 ? 'FEMALE' : 'MALE', phone: `07${Math.floor(10000000 + rand() * 89999999)}`,
        bloodGroup: pick(['O+', 'A+', 'B+', 'AB+', 'O-']), address: pick(['Colombo 05', 'Nugegoda', 'Dehiwala', 'Maharagama', 'Kandy', 'Gampaha']),
        createdAt: created,
      },
    });
    patients.push(await prisma.patient.update({ where: { id: p.id }, data: { patientNo: `P-${String(p.id).padStart(6, '0')}` } }));
  }

  // ---- Past days: consultations -> records, prescriptions, lab, invoices, payments ----
  let invoices = 0;
  for (let daysAgo = DAYS_BACK; daysAgo >= 1; daysAgo--) {
    const dayStart = at(daysAgo, 0);
    if (dayStart.getDay() === 0) continue; // closed on Sundays
    const visits = 3 + Math.floor(rand() * 4);
    process.stdout.write(`Day -${daysAgo}: ${visits} visits\n`);

    for (let v = 0; v < visits; v++) {
      const doctor = doctors[v % doctors.length];
      const patient = pick(patients.filter((p) => p.createdAt <= at(daysAgo, 23)));
      if (!patient) continue;
      const time = at(daysAgo, 9, v * 15 + Math.floor(v / doctors.length) * 0);
      const cancelled = chance(0.12);
      const appt = await prisma.appointment.create({
        data: {
          patientId: patient.id, doctorId: doctor.id, scheduledAt: time, durationMins: 15,
          reason: cancelled ? 'Consultation' : pick(['Consultation', 'Follow-up', 'Check-up']),
          status: cancelled ? 'CANCELLED' : 'COMPLETED', createdAt: new Date(time.getTime() - 2 * 86400000),
        },
      });
      if (cancelled) continue;

      const c = pick(CASES);
      const record = await prisma.medicalRecord.create({
        data: { patientId: patient.id, doctorId: doctor.id, appointmentId: appt.id, symptoms: c.symptoms, diagnosis: c.diagnosis, treatment: c.treatment, createdAt: new Date(time.getTime() + 12 * MIN) },
      });

      const items = []; // invoice lines
      items.push({ type: 'CONSULTATION', description: `Consultation - ${doctor.user.fullName} (${time.toLocaleDateString('en-GB')})`, quantity: 1, unitPrice: Number(doctor.consultationFee) });

      let rx = null;
      const rxMeds = c.meds.filter((n) => medByName[n]);
      if (rxMeds.length) {
        const dispensedAt = new Date(time.getTime() + 40 * MIN);
        rx = await prisma.prescription.create({
          data: {
            patientId: patient.id, doctorId: doctor.id, medicalRecordId: record.id, status: 'DISPENSED', dispensedAt,
            dispensedById: pharmacist?.id, createdAt: new Date(time.getTime() + 13 * MIN),
            items: { create: rxMeds.map((n) => { const [dosage, frequency, durationDays, quantity] = DOSING[n]; return { medicineId: medByName[n].id, dosage, frequency, durationDays, quantity }; }) },
          },
        });
        rxMeds.forEach((n) => items.push({ type: 'PHARMACY', description: n, quantity: DOSING[n][3], unitPrice: Number(medByName[n].unitPrice) }));
      }

      let labReq = null;
      if (c.lab && testByName[c.lab] && chance(0.8)) {
        const t = testByName[c.lab];
        labReq = await prisma.labRequest.create({
          data: {
            patientId: patient.id, doctorId: doctor.id, testTypeId: t.id, status: 'COMPLETED',
            sampleCollectedAt: new Date(time.getTime() + 30 * MIN), result: RESULTS[c.lab], resultEnteredAt: new Date(time.getTime() + (2 + rand() * 4) * 60 * MIN),
            createdAt: new Date(time.getTime() + 14 * MIN),
          },
        });
        items.push({ type: 'LABORATORY', description: `Lab test - ${t.name} (${time.toLocaleDateString('en-GB')})`, quantity: 1, unitPrice: Number(t.price) });
      }

      // Invoice + payment
      const lines = items.map((i) => ({ ...i, amount: Math.round(i.quantity * i.unitPrice * 100) / 100 }));
      const subtotal = lines.reduce((s, l) => s + l.amount, 0);
      const discount = chance(0.15) ? Math.round(subtotal * 0.05) : 0;
      const total = subtotal - discount;
      const roll = rand();
      const paid = roll < 0.82 ? total : roll < 0.92 ? Math.round(total / 2) : 0;
      const createdAt = new Date(time.getTime() + 60 * MIN);
      const inv = await prisma.invoice.create({
        data: {
          invoiceNo: `TMP-${Date.now()}-${v}`, patientId: patient.id, subtotal, discount, totalAmount: total, paidAmount: paid,
          status: paid <= 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIAL', createdById: reception?.id, createdAt,
          items: { create: lines },
        },
      });
      await prisma.invoice.update({ where: { id: inv.id }, data: { invoiceNo: `INV-${ymd(createdAt)}-${String(inv.id).padStart(6, '0')}` } });
      if (paid > 0) {
        await prisma.payment.create({
          data: { invoiceId: inv.id, amount: paid, method: pick(['CASH', 'CASH', 'CARD', 'BANK_TRANSFER']), receivedBy: pick([reception?.id, accountant?.id]), paidAt: new Date(createdAt.getTime() + 5 * MIN) },
        });
      }
      await prisma.appointment.update({ where: { id: appt.id }, data: { invoiceId: inv.id } });
      if (rx) await prisma.prescription.update({ where: { id: rx.id }, data: { invoiceId: inv.id } });
      if (labReq) await prisma.labRequest.update({ where: { id: labReq.id }, data: { invoiceId: inv.id } });
      invoices++;
    }
  }

  // ---- Two past admissions (discharged and billed) ----
  console.log('Adding admissions...');
  const beds = await prisma.bed.findMany({ where: { isOccupied: false }, include: { ward: true }, take: 2 });
  for (const [i, bed] of beds.entries()) {
    const patient = patients[i + 2];
    const admittedAt = at(10 - i * 4, 11);
    const dischargedAt = at(7 - i * 4, 10);
    const days = Math.max(1, Math.ceil((dischargedAt - admittedAt) / 86400000));
    const amount = days * Number(bed.ward.dailyRate);
    const adm = await prisma.admission.create({
      data: { patientId: patient.id, doctorId: doctors[i].id, bedId: bed.id, admittedAt, dischargedAt, status: 'DISCHARGED', reason: i ? 'Observation after fall' : 'Dengue fever - monitoring platelets' },
    });
    const inv = await prisma.invoice.create({
      data: {
        invoiceNo: `TMP-adm-${i}`, patientId: patient.id, subtotal: amount, totalAmount: amount, paidAmount: amount, status: 'PAID', createdById: accountant?.id, createdAt: dischargedAt,
        items: { create: [{ type: 'ADMISSION', description: `${bed.ward.name} bed ${bed.bedNo}`, quantity: days, unitPrice: Number(bed.ward.dailyRate), amount }] },
      },
    });
    await prisma.invoice.update({ where: { id: inv.id }, data: { invoiceNo: `INV-${ymd(dischargedAt)}-${String(inv.id).padStart(6, '0')}` } });
    await prisma.payment.create({ data: { invoiceId: inv.id, amount, method: 'CARD', receivedBy: accountant?.id, paidAt: dischargedAt } });
    await prisma.admission.update({ where: { id: adm.id }, data: { invoiceId: inv.id } });
  }

  // ---- Attendance for the last two weeks (weekdays) ----
  console.log('Adding attendance...');
  const att = [];
  for (let daysAgo = DAYS_BACK; daysAgo >= 1; daysAgo--) {
    const d = at(daysAgo, 0);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const e of employees) {
      const r = rand();
      const status = r < 0.8 ? 'PRESENT' : r < 0.92 ? 'LATE' : r < 0.96 ? 'HALF_DAY' : 'ABSENT';
      const inH = status === 'LATE' ? at(daysAgo, 8, 40 + Math.floor(rand() * 40)) : at(daysAgo, 7, 45 + Math.floor(rand() * 40));
      att.push({
        employeeId: e.id, date: dateOnly(d), status,
        checkIn: status === 'ABSENT' ? null : inH,
        checkOut: status === 'ABSENT' ? null : at(daysAgo, status === 'HALF_DAY' ? 12 : 16, 30 + Math.floor(rand() * 60)),
      });
    }
  }
  await prisma.attendance.createMany({ data: att, skipDuplicates: true });

  // ---- Leave: one approved (past), one pending (upcoming) ----
  const nurse = employees.find((e) => e.designation.includes('Nurse')) || employees[0];
  const labEmp = employees.find((e) => e.designation.includes('Lab')) || employees[1];
  if (nurse) await prisma.leaveRecord.create({ data: { employeeId: nurse.id, leaveType: 'Sick', startDate: dateOnly(at(9, 0)), endDate: dateOnly(at(8, 0)), reason: 'Fever', status: 'APPROVED' } });
  if (labEmp) await prisma.leaveRecord.create({ data: { employeeId: labEmp.id, leaveType: 'Annual', startDate: dateOnly(at(-7, 0)), endDate: dateOnly(at(-9, 0)), reason: 'Family event', status: 'PENDING' } });

  console.log(`Demo history added: ${patients.length} patients, ${invoices + beds.length} invoices, ${att.length} attendance records.`);
  if (lab) console.log('Tip: log in as accountant and open Reports to see the data.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

// =============================================================
// Seed data: run with  npm run db:seed
// Creates one login per role (password for all: Password123)
// =============================================================
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const PASSWORD = 'Password123';

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ---- Departments ----
  const deptNames = ['General Medicine', 'Cardiology', 'Pediatrics', 'Orthopedics', 'Laboratory', 'Pharmacy', 'Administration'];
  const depts = {};
  for (const name of deptNames) {
    depts[name] = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  }

  // ---- Users (one per role) ----
  const userData = [
    { username: 'admin', fullName: 'System Administrator', role: 'ADMIN' },
    { username: 'dr.perera', fullName: 'Dr. Nimal Perera', role: 'DOCTOR' },
    { username: 'dr.fernando', fullName: 'Dr. Anjali Fernando', role: 'DOCTOR' },
    { username: 'dr.silva', fullName: 'Dr. Kasun Silva', role: 'DOCTOR' },
    { username: 'nurse.kumari', fullName: 'Sanduni Kumari', role: 'NURSE' },
    { username: 'reception', fullName: 'Tharindu Jayasinghe', role: 'RECEPTIONIST' },
    { username: 'lab', fullName: 'Ruwan Bandara', role: 'LAB_STAFF' },
    { username: 'pharmacist', fullName: 'Dilini Wickramasinghe', role: 'PHARMACIST' },
    { username: 'accountant', fullName: 'Chamara Rathnayake', role: 'ACCOUNTANT' },
  ];
  const users = {};
  for (const u of userData) {
    users[u.username] = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash },
    });
  }

  // ---- Doctors + weekly schedules ----
  const doctorData = [
    { username: 'dr.perera', dept: 'General Medicine', specialization: 'General Physician', fee: 2500 },
    { username: 'dr.fernando', dept: 'Cardiology', specialization: 'Cardiologist', fee: 4500 },
    { username: 'dr.silva', dept: 'Pediatrics', specialization: 'Pediatrician', fee: 3500 },
  ];
  const doctors = [];
  for (const d of doctorData) {
    const doctor = await prisma.doctor.upsert({
      where: { userId: users[d.username].id },
      update: {},
      create: {
        userId: users[d.username].id,
        departmentId: depts[d.dept].id,
        specialization: d.specialization,
        qualification: 'MBBS',
        consultationFee: d.fee,
      },
    });
    doctors.push(doctor);
    for (const day of [1, 2, 3, 4, 5]) { // Mon-Fri
      await prisma.doctorSchedule.upsert({
        where: { doctorId_dayOfWeek_startTime: { doctorId: doctor.id, dayOfWeek: day, startTime: '09:00' } },
        update: {},
        create: { doctorId: doctor.id, dayOfWeek: day, startTime: '09:00', endTime: '13:00', slotMins: 15 },
      });
    }
  }

  // ---- Patients ----
  const patientData = [
    ['Saman', 'Kumara', '1985-03-12', 'MALE', '0771234567', 'O+'],
    ['Nadeesha', 'Herath', '1992-07-25', 'FEMALE', '0712345678', 'A+'],
    ['Pradeep', 'Gunawardena', '1970-11-02', 'MALE', '0763456789', 'B+'],
    ['Ishara', 'Dissanayake', '2015-01-18', 'FEMALE', '0754567890', 'AB+'],
    ['Lahiru', 'Weerasinghe', '1998-09-30', 'MALE', '0785678901', 'O-'],
  ];
  const patients = [];
  for (let i = 0; i < patientData.length; i++) {
    const [firstName, lastName, dob, gender, phone, bloodGroup] = patientData[i];
    const patientNo = `P-${String(i + 1).padStart(6, '0')}`;
    patients.push(
      await prisma.patient.upsert({
        where: { patientNo },
        update: {},
        create: { patientNo, firstName, lastName, dateOfBirth: new Date(dob), gender, phone, bloodGroup, address: 'Colombo' },
      })
    );
  }

  // ---- Appointments (today + upcoming) ----
  if ((await prisma.appointment.count()) === 0) {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    for (let i = 0; i < patients.length; i++) {
      const at = new Date(today.getTime() + i * 15 * 60 * 1000);
      await prisma.appointment.create({
        data: { patientId: patients[i].id, doctorId: doctors[i % doctors.length].id, scheduledAt: at, reason: 'Consultation' },
      });
    }
  }

  // ---- Wards & beds ----
  const wards = [
    { name: 'General Ward', dailyRate: 3000, beds: 6 },
    { name: 'Private Room', dailyRate: 12000, beds: 3 },
    { name: 'ICU', dailyRate: 25000, beds: 2 },
  ];
  for (const w of wards) {
    const ward = await prisma.ward.upsert({ where: { name: w.name }, update: {}, create: { name: w.name, dailyRate: w.dailyRate } });
    for (let b = 1; b <= w.beds; b++) {
      const bedNo = `${w.name.slice(0, 2).toUpperCase()}-${b}`;
      await prisma.bed.upsert({ where: { wardId_bedNo: { wardId: ward.id, bedNo } }, update: {}, create: { wardId: ward.id, bedNo } });
    }
  }

  // ---- Lab test catalogue ----
  const tests = [
    ['Full Blood Count', 1500, ''],
    ['Fasting Blood Sugar', 600, '70-100 mg/dL'],
    ['Lipid Profile', 2800, 'Total < 200 mg/dL'],
    ['Liver Function Test', 3200, ''],
    ['Urine Full Report', 500, ''],
  ];
  for (const [name, price, normalRange] of tests) {
    await prisma.labTestType.upsert({ where: { name }, update: {}, create: { name, price, normalRange } });
  }

  // ---- Medicines with batches (one expiring soon, one low stock for alerts) ----
  const meds = [
    { name: 'Paracetamol 500mg', form: 'Tablet', unitPrice: 5, batches: [['PCM-A1', 500, 365]] },
    { name: 'Amoxicillin 250mg', form: 'Capsule', unitPrice: 18, batches: [['AMX-B2', 200, 20]] }, // expiring soon
    { name: 'Metformin 500mg', form: 'Tablet', unitPrice: 8, batches: [['MET-C3', 10, 300]] },     // low stock
    { name: 'Atorvastatin 10mg', form: 'Tablet', unitPrice: 25, batches: [['ATV-D4', 150, 400]] },
    { name: 'Salbutamol Syrup', form: 'Syrup', unitPrice: 320, batches: [['SAL-E5', 40, 180]] },
  ];
  for (const m of meds) {
    const med = await prisma.medicine.upsert({
      where: { name: m.name },
      update: {},
      create: { name: m.name, form: m.form, unitPrice: m.unitPrice },
    });
    for (const [batchNo, quantity, expiresInDays] of m.batches) {
      await prisma.medicineBatch.upsert({
        where: { medicineId_batchNo: { medicineId: med.id, batchNo } },
        update: {},
        create: { medicineId: med.id, batchNo, quantity, expiryDate: daysFromNow(expiresInDays) },
      });
    }
  }

  // ---- Employees (linked to the user accounts) ----
  const empDesignation = {
    admin: ['Administrator', 'Administration'],
    'nurse.kumari': ['Staff Nurse', 'General Medicine'],
    reception: ['Receptionist', 'Administration'],
    lab: ['Lab Technician', 'Laboratory'],
    pharmacist: ['Pharmacist', 'Pharmacy'],
    accountant: ['Accountant', 'Administration'],
  };
  let n = 1;
  for (const [username, [designation, dept]] of Object.entries(empDesignation)) {
    const [firstName, ...rest] = users[username].fullName.split(' ');
    const employeeNo = `E-${String(n++).padStart(4, '0')}`;
    await prisma.employee.upsert({
      where: { employeeNo },
      update: {},
      create: {
        employeeNo,
        userId: users[username].id,
        firstName,
        lastName: rest.join(' ') || '-',
        designation,
        departmentId: depts[dept].id,
        joinedDate: new Date('2024-01-01'),
      },
    });
  }

  console.log('Seed complete.');
  console.log(`Logins (password for all: ${PASSWORD}):`);
  userData.forEach((u) => console.log(`  ${u.role.padEnd(13)} ${u.username}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// =============================================================
// Reports (spec 3.10): patient, appointment, revenue, pharmacy, laboratory, staff
// Every report returns the same shape, so one frontend page can show any of them:
//   { title, summary: [{ label, value, type? }], tables: [{ title, columns, rows }] }
// column.type: 'money' | 'number' | 'date' | 'datetime' (for display formatting)
// =============================================================
const prisma = require('../lib/prisma');

const DAY = 86400000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const hm = (d) => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const name = (p) => (p ? `${p.firstName} ${p.lastName}` : '');
const ageOf = (dob) => Math.floor((Date.now() - new Date(dob)) / (365.25 * DAY));

// Counts items per day across the whole range (days with zero included)
function perDay(items, getDate, getValue = () => 1, { from, to }) {
  const map = new Map();
  for (let t = from.getTime(); t < to.getTime(); t += DAY) map.set(ymd(t), 0);
  for (const it of items) {
    const k = ymd(getDate(it));
    if (map.has(k)) map.set(k, round2(map.get(k) + getValue(it)));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

function countBy(items, keyFn) {
  const m = {};
  for (const it of items) { const k = keyFn(it); m[k] = (m[k] || 0) + 1; }
  return m;
}

// ---------------------------------------------------------------
async function patients(range) {
  const [all, inRange] = await Promise.all([
    prisma.patient.count(),
    prisma.patient.findMany({ where: { createdAt: { gte: range.from, lt: range.to } }, orderBy: { createdAt: 'asc' } }),
  ]);
  const g = countBy(inRange, (p) => p.gender);
  const groups = { '0-12': 0, '13-17': 0, '18-35': 0, '36-60': 0, '60+': 0 };
  inRange.forEach((p) => {
    const a = ageOf(p.dateOfBirth);
    groups[a <= 12 ? '0-12' : a <= 17 ? '13-17' : a <= 35 ? '18-35' : a <= 60 ? '36-60' : '60+'] += 1;
  });

  return {
    title: 'Patient report',
    summary: [
      { label: 'Total patients', value: all },
      { label: 'Registered in period', value: inRange.length },
      { label: 'Male / Female / Other', value: `${g.MALE || 0} / ${g.FEMALE || 0} / ${g.OTHER || 0}` },
    ],
    chart: { title: 'New registrations per day', points: perDay(inRange, (p) => p.createdAt, undefined, range) },
    tables: [
      {
        title: 'Patients registered in period',
        columns: [
          { key: 'patientNo', label: 'Patient no' }, { key: 'name', label: 'Name' }, { key: 'gender', label: 'Gender' },
          { key: 'age', label: 'Age', type: 'number' }, { key: 'bloodGroup', label: 'Blood' }, { key: 'phone', label: 'Phone' },
          { key: 'registered', label: 'Registered', type: 'datetime' },
        ],
        rows: inRange.map((p) => ({
          patientNo: p.patientNo, name: name(p), gender: p.gender, age: ageOf(p.dateOfBirth),
          bloodGroup: p.bloodGroup || '', phone: p.phone, registered: p.createdAt,
        })),
      },
      {
        title: 'Age groups (registered in period)',
        columns: [{ key: 'group', label: 'Age group' }, { key: 'count', label: 'Patients', type: 'number' }],
        rows: Object.entries(groups).map(([group, count]) => ({ group, count })),
      },
    ],
  };
}

// ---------------------------------------------------------------
async function appointments(range) {
  const list = await prisma.appointment.findMany({
    where: { scheduledAt: { gte: range.from, lt: range.to } },
    include: { patient: true, doctor: { include: { user: true, department: true } } },
    orderBy: { scheduledAt: 'asc' },
  });
  const s = countBy(list, (a) => a.status);
  const byDoctor = {};
  list.forEach((a) => {
    const k = a.doctorId;
    byDoctor[k] = byDoctor[k] || { doctor: a.doctor.user.fullName, department: a.doctor.department.name, total: 0, completed: 0, cancelled: 0, upcoming: 0 };
    byDoctor[k].total += 1;
    if (a.status === 'COMPLETED') byDoctor[k].completed += 1;
    else if (a.status === 'CANCELLED') byDoctor[k].cancelled += 1;
    else byDoctor[k].upcoming += 1;
  });
  const done = (s.COMPLETED || 0) + (s.CANCELLED || 0);

  return {
    title: 'Appointment report',
    summary: [
      { label: 'Total appointments', value: list.length },
      { label: 'Completed', value: s.COMPLETED || 0 },
      { label: 'Cancelled', value: s.CANCELLED || 0 },
      { label: 'Booked / rescheduled', value: (s.BOOKED || 0) + (s.RESCHEDULED || 0) },
      { label: 'Cancellation rate', value: done ? `${Math.round(((s.CANCELLED || 0) / done) * 100)}%` : '-' },
    ],
    chart: { title: 'Appointments per day', points: perDay(list, (a) => a.scheduledAt, undefined, range) },
    tables: [
      {
        title: 'By doctor',
        columns: [
          { key: 'doctor', label: 'Doctor' }, { key: 'department', label: 'Department' }, { key: 'total', label: 'Total', type: 'number' },
          { key: 'completed', label: 'Completed', type: 'number' }, { key: 'cancelled', label: 'Cancelled', type: 'number' },
          { key: 'upcoming', label: 'Booked', type: 'number' },
        ],
        rows: Object.values(byDoctor).sort((a, b) => b.total - a.total),
      },
      {
        title: 'All appointments',
        columns: [
          { key: 'date', label: 'Date' }, { key: 'time', label: 'Time' }, { key: 'patientNo', label: 'Patient no' },
          { key: 'patient', label: 'Patient' }, { key: 'doctor', label: 'Doctor' }, { key: 'status', label: 'Status' },
          { key: 'reason', label: 'Reason' },
        ],
        rows: list.map((a) => ({
          date: ymd(a.scheduledAt), time: hm(a.scheduledAt), patientNo: a.patient.patientNo, patient: name(a.patient),
          doctor: a.doctor.user.fullName, status: a.status, reason: a.reason || '',
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------
async function revenue(range) {
  const [payments, invoices, items] = await Promise.all([
    prisma.payment.findMany({
      where: { paidAt: { gte: range.from, lt: range.to } },
      include: { invoice: { include: { patient: true } } },
      orderBy: { paidAt: 'asc' },
    }),
    prisma.invoice.findMany({ where: { createdAt: { gte: range.from, lt: range.to } } }),
    prisma.invoiceItem.findMany({ where: { invoice: { createdAt: { gte: range.from, lt: range.to } } } }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(payments.map((p) => p.receivedBy).filter(Boolean))] } },
    select: { id: true, fullName: true },
  });

  const collected = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const billed = round2(invoices.reduce((s, i) => s + Number(i.totalAmount), 0));
  const discounts = round2(invoices.reduce((s, i) => s + Number(i.discount), 0));
  const outstanding = round2(invoices.reduce((s, i) => s + Number(i.totalAmount) - Number(i.paidAmount), 0));

  const byType = {};
  items.forEach((i) => { byType[i.type] = round2((byType[i.type] || 0) + Number(i.amount)); });
  const byMethod = {};
  payments.forEach((p) => { byMethod[p.method] = round2((byMethod[p.method] || 0) + Number(p.amount)); });

  return {
    title: 'Revenue report',
    summary: [
      { label: 'Collected (payments)', value: collected, type: 'money' },
      { label: 'Billed (invoices)', value: billed, type: 'money' },
      { label: 'Discounts given', value: discounts, type: 'money' },
      { label: 'Outstanding on these invoices', value: outstanding, type: 'money' },
      { label: 'Invoices', value: invoices.length },
    ],
    chart: { title: 'Collected per day (Rs.)', type: 'money', points: perDay(payments, (p) => p.paidAt, (p) => Number(p.amount), range) },
    tables: [
      {
        title: 'Billed by service',
        columns: [{ key: 'type', label: 'Service' }, { key: 'amount', label: 'Amount', type: 'money' }],
        rows: ['CONSULTATION', 'LABORATORY', 'PHARMACY', 'ADMISSION', 'OTHER'].map((t) => ({ type: t.toLowerCase(), amount: byType[t] || 0 })),
      },
      {
        title: 'Collected by payment method',
        columns: [{ key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', type: 'money' }],
        rows: Object.entries(byMethod).map(([method, amount]) => ({ method: method.replace('_', ' ').toLowerCase(), amount })),
      },
      {
        title: 'Payments',
        columns: [
          { key: 'paidAt', label: 'Date', type: 'datetime' }, { key: 'invoiceNo', label: 'Invoice' }, { key: 'patient', label: 'Patient' },
          { key: 'method', label: 'Method' }, { key: 'receivedBy', label: 'Received by' }, { key: 'amount', label: 'Amount', type: 'money' },
        ],
        rows: payments.map((p) => ({
          paidAt: p.paidAt, invoiceNo: p.invoice.invoiceNo, patient: name(p.invoice.patient), method: p.method,
          receivedBy: users.find((u) => u.id === p.receivedBy)?.fullName || '', amount: Number(p.amount),
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------
async function pharmacy(range) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * DAY);
  const [dispensed, medicines] = await Promise.all([
    prisma.prescription.findMany({
      where: { status: 'DISPENSED', dispensedAt: { gte: range.from, lt: range.to } },
      include: { items: { include: { medicine: true } } },
    }),
    prisma.medicine.findMany({ include: { batches: true }, orderBy: { name: 'asc' } }),
  ]);

  const used = {};
  dispensed.forEach((rx) => rx.items.forEach((i) => {
    used[i.medicineId] = used[i.medicineId] || { qty: 0, value: 0 };
    used[i.medicineId].qty += i.quantity;
    used[i.medicineId].value = round2(used[i.medicineId].value + i.quantity * Number(i.medicine.unitPrice));
  }));

  const rows = medicines.map((m) => {
    const valid = m.batches.filter((b) => new Date(b.expiryDate) > now);
    const stock = valid.reduce((s, b) => s + b.quantity, 0);
    const expiringSoon = valid.filter((b) => new Date(b.expiryDate) <= in30).reduce((s, b) => s + b.quantity, 0);
    const expired = m.batches.filter((b) => new Date(b.expiryDate) <= now).reduce((s, b) => s + b.quantity, 0);
    return {
      name: m.name, dispensedQty: used[m.id]?.qty || 0, dispensedValue: used[m.id]?.value || 0, stock,
      stockValue: round2(stock * Number(m.unitPrice)), reorderLevel: m.reorderLevel, expiringSoon, expired,
      status: stock === 0 ? 'OUT OF STOCK' : stock <= m.reorderLevel ? 'LOW' : 'OK',
    };
  });

  return {
    title: 'Pharmacy report',
    summary: [
      { label: 'Prescriptions dispensed', value: dispensed.length },
      { label: 'Value dispensed', value: round2(rows.reduce((s, r) => s + r.dispensedValue, 0)), type: 'money' },
      { label: 'Current stock value', value: round2(rows.reduce((s, r) => s + r.stockValue, 0)), type: 'money' },
      { label: 'Low / out of stock', value: rows.filter((r) => r.status !== 'OK').length },
      { label: 'Units expiring in 30 days', value: rows.reduce((s, r) => s + r.expiringSoon, 0) },
    ],
    chart: {
      title: 'Prescriptions dispensed per day',
      points: perDay(dispensed, (p) => p.dispensedAt, undefined, range),
    },
    tables: [
      {
        title: 'Medicines: usage in period and current stock',
        columns: [
          { key: 'name', label: 'Medicine' }, { key: 'dispensedQty', label: 'Dispensed', type: 'number' },
          { key: 'dispensedValue', label: 'Value dispensed', type: 'money' }, { key: 'stock', label: 'In stock', type: 'number' },
          { key: 'stockValue', label: 'Stock value', type: 'money' }, { key: 'reorderLevel', label: 'Reorder at', type: 'number' },
          { key: 'expiringSoon', label: 'Expiring (30d)', type: 'number' }, { key: 'expired', label: 'Expired', type: 'number' },
          { key: 'status', label: 'Status' },
        ],
        rows,
      },
    ],
  };
}

// ---------------------------------------------------------------
async function laboratory(range) {
  const list = await prisma.labRequest.findMany({
    where: { createdAt: { gte: range.from, lt: range.to } },
    include: { testType: true, patient: true, doctor: { include: { user: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const s = countBy(list, (r) => r.status);
  const done = list.filter((r) => r.status === 'COMPLETED' && r.resultEnteredAt);
  const avgHours = done.length ? done.reduce((sum, r) => sum + (new Date(r.resultEnteredAt) - new Date(r.createdAt)), 0) / done.length / 3600000 : null;

  const byTest = {};
  list.forEach((r) => {
    const k = r.testTypeId;
    byTest[k] = byTest[k] || { test: r.testType.name, requested: 0, completed: 0, cancelled: 0, pending: 0, revenue: 0 };
    byTest[k].requested += 1;
    if (r.status === 'COMPLETED') byTest[k].completed += 1;
    else if (r.status === 'CANCELLED') byTest[k].cancelled += 1;
    else byTest[k].pending += 1;
    if (r.status !== 'CANCELLED') byTest[k].revenue = round2(byTest[k].revenue + Number(r.testType.price));
  });

  return {
    title: 'Laboratory report',
    summary: [
      { label: 'Tests requested', value: list.length },
      { label: 'Completed', value: s.COMPLETED || 0 },
      { label: 'Pending', value: (s.REQUESTED || 0) + (s.SAMPLE_COLLECTED || 0) },
      { label: 'Cancelled', value: s.CANCELLED || 0 },
      { label: 'Average turnaround', value: avgHours === null ? '-' : `${avgHours.toFixed(1)} hours` },
    ],
    chart: { title: 'Tests requested per day', points: perDay(list, (r) => r.createdAt, undefined, range) },
    tables: [
      {
        title: 'By test',
        columns: [
          { key: 'test', label: 'Test' }, { key: 'requested', label: 'Requested', type: 'number' }, { key: 'completed', label: 'Completed', type: 'number' },
          { key: 'pending', label: 'Pending', type: 'number' }, { key: 'cancelled', label: 'Cancelled', type: 'number' },
          { key: 'revenue', label: 'Value', type: 'money' },
        ],
        rows: Object.values(byTest).sort((a, b) => b.requested - a.requested),
      },
      {
        title: 'All requests',
        columns: [
          { key: 'requested', label: 'Requested', type: 'datetime' }, { key: 'patient', label: 'Patient' }, { key: 'test', label: 'Test' },
          { key: 'doctor', label: 'Doctor' }, { key: 'status', label: 'Status' }, { key: 'result', label: 'Result' },
        ],
        rows: list.map((r) => ({
          requested: r.createdAt, patient: name(r.patient), test: r.testType.name, doctor: r.doctor.user.fullName,
          status: r.status, result: r.result || '',
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------
async function staff(range) {
  const fromDate = new Date(Date.UTC(range.from.getFullYear(), range.from.getMonth(), range.from.getDate()));
  const toDate = new Date(Date.UTC(range.to.getFullYear(), range.to.getMonth(), range.to.getDate()));
  const employees = await prisma.employee.findMany({
    include: {
      department: true,
      attendance: { where: { date: { gte: fromDate, lt: toDate } } },
      leaves: { where: { status: 'APPROVED', startDate: { lt: toDate }, endDate: { gte: fromDate } } },
    },
    orderBy: { employeeNo: 'asc' },
  });

  const rows = employees.map((e) => {
    const c = countBy(e.attendance, (a) => a.status);
    // Count only the leave days that fall inside the report period
    const leaveDays = e.leaves.reduce((sum, l) => {
      const s = Math.max(new Date(l.startDate).getTime(), fromDate.getTime());
      const en = Math.min(new Date(l.endDate).getTime(), toDate.getTime() - DAY);
      return sum + Math.max(0, Math.round((en - s) / DAY) + 1);
    }, 0);
    return {
      employeeNo: e.employeeNo, name: `${e.firstName} ${e.lastName}`, designation: e.designation,
      department: e.department?.name || '', present: c.PRESENT || 0, late: c.LATE || 0, halfDay: c.HALF_DAY || 0,
      absent: c.ABSENT || 0, leaveDays, active: e.isActive ? 'Yes' : 'No',
    };
  });
  const totalMarked = rows.reduce((s, r) => s + r.present + r.late + r.halfDay + r.absent, 0);
  const attended = rows.reduce((s, r) => s + r.present + r.late + r.halfDay, 0);
  const byDept = countBy(employees.filter((e) => e.isActive), (e) => e.department?.name || 'Unassigned');

  return {
    title: 'Staff report',
    summary: [
      { label: 'Active employees', value: employees.filter((e) => e.isActive).length },
      { label: 'Attendance rate', value: totalMarked ? `${Math.round((attended / totalMarked) * 100)}%` : '-' },
      { label: 'Late arrivals', value: rows.reduce((s, r) => s + r.late, 0) },
      { label: 'Approved leave days', value: rows.reduce((s, r) => s + r.leaveDays, 0) },
    ],
    tables: [
      {
        title: 'Attendance and leave by employee',
        columns: [
          { key: 'employeeNo', label: 'No' }, { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' },
          { key: 'department', label: 'Department' }, { key: 'present', label: 'Present', type: 'number' },
          { key: 'late', label: 'Late', type: 'number' }, { key: 'halfDay', label: 'Half day', type: 'number' },
          { key: 'absent', label: 'Absent', type: 'number' }, { key: 'leaveDays', label: 'Leave days', type: 'number' },
          { key: 'active', label: 'Active' },
        ],
        rows,
      },
      {
        title: 'Headcount by department',
        columns: [{ key: 'department', label: 'Department' }, { key: 'count', label: 'Employees', type: 'number' }],
        rows: Object.entries(byDept).map(([department, count]) => ({ department, count })),
      },
    ],
  };
}

module.exports = { patients, appointments, revenue, pharmacy, laboratory, staff };

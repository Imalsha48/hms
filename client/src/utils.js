// Formatting helpers used across pages
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const fmtTime = (d) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (d) => `${fmtDate(d)} ${fmtTime(d)}`;
export const fmtMoney = (n) => `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
export const fullName = (p) => (p ? `${p.firstName} ${p.lastName}` : '');

export const age = (dob) => {
  const b = new Date(dob);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
};

// "YYYY-MM-DD" for today in LOCAL time (toISOString would give UTC)
export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "YYYY-MM-DDTHH:mm" in local time - what the server expects for scheduledAt
export const localDateTimeStr = (d) => `${todayStr(new Date(d))}T${fmtTime(d)}`;

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

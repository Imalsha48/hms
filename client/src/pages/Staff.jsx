// Staff (spec 3.9). Admin: employees, daily attendance, leave approvals.
// Everyone with an employee record: their own attendance and leave.
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, MenuItem, Paper,
  Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtTime, todayStr } from '../utils';

const ATT = { PRESENT: 'success', LATE: 'warning', HALF_DAY: 'info', ABSENT: 'error' };
// DATE columns come back as "2026-10-17T00:00:00.000Z": show the date part as-is
const dateOnly = (d) => fmtDate(`${String(d).slice(0, 10)}T00:00:00`);
const leaveDays = (l) => Math.round((new Date(l.endDate) - new Date(l.startDate)) / 86400000) + 1;

function EmployeeDialog({ open, employee, departments, onClose, onSaved }) {
  const empty = { firstName: '', lastName: '', designation: '', departmentId: '', phone: '', email: '', joinedDate: todayStr() };
  const [f, setF] = useState(empty);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setF(employee ? { ...Object.fromEntries(Object.keys(empty).map((k) => [k, employee[k] ?? ''])), joinedDate: String(employee.joinedDate).slice(0, 10) } : empty);
  }, [open, employee]); // eslint-disable-line

  const save = async () => {
    try {
      if (employee) await api.put(`/staff/employees/${employee.id}`, f);
      else await api.post('/staff/employees', f);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };
  const field = (k, label, props = {}) => (
    <Grid item xs={12} sm={6}><TextField label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></Grid>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{employee ? `Edit ${employee.employeeNo}` : 'Add employee'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ pt: 1 }}>
          {field('firstName', 'First name', { required: true })}
          {field('lastName', 'Last name', { required: true })}
          {field('designation', 'Designation', { required: true, placeholder: 'Staff Nurse' })}
          {field('departmentId', 'Department', { select: true, children: [<MenuItem key="" value="">None</MenuItem>, ...departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)] })}
          {field('phone', 'Phone')}
          {field('email', 'Email')}
          {field('joinedDate', 'Joined date', { type: 'date', InputLabelProps: { shrink: true } })}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>{employee ? 'Save' : 'Add employee'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function LeaveForm({ employees, onSaved }) {
  const empty = { leaveType: 'Annual', startDate: todayStr(), endDate: todayStr(), reason: '', employeeId: '' };
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState(null);
  const submit = async () => {
    try {
      await api.post('/staff/leaves', f);
      setF(empty);
      setMsg({ type: 'success', text: 'Leave request submitted' });
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: errMsg(err) });
    }
  };
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography fontWeight={700} sx={{ mb: 1.5 }}>Apply for leave</Typography>
      {msg && <Alert severity={msg.type} sx={{ mb: 1.5 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <Grid container spacing={1.5}>
        {employees && (
          <Grid item xs={12} md={3}>
            <TextField select label="Employee" value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
              {employees.map((e) => <MenuItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</MenuItem>)}
            </TextField>
          </Grid>
        )}
        <Grid item xs={12} sm={4} md={2}>
          <TextField select label="Type" value={f.leaveType} onChange={(e) => setF({ ...f, leaveType: e.target.value })}>
            {['Annual', 'Sick', 'Casual'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid item xs={6} sm={4} md={2}><TextField type="date" label="From" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
        <Grid item xs={6} sm={4} md={2}><TextField type="date" label="To" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
        <Grid item xs={12} md={employees ? 3 : 6}><TextField label="Reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Grid>
      </Grid>
      <Button variant="contained" sx={{ mt: 1.5 }} onClick={submit} disabled={employees && !f.employeeId}>Submit request</Button>
    </Paper>
  );
}

function LeaveTable({ leaves, showEmployee, onDecide }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {showEmployee && <TableCell>Employee</TableCell>}
          <TableCell>Type</TableCell><TableCell>From</TableCell><TableCell>To</TableCell><TableCell>Days</TableCell>
          <TableCell>Reason</TableCell><TableCell>Status</TableCell>{onDecide && <TableCell />}
        </TableRow>
      </TableHead>
      <TableBody>
        {leaves.map((l) => (
          <TableRow key={l.id}>
            {showEmployee && <TableCell sx={{ fontWeight: 600 }}>{l.employee.firstName} {l.employee.lastName}<Typography variant="caption" display="block" color="text.secondary">{l.employee.designation}</Typography></TableCell>}
            <TableCell>{l.leaveType}</TableCell>
            <TableCell>{dateOnly(l.startDate)}</TableCell>
            <TableCell>{dateOnly(l.endDate)}</TableCell>
            <TableCell>{leaveDays(l)}</TableCell>
            <TableCell>{l.reason || '-'}</TableCell>
            <TableCell><StatusChip status={l.status} /></TableCell>
            {onDecide && (
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {l.status === 'PENDING' && (
                  <>
                    <Button size="small" color="success" onClick={() => onDecide(l, 'APPROVED')}>Approve</Button>
                    <Button size="small" color="error" onClick={() => onDecide(l, 'REJECTED')}>Reject</Button>
                  </>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
        {leaves.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.secondary' }}>No leave records</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export default function Staff() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole();
  const [tab, setTab] = useState(0);
  const [me, setMe] = useState(undefined);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [attDate, setAttDate] = useState(todayStr());
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null closed, {} new, employee edit

  const loadMe = () => api.get('/staff/me').then((r) => setMe(r.data));
  const loadAdmin = () => {
    api.get('/staff/employees').then((r) => setEmployees(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/staff/leaves').then((r) => setLeaves(r.data));
  };
  const loadAttendance = () => api.get('/staff/attendance', { params: { date: attDate } }).then((r) => setAttendance(r.data));

  useEffect(() => {
    loadMe();
    if (isAdmin) { loadAdmin(); api.get('/departments').then((r) => setDepartments(r.data)); }
  }, []); // eslint-disable-line
  useEffect(() => { if (isAdmin) loadAttendance(); }, [attDate]); // eslint-disable-line

  const mark = async (employeeId, status) => {
    if (!status) return;
    try { await api.put('/staff/attendance', { employeeId, date: attDate, status }); loadAttendance(); } catch (err) { setError(errMsg(err)); }
  };
  const decide = async (l, status) => {
    try { await api.patch(`/staff/leaves/${l.id}`, { status }); loadAdmin(); } catch (err) { setError(errMsg(err)); }
  };
  const shiftDay = (n) => {
    const [y, m, d] = attDate.split('-').map(Number);
    setAttDate(todayStr(new Date(y, m - 1, d + n)));
  };

  // Non-admin view: just their own leave
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="My attendance & leave" />
        {me === null && <Alert severity="info">Your account has no employee record, so attendance and leave aren't tracked here.</Alert>}
        {me && (
          <>
            <LeaveForm onSaved={loadMe} />
            <Paper sx={{ p: 2 }}>
              <Typography fontWeight={700} sx={{ mb: 1 }}>My leave requests</Typography>
              <LeaveTable leaves={me.leaves} />
            </Paper>
          </>
        )}
      </>
    );
  }

  const pending = leaves.filter((l) => l.status === 'PENDING').length;
  const counts = attendance.reduce((c, e) => ({ ...c, [e.record?.status || 'UNMARKED']: (c[e.record?.status || 'UNMARKED'] || 0) + 1 }), {});

  return (
    <>
      <PageHeader
        title="Staff"
        action={tab === 0 && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>Add employee</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          <Tab label={`Employees (${employees.length})`} />
          <Tab label="Attendance" />
          <Tab label={pending ? `Leave (${pending} pending)` : 'Leave'} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>No</TableCell><TableCell>Name</TableCell><TableCell>Designation</TableCell><TableCell>Department</TableCell>
                  <TableCell>Login</TableCell><TableCell>Joined</TableCell><TableCell>Status</TableCell><TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{e.employeeNo}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{e.firstName} {e.lastName}</TableCell>
                    <TableCell>{e.designation}</TableCell>
                    <TableCell>{e.department?.name || '-'}</TableCell>
                    <TableCell>{e.user ? `${e.user.username} (${e.user.role.toLowerCase().replace('_', ' ')})` : '-'}</TableCell>
                    <TableCell>{dateOnly(e.joinedDate)}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={e.isActive ? 'Active' : 'Inactive'} color={e.isActive ? 'success' : 'default'} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" onClick={() => setEditing(e)}>Edit</Button>
                      <Button size="small" color={e.isActive ? 'error' : 'success'}
                        onClick={() => api.put(`/staff/employees/${e.id}`, { isActive: !e.isActive }).then(loadAdmin)}>
                        {e.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center">
                <IconButton onClick={() => shiftDay(-1)}><ChevronLeft /></IconButton>
                <TextField type="date" value={attDate} onChange={(e) => e.target.value && setAttDate(e.target.value)} sx={{ width: 170 }} />
                <IconButton onClick={() => shiftDay(1)}><ChevronRight /></IconButton>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {Object.entries(counts).map(([k, n]) => <Chip key={k} size="small" label={`${k.replace('_', ' ').toLowerCase()}: ${n}`} color={ATT[k] || 'default'} variant="outlined" />)}
              </Stack>
            </Stack>
            <Table>
              <TableHead>
                <TableRow><TableCell>Employee</TableCell><TableCell>Check in</TableCell><TableCell>Check out</TableCell><TableCell>Mark as</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {attendance.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{e.firstName} {e.lastName}<Typography variant="caption" display="block" color="text.secondary">{e.designation}</Typography></TableCell>
                    <TableCell>{e.record?.checkIn ? fmtTime(e.record.checkIn) : '-'}</TableCell>
                    <TableCell>{e.record?.checkOut ? fmtTime(e.record.checkOut) : '-'}</TableCell>
                    <TableCell>
                      <ToggleButtonGroup size="small" exclusive value={e.record?.status || null} onChange={(ev, v) => mark(e.id, v)}>
                        {Object.keys(ATT).map((s) => <ToggleButton key={s} value={s} color={ATT[s]} sx={{ px: 1.2, textTransform: 'none' }}>{s.replace('_', ' ').toLowerCase()}</ToggleButton>)}
                      </ToggleButtonGroup>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            <LeaveForm employees={employees.filter((e) => e.isActive)} onSaved={loadAdmin} />
            <LeaveTable leaves={leaves} showEmployee onDecide={decide} />
          </Box>
        )}
      </Paper>

      <EmployeeDialog open={editing !== null} employee={editing?.id ? editing : null} departments={departments}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadAdmin(); }} />
    </>
  );
}

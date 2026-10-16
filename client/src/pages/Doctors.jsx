// Doctors & Departments (spec 3.3)
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, MenuItem,
  Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import ScheduleIcon from '@mui/icons-material/ScheduleOutlined';
import PageHeader from '../components/PageHeader';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { DAYS, fmtMoney } from '../utils';

const scheduleText = (s) => {
  if (!s.length) return 'No schedule';
  const days = [...new Set(s.map((x) => x.dayOfWeek))].map((d) => DAYS[d]).join(', ');
  return `${days} · ${s[0].startTime}-${s[0].endTime}`;
};

function DoctorDialog({ open, onClose, onSaved, departments }) {
  const empty = { username: '', password: '', fullName: '', email: '', departmentId: '', specialization: '', qualification: '', phone: '', consultationFee: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setForm(empty); setError(''); } }, [open]); // eslint-disable-line

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/doctors', form);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };
  const f = (k, label, props = {}) => <Grid item xs={12} sm={6}><TextField label={label} value={form[k]} onChange={set(k)} {...props} /></Grid>;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth component="form" onSubmit={submit}>
      <DialogTitle>Add doctor</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="overline" color="text.secondary">Login account</Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {f('username', 'Username', { required: true })}
          {f('password', 'Temporary password', { required: true, type: 'password', helperText: '8+ chars, letters and numbers' })}
        </Grid>
        <Typography variant="overline" color="text.secondary">Profile</Typography>
        <Grid container spacing={2}>
          {f('fullName', 'Full name', { required: true, placeholder: 'Dr. ...' })}
          {f('email', 'Email', { type: 'email' })}
          {f('departmentId', 'Department', { select: true, required: true, children: departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>) })}
          {f('specialization', 'Specialization', { required: true })}
          {f('qualification', 'Qualification')}
          {f('phone', 'Phone')}
          {f('consultationFee', 'Consultation fee (Rs.)', { type: 'number', inputProps: { min: 0 } })}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained">Create doctor</Button>
      </DialogActions>
    </Dialog>
  );
}

function ScheduleDialog({ doctor, onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (doctor) { setRows(doctor.schedules.map(({ dayOfWeek, startTime, endTime, slotMins }) => ({ dayOfWeek, startTime, endTime, slotMins }))); setError(''); }
  }, [doctor]);

  const update = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => {
    try {
      await api.put(`/doctors/${doctor.id}/schedules`, rows);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Dialog open={!!doctor} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Weekly schedule · {doctor?.user.fullName}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {rows.map((r, i) => (
            <Stack direction="row" spacing={1} key={i} alignItems="center">
              <TextField select label="Day" value={r.dayOfWeek} onChange={(e) => update(i, 'dayOfWeek', Number(e.target.value))}>
                {DAYS.map((d, n) => <MenuItem key={d} value={n}>{d}</MenuItem>)}
              </TextField>
              <TextField type="time" label="Start" value={r.startTime} onChange={(e) => update(i, 'startTime', e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField type="time" label="End" value={r.endTime} onChange={(e) => update(i, 'endTime', e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField type="number" label="Slot (min)" value={r.slotMins} onChange={(e) => update(i, 'slotMins', Number(e.target.value))} />
              <IconButton onClick={() => setRows(rows.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} onClick={() => setRows([...rows, { dayOfWeek: 1, startTime: '09:00', endTime: '13:00', slotMins: 15 }])} sx={{ alignSelf: 'flex-start' }}>
            Add time block
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save schedule</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Doctors() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(); // hasRole() with no roles = admin only
  const [tab, setTab] = useState(0);
  const [doctors, setDoctors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [newDept, setNewDept] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.get('/doctors', { params: { departmentId: deptFilter || undefined } }).then((r) => setDoctors(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/departments').then((r) => setDepartments(r.data));
  };
  useEffect(load, [deptFilter]); // eslint-disable-line

  const toggleActive = async (d) => {
    await api.put(`/doctors/${d.id}`, { isActive: !d.user.isActive });
    load();
  };
  const addDept = async () => {
    try { await api.post('/departments', { name: newDept }); setNewDept(''); load(); } catch (err) { setError(errMsg(err)); }
  };
  const deleteDept = async (d) => {
    if (!window.confirm(`Delete ${d.name}?`)) return;
    try { await api.delete(`/departments/${d.id}`); load(); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <>
      <PageHeader
        title="Doctors & departments"
        action={isAdmin && tab === 0 && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add doctor</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          <Tab label={`Doctors (${doctors.length})`} />
          <Tab label={`Departments (${departments.length})`} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <TextField select label="Department" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} sx={{ m: 2, maxWidth: 260 }}>
              <MenuItem value="">All departments</MenuItem>
              {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
            </TextField>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Doctor</TableCell><TableCell>Department</TableCell><TableCell>Specialization</TableCell>
                  <TableCell>Schedule</TableCell><TableCell>Fee</TableCell><TableCell>Status</TableCell>
                  {isAdmin && <TableCell align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {doctors.map((d) => (
                  <TableRow key={d.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{d.user.fullName}</TableCell>
                    <TableCell>{d.department.name}</TableCell>
                    <TableCell>{d.specialization}</TableCell>
                    <TableCell>{scheduleText(d.schedules)}</TableCell>
                    <TableCell>{fmtMoney(d.consultationFee)}</TableCell>
                    <TableCell><Chip size="small" label={d.user.isActive ? 'Active' : 'Inactive'} color={d.user.isActive ? 'success' : 'default'} variant="outlined" /></TableCell>
                    {isAdmin && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" startIcon={<ScheduleIcon />} onClick={() => setScheduleFor(d)}>Schedule</Button>
                        <Button size="small" color={d.user.isActive ? 'error' : 'success'} onClick={() => toggleActive(d)}>
                          {d.user.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            {isAdmin && (
              <Stack direction="row" spacing={1} sx={{ mb: 2, maxWidth: 420 }}>
                <TextField label="New department name" value={newDept} onChange={(e) => setNewDept(e.target.value)} />
                <Button variant="contained" onClick={addDept} disabled={!newDept.trim()}>Add</Button>
              </Stack>
            )}
            <Table size="small">
              <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Doctors</TableCell><TableCell>Staff</TableCell>{isAdmin && <TableCell />}</TableRow></TableHead>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{d.name}</TableCell>
                    <TableCell>{d._count.doctors}</TableCell>
                    <TableCell>{d._count.employees}</TableCell>
                    {isAdmin && <TableCell align="right"><IconButton size="small" onClick={() => deleteDept(d)}><DeleteIcon fontSize="small" /></IconButton></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <DoctorDialog open={addOpen} departments={departments} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <ScheduleDialog doctor={scheduleFor} onClose={() => setScheduleFor(null)} onSaved={() => { setScheduleFor(null); load(); }} />
    </>
  );
}

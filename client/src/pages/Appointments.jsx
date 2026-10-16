// Appointments (spec 3.4): book, view by day, reschedule, cancel, complete
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Link, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtTime, fullName, localDateTimeStr, todayStr } from '../utils';

// Shows a doctor's free slots for a date as clickable chips
function SlotPicker({ doctorId, date, value, onChange }) {
  const [slots, setSlots] = useState(null);
  useEffect(() => {
    if (!doctorId || !date) return setSlots(null);
    api.get(`/doctors/${doctorId}/slots`, { params: { date } }).then((r) => setSlots(r.data)).catch(() => setSlots([]));
  }, [doctorId, date]);

  if (!slots) return null;
  if (!slots.length) return <Alert severity="info">No available times. The doctor may not work this day, or the times have passed.</Alert>;
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Available times</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {slots.map((s) => {
          const v = localDateTimeStr(s.time);
          return (
            <Chip key={v} label={fmtTime(s.time)} disabled={!s.available} onClick={() => onChange(v)}
              color={value === v ? 'primary' : 'default'} variant={value === v ? 'filled' : 'outlined'} />
          );
        })}
      </Box>
    </Box>
  );
}

function BookDialog({ open, onClose, onSaved, doctors }) {
  const [patientOptions, setPatientOptions] = useState([]);
  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(todayStr());
  const [slot, setSlot] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setPatient(null); setDoctorId(''); setDate(todayStr()); setSlot(''); setReason(''); setError(''); }
  }, [open]);

  const searchPatients = (text) => {
    api.get('/patients', { params: { search: text || undefined, pageSize: 10 } }).then((r) => setPatientOptions(r.data.items));
  };

  const submit = async () => {
    try {
      await api.post('/appointments', { patientId: patient.id, doctorId, scheduledAt: slot, reason });
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Book appointment</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Autocomplete
            options={patientOptions}
            value={patient}
            onChange={(e, v) => setPatient(v)}
            onInputChange={(e, text) => searchPatients(text)}
            onOpen={() => searchPatients('')}
            filterOptions={(x) => x}
            getOptionLabel={(p) => `${fullName(p)} (${p.patientNo})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Patient" placeholder="Type a name or patient no" />}
          />
          <TextField select label="Doctor" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(''); }}>
            {doctors.map((d) => <MenuItem key={d.id} value={d.id}>{d.user.fullName} · {d.specialization}</MenuItem>)}
          </TextField>
          <TextField type="date" label="Date" value={date} onChange={(e) => { setDate(e.target.value); setSlot(''); }}
            InputLabelProps={{ shrink: true }} inputProps={{ min: todayStr() }} />
          <SlotPicker doctorId={doctorId} date={date} value={slot} onChange={setSlot} />
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!patient || !doctorId || !slot}>Book</Button>
      </DialogActions>
    </Dialog>
  );
}

function RescheduleDialog({ appt, onClose, onSaved }) {
  const [date, setDate] = useState(todayStr());
  const [slot, setSlot] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (appt) { setDate(todayStr(new Date(appt.scheduledAt))); setSlot(''); setError(''); } }, [appt]);

  const submit = async () => {
    try {
      await api.patch(`/appointments/${appt.id}/reschedule`, { scheduledAt: slot });
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Dialog open={!!appt} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reschedule · {appt && fullName(appt.patient)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField type="date" label="New date" value={date} onChange={(e) => { setDate(e.target.value); setSlot(''); }}
            InputLabelProps={{ shrink: true }} inputProps={{ min: todayStr() }} />
          {appt && <SlotPicker doctorId={appt.doctorId} date={date} value={slot} onChange={setSlot} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!slot}>Reschedule</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Appointments() {
  const { user, hasRole } = useAuth();
  const isDoctor = user.role === 'DOCTOR';
  const [date, setDate] = useState(todayStr());
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [appts, setAppts] = useState([]);
  const [error, setError] = useState('');
  const [bookOpen, setBookOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(null);

  useEffect(() => { api.get('/doctors', { params: { active: 'true' } }).then((r) => setDoctors(r.data)); }, []);

  const load = () => {
    api.get('/appointments', { params: { date, doctorId: doctorId || undefined } })
      .then((r) => setAppts(r.data))
      .catch((e) => setError(errMsg(e)));
  };
  useEffect(load, [date, doctorId]); // eslint-disable-line

  const shiftDay = (n) => {
    const [y, m, d] = date.split('-').map(Number);
    setDate(todayStr(new Date(y, m - 1, d + n)));
  };

  const action = async (a, kind) => {
    if (kind === 'cancel' && !window.confirm(`Cancel ${fullName(a.patient)}'s appointment?`)) return;
    try {
      await api.patch(`/appointments/${a.id}/${kind}`);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const active = (a) => ['BOOKED', 'RESCHEDULED'].includes(a.status);

  return (
    <>
      <PageHeader
        title={isDoctor ? 'My appointments' : 'Appointments'}
        subtitle={`${appts.filter(active).length} upcoming on ${fmtDate(date)}`}
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setBookOpen(true)}>Book appointment</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2 }} alignItems={{ sm: 'center' }}>
          <Stack direction="row" alignItems="center">
            <IconButton onClick={() => shiftDay(-1)}><ChevronLeft /></IconButton>
            <TextField type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} sx={{ width: 170 }} />
            <IconButton onClick={() => shiftDay(1)}><ChevronRight /></IconButton>
          </Stack>
          <Button size="small" onClick={() => setDate(todayStr())}>Today</Button>
          {!isDoctor && (
            <TextField select label="Doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} sx={{ maxWidth: 260 }}>
              <MenuItem value="">All doctors</MenuItem>
              {doctors.map((d) => <MenuItem key={d.id} value={d.id}>{d.user.fullName}</MenuItem>)}
            </TextField>
          )}
        </Stack>

        <Box sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell><TableCell>Patient</TableCell>
                {!isDoctor && <TableCell>Doctor</TableCell>}
                <TableCell>Reason</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {appts.map((a) => (
                <TableRow key={a.id} hover sx={{ opacity: a.status === 'CANCELLED' ? 0.55 : 1 }}>
                  <TableCell sx={{ fontWeight: 700 }}>{fmtTime(a.scheduledAt)}</TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/patients/${a.patient.id}`} underline="hover" fontWeight={600}>{fullName(a.patient)}</Link>
                    <Typography variant="caption" display="block" color="text.secondary">{a.patient.patientNo}</Typography>
                  </TableCell>
                  {!isDoctor && <TableCell>{a.doctor.user.fullName}</TableCell>}
                  <TableCell>{a.reason || '-'}</TableCell>
                  <TableCell><StatusChip status={a.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {active(a) && (
                      <>
                        {hasRole('DOCTOR', 'NURSE') && <Button size="small" color="success" onClick={() => action(a, 'complete')}>Complete</Button>}
                        <Button size="small" onClick={() => setRescheduling(a)}>Reschedule</Button>
                        <Button size="small" color="error" onClick={() => action(a, 'cancel')}>Cancel</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {appts.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No appointments on this day</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <BookDialog open={bookOpen} doctors={doctors} onClose={() => setBookOpen(false)} onSaved={() => { setBookOpen(false); load(); }} />
      <RescheduleDialog appt={rescheduling} onClose={() => setRescheduling(null)} onSaved={() => { setRescheduling(null); load(); }} />
    </>
  );
}

// Inpatient admissions: ward/bed map, admit, transfer, discharge
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, MenuItem, Paper, Stack,
  Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BedIcon from '@mui/icons-material/HotelOutlined';
import PageHeader from '../components/PageHeader';
import PatientPicker from '../components/PatientPicker';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime, fmtMoney, fullName } from '../utils';

const daysSince = (d) => Math.max(1, Math.ceil((Date.now() - new Date(d)) / 86400000));

function freeBeds(wards) {
  return wards.flatMap((w) => w.beds.filter((b) => !b.isOccupied).map((b) => ({ ...b, ward: w })));
}

function AdmitDialog({ open, onClose, onSaved, wards, doctors, presetBed }) {
  const [patient, setPatient] = useState(null);
  const [doctorId, setDoctorId] = useState('');
  const [bedId, setBedId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setPatient(null); setDoctorId(''); setBedId(presetBed?.id || ''); setReason(''); setError(''); }
  }, [open, presetBed]);

  const save = async () => {
    try {
      await api.post('/admissions', { patientId: patient.id, doctorId, bedId, reason });
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Admit patient</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <PatientPicker value={patient} onChange={setPatient} />
          <TextField select label="Attending doctor" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => <MenuItem key={d.id} value={d.id}>{d.user.fullName} · {d.specialization}</MenuItem>)}
          </TextField>
          <TextField select label="Bed" value={bedId} onChange={(e) => setBedId(e.target.value)}>
            {freeBeds(wards).map((b) => (
              <MenuItem key={b.id} value={b.id}>{b.ward.name} · {b.bedNo} ({fmtMoney(b.ward.dailyRate)}/day)</MenuItem>
            ))}
          </TextField>
          <TextField label="Reason for admission" value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!patient || !doctorId || !bedId}>Admit</Button>
      </DialogActions>
    </Dialog>
  );
}

function TransferDialog({ admission, wards, onClose, onSaved }) {
  const [bedId, setBedId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setBedId(''); setError(''); }, [admission]);
  const save = async () => {
    try { await api.patch(`/admissions/${admission.id}/transfer`, { bedId }); onSaved(); } catch (err) { setError(errMsg(err)); }
  };
  return (
    <Dialog open={!!admission} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Transfer · {admission && fullName(admission.patient)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">Currently in {admission?.bed.ward.name} · {admission?.bed.bedNo}</Typography>
          <TextField select label="New bed" value={bedId} onChange={(e) => setBedId(e.target.value)}>
            {freeBeds(wards).map((b) => <MenuItem key={b.id} value={b.id}>{b.ward.name} · {b.bedNo}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!bedId}>Transfer</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Admissions() {
  const { hasRole } = useAuth();
  const canManage = hasRole('NURSE', 'DOCTOR', 'RECEPTIONIST');
  const [tab, setTab] = useState(0);
  const [wards, setWards] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [error, setError] = useState('');
  const [admitOpen, setAdmitOpen] = useState(false);
  const [presetBed, setPresetBed] = useState(null);
  const [transferFor, setTransferFor] = useState(null);

  const load = () => {
    api.get('/admissions/wards').then((r) => setWards(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/admissions').then((r) => setAdmissions(r.data));
  };
  useEffect(() => {
    load();
    api.get('/doctors', { params: { active: 'true' } }).then((r) => setDoctors(r.data));
  }, []);

  const discharge = async (a) => {
    if (!window.confirm(`Discharge ${fullName(a.patient)}? The bed will be freed.`)) return;
    try { await api.patch(`/admissions/${a.id}/discharge`); load(); } catch (err) { setError(errMsg(err)); }
  };

  const current = admissions.filter((a) => a.status === 'ADMITTED');
  const past = admissions.filter((a) => a.status === 'DISCHARGED');
  const totalBeds = wards.reduce((s, w) => s + w.beds.length, 0);
  const occupied = wards.reduce((s, w) => s + w.occupied, 0);

  const admissionRows = (list, active) => (
    <Box sx={{ overflowX: 'auto' }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Patient</TableCell><TableCell>Ward / bed</TableCell><TableCell>Doctor</TableCell>
            <TableCell>Admitted</TableCell><TableCell>{active ? 'Days so far' : 'Discharged'}</TableCell><TableCell>Reason</TableCell>
            {active && canManage && <TableCell align="right">Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {list.map((a) => (
            <TableRow key={a.id} hover>
              <TableCell>
                <Link component={RouterLink} to={`/patients/${a.patient.id}`} underline="hover" fontWeight={600}>{fullName(a.patient)}</Link>
                <Typography variant="caption" display="block" color="text.secondary">{a.patient.patientNo}</Typography>
              </TableCell>
              <TableCell>{a.bed.ward.name} · {a.bed.bedNo}</TableCell>
              <TableCell>{a.doctor.user.fullName}</TableCell>
              <TableCell>{fmtDateTime(a.admittedAt)}</TableCell>
              <TableCell>{active ? daysSince(a.admittedAt) : fmtDateTime(a.dischargedAt)}</TableCell>
              <TableCell>{a.reason || '-'}</TableCell>
              {active && canManage && (
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button size="small" onClick={() => setTransferFor(a)}>Transfer</Button>
                  <Button size="small" color="error" onClick={() => discharge(a)}>Discharge</Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {list.length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nothing here</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Box>
  );

  return (
    <>
      <PageHeader
        title="Admissions"
        subtitle={`${occupied} of ${totalBeds} beds occupied`}
        action={canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setPresetBed(null); setAdmitOpen(true); }}>Admit patient</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          <Tab label="Bed map" />
          <Tab label={`Admitted (${current.length})`} />
          <Tab label="Discharged" />
        </Tabs>

        {tab === 0 && (
          <Stack spacing={3} sx={{ p: 2 }}>
            {wards.map((w) => (
              <Box key={w.id}>
                <Typography fontWeight={700}>
                  {w.name} <Typography component="span" variant="body2" color="text.secondary">· {w.occupied}/{w.beds.length} occupied · {fmtMoney(w.dailyRate)}/day</Typography>
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5, mt: 1 }}>
                  {w.beds.map((b) => {
                    const p = b.current?.patient;
                    return (
                      <Tooltip key={b.id} title={p ? `Admitted ${fmtDateTime(b.current.admittedAt)}` : canManage ? 'Click to admit a patient here' : ''}>
                        <Paper
                          onClick={() => !p && canManage && (setPresetBed(b), setAdmitOpen(true))}
                          sx={{
                            p: 1.5, cursor: !p && canManage ? 'pointer' : 'default',
                            bgcolor: p ? '#fdecea' : '#e8f5e9', borderColor: p ? '#f5c2c0' : '#b9dfbc',
                          }}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <BedIcon fontSize="small" sx={{ color: p ? 'error.main' : 'success.main' }} />
                            <Typography fontWeight={700}>{b.bedNo}</Typography>
                          </Stack>
                          {p ? (
                            <Link component={RouterLink} to={`/patients/${p.id}`} variant="body2" underline="hover" sx={{ display: 'block', mt: 0.5 }} noWrap>
                              {fullName(p)}
                            </Link>
                          ) : <Chip size="small" label="Free" color="success" variant="outlined" sx={{ mt: 0.5 }} />}
                        </Paper>
                      </Tooltip>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
        {tab === 1 && admissionRows(current, true)}
        {tab === 2 && admissionRows(past, false)}
      </Paper>

      <AdmitDialog open={admitOpen} wards={wards} doctors={doctors} presetBed={presetBed} onClose={() => setAdmitOpen(false)} onSaved={() => { setAdmitOpen(false); load(); }} />
      <TransferDialog admission={transferFor} wards={wards} onClose={() => setTransferFor(null)} onSaved={() => { setTransferFor(null); load(); }} />
    </>
  );
}

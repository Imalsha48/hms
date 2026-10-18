// Doctor's consultation screen (spec 3.5):
// diagnosis + treatment notes + prescription + lab orders, saved together.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Grid, IconButton, Paper, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import ClinicalAlerts from '../components/ClinicalAlerts';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PageHeader from '../components/PageHeader';
import api, { errMsg } from '../api/client';
import { age, fmtDate, fmtMoney, fullName } from '../utils';

const emptyLine = () => ({ medicine: null, dosage: '', frequency: '', durationDays: 5, quantity: '' });
const FREQUENCIES = ['Once a day', 'Twice a day', '3 times a day', '4 times a day', 'At night', 'When needed'];
const PER_DAY = { 'Once a day': 1, 'Twice a day': 2, '3 times a day': 3, '4 times a day': 4, 'At night': 1 };

export default function Consultation() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const patientId = params.get('patientId');
  const appointmentId = params.get('appointmentId');

  const [patient, setPatient] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [tests, setTests] = useState([]);
  const [form, setForm] = useState({ symptoms: '', diagnosis: '', treatment: '', notes: '' });
  const [lines, setLines] = useState([]);
  const [labTestIds, setLabTestIds] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    if (!patientId) return;
    api.get(`/patients/${patientId}`).then((r) => setPatient(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/pharmacy/medicines').then((r) => setMedicines(r.data));
    api.get('/lab/tests').then((r) => setTests(r.data));
  }, [patientId]);

  // Decision support: re-check the prescription (debounced) whenever it changes
  const rxKey = JSON.stringify(lines.map((l) => [l.medicine?.id, l.dosage, l.frequency]));
  useEffect(() => {
    const items = lines.filter((l) => l.medicine).map((l) => ({ medicineId: l.medicine.id, dosage: l.dosage, frequency: l.frequency }));
    if (!patientId || !items.length) { setAlerts([]); return undefined; }
    const t = setTimeout(() => {
      api.post('/clinical/check-prescription', { patientId: Number(patientId), items }).then((r) => setAlerts(r.data.alerts)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [rxKey, patientId]); // eslint-disable-line

  if (!patientId) return <Alert severity="info">Open a consultation from an appointment or a patient profile.</Alert>;
  if (!patient) return error ? <Alert severity="error">{error}</Alert> : <Skeleton variant="rounded" height={400} />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Updating dosage/frequency/days auto-fills quantity (e.g. 1 tablet, 3x a day, 5 days = 15)
  const updateLine = (i, changes) =>
    setLines(lines.map((l, j) => {
      if (j !== i) return l;
      const next = { ...l, ...changes };
      const perDose = parseFloat(next.dosage) || 1;
      if (('frequency' in changes || 'durationDays' in changes || 'dosage' in changes) && PER_DAY[next.frequency]) {
        next.quantity = Math.ceil(perDose * PER_DAY[next.frequency] * (Number(next.durationDays) || 0));
      }
      return next;
    }));

  const toggleTest = (id) => setLabTestIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const hasHigh = alerts.some((a) => a.severity === 'high');

  // High-risk alerts need a documented reason before saving
  const trySave = () => {
    if (hasHigh && !overrideReason.trim()) { setOverrideOpen(true); return; }
    save();
  };

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await api.post('/records', {
        overrideReason: overrideReason.trim() || undefined,
        patientId: Number(patientId),
        appointmentId: appointmentId ? Number(appointmentId) : undefined,
        ...form,
        prescriptionItems: lines.map((l) => ({
          medicineId: l.medicine?.id, dosage: l.dosage, frequency: l.frequency,
          durationDays: Number(l.durationDays), quantity: Number(l.quantity),
        })),
        labTestIds,
      });
      navigate(`/patients/${patientId}`);
    } catch (err) {
      if (err.response?.status === 409 && /High-risk alert/.test(errMsg(err))) setOverrideOpen(true);
      else { setError(errMsg(err)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } finally {
      setBusy(false);
    }
  };

  const lastRecord = patient.medicalRecords[0];

  return (
    <>
      <PageHeader
        title={`Consultation · ${fullName(patient)}`}
        subtitle={`${patient.patientNo} · ${age(patient.dateOfBirth)} years · ${patient.gender.toLowerCase()}${patient.bloodGroup ? ` · ${patient.bloodGroup}` : ''}`}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {patient.allergies && <Alert severity="warning" sx={{ mb: 2 }}><b>Allergies:</b> {patient.allergies}</Alert>}
      {lastRecord && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Last visit {fmtDate(lastRecord.createdAt)}: <b>{lastRecord.diagnosis}</b>
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper sx={{ p: 2.5 }}>
          <Typography fontWeight={700} sx={{ mb: 2 }}>Clinical notes</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}><TextField label="Symptoms / complaints" multiline minRows={3} value={form.symptoms} onChange={set('symptoms')} /></Grid>
            <Grid item xs={12} md={6}><TextField label="Diagnosis" required multiline minRows={3} value={form.diagnosis} onChange={set('diagnosis')} /></Grid>
            <Grid item xs={12} md={6}><TextField label="Treatment plan" multiline minRows={2} value={form.treatment} onChange={set('treatment')} /></Grid>
            <Grid item xs={12} md={6}><TextField label="Notes" multiline minRows={2} value={form.notes} onChange={set('notes')} /></Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Typography fontWeight={700} sx={{ mb: 2 }}>Prescription</Typography>
          <Stack spacing={1.5}>
            {lines.map((l, i) => (
              <Grid container spacing={1} key={i} alignItems="center">
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    options={medicines}
                    value={l.medicine}
                    onChange={(e, v) => updateLine(i, { medicine: v })}
                    getOptionLabel={(m) => m.name}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderOption={(props, m) => (
                      <li {...props} key={m.id}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                          <span>{m.name}</span>
                          <Chip size="small" label={`${m.stock} in stock`} color={m.stock === 0 ? 'error' : m.lowStock ? 'warning' : 'default'} variant="outlined" />
                        </Box>
                      </li>
                    )}
                    renderInput={(p) => <TextField {...p} label="Medicine" size="small" />}
                  />
                </Grid>
                <Grid item xs={6} md={2}><TextField label="Dosage" placeholder="1 tablet" value={l.dosage} onChange={(e) => updateLine(i, { dosage: e.target.value })} /></Grid>
                <Grid item xs={6} md={2.4}>
                  <Autocomplete freeSolo options={FREQUENCIES} inputValue={l.frequency} onInputChange={(e, v) => updateLine(i, { frequency: v })}
                    renderInput={(p) => <TextField {...p} label="Frequency" size="small" />} />
                </Grid>
                <Grid item xs={5} md={1.3}><TextField label="Days" type="number" inputProps={{ min: 1 }} value={l.durationDays} onChange={(e) => updateLine(i, { durationDays: e.target.value })} /></Grid>
                <Grid item xs={5} md={1.3}><TextField label="Qty" type="number" inputProps={{ min: 1 }} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} /></Grid>
                <Grid item xs={2} md={1} sx={{ textAlign: 'right' }}>
                  <IconButton onClick={() => setLines(lines.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>
                </Grid>
                {l.medicine && Number(l.quantity) > l.medicine.stock && (
                  <Grid item xs={12}><Typography variant="caption" color="error">Only {l.medicine.stock} in stock. The pharmacy can't dispense this until restocked.</Typography></Grid>
                )}
              </Grid>
            ))}
            <Button startIcon={<AddIcon />} onClick={() => setLines([...lines, emptyLine()])} sx={{ alignSelf: 'flex-start' }}>Add medicine</Button>
            {alerts.length > 0 && <Box sx={{ pt: 1 }}><ClinicalAlerts alerts={alerts} /></Box>}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>Lab tests</Typography>
          <Grid container>
            {tests.map((t) => (
              <Grid item xs={12} sm={6} md={4} key={t.id}>
                <FormControlLabel
                  control={<Checkbox checked={labTestIds.includes(t.id)} onChange={() => toggleTest(t.id)} />}
                  label={<span>{t.name} <Typography component="span" variant="caption" color="text.secondary">({fmtMoney(t.price)})</Typography></span>}
                />
              </Grid>
            ))}
          </Grid>
        </Paper>

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button variant="contained" size="large" color={hasHigh ? 'error' : 'primary'} onClick={trySave} disabled={busy || !form.diagnosis.trim()}>
            {busy ? 'Saving...' : appointmentId ? 'Save & complete appointment' : 'Save consultation'}
          </Button>
        </Stack>
      </Stack>

      <Dialog open={overrideOpen} onClose={() => setOverrideOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Override high-risk alert?</DialogTitle>
        <DialogContent>
          <ClinicalAlerts alerts={alerts.filter((a) => a.severity === 'high')} compact />
          <Typography variant="body2" sx={{ my: 2 }}>
            Saving anyway requires a clinical reason. It is stored in the medical record and the audit log.
          </Typography>
          <TextField label="Reason for override" multiline minRows={2} value={overrideReason} autoFocus
            onChange={(e) => setOverrideReason(e.target.value)} placeholder="e.g. Allergy was a mild rash; benefit outweighs risk, patient informed" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setOverrideOpen(false); setOverrideReason(''); }}>Go back and change</Button>
          <Button color="error" variant="contained" disabled={!overrideReason.trim()} onClick={() => { setOverrideOpen(false); save(); }}>
            Override and save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

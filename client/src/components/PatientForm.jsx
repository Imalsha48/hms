// Add / edit patient dialog (used on the Patients list and the Patient profile)
import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, TextField } from '@mui/material';
import api, { errMsg } from '../api/client';

const EMPTY = {
  firstName: '', lastName: '', dateOfBirth: '', gender: '', nic: '', phone: '', email: '', address: '',
  bloodGroup: '', allergies: '', emergencyName: '', emergencyPhone: '',
};
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientForm({ open, onClose, onSaved, patient }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(patient
      ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, k === 'dateOfBirth' ? patient.dateOfBirth.slice(0, 10) : patient[k] ?? '']))
      : EMPTY);
  }, [open, patient]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = patient ? await api.put(`/patients/${patient.id}`, form) : await api.post('/patients', form);
      onSaved(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, props = {}, xs = 6) => (
    <Grid item xs={12} sm={xs}><TextField label={label} value={form[k]} onChange={set(k)} {...props} /></Grid>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth component="form" onSubmit={submit}>
      <DialogTitle>{patient ? `Edit ${patient.patientNo}` : 'Register new patient'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ pt: 1 }}>
          {field('firstName', 'First name', { required: true })}
          {field('lastName', 'Last name', { required: true })}
          {field('dateOfBirth', 'Date of birth', { type: 'date', required: true, InputLabelProps: { shrink: true } }, 4)}
          {field('gender', 'Gender', { select: true, required: true, children: ['MALE', 'FEMALE', 'OTHER'].map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>) }, 4)}
          {field('bloodGroup', 'Blood group', { select: true, children: [<MenuItem key="" value="">Unknown</MenuItem>, ...BLOOD.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)] }, 4)}
          {field('nic', 'NIC')}
          {field('phone', 'Phone', { required: true })}
          {field('email', 'Email', { type: 'email' })}
          {field('address', 'Address')}
          {field('allergies', 'Allergies', { multiline: true, minRows: 2 }, 12)}
          {field('emergencyName', 'Emergency contact name')}
          {field('emergencyPhone', 'Emergency contact phone')}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy}>{patient ? 'Save changes' : 'Register patient'}</Button>
      </DialogActions>
    </Dialog>
  );
}

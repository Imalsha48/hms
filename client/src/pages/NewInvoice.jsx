// Create an invoice: pick a patient, tick their unbilled charges, add extras/discount
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Divider, Grid, IconButton, Paper, Stack, Table, TableBody, TableCell,
  TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PageHeader from '../components/PageHeader';
import PatientPicker from '../components/PatientPicker';
import api, { errMsg } from '../api/client';
import { fmtMoney } from '../utils';

const GROUPS = [
  { key: 'appointments', label: 'Consultations', idsKey: 'appointmentIds' },
  { key: 'labRequests', label: 'Laboratory', idsKey: 'labRequestIds' },
  { key: 'prescriptions', label: 'Pharmacy (dispensed prescriptions)', idsKey: 'prescriptionIds' },
  { key: 'admissions', label: 'Admissions', idsKey: 'admissionIds' },
];
const round2 = (n) => Math.round(n * 100) / 100;

export default function NewInvoice() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [patient, setPatient] = useState(null);
  const [unbilled, setUnbilled] = useState(null);
  const [selected, setSelected] = useState({}); // "appointments:3" -> true
  const [extras, setExtras] = useState([]);
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Opened from a patient profile: /billing/new?patientId=3
  useEffect(() => {
    const id = params.get('patientId');
    if (id) api.get(`/patients/${id}`).then((r) => setPatient(r.data));
  }, [params]);

  useEffect(() => {
    setUnbilled(null);
    setSelected({});
    if (!patient) return;
    api.get('/billing/unbilled', { params: { patientId: patient.id } })
      .then((r) => {
        setUnbilled(r.data);
        // Tick everything by default - usually you bill it all
        const all = {};
        GROUPS.forEach((g) => r.data[g.key].forEach((c) => { all[`${g.key}:${c.id}`] = true; }));
        setSelected(all);
      })
      .catch((e) => setError(errMsg(e)));
  }, [patient]);

  // Preview only - the server recalculates everything
  const subtotal = useMemo(() => {
    if (!unbilled) return 0;
    let s = 0;
    GROUPS.forEach((g) => unbilled[g.key].forEach((c) => { if (selected[`${g.key}:${c.id}`]) s += c.amount; }));
    extras.forEach((e) => { s += Number(e.amount) || 0; });
    return round2(s);
  }, [unbilled, selected, extras]);
  const total = round2(subtotal - (Number(discount) || 0));

  const nothingBillable = unbilled && GROUPS.every((g) => unbilled[g.key].length === 0);

  const create = async () => {
    setError('');
    setBusy(true);
    const body = { patientId: patient.id, extraItems: extras, discount: Number(discount) || 0, notes };
    GROUPS.forEach((g) => {
      body[g.idsKey] = unbilled[g.key].filter((c) => selected[`${g.key}:${c.id}`]).map((c) => c.id);
    });
    try {
      const { data } = await api.post('/billing/invoices', body);
      navigate(`/billing/invoices/${data.id}`, { replace: true });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New invoice" />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <PatientPicker value={patient} onChange={setPatient} />
          </Paper>

          {patient && !unbilled && <Typography color="text.secondary">Loading charges...</Typography>}
          {nothingBillable && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No unbilled charges for this patient. You can still add charges manually below.
            </Alert>
          )}

          {unbilled && GROUPS.filter((g) => unbilled[g.key].length).map((g) => (
            <Paper key={g.key} sx={{ p: 2, mb: 2 }}>
              <Typography fontWeight={700} sx={{ mb: 1 }}>{g.label}</Typography>
              <Table size="small">
                <TableBody>
                  {unbilled[g.key].map((c) => {
                    const k = `${g.key}:${c.id}`;
                    return (
                      <TableRow key={k} hover onClick={() => setSelected({ ...selected, [k]: !selected[k] })} sx={{ cursor: 'pointer' }}>
                        <TableCell padding="checkbox"><Checkbox checked={!!selected[k]} /></TableCell>
                        <TableCell>
                          {c.lines.map((l, i) => (
                            <Typography key={i} variant="body2">
                              {l.description}{l.quantity > 1 && <span style={{ color: '#888' }}> &times; {l.quantity} @ {fmtMoney(l.unitPrice)}</span>}
                            </Typography>
                          ))}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(c.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Paper>
          ))}

          {patient && unbilled && (
            <Paper sx={{ p: 2 }}>
              <Typography fontWeight={700} sx={{ mb: 1 }}>Other charges</Typography>
              <Stack spacing={1}>
                {extras.map((e, i) => (
                  <Stack direction="row" spacing={1} key={i}>
                    <TextField label="Description" value={e.description} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)))} />
                    <TextField label="Amount (Rs.)" type="number" value={e.amount} sx={{ maxWidth: 160 }}
                      onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} />
                    <IconButton onClick={() => setExtras(extras.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>
                  </Stack>
                ))}
                <Button startIcon={<AddIcon />} onClick={() => setExtras([...extras, { description: '', amount: '' }])} sx={{ alignSelf: 'flex-start' }}>
                  Add charge
                </Button>
              </Stack>
            </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2.5, position: { md: 'sticky' }, top: { md: 88 } }}>
            <Typography fontWeight={700} sx={{ mb: 2 }}>Summary</Typography>
            <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><b>{fmtMoney(subtotal)}</b></Box>
              <TextField label="Discount (Rs.)" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} inputProps={{ min: 0 }} />
              <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6">Total</Typography>
                <Typography variant="h6" fontWeight={700}>{fmtMoney(total)}</Typography>
              </Box>
              <Button variant="contained" size="large" disabled={!patient || !unbilled || subtotal <= 0 || busy} onClick={create}>
                {busy ? 'Creating...' : 'Create invoice'}
              </Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </>
  );
}

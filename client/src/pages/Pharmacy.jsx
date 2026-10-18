// Pharmacy (spec 3.7): prescriptions to dispense, inventory, stock receiving, expiry alerts
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton,
  Link, Paper, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandIcon from '@mui/icons-material/KeyboardArrowDown';
import CollapseIcon from '@mui/icons-material/KeyboardArrowUp';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import ClinicalAlerts from '../components/ClinicalAlerts';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtDateTime, fmtMoney, fullName, todayStr } from '../utils';

const isExpired = (d) => new Date(d) <= new Date(new Date().toDateString());
const daysLeft = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

function MedicineDialog({ open, onClose, onSaved }) {
  const empty = { name: '', genericName: '', form: '', strength: '', unitPrice: '', reorderLevel: 20 };
  const [f, setF] = useState(empty);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF(empty); setError(''); } }, [open]); // eslint-disable-line

  const save = async () => {
    try { await api.post('/pharmacy/medicines', f); onSaved(); } catch (err) { setError(errMsg(err)); }
  };
  const field = (k, label, props = {}) => (
    <Grid item xs={12} sm={6}><TextField label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} /></Grid>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add medicine</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ pt: 1 }}>
          {field('name', 'Name', { required: true, placeholder: 'Paracetamol 500mg' })}
          {field('genericName', 'Generic name')}
          {field('form', 'Form', { placeholder: 'Tablet / Syrup / Capsule' })}
          {field('strength', 'Strength', { placeholder: '500mg' })}
          {field('unitPrice', 'Unit price (Rs.)', { type: 'number', required: true })}
          {field('reorderLevel', 'Reorder level', { type: 'number', helperText: 'Alert when stock falls to this' })}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!f.name || f.unitPrice === ''}>Add medicine</Button>
      </DialogActions>
    </Dialog>
  );
}

function ReceiveDialog({ medicine, onClose, onSaved }) {
  const [f, setF] = useState({ batchNo: '', quantity: '', expiryDate: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (medicine) { setF({ batchNo: '', quantity: '', expiryDate: '' }); setError(''); } }, [medicine]);

  const save = async () => {
    try { await api.post(`/pharmacy/medicines/${medicine.id}/batches`, f); onSaved(); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <Dialog open={!!medicine} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Receive stock · {medicine?.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Batch number" value={f.batchNo} onChange={(e) => setF({ ...f, batchNo: e.target.value })} />
          <TextField label="Quantity" type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
          <TextField label="Expiry date" type="date" InputLabelProps={{ shrink: true }} inputProps={{ min: todayStr() }}
            value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!f.batchNo || !f.quantity || !f.expiryDate}>Add to stock</Button>
      </DialogActions>
    </Dialog>
  );
}

function InventoryRow({ m, isPharm, onReceive, onRemoveBatch }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow hover>
        <TableCell padding="checkbox"><IconButton size="small" onClick={() => setOpen(!open)}>{open ? <CollapseIcon /> : <ExpandIcon />}</IconButton></TableCell>
        <TableCell>
          <Typography fontWeight={600}>{m.name}</Typography>
          <Typography variant="caption" color="text.secondary">{[m.form, m.strength].filter(Boolean).join(' · ')}</Typography>
        </TableCell>
        <TableCell align="right">{fmtMoney(m.unitPrice)}</TableCell>
        <TableCell align="right" sx={{ fontWeight: 700 }}>{m.stock}</TableCell>
        <TableCell>{m.nextExpiry ? fmtDate(m.nextExpiry) : '-'}</TableCell>
        <TableCell>
          <Stack direction="row" spacing={0.5}>
            {m.stock === 0 ? <Chip size="small" color="error" label="Out of stock" /> : m.lowStock && <Chip size="small" color="warning" label="Low stock" />}
            {m.expiredQty > 0 && <Chip size="small" color="error" variant="outlined" label={`${m.expiredQty} expired`} />}
          </Stack>
        </TableCell>
        {isPharm && <TableCell align="right"><Button size="small" startIcon={<AddIcon />} onClick={() => onReceive(m)}>Receive</Button></TableCell>}
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
          <Collapse in={open} unmountOnExit>
            <Table size="small" sx={{ my: 1 }}>
              <TableHead><TableRow><TableCell>Batch</TableCell><TableCell align="right">Qty</TableCell><TableCell>Expiry</TableCell><TableCell>Received</TableCell>{isPharm && <TableCell />}</TableRow></TableHead>
              <TableBody>
                {m.batches.map((b) => (
                  <TableRow key={b.id} sx={{ opacity: b.quantity === 0 ? 0.5 : 1 }}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{b.batchNo}</TableCell>
                    <TableCell align="right">{b.quantity}</TableCell>
                    <TableCell sx={{ color: isExpired(b.expiryDate) ? 'error.main' : daysLeft(b.expiryDate) <= 30 ? 'warning.dark' : undefined }}>
                      {fmtDate(b.expiryDate)}{isExpired(b.expiryDate) && ' (expired)'}
                    </TableCell>
                    <TableCell>{fmtDate(b.receivedAt)}</TableCell>
                    {isPharm && (
                      <TableCell align="right">
                        {(isExpired(b.expiryDate) || b.quantity === 0) && (
                          <IconButton size="small" title="Remove batch" onClick={() => onRemoveBatch(b)}><DeleteIcon fontSize="small" /></IconButton>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {m.batches.length === 0 && <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>No batches yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function Pharmacy() {
  const { hasRole } = useAuth();
  const isPharm = hasRole('PHARMACIST');
  const [tab, setTab] = useState(0);
  const [prescriptions, setPrescriptions] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState(null);

  const load = () => {
    api.get('/pharmacy/prescriptions').then((r) => setPrescriptions(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/pharmacy/medicines').then((r) => setMedicines(r.data));
  };
  useEffect(() => { load(); }, []);

  const dispense = async (rx) => {
    if (!window.confirm(`Dispense prescription for ${fullName(rx.patient)}?`)) return;
    try {
      await api.post(`/pharmacy/prescriptions/${rx.id}/dispense`);
      setSuccess(`Dispensed to ${fullName(rx.patient)}. Stock updated.`);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const removeBatch = async (b) => {
    if (!window.confirm(`Remove batch ${b.batchNo} from stock?`)) return;
    try { await api.delete(`/pharmacy/batches/${b.id}`); load(); } catch (err) { setError(errMsg(err)); }
  };

  const pending = prescriptions.filter((p) => p.status === 'PENDING');
  const history = prescriptions.filter((p) => p.status === 'DISPENSED');
  const alerts = medicines.filter((m) => m.lowStock || m.expiredQty > 0 || (m.nextExpiry && daysLeft(m.nextExpiry) <= 30));
  const shownMeds = medicines.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const rxTable = (list, showAction) => (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      {list.length === 0 && <Typography color="text.secondary" align="center" sx={{ py: 3 }}>Nothing here</Typography>}
      {list.map((rx) => {
        const canDispense = rx.items.every((i) => i.inStock);
        return (
          <Paper key={rx.id} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
              <Box>
                <Link component={RouterLink} to={`/patients/${rx.patient.id}`} underline="hover" fontWeight={700}>{fullName(rx.patient)}</Link>
                <Typography variant="caption" color="text.secondary" display="block">
                  {rx.patient.patientNo} · {rx.doctor.user.fullName} · {fmtDateTime(rx.createdAt)}
                  {rx.dispensedAt && ` · dispensed ${fmtDateTime(rx.dispensedAt)}`}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <StatusChip status={rx.status} />
                {showAction && isPharm && <Button variant="contained" size="small" disabled={!canDispense} onClick={() => dispense(rx)}>Dispense</Button>}
              </Stack>
            </Stack>
            {rx.patient.allergies && <Alert severity="warning" sx={{ py: 0, mb: 1 }}>Allergies: {rx.patient.allergies}</Alert>}
            {showAction && rx.alerts?.length > 0 && <Box sx={{ mb: 1 }}><ClinicalAlerts alerts={rx.alerts} compact /></Box>}
            <Table size="small">
              <TableBody>
                {rx.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{i.medicine.name}</TableCell>
                    <TableCell>{i.dosage}, {i.frequency}, {i.durationDays} days</TableCell>
                    <TableCell align="right">Qty {i.quantity}</TableCell>
                    {showAction && (
                      <TableCell align="right">
                        {i.inStock ? <Chip size="small" label={`${i.medicine.stock} in stock`} variant="outlined" />
                          : <Chip size="small" color="error" label={`Only ${i.medicine.stock} in stock`} />}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {showAction && !canDispense && <Typography variant="caption" color="error">Receive more stock before dispensing.</Typography>}
          </Paper>
        );
      })}
    </Stack>
  );

  return (
    <>
      <PageHeader
        title="Pharmacy"
        action={isPharm && tab === 1 && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}>Add medicine</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          <Tab label={<Badge badgeContent={pending.length} color="primary" sx={{ pr: 1.5 }}>To dispense</Badge>} />
          <Tab label="Inventory" />
          <Tab label={<Badge badgeContent={alerts.length} color="error" sx={{ pr: 1.5 }}>Alerts</Badge>} />
          <Tab label="Dispensed" />
        </Tabs>

        {tab === 0 && rxTable(pending, true)}
        {tab === 3 && rxTable(history, false)}

        {tab === 1 && (
          <Box sx={{ overflowX: 'auto' }}>
            <TextField placeholder="Search medicines" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ m: 2, maxWidth: 320 }} />
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell /><TableCell>Medicine</TableCell><TableCell align="right">Unit price</TableCell>
                  <TableCell align="right">In stock</TableCell><TableCell>Next expiry</TableCell><TableCell>Status</TableCell>
                  {isPharm && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {shownMeds.map((m) => <InventoryRow key={m.id} m={m} isPharm={isPharm} onReceive={setReceiveFor} onRemoveBatch={removeBatch} />)}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            {alerts.length === 0 ? <Typography color="text.secondary">No alerts. Stock levels and expiry dates are fine.</Typography> : (
              <Stack spacing={1}>
                {alerts.map((m) => (
                  <Alert key={m.id} severity={m.stock === 0 || m.expiredQty > 0 ? 'error' : 'warning'}
                    action={isPharm && <Button color="inherit" size="small" onClick={() => setReceiveFor(m)}>Receive</Button>}>
                    <b>{m.name}</b>
                    {m.lowStock && ` · ${m.stock} left (reorder level ${m.reorderLevel})`}
                    {m.nextExpiry && daysLeft(m.nextExpiry) <= 30 && ` · a batch expires in ${daysLeft(m.nextExpiry)} days (${fmtDate(m.nextExpiry)})`}
                    {m.expiredQty > 0 && ` · ${m.expiredQty} units expired, remove from shelf`}
                  </Alert>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Paper>

      <MedicineDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <ReceiveDialog medicine={receiveFor} onClose={() => setReceiveFor(null)} onSaved={() => { setReceiveFor(null); setSuccess('Stock received'); load(); }} />
    </>
  );
}

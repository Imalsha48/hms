// Laboratory (spec 3.6): requests -> sample collection -> results -> reports
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Badge, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Paper, Stack, Tab,
  Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import api, { errMsg, openFile } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime, fmtMoney, fullName } from '../utils';

const TABS = [
  { status: 'REQUESTED', label: 'Awaiting sample' },
  { status: 'SAMPLE_COLLECTED', label: 'Awaiting result' },
  { status: 'COMPLETED', label: 'Completed' },
  { status: 'CANCELLED', label: 'Cancelled' },
];

function ResultDialog({ request, onClose, onSaved }) {
  const [result, setResult] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef();
  useEffect(() => { if (request) { setResult(''); setFile(null); setError(''); } }, [request]);

  const save = async () => {
    const fd = new FormData();
    fd.append('result', result);
    if (file) fd.append('report', file);
    try {
      await api.patch(`/lab/requests/${request.id}/result`, fd);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Dialog open={!!request} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Enter result · {request?.testType.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            Patient: <b>{request && fullName(request.patient)}</b> ({request?.patient.patientNo})
            {request?.testType.normalRange && <> · Normal range: <b>{request.testType.normalRange}</b></>}
          </Typography>
          <TextField label="Result" required multiline minRows={4} value={result} onChange={(e) => setResult(e.target.value)} />
          <Box>
            <Button startIcon={<UploadIcon />} variant="outlined" onClick={() => fileRef.current.click()}>
              {file ? file.name : 'Attach report (PDF/JPG/PNG, optional)'}
            </Button>
            <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!result.trim()}>Save result</Button>
      </DialogActions>
    </Dialog>
  );
}

function TestCatalogue({ canEdit }) {
  const [tests, setTests] = useState([]);
  const [form, setForm] = useState({ name: '', price: '', normalRange: '' });
  const [error, setError] = useState('');
  const load = () => api.get('/lab/tests').then((r) => setTests(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    try {
      await api.post('/lab/tests', form);
      setForm({ name: '', price: '', normalRange: '' });
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {canEdit && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
          <TextField label="Test name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Price (Rs.)" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} sx={{ maxWidth: { sm: 160 } }} />
          <TextField label="Normal range" value={form.normalRange} onChange={(e) => setForm({ ...form, normalRange: e.target.value })} />
          <Button variant="contained" onClick={add} disabled={!form.name || form.price === ''}>Add</Button>
        </Stack>
      )}
      <Table size="small">
        <TableHead><TableRow><TableCell>Test</TableCell><TableCell>Normal range</TableCell><TableCell align="right">Price</TableCell></TableRow></TableHead>
        <TableBody>
          {tests.map((t) => (
            <TableRow key={t.id}><TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell><TableCell>{t.normalRange || '-'}</TableCell><TableCell align="right">{fmtMoney(t.price)}</TableCell></TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default function Lab() {
  const { hasRole } = useAuth();
  const isLab = hasRole('LAB_STAFF');
  const [tab, setTab] = useState(0);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [resultFor, setResultFor] = useState(null);

  const load = () => api.get('/lab/requests').then((r) => setRequests(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  const act = async (r, kind) => {
    if (kind === 'cancel' && !window.confirm(`Cancel ${r.testType.name} for ${fullName(r.patient)}?`)) return;
    try {
      await api.patch(`/lab/requests/${r.id}/${kind}`);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  const showing = tab < TABS.length ? requests.filter((r) => r.status === TABS[tab].status) : [];

  return (
    <>
      <PageHeader title="Laboratory" subtitle="Test requests from doctors, sample collection and results" />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          {TABS.map((t) => {
            const n = requests.filter((r) => r.status === t.status).length;
            return <Tab key={t.status} label={<Badge badgeContent={t.status === 'COMPLETED' || t.status === 'CANCELLED' ? 0 : n} color="primary" sx={{ pr: 1.5 }}>{t.label}</Badge>} />;
          })}
          <Tab label="Test catalogue" />
        </Tabs>

        {tab === TABS.length ? <TestCatalogue canEdit={isLab} /> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Requested</TableCell><TableCell>Patient</TableCell><TableCell>Test</TableCell>
                  <TableCell>Doctor</TableCell><TableCell>{tab === 2 ? 'Result' : 'Status'}</TableCell><TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {showing.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{fmtDateTime(r.createdAt)}</TableCell>
                    <TableCell>
                      <Link component={RouterLink} to={`/patients/${r.patient.id}`} underline="hover" fontWeight={600}>{fullName(r.patient)}</Link>
                      <Typography variant="caption" display="block" color="text.secondary">{r.patient.patientNo}</Typography>
                    </TableCell>
                    <TableCell>{r.testType.name}</TableCell>
                    <TableCell>{r.doctor.user.fullName}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      {tab === 2 ? (
                        <>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{r.result}</Typography>
                          {r.reportName && <Link component="button" variant="caption" onClick={() => openFile(`/lab/requests/${r.id}/report`)}>View report</Link>}
                        </>
                      ) : <StatusChip status={r.status} />}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {r.status === 'REQUESTED' && hasRole('LAB_STAFF', 'NURSE') && <Button size="small" variant="contained" onClick={() => act(r, 'collect')}>Sample collected</Button>}
                      {r.status === 'SAMPLE_COLLECTED' && isLab && <Button size="small" variant="contained" onClick={() => setResultFor(r)}>Enter result</Button>}
                      {['REQUESTED', 'SAMPLE_COLLECTED'].includes(r.status) && hasRole('LAB_STAFF', 'DOCTOR') && (
                        <Button size="small" color="error" onClick={() => act(r, 'cancel')}>Cancel</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {showing.length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nothing here</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <ResultDialog request={resultFor} onClose={() => setResultFor(null)} onSaved={() => { setResultFor(null); load(); }} />
    </>
  );
}

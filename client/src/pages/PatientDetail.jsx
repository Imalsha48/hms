// Patient profile with full medical history (spec 3.2 + 3.5)
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Grid, IconButton, Link, Paper, Skeleton, Stack, Tab, Table, TableBody,
  TableCell, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/EditOutlined';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PageHeader from '../components/PageHeader';
import PatientForm from '../components/PatientForm';
import StatusChip from '../components/StatusChip';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { age, fmtDate, fmtDateTime, fmtMoney, fullName } from '../utils';

// Simple reusable table: columns = [[header, row => value], ...]
function SimpleTable({ rows, columns, empty }) {
  if (!rows.length) return <Typography color="text.secondary" sx={{ p: 2 }}>{empty}</Typography>;
  return (
    <Table size="small">
      <TableHead><TableRow>{columns.map(([h]) => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
      <TableBody>
        {rows.map((r) => <TableRow key={r.id}>{columns.map(([h, fn]) => <TableCell key={h}>{fn(r)}</TableCell>)}</TableRow>)}
      </TableBody>
    </Table>
  );
}

const Info = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography>{value || '-'}</Typography>
  </Box>
);

export default function PatientDetail() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const fileRef = useRef();
  const canEdit = hasRole('RECEPTIONIST', 'NURSE', 'DOCTOR');

  const load = useCallback(() => {
    api.get(`/patients/${id}`).then((r) => setP(r.data)).catch((e) => setError(errMsg(e)));
  }, [id]);
  useEffect(load, [load]);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', docTitle || file.name);
    try {
      await api.post(`/patients/${id}/documents`, fd);
      setDocTitle('');
      load();
    } catch (err) {
      setError(errMsg(err));
    }
    e.target.value = '';
  };

  const removeDoc = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    await api.delete(`/patients/${id}/documents/${docId}`);
    load();
  };

  if (error && !p) return <Alert severity="error">{error}</Alert>;
  if (!p) return <Skeleton variant="rounded" height={300} />;

  const doctor = (r) => r.doctor?.user?.fullName || '-';

  return (
    <>
      <PageHeader
        title={fullName(p)}
        subtitle={`${p.patientNo} · ${age(p.dateOfBirth)} years · ${p.gender.toLowerCase()}`}
        action={canEdit && <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setEditOpen(true)}>Edit details</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {p.allergies && <Alert severity="warning" sx={{ mb: 2 }}><b>Allergies:</b> {p.allergies}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          <Tab label="Details" />
          <Tab label={`Appointments (${p.appointments.length})`} />
          <Tab label={`Medical records (${p.medicalRecords.length})`} />
          <Tab label={`Prescriptions (${p.prescriptions.length})`} />
          <Tab label={`Lab (${p.labRequests.length})`} />
          <Tab label={`Admissions (${p.admissions.length})`} />
          <Tab label={`Billing (${p.invoices.length})`} />
          <Tab label={`Documents (${p.documents.length})`} />
        </Tabs>

        <Box sx={{ p: 2 }}>
          {tab === 0 && (
            <Grid container spacing={2.5}>
              {[
                ['Date of birth', fmtDate(p.dateOfBirth)], ['NIC', p.nic], ['Blood group', p.bloodGroup],
                ['Phone', p.phone], ['Email', p.email], ['Address', p.address],
                ['Emergency contact', p.emergencyName], ['Emergency phone', p.emergencyPhone], ['Registered', fmtDate(p.createdAt)],
              ].map(([l, v]) => <Grid item xs={12} sm={6} md={4} key={l}><Info label={l} value={v} /></Grid>)}
            </Grid>
          )}

          {tab === 1 && <SimpleTable rows={p.appointments} empty="No appointments" columns={[
            ['Date & time', (a) => fmtDateTime(a.scheduledAt)], ['Doctor', doctor], ['Reason', (a) => a.reason || '-'],
            ['Status', (a) => <StatusChip status={a.status} />],
          ]} />}

          {tab === 2 && (p.medicalRecords.length === 0
            ? <Typography color="text.secondary" sx={{ p: 2 }}>No medical records</Typography>
            : <Stack spacing={1.5}>{p.medicalRecords.map((r) => (
              <Paper key={r.id} sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">{fmtDateTime(r.createdAt)} · {doctor(r)}</Typography>
                <Typography fontWeight={700}>{r.diagnosis}</Typography>
                {r.symptoms && <Typography variant="body2"><b>Symptoms:</b> {r.symptoms}</Typography>}
                {r.treatment && <Typography variant="body2"><b>Treatment:</b> {r.treatment}</Typography>}
                {r.notes && <Typography variant="body2"><b>Notes:</b> {r.notes}</Typography>}
              </Paper>
            ))}</Stack>)}

          {tab === 3 && <SimpleTable rows={p.prescriptions} empty="No prescriptions" columns={[
            ['Date', (r) => fmtDate(r.createdAt)], ['Doctor', doctor],
            ['Medicines', (r) => r.items.map((i) => `${i.medicine.name} (${i.dosage}, ${i.frequency}, ${i.durationDays}d)`).join('; ')],
            ['Status', (r) => <StatusChip status={r.status} />],
          ]} />}

          {tab === 4 && <SimpleTable rows={p.labRequests} empty="No lab tests" columns={[
            ['Requested', (r) => fmtDate(r.createdAt)], ['Test', (r) => r.testType.name], ['Result', (r) => r.result || '-'],
            ['Status', (r) => <StatusChip status={r.status} />],
          ]} />}

          {tab === 5 && <SimpleTable rows={p.admissions} empty="No admissions" columns={[
            ['Admitted', (r) => fmtDateTime(r.admittedAt)], ['Ward / Bed', (r) => `${r.bed.ward.name} / ${r.bed.bedNo}`],
            ['Discharged', (r) => (r.dischargedAt ? fmtDateTime(r.dischargedAt) : '-')], ['Status', (r) => <StatusChip status={r.status} />],
          ]} />}

          {tab === 6 && <SimpleTable rows={p.invoices} empty="No invoices" columns={[
            ['Invoice', (r) => r.invoiceNo], ['Date', (r) => fmtDate(r.createdAt)], ['Total', (r) => fmtMoney(r.totalAmount)],
            ['Paid', (r) => fmtMoney(r.paidAmount)], ['Status', (r) => <StatusChip status={r.status} />],
          ]} />}

          {tab === 7 && (
            <>
              {canEdit && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, maxWidth: 560 }}>
                  <TextField label="Document title (optional)" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                  <Button variant="contained" startIcon={<UploadIcon />} onClick={() => fileRef.current.click()} sx={{ whiteSpace: 'nowrap' }}>
                    Upload file
                  </Button>
                  <input ref={fileRef} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={upload} />
                </Stack>
              )}
              <SimpleTable rows={p.documents} empty="No documents uploaded" columns={[
                ['Title', (d) => <Link href={d.filePath} target="_blank" rel="noreferrer">{d.title}</Link>],
                ['Type', (d) => <Chip size="small" label={d.mimeType.split('/')[1].toUpperCase()} />],
                ['Uploaded', (d) => fmtDateTime(d.uploadedAt)],
                ['', (d) => canEdit && <IconButton size="small" onClick={() => removeDoc(d.id)}><DeleteIcon fontSize="small" /></IconButton>],
              ]} />
            </>
          )}
        </Box>
      </Paper>

      <PatientForm open={editOpen} patient={p} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
    </>
  );
}

// Billing (spec 3.8): invoice list with filters
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, InputAdornment, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import PageHeader from '../components/PageHeader';
import StatusChip from '../components/StatusChip';
import api, { errMsg } from '../api/client';
import { fmtDateTime, fmtMoney, fullName } from '../utils';

export default function Billing() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      const params = Object.fromEntries(Object.entries({ ...filters, page: page + 1, pageSize: 15 }).filter(([, v]) => v !== ''));
      api.get('/billing/invoices', { params }).then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [filters, page]);

  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(0); };

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Invoices for consultations, lab tests, pharmacy and admissions"
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/billing/new')}>New invoice</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2 }}>
          <TextField placeholder="Invoice no, patient name or no" value={filters.search} onChange={set('search')}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
          <TextField select label="Status" value={filters.status} onChange={set('status')} sx={{ minWidth: 150 }}>
            <MenuItem value="">All</MenuItem>
            {['UNPAID', 'PARTIAL', 'PAID'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField type="date" label="From" value={filters.from} onChange={set('from')} InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="To" value={filters.to} onChange={set('to')} InputLabelProps={{ shrink: true }} />
        </Stack>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Invoice</TableCell><TableCell>Date</TableCell><TableCell>Patient</TableCell>
                <TableCell align="right">Total</TableCell><TableCell align="right">Paid</TableCell>
                <TableCell align="right">Balance</TableCell><TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((inv) => (
                <TableRow key={inv.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/billing/invoices/${inv.id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoiceNo}</TableCell>
                  <TableCell>{fmtDateTime(inv.createdAt)}</TableCell>
                  <TableCell>{fullName(inv.patient)} <span style={{ color: '#888' }}>({inv.patient.patientNo})</span></TableCell>
                  <TableCell align="right">{fmtMoney(inv.totalAmount)}</TableCell>
                  <TableCell align="right">{fmtMoney(inv.paidAmount)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(Number(inv.totalAmount) - Number(inv.paidAmount))}</TableCell>
                  <TableCell><StatusChip status={inv.status} /></TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No invoices found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={data.total} page={page} rowsPerPage={15} rowsPerPageOptions={[15]} onPageChange={(e, p) => setPage(p)} />
      </Paper>
    </>
  );
}

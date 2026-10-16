import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Button, InputAdornment, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import PageHeader from '../components/PageHeader';
import PatientForm from '../components/PatientForm';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { age, fmtDate, fullName } from '../utils';

export default function Patients() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  // Debounced search: waits 300ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/patients', { params: { search: search || undefined, page: page + 1, pageSize } })
        .then((r) => setData(r.data))
        .catch((e) => setError(errMsg(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [search, page, pageSize]);

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle={`${data.total} registered`}
        action={hasRole('RECEPTIONIST', 'NURSE', 'DOCTOR') && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>Register patient</Button>
        )}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper>
        <TextField
          placeholder="Search by name, patient no, phone or NIC"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          sx={{ p: 2, maxWidth: 480 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        />
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Patient no</TableCell><TableCell>Name</TableCell><TableCell>Age / Gender</TableCell>
                <TableCell>Phone</TableCell><TableCell>Blood</TableCell><TableCell>Registered</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/patients/${p.id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{p.patientNo}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{fullName(p)}</TableCell>
                  <TableCell>{age(p.dateOfBirth)} / {p.gender[0]}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell>{p.bloodGroup || '-'}</TableCell>
                  <TableCell>{fmtDate(p.createdAt)}</TableCell>
                </TableRow>
              ))}
              {data.items.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No patients found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={data.total} page={page} rowsPerPage={pageSize}
          onPageChange={(e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
        />
      </Paper>

      <PatientForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={(p) => navigate(`/patients/${p.id}`)} />
    </>
  );
}

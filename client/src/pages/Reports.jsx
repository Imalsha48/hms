// Reports (spec 3.10). Every report has the same shape, so one page renders them all.
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Grid, MenuItem, Paper, Skeleton, Stack, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined';
import PageHeader from '../components/PageHeader';
import BarChart from '../components/BarChart';
import api, { downloadFile, errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime, fmtMoney, todayStr } from '../utils';

// Who can see each report (admin always can) - matches the server rules
const REPORTS = [
  { key: 'revenue', label: 'Revenue', roles: ['ACCOUNTANT'] },
  { key: 'patients', label: 'Patients', roles: ['ACCOUNTANT'] },
  { key: 'appointments', label: 'Appointments', roles: ['ACCOUNTANT'] },
  { key: 'pharmacy', label: 'Pharmacy', roles: ['ACCOUNTANT', 'PHARMACIST'] },
  { key: 'laboratory', label: 'Laboratory', roles: ['ACCOUNTANT', 'LAB_STAFF'] },
  { key: 'staff', label: 'Staff', roles: [] },
];

const monthStart = () => { const d = new Date(); return todayStr(new Date(d.getFullYear(), d.getMonth(), 1)); };
const PRESETS = {
  month: () => [monthStart(), todayStr()],
  '7': () => [todayStr(new Date(Date.now() - 6 * 86400000)), todayStr()],
  '30': () => [todayStr(new Date(Date.now() - 29 * 86400000)), todayStr()],
  today: () => [todayStr(), todayStr()],
};

function cell(value, type) {
  if (value === null || value === undefined || value === '') return '-';
  if (type === 'money') return fmtMoney(value);
  if (type === 'datetime') return fmtDateTime(value);
  if (type === 'number') return Number(value).toLocaleString();
  return String(value);
}

export default function Reports() {
  const { hasRole } = useAuth();
  const available = REPORTS.filter((r) => hasRole(...r.roles));
  const [tab, setTab] = useState(0);
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(PRESETS.month());
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const current = available[tab];

  useEffect(() => {
    if (!current) return;
    setReport(null);
    setError('');
    api.get(`/reports/${current.key}`, { params: { from: range[0], to: range[1] } })
      .then((r) => setReport(r.data))
      .catch((e) => setError(errMsg(e)));
  }, [current?.key, range]); // eslint-disable-line

  const choosePreset = (p) => { setPreset(p); if (PRESETS[p]) setRange(PRESETS[p]()); };
  const exportCsv = async (tableIndex) => {
    try {
      await downloadFile(`/reports/${current.key}`, { from: range[0], to: range[1], format: 'csv', table: tableIndex }, `${current.key}.csv`);
    } catch (err) {
      setError(errMsg(err));
    }
  };

  if (!available.length) return <Alert severity="info">You don't have access to any reports.</Alert>;

  return (
    <>
      <PageHeader title="Reports" subtitle="Pick a report and a period. Every table can be exported to CSV (opens in Excel)." />

      {/* Filters: one row above the content */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField select label="Period" value={preset} onChange={(e) => choosePreset(e.target.value)} sx={{ minWidth: 170 }}>
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="7">Last 7 days</MenuItem>
            <MenuItem value="30">Last 30 days</MenuItem>
            <MenuItem value="month">This month</MenuItem>
            <MenuItem value="custom">Custom</MenuItem>
          </TextField>
          <TextField type="date" label="From" value={range[0]} InputLabelProps={{ shrink: true }}
            onChange={(e) => { setPreset('custom'); setRange([e.target.value, range[1]]); }} />
          <TextField type="date" label="To" value={range[1]} InputLabelProps={{ shrink: true }}
            onChange={(e) => { setPreset('custom'); setRange([range[0], e.target.value]); }} />
        </Stack>
      </Paper>

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          {available.map((r) => <Tab key={r.key} label={r.label} />)}
        </Tabs>

        <Box sx={{ p: 2 }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!report && !error && <Skeleton variant="rounded" height={300} />}
          {report && (
            <Stack spacing={3}>
              <Grid container spacing={1.5}>
                {report.summary.map((s) => (
                  <Grid item xs={12} sm={6} md={12 / Math.min(report.summary.length, 5)} key={s.label}>
                    <Box sx={{ p: 1.5, border: '1px solid #e3e8ea', borderRadius: 2, height: '100%' }}>
                      <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                      <Typography variant="h6" fontWeight={700}>{s.type === 'money' ? fmtMoney(s.value) : s.value}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>

              {report.chart && <BarChart {...report.chart} />}

              {report.tables.map((t, i) => (
                <Box key={t.title}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography fontWeight={700}>{t.title} <Typography component="span" variant="body2" color="text.secondary">({t.rows.length})</Typography></Typography>
                    <Button size="small" startIcon={<DownloadIcon />} onClick={() => exportCsv(i)} disabled={!t.rows.length}>Export CSV</Button>
                  </Stack>
                  <TableContainer sx={{ maxHeight: 420, border: '1px solid #e3e8ea', borderRadius: 2 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          {t.columns.map((c) => (
                            <TableCell key={c.key} align={['money', 'number'].includes(c.type) ? 'right' : 'left'} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {t.rows.map((r, j) => (
                          <TableRow key={j} hover>
                            {t.columns.map((c) => (
                              <TableCell key={c.key} align={['money', 'number'].includes(c.type) ? 'right' : 'left'} sx={{ whiteSpace: c.key === 'result' ? 'normal' : 'nowrap' }}>
                                {cell(r[c.key], c.type)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                        {t.rows.length === 0 && (
                          <TableRow><TableCell colSpan={t.columns.length} align="center" sx={{ py: 3, color: 'text.secondary' }}>No data for this period</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Paper>
    </>
  );
}

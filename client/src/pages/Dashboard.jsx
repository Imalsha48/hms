import { useEffect, useState } from 'react';
import { Alert, Box, Button, Grid, List, ListItem, ListItemText, Paper, Skeleton, Typography } from '@mui/material';
import ClockIcon from '@mui/icons-material/AccessTimeOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import EventIcon from '@mui/icons-material/EventOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import BedIcon from '@mui/icons-material/HotelOutlined';
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined';
import PageHeader from '../components/PageHeader';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtMoney, fmtTime } from '../utils';

// Check in / check out for staff with an employee record (spec 3.9 attendance)
function AttendanceCard() {
  const [me, setMe] = useState(undefined);
  const [error, setError] = useState('');
  const load = () => api.get('/staff/me').then((r) => setMe(r.data)).catch(() => setMe(null));
  useEffect(() => { load(); }, []);
  if (!me) return null;

  const act = async (kind) => {
    try { await api.post(`/staff/me/${kind}`); setError(''); load(); } catch (err) { setError(errMsg(err)); }
  };
  const t = me.today;
  return (
    <Paper sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <ClockIcon color="primary" />
      <Box sx={{ flexGrow: 1 }}>
        <Typography fontWeight={700}>My attendance today</Typography>
        <Typography variant="body2" color={error ? 'error' : 'text.secondary'}>
          {error || (!t ? 'Not checked in yet'
            : `Checked in ${fmtTime(t.checkIn)}${t.status === 'LATE' ? ' (late)' : ''}${t.checkOut ? ` · checked out ${fmtTime(t.checkOut)}` : ''}`)}
        </Typography>
      </Box>
      {!t && <Button variant="contained" onClick={() => act('check-in')}>Check in</Button>}
      {t && !t.checkOut && <Button variant="outlined" onClick={() => act('check-out')}>Check out</Button>}
    </Paper>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <Paper sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
      <Box sx={{ width: 46, height: 46, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: `${color}1a`, color }}>{icon}</Box>
      <Box>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h5" fontWeight={700}>{value}</Typography>
      </Box>
    </Paper>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;

  const stats = data && [
    { label: 'Total patients', value: data.totalPatients, icon: <PeopleIcon />, color: '#0b6e75' },
    { label: "Today's appointments", value: data.todaysAppointments, icon: <EventIcon />, color: '#3f6fd8' },
    { label: 'Pending lab requests', value: data.pendingLab, icon: <ScienceIcon />, color: '#b7791f' },
    { label: 'Admitted patients', value: data.admitted, icon: <BedIcon />, color: '#7b4bc4' },
  ];

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName.split(' ')[0]}`} subtitle={fmtDate(new Date())} />
      <AttendanceCard />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(stats || Array.from({ length: 4 })).map((s, i) => (
          <Grid item xs={12} sm={6} lg={3} key={i}>
            {s ? <StatCard {...s} /> : <Skeleton variant="rounded" height={90} />}
          </Grid>
        ))}
      </Grid>

      {data && hasRole('ACCOUNTANT') && (
        <Paper sx={{ p: 2.5, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <PaymentsIcon sx={{ color: '#2f855a' }} />
            <Typography fontWeight={700}>Revenue summary</Typography>
          </Box>
          <Grid container spacing={2}>
            {[["Collected today", data.revenueToday], ['Collected this month', data.revenueMonth], ['Outstanding (unpaid invoices)', data.outstanding]].map(([l, v]) => (
              <Grid item xs={12} sm={4} key={l}>
                <Typography variant="body2" color="text.secondary">{l}</Typography>
                <Typography variant="h6" fontWeight={700}>{fmtMoney(v)}</Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {data && hasRole('PHARMACIST', 'DOCTOR') && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2.5 }}>
              <Typography fontWeight={700} gutterBottom>Low stock medicines</Typography>
              {data.alerts.lowStock.length === 0 ? <Typography color="text.secondary">All stock levels OK</Typography> : (
                <List dense disablePadding>
                  {data.alerts.lowStock.map((m) => (
                    <ListItem key={m.id} disableGutters>
                      <ListItemText primary={m.name} secondary={`${m.stock} left (reorder at ${m.reorderLevel})`} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2.5 }}>
              <Typography fontWeight={700} gutterBottom>Expiring within 30 days</Typography>
              {data.alerts.expiring.length === 0 ? <Typography color="text.secondary">No batches expiring soon</Typography> : (
                <List dense disablePadding>
                  {data.alerts.expiring.map((b) => (
                    <ListItem key={b.id} disableGutters>
                      <ListItemText primary={`${b.medicine} - batch ${b.batchNo}`} secondary={`${b.quantity} units, expires ${fmtDate(b.expiryDate)}`} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </>
  );
}

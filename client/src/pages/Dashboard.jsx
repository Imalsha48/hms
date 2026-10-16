import { useEffect, useState } from 'react';
import { Alert, Box, Grid, List, ListItem, ListItemText, Paper, Skeleton, Typography } from '@mui/material';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import EventIcon from '@mui/icons-material/EventOutlined';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import BedIcon from '@mui/icons-material/HotelOutlined';
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined';
import PageHeader from '../components/PageHeader';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtMoney } from '../utils';

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
    ...(hasRole('ACCOUNTANT')
      ? [{ label: "Today's revenue", value: fmtMoney(data.revenueToday), icon: <PaymentsIcon />, color: '#2f855a' }]
      : []),
  ];

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName.split(' ')[0]}`} subtitle={fmtDate(new Date())} />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(stats || Array.from({ length: 4 })).map((s, i) => (
          <Grid item xs={12} sm={6} lg={stats && stats.length > 4 ? 2.4 : 3} key={i}>
            {s ? <StatCard {...s} /> : <Skeleton variant="rounded" height={90} />}
          </Grid>
        ))}
      </Grid>

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

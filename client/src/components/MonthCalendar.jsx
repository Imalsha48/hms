// Month calendar for appointments (spec 7: "Calendar View").
// Each day shows how many appointments are booked/completed; click a day to open it.
import { useEffect, useState } from 'react';
import { Box, IconButton, Stack, Typography } from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import api from '../api/client';
import { todayStr } from '../utils';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function MonthCalendar({ doctorId, selected, onPick }) {
  const [month, setMonth] = useState(() => { const d = new Date(`${selected}T00:00:00`); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    api.get('/appointments', { params: { from: from.toISOString(), to: to.toISOString(), doctorId: doctorId || undefined } }).then((r) => {
      const c = {};
      r.data.forEach((a) => {
        const k = todayStr(new Date(a.scheduledAt));
        c[k] = c[k] || { active: 0, completed: 0, cancelled: 0 };
        if (a.status === 'COMPLETED') c[k].completed += 1;
        else if (a.status === 'CANCELLED') c[k].cancelled += 1;
        else c[k].active += 1;
      });
      setCounts(c);
    });
  }, [month, doctorId]);

  // Build the grid: Monday-first weeks covering the month
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);
  const today = todayStr();

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <IconButton onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></IconButton>
        <Typography fontWeight={700} sx={{ minWidth: 150, textAlign: 'center' }}>
          {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </Typography>
        <IconButton onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></IconButton>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {WEEK.map((w) => <Typography key={w} variant="caption" color="text.secondary" sx={{ textAlign: 'center', py: 0.5 }}>{w}</Typography>)}
        {cells.map((d, i) => {
          if (!d) return <Box key={i} />;
          const k = todayStr(d);
          const c = counts[k];
          const isSel = k === selected;
          return (
            <Box key={k} onClick={() => onPick(k)}
              sx={{
                minHeight: { xs: 56, md: 84 }, p: 0.75, borderRadius: 1.5, cursor: 'pointer',
                border: '1px solid', borderColor: isSel ? 'primary.main' : '#e3e8ea', bgcolor: isSel ? 'rgba(11,110,117,.06)' : '#fff',
                '&:hover': { borderColor: 'primary.main' },
              }}>
              <Typography variant="body2" fontWeight={k === today ? 800 : 500} color={k === today ? 'primary' : 'text.primary'}>{d.getDate()}</Typography>
              {c && (
                <Box sx={{ mt: 0.5, fontSize: 11, lineHeight: 1.4, color: 'text.secondary' }}>
                  {c.active > 0 && <div><b style={{ color: '#0b6e75' }}>{c.active}</b> booked</div>}
                  {c.completed > 0 && <div>{c.completed} done</div>}
                  {c.cancelled > 0 && <div>{c.cancelled} cancelled</div>}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

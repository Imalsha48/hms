// Small single-series bar chart (e.g. "appointments per day").
// One series -> one color and no legend; the title names it. Hover a column for the exact value.
import { Box, Tooltip, Typography } from '@mui/material';
import { fmtMoney } from '../utils';

const HEIGHT = 160;

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

export default function BarChart({ title, points, type }) {
  if (!points?.length) return null;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const fmt = (v) => (type === 'money' ? fmtMoney(v) : v.toLocaleString());
  const label = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const every = Math.ceil(points.length / 10); // at most ~10 x-axis labels

  return (
    <Box>
      <Typography fontWeight={700} sx={{ mb: 1 }}>{title}</Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        {/* y-axis: just the max and zero, recessive */}
        <Box sx={{ height: HEIGHT, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'text.secondary', fontSize: 11, textAlign: 'right', minWidth: 40 }}>
          <span>{type === 'money' ? max.toLocaleString() : max}</span><span>0</span>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ height: HEIGHT, display: 'flex', alignItems: 'flex-end', gap: '2px', borderBottom: '1px solid #cfd8dc', backgroundImage: 'linear-gradient(#eef2f3 1px, transparent 1px)', backgroundSize: `100% ${HEIGHT / 2}px` }}>
            {points.map((p) => (
              <Tooltip key={p.date} title={`${label(p.date)}: ${fmt(p.value)}`} placement="top" arrow>
                {/* Full-height hit target, bigger than the bar itself */}
                <Box sx={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default', '&:hover > div': { opacity: 0.8 } }}>
                  <Box sx={{ width: '100%', maxWidth: 28, mx: 'auto', height: `${(p.value / max) * 100}%`, minHeight: p.value ? 2 : 0, bgcolor: 'primary.main', borderRadius: '4px 4px 0 0' }} />
                </Box>
              </Tooltip>
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: '2px', mt: 0.5 }}>
            {points.map((p, i) => (
              <Box key={p.date} sx={{ flex: 1, fontSize: 10, color: 'text.secondary', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}>
                {i % every === 0 ? label(p.date) : ''}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

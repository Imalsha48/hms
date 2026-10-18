// Shows decision-support alerts. Every alert explains WHY it fired and WHICH data triggered it.
import { Alert, AlertTitle, Box, Chip, Stack, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/PsychologyOutlined';

const SEVERITY = { high: 'error', medium: 'warning', info: 'info' };
const LABEL = { high: 'High risk', medium: 'Caution', info: 'Note' };

export default function ClinicalAlerts({ alerts, title = 'Clinical decision support', compact = false, emptyText }) {
  if (!alerts?.length) {
    return emptyText ? <Typography variant="body2" color="text.secondary">{emptyText}</Typography> : null;
  }
  const counts = alerts.reduce((c, a) => ({ ...c, [a.severity]: (c[a.severity] || 0) + 1 }), {});
  return (
    <Box>
      {!compact && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <PsychologyIcon color="primary" fontSize="small" />
          <Typography fontWeight={700} variant="body2">{title}</Typography>
          {['high', 'medium', 'info'].filter((s) => counts[s]).map((s) => (
            <Chip key={s} size="small" variant="outlined" color={SEVERITY[s]} label={`${counts[s]} ${LABEL[s].toLowerCase()}`} />
          ))}
        </Stack>
      )}
      <Stack spacing={1}>
        {alerts.map((a, i) => (
          <Alert key={i} severity={SEVERITY[a.severity]} sx={{ py: compact ? 0 : 0.5 }}>
            <AlertTitle sx={{ mb: 0.25, fontSize: 14 }}>
              <b>{LABEL[a.severity]}</b> · {a.title}
            </AlertTitle>
            {!compact && <Typography variant="body2">{a.why}</Typography>}
            <Typography variant="caption" color="text.secondary" display="block">
              {a.category} · {a.evidence}
            </Typography>
          </Alert>
        ))}
      </Stack>
    </Box>
  );
}

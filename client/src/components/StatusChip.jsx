import { Chip } from '@mui/material';

const COLORS = {
  BOOKED: 'info', RESCHEDULED: 'warning', COMPLETED: 'success', CANCELLED: 'default',
  REQUESTED: 'info', SAMPLE_COLLECTED: 'warning', PENDING: 'warning', DISPENSED: 'success',
  UNPAID: 'error', PARTIAL: 'warning', PAID: 'success', ADMITTED: 'info', DISCHARGED: 'default',
  APPROVED: 'success', REJECTED: 'error',
};

export default function StatusChip({ status }) {
  return <Chip size="small" label={status.replace('_', ' ')} color={COLORS[status] || 'default'} variant="outlined" />;
}

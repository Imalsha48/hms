// Invoice view: printable invoice/receipt + payments
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, GlobalStyles, MenuItem,
  Paper, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import PaymentsIcon from '@mui/icons-material/PaymentsOutlined';
import StatusChip from '../components/StatusChip';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime, fmtMoney, fullName } from '../utils';

const METHODS = { CASH: 'Cash', CARD: 'Card', BANK_TRANSFER: 'Bank transfer' };

function PaymentDialog({ open, balance, onClose, onSaved, invoiceId }) {
  const [f, setF] = useState({ amount: '', method: 'CASH', reference: '' });
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setF({ amount: String(balance), method: 'CASH', reference: '' }); setError(''); } }, [open, balance]);

  const save = async () => {
    try {
      await api.post(`/billing/invoices/${invoiceId}/payments`, { ...f, amount: Number(f.amount) });
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record payment</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">Balance due: <b>{fmtMoney(balance)}</b></Typography>
          <TextField label="Amount (Rs.)" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <TextField select label="Method" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
            {Object.entries(METHODS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
          {f.method !== 'CASH' && (
            <TextField label="Reference (card slip / transfer no)" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!(Number(f.amount) > 0)}>Record payment</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/billing/invoices/${id}`).then((r) => setInv(r.data)).catch((e) => setError(errMsg(e)));
  }, [id]);
  useEffect(load, [load]);

  const voidInvoice = async () => {
    if (!window.confirm('Void this invoice? Its charges will become billable again.')) return;
    try {
      await api.delete(`/billing/invoices/${id}`);
      navigate('/billing', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    }
  };

  if (!inv) return error ? <Alert severity="error">{error}</Alert> : <Skeleton variant="rounded" height={500} />;

  const balance = Math.round((Number(inv.totalAmount) - Number(inv.paidAmount)) * 100) / 100;

  return (
    <>
      {/* When printing, hide the app chrome and print only the invoice */}
      <GlobalStyles styles={{
        '@media print': {
          '.no-print': { display: 'none !important' },
          'main': { margin: '0 !important', padding: '0 !important' },
          'body': { background: '#fff !important' },
          '.invoice-paper': { border: 'none !important', boxShadow: 'none !important' },
        },
      }} />

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mb: 2 }} className="no-print">
        <Button onClick={() => navigate('/billing')}>Back to invoices</Button>
        {hasRole('ACCOUNTANT') && Number(inv.paidAmount) === 0 && <Button color="error" onClick={voidInvoice}>Void</Button>}
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>Print</Button>
        {balance > 0 && <Button variant="contained" startIcon={<PaymentsIcon />} onClick={() => setPayOpen(true)}>Record payment</Button>}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }} className="no-print" onClose={() => setError('')}>{error}</Alert>}

      <Paper className="invoice-paper" sx={{ p: { xs: 2.5, md: 5 }, maxWidth: 860, mx: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 4 }}>
          <Box>
            <Typography variant="h5" fontWeight={800} color="primary">HMS Hospital</Typography>
            <Typography variant="body2" color="text.secondary">Hospital Management System</Typography>
          </Box>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="h6" fontWeight={700}>{inv.status === 'PAID' ? 'RECEIPT' : 'INVOICE'}</Typography>
            <Typography sx={{ fontFamily: 'monospace' }}>{inv.invoiceNo}</Typography>
            <Typography variant="body2" color="text.secondary">{fmtDateTime(inv.createdAt)}</Typography>
            <Box sx={{ mt: 0.5 }}><StatusChip status={inv.status} /></Box>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="caption" color="text.secondary">BILL TO</Typography>
          <Typography fontWeight={700}>{fullName(inv.patient)}</Typography>
          <Typography variant="body2">{inv.patient.patientNo} · {inv.patient.phone}</Typography>
          {inv.patient.address && <Typography variant="body2">{inv.patient.address}</Typography>}
        </Box>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Description</TableCell><TableCell>Type</TableCell>
              <TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell><TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {inv.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{i.description}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{i.type.toLowerCase()}</TableCell>
                <TableCell align="right">{i.quantity}</TableCell>
                <TableCell align="right">{fmtMoney(i.unitPrice)}</TableCell>
                <TableCell align="right">{fmtMoney(i.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Box sx={{ ml: 'auto', mt: 2, maxWidth: 300 }}>
          {[
            ['Subtotal', fmtMoney(inv.subtotal)],
            ...(Number(inv.discount) > 0 ? [['Discount', `- ${fmtMoney(inv.discount)}`]] : []),
          ].map(([l, v]) => (
            <Box key={l} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}><span>{l}</span><span>{v}</span></Box>
          ))}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><b>Total</b><b>{fmtMoney(inv.totalAmount)}</b></Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}><span>Paid</span><span>{fmtMoney(inv.paidAmount)}</span></Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', color: balance > 0 ? 'error.main' : 'success.main' }}>
            <b>Balance due</b><b>{fmtMoney(balance)}</b>
          </Box>
        </Box>

        {inv.payments.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>Payments</Typography>
            <Table size="small">
              <TableBody>
                {inv.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{fmtDateTime(p.paidAt)}</TableCell>
                    <TableCell>{METHODS[p.method]}{p.reference && ` (${p.reference})`}</TableCell>
                    <TableCell>{p.receivedByName && `Received by ${p.receivedByName}`}</TableCell>
                    <TableCell align="right">{fmtMoney(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {inv.notes && <Typography variant="body2" sx={{ mt: 3 }}><b>Notes:</b> {inv.notes}</Typography>}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 4, textAlign: 'center' }}>
          {inv.createdBy && `Prepared by ${inv.createdBy} · `}Thank you. This is a computer-generated document.
        </Typography>
      </Paper>

      <PaymentDialog open={payOpen} balance={balance} invoiceId={inv.id} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); load(); }} />
    </>
  );
}

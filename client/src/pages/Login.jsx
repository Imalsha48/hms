import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api/client';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const notice = params.get('idle')
    ? 'You were logged out after 15 minutes of inactivity.'
    : params.get('expired')
      ? 'Your session expired. Please log in again.'
      : '';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(form.username.trim(), form.password);
      navigate('/');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, background: 'linear-gradient(135deg,#0f2f33 0%,#0b6e75 100%)' }}>
      <Paper component="form" onSubmit={submit} sx={{ p: 4, width: '100%', maxWidth: 380 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <LocalHospitalIcon color="primary" fontSize="large" />
          <Typography variant="h5" fontWeight={700}>HMS</Typography>
        </Box>
        <Typography color="text.secondary" sx={{ mb: 3 }}>Sign in to the Hospital Management System</Typography>

        {notice && <Alert severity="info" sx={{ mb: 2 }}>{notice}</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField label="Username" autoFocus required sx={{ mb: 2 }} value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <TextField label="Password" type="password" required sx={{ mb: 3 }} value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" variant="contained" fullWidth size="large" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </Button>
      </Paper>
    </Box>
  );
}

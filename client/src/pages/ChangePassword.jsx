import { useState } from 'react';
import { Alert, Button, Paper, Stack, TextField } from '@mui/material';
import PageHeader from '../components/PageHeader';
import api, { errMsg } from '../api/client';

export default function ChangePassword() {
  const empty = { currentPassword: '', newPassword: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [msg, setMsg] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return setMsg({ type: 'error', text: 'New passwords do not match' });
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setMsg({ type: 'success', text: 'Password changed successfully' });
      setForm(empty);
    } catch (err) {
      setMsg({ type: 'error', text: errMsg(err) });
    }
  };

  return (
    <>
      <PageHeader title="Change password" subtitle="At least 8 characters, with letters and numbers" />
      <Paper component="form" onSubmit={submit} sx={{ p: 3, maxWidth: 420 }}>
        <Stack spacing={2}>
          {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
          <TextField type="password" label="Current password" required value={form.currentPassword} onChange={set('currentPassword')} />
          <TextField type="password" label="New password" required value={form.newPassword} onChange={set('newPassword')} />
          <TextField type="password" label="Confirm new password" required value={form.confirm} onChange={set('confirm')} />
          <Button type="submit" variant="contained">Update password</Button>
        </Stack>
      </Paper>
    </>
  );
}

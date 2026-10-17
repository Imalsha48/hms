// Admin: user accounts & roles (spec 3.1), audit trail (spec 4 / 10), backup download (spec 10)
import { Fragment, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack,
  Tab, Table, TableBody, TableCell, TableHead, TablePagination, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandIcon from '@mui/icons-material/KeyboardArrowDown';
import CollapseIcon from '@mui/icons-material/KeyboardArrowUp';
import BackupIcon from '@mui/icons-material/CloudDownloadOutlined';
import PageHeader from '../components/PageHeader';
import api, { downloadFile, errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime } from '../utils';

// Doctors are created on the Doctors page (they also need a doctor profile)
const ROLES = ['ADMIN', 'NURSE', 'RECEPTIONIST', 'LAB_STAFF', 'PHARMACIST', 'ACCOUNTANT'];
const pretty = (r) => r.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const ACTION_COLOR = { CREATE: 'success', UPDATE: 'info', DELETE: 'error', LOGIN: 'default', LOGIN_FAILED: 'warning', LOGOUT: 'default', PASSWORD_CHANGE: 'info', BACKUP: 'secondary' };

function UserDialog({ open, user, onClose, onSaved }) {
  const [f, setF] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setError(''); setF(user ? { fullName: user.fullName, email: user.email || '', role: user.role } : { username: '', fullName: '', email: '', role: 'RECEPTIONIST', password: '' }); }
  }, [open, user]);
  const save = async () => {
    try {
      if (user) await api.put(`/users/${user.id}`, f);
      else await api.post('/users', f);
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{user ? `Edit ${user.username}` : 'Add user'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!user && <TextField label="Username" value={f.username || ''} onChange={set('username')} />}
          <TextField label="Full name" value={f.fullName || ''} onChange={set('fullName')} />
          <TextField label="Email" value={f.email || ''} onChange={set('email')} />
          <TextField select label="Role" value={f.role || ''} onChange={set('role')} disabled={user?.role === 'DOCTOR'}
            helperText={user?.role === 'DOCTOR' ? 'Doctor accounts are managed on the Doctors page' : 'To add a doctor, use the Doctors page'}>
            {(user?.role === 'DOCTOR' ? ['DOCTOR'] : ROLES).map((r) => <MenuItem key={r} value={r}>{pretty(r)}</MenuItem>)}
          </TextField>
          {!user && <TextField label="Temporary password" type="password" value={f.password || ''} onChange={set('password')} helperText="8+ characters, letters and numbers" />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>{user ? 'Save' : 'Create user'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ResetDialog({ user, onClose }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { setPw(''); setMsg(null); }, [user]);
  const save = async () => {
    try { await api.post(`/users/${user.id}/reset-password`, { newPassword: pw }); setMsg({ type: 'success', text: 'Password reset. Give the new password to the user.' }); }
    catch (err) { setMsg({ type: 'error', text: errMsg(err) }); }
  };
  return (
    <Dialog open={!!user} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reset password · {user?.username}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
          <TextField label="New password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} helperText="8+ characters, letters and numbers" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={save} disabled={!pw}>Reset</Button>
      </DialogActions>
    </Dialog>
  );
}

function AuditLog({ users }) {
  const [filters, setFilters] = useState({ action: '', entity: '', userId: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0, entities: [] });
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const params = Object.fromEntries(Object.entries({ ...filters, page: page + 1, pageSize: 25 }).filter(([, v]) => v !== ''));
    api.get('/users/audit-logs', { params }).then((r) => setData(r.data));
  }, [filters, page]);
  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(0); };

  const details = (d) => { try { return JSON.stringify(JSON.parse(d), null, 2); } catch { return d; } };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2 }}>
        <TextField select label="Action" value={filters.action} onChange={set('action')} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          {Object.keys(ACTION_COLOR).map((a) => <MenuItem key={a} value={a}>{a.replace('_', ' ')}</MenuItem>)}
        </TextField>
        <TextField select label="Area" value={filters.entity} onChange={set('entity')} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          {data.entities.map((e) => <MenuItem key={e} value={e}>{e}</MenuItem>)}
        </TextField>
        <TextField select label="User" value={filters.userId} onChange={set('userId')} sx={{ minWidth: 180 }}>
          <MenuItem value="">All</MenuItem>
          {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>)}
        </TextField>
        <TextField type="date" label="From" value={filters.from} onChange={set('from')} InputLabelProps={{ shrink: true }} />
        <TextField type="date" label="To" value={filters.to} onChange={set('to')} InputLabelProps={{ shrink: true }} />
      </Stack>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow><TableCell /><TableCell>When</TableCell><TableCell>User</TableCell><TableCell>Action</TableCell><TableCell>Area</TableCell><TableCell>Record</TableCell><TableCell>IP</TableCell></TableRow>
          </TableHead>
          <TableBody>
            {data.items.map((l) => (
              <Fragment key={l.id}>
                <TableRow hover>
                  <TableCell padding="checkbox">
                    {l.details && <IconButton size="small" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? <CollapseIcon /> : <ExpandIcon />}</IconButton>}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.createdAt)}</TableCell>
                  <TableCell>{l.user ? `${l.user.username} (${pretty(l.user.role)})` : '-'}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={l.action.replace('_', ' ')} color={ACTION_COLOR[l.action] || 'default'} /></TableCell>
                  <TableCell>{l.entity}</TableCell>
                  <TableCell>{l.entityId || '-'}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{l.ipAddress || '-'}</TableCell>
                </TableRow>
                {open === l.id && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ bgcolor: '#f7f9fa' }}>
                      <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{details(l.details)}</Box>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
            {data.items.length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>No log entries</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Box>
      <TablePagination component="div" count={data.total} page={page} rowsPerPage={25} rowsPerPageOptions={[25]} onPageChange={(e, p) => setPage(p)} />
    </Box>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | user
  const [resetFor, setResetFor] = useState(null);
  const [backupMsg, setBackupMsg] = useState(null);

  const load = () => api.get('/users').then((r) => setUsers(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  const toggle = async (u) => {
    try { await api.put(`/users/${u.id}`, { isActive: !u.isActive }); load(); } catch (err) { setError(errMsg(err)); }
  };
  const backup = async () => {
    setBackupMsg({ type: 'info', text: 'Preparing backup...' });
    try { await downloadFile('/users/backup', {}, 'hms-backup.json'); setBackupMsg({ type: 'success', text: 'Backup downloaded. Keep it somewhere safe.' }); }
    catch (err) { setBackupMsg({ type: 'error', text: errMsg(err) }); }
  };

  return (
    <>
      <PageHeader
        title="Users & security"
        action={tab === 0 && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>Add user</Button>}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: '1px solid #e3e8ea', px: 1 }}>
          <Tab label={`Users (${users.length})`} />
          <Tab label="Audit log" />
          <Tab label="Backup" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow><TableCell>Username</TableCell><TableCell>Name</TableCell><TableCell>Role</TableCell><TableCell>Last login</TableCell><TableCell>Status</TableCell><TableCell /></TableRow>
              </TableHead>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} hover sx={{ opacity: u.isActive ? 1 : 0.55 }}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{u.username}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{u.fullName}</TableCell>
                    <TableCell><Chip size="small" label={pretty(u.role)} variant="outlined" color={u.role === 'ADMIN' ? 'primary' : 'default'} /></TableCell>
                    <TableCell>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={u.isActive ? 'Active' : 'Disabled'} color={u.isActive ? 'success' : 'default'} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Button size="small" onClick={() => setEditing(u)}>Edit</Button>
                      <Button size="small" onClick={() => setResetFor(u)}>Reset password</Button>
                      {u.id !== me.id && (
                        <Button size="small" color={u.isActive ? 'error' : 'success'} onClick={() => toggle(u)}>{u.isActive ? 'Disable' : 'Enable'}</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 1 && <AuditLog users={users} />}

        {tab === 2 && (
          <Box sx={{ p: 3, maxWidth: 720 }}>
            <Typography fontWeight={700} gutterBottom>Automatic backups</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              A full backup of the database runs automatically every night at 00:00 (kept 7 days), and every Sunday's backup
              is kept as the weekly full backup (90 days). See the recovery plan in the project README.
            </Typography>
            <Typography fontWeight={700} gutterBottom>Manual backup</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Download a complete copy of all data now, for example before a major change. The file contains patient data, so store it securely.
            </Typography>
            {backupMsg && <Alert severity={backupMsg.type} sx={{ mb: 2 }}>{backupMsg.text}</Alert>}
            <Button variant="contained" startIcon={<BackupIcon />} onClick={backup}>Download backup now</Button>
          </Box>
        )}
      </Paper>

      <UserDialog open={editing !== null} user={editing?.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      <ResetDialog user={resetFor} onClose={() => setResetFor(null)} />
    </>
  );
}

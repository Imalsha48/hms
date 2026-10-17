import { Navigate, Route, Routes } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientDetail from './pages/PatientDetail';
import Doctors from './pages/Doctors';
import Appointments from './pages/Appointments';
import ChangePassword from './pages/ChangePassword';
import Consultation from './pages/Consultation';
import Lab from './pages/Lab';
import Pharmacy from './pages/Pharmacy';

// Blocks the page unless logged in (and, if roles are given, has one of them)
function Protected({ roles, children }) {
  const { user, loading, hasRole } = useAuth();
  if (loading) return <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="doctors" element={<Doctors />} />
        <Route path="appointments" element={<Protected roles={['RECEPTIONIST', 'NURSE', 'DOCTOR']}><Appointments /></Protected>} />
        <Route path="consultation" element={<Protected roles={['DOCTOR']}><Consultation /></Protected>} />
        <Route path="lab" element={<Protected roles={['LAB_STAFF', 'DOCTOR', 'NURSE']}><Lab /></Protected>} />
        <Route path="pharmacy" element={<Protected roles={['PHARMACIST', 'DOCTOR']}><Pharmacy /></Protected>} />
        <Route path="change-password" element={<ChangePassword />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

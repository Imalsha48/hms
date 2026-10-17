// App shell: sidebar (changes by role) + top bar + page content
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Toolbar, Typography, useMediaQuery,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/SpaceDashboardOutlined';
import PeopleIcon from '@mui/icons-material/PeopleAltOutlined';
import DoctorIcon from '@mui/icons-material/MedicalServicesOutlined';
import EventIcon from '@mui/icons-material/EventOutlined';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import MedicationIcon from '@mui/icons-material/MedicationOutlined';
import { useAuth } from '../context/AuthContext';

const DRAWER = 236;

// roles: who sees the link (ADMIN always does). No roles = everyone.
export const NAV = [
  { to: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/patients', label: 'Patients', icon: <PeopleIcon /> },
  { to: '/appointments', label: 'Appointments', icon: <EventIcon />, roles: ['RECEPTIONIST', 'NURSE', 'DOCTOR'] },
  { to: '/lab', label: 'Laboratory', icon: <ScienceIcon />, roles: ['LAB_STAFF', 'DOCTOR', 'NURSE'] },
  { to: '/pharmacy', label: 'Pharmacy', icon: <MedicationIcon />, roles: ['PHARMACIST', 'DOCTOR'] },
  { to: '/doctors', label: 'Doctors', icon: <DoctorIcon /> },
];

const prettyRole = (r) => r.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width:900px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);

  const sidebar = (
    <Box sx={{ height: '100%', bgcolor: '#0f2f33', color: '#d9e6e8' }}>
      <Toolbar sx={{ gap: 1 }}>
        <LocalHospitalIcon sx={{ color: '#5fd0c8' }} />
        <Typography fontWeight={700} color="#fff">HMS</Typography>
      </Toolbar>
      <Divider sx={{ borderColor: 'rgba(255,255,255,.08)' }} />
      <List sx={{ px: 1 }}>
        {NAV.filter((n) => !n.roles || hasRole(...n.roles)).map((n) => (
          <ListItemButton
            key={n.to}
            component={NavLink}
            to={n.to}
            end={n.to === '/'}
            onClick={() => setMobileOpen(false)}
            sx={{
              borderRadius: 1.5, mb: 0.5, color: 'inherit',
              '&.active': { bgcolor: 'rgba(95,208,200,.15)', color: '#fff', '& .MuiListItemIcon-root': { color: '#5fd0c8' } },
            }}
          >
            <ListItemIcon sx={{ color: '#8fb3b8', minWidth: 38 }}>{n.icon}</ListItemIcon>
            <ListItemText primary={n.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar position="fixed" color="inherit" sx={{ ml: { md: `${DRAWER}px` }, width: { md: `calc(100% - ${DRAWER}px)` }, borderBottom: '1px solid #e3e8ea', boxShadow: 'none' }}>
        <Toolbar>
          {isMobile && <IconButton onClick={() => setMobileOpen(true)} edge="start" sx={{ mr: 1 }}><MenuIcon /></IconButton>}
          <Box sx={{ flexGrow: 1 }} />
          <Chip label={prettyRole(user.role)} size="small" color="primary" variant="outlined" sx={{ mr: 1.5 }} />
          <IconButton onClick={(e) => setAnchor(e.currentTarget)}>
            <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: 15 }}>{user.fullName[0]}</Avatar>
          </IconButton>
          <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            <MenuItem disabled>{user.fullName}</MenuItem>
            <MenuItem onClick={() => { setAnchor(null); navigate('/change-password'); }}>Change password</MenuItem>
            <MenuItem onClick={() => logout()}>Log out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER }, flexShrink: 0 }}>
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={isMobile ? mobileOpen : true}
          onClose={() => setMobileOpen(false)}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER, border: 'none' } }}
        >
          {sidebar}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, mt: 8, minWidth: 0 }}>
        <Outlet />
      </Box>
    </Box>
  );
}

// =============================================================
// Express app setup (APPLICATION LAYER entry point)
// =============================================================
const express = require('express');
const cors = require('cors');
const path = require('path');

const { authenticate } = require('./middleware/auth');
const { auditTrail } = require('./middleware/audit');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Public routes
app.use('/api/auth', require('./routes/auth'));

// Everything below requires login, and every change is audit-logged
app.use('/api', authenticate, auditTrail);
app.use('/api/users', require('./routes/users'));

// Modules
app.use('/api/patients',     require('./routes/patients'));
app.use('/api/doctors',      require('./routes/doctors'));
app.use('/api/departments',  require('./routes/departments'));
app.use('/api/appointments', require('./routes/appointments'));
// app.use('/api/records',      require('./routes/records'));
// app.use('/api/lab',          require('./routes/lab'));
// app.use('/api/pharmacy',     require('./routes/pharmacy'));
// app.use('/api/billing',      require('./routes/billing'));
// app.use('/api/admissions',   require('./routes/admissions'));
// app.use('/api/staff',        require('./routes/staff'));
// app.use('/api/reports',      require('./routes/reports'));
app.use('/api/dashboard',    require('./routes/dashboard'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;

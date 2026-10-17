// =============================================================
// Express app setup (APPLICATION LAYER entry point)
// =============================================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { authenticate } = require('./middleware/auth');
const { auditTrail } = require('./middleware/audit');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// On Render the app sits behind a proxy; this makes req.ip the real client IP (for audit logs)
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Public routes
app.use('/api/auth', require('./routes/auth'));

// Everything below requires login, and every change is audit-logged
app.use('/api', authenticate, auditTrail);
app.use('/api/users', require('./routes/users'));

// Modules
app.use('/api/patients', require('./routes/patients'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/records', require('./routes/records'));
app.use('/api/lab', require('./routes/lab'));
app.use('/api/pharmacy', require('./routes/pharmacy'));
// app.use('/api/billing',      require('./routes/billing'));
// app.use('/api/admissions',   require('./routes/admissions'));
// app.use('/api/staff',        require('./routes/staff'));
// app.use('/api/reports',      require('./routes/reports'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api', notFound); // unknown API routes -> JSON 404

// In production, Express also serves the built React app (client/dist),
// so the whole system runs on ONE URL. Any non-API path returns index.html
// and React Router decides which page to show.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;

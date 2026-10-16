// =============================================================
// Audit Logs (spec 4 Security + 10 Audit Trail)
// Automatically records every successful create/update/delete request.
// =============================================================
const prisma = require('../lib/prisma');

const METHOD_TO_ACTION = { POST: 'CREATE', PUT: 'UPDATE', PATCH: 'UPDATE', DELETE: 'DELETE' };

// Never store these in the log
const SENSITIVE_FIELDS = ['password', 'currentPassword', 'newPassword', 'passwordHash'];

function scrub(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  for (const f of SENSITIVE_FIELDS) if (f in copy) copy[f] = '***';
  return copy;
}

function auditTrail(req, res, next) {
  const action = METHOD_TO_ACTION[req.method];
  if (!action) return next(); // GET requests are not logged

  res.on('finish', () => {
    if (res.statusCode >= 400) return; // only log successful changes
    // "/api/patients/12" -> entity "patients", entityId "12"
    const parts = req.originalUrl.split('?')[0].split('/').filter(Boolean); // ["api","patients","12"]
    const entity = parts[1] || 'unknown';
    const entityId = parts[2] || null;

    prisma.auditLog
      .create({
        data: {
          userId: req.user ? req.user.id : null,
          action,
          entity,
          entityId,
          details: JSON.stringify(scrub(req.body)).slice(0, 5000),
          ipAddress: req.ip,
        },
      })
      .catch((e) => console.error('Audit log failed:', e.message));
  });

  next();
}

// For events that aren't plain CRUD (e.g. LOGIN)
async function logEvent(userId, action, entity, details, ipAddress) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entity, details, ipAddress } });
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

module.exports = { auditTrail, logEvent };

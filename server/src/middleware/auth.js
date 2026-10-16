// =============================================================
// Authentication + Role-Based Access Control (spec 3.1 & 4 Security)
// =============================================================
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

/**
 * authenticate: checks the "Authorization: Bearer <token>" header.
 * - Rejects missing / invalid / expired tokens (expiry = automatic session timeout)
 * - Rejects deactivated users even if their token is still valid
 * - Attaches the user to req.user for later middleware and routes
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError('Not logged in', 401);

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      const msg = e.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid token';
      throw new AppError(msg, 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    if (!user || !user.isActive) throw new AppError('Account is disabled', 401);

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * authorize: only lets the listed roles through.
 * ADMIN always has access.
 * Usage: router.post('/', authorize('RECEPTIONIST', 'DOCTOR'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Not logged in', 401));
    if (req.user.role === 'ADMIN' || allowedRoles.includes(req.user.role)) return next();
    return next(new AppError('You do not have permission to do this', 403));
  };
}

module.exports = { authenticate, authorize };

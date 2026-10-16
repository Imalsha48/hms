// /api/auth  -> Login, Logout, Password Management (spec 3.1)
const router = require('express').Router();
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { authenticate } = require('../middleware/auth');
const { logEvent } = require('../middleware/audit');

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    try {
      const result = await authService.login(username, password);
      await logEvent(result.user.id, 'LOGIN', 'auth', null, req.ip);
      res.json(result);
    } catch (err) {
      await logEvent(null, 'LOGIN_FAILED', 'auth', `username=${username}`, req.ip);
      throw err;
    }
  })
);

// GET /api/auth/me  -> who am I (frontend calls this on page refresh)
router.get('/me', authenticate, (req, res) => res.json(req.user));

// POST /api/auth/logout
// JWTs are stateless: the client deletes its token. We just record the event.
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await logEvent(req.user.id, 'LOGOUT', 'auth', null, req.ip);
    res.json({ message: 'Logged out' });
  })
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    await logEvent(req.user.id, 'PASSWORD_CHANGE', 'auth', null, req.ip);
    res.json({ message: 'Password changed successfully' });
  })
);

module.exports = router;

// =============================================================
// Auth business logic (BUSINESS LOGIC LAYER)
// =============================================================
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const AppError = require('../utils/AppError');

const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function validatePasswordStrength(pw) {
  if (!pw || pw.length < 8) throw new AppError('Password must be at least 8 characters');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
    throw new AppError('Password must contain letters and numbers');
  }
}

async function login(username, password) {
  if (!username || !password) throw new AppError('Username and password are required');

  const user = await prisma.user.findUnique({ where: { username } });
  // Same message for "no user" and "wrong password" so attackers can't guess usernames
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Invalid username or password', 401);
  }
  if (!user.isActive) throw new AppError('Account is disabled', 403);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return {
    token: signToken(user),
    user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
  };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword || '', user.passwordHash))) {
    throw new AppError('Current password is incorrect');
  }
  validatePasswordStrength(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(newPassword, SALT_ROUNDS) },
  });
}

async function hashPassword(pw) {
  validatePasswordStrength(pw);
  return bcrypt.hash(pw, SALT_ROUNDS);
}

module.exports = { login, changePassword, hashPassword };

// Single shared Prisma client (DATABASE LAYER)
const { PrismaClient } = require('@prisma/client');

// File bytes are large, so they are left out of every query by default.
// The download routes ask for them explicitly with omit: { data: false }.
const prisma = new PrismaClient({
  omit: {
    patientDocument: { data: true },
    labRequest: { reportData: true },
  },
});

module.exports = prisma;

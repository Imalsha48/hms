// Central error handler: every error ends up here and is returned as JSON
// Prisma errors have codes like P2002 (duplicate) - see prisma.io/docs/reference/api-reference/error-reference

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  // Friendly messages for common database errors
  if (typeof err.code === 'string' && /^P\d{4}$/.test(err.code)) {
    if (err.code === 'P2002') {
      const field = err.meta?.target || 'field';
      return res.status(409).json({ message: `A record with this ${field} already exists` });
    }
    if (err.code === 'P2025') return res.status(404).json({ message: 'Record not found' });
    if (err.code === 'P2003') return res.status(400).json({ message: 'Related record does not exist or is still in use' });
  }

  const status = err.statusCode || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Internal server error' : err.message });
}

module.exports = { notFound, errorHandler };

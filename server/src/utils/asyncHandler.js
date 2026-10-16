// Wraps async route handlers so thrown errors reach the error middleware
// (saves writing try/catch in every route)
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

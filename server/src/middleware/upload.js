// File uploads (patient documents, lab reports) using multer.
// Files are kept in memory and then saved into the database, because free cloud
// hosting (Render) deletes files written to disk whenever the app restarts.
const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new AppError('Only PDF, JPG and PNG files are allowed')),
});

// Sends stored bytes back to the browser as a file
function sendFile(res, { data, mimeType, fileName }) {
  if (!data) throw new AppError('File not found. Please upload it again.', 404);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.send(Buffer.from(data));
}

module.exports = { upload, sendFile };

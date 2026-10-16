// File uploads (patient documents, lab reports) using multer
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/AppError');

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

function uploader(subfolder) {
  const dir = path.join(__dirname, '..', '..', 'uploads', subfolder);
  fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: dir,
      // Random name so users can't overwrite each other's files
      filename: (req, file, cb) =>
        cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) =>
      ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new AppError('Only PDF, JPG and PNG files are allowed')),
  });
}

module.exports = uploader;

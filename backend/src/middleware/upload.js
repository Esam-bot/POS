const multer = require('multer');
const { MAX_BYTES, ALLOWED_MIME } = require('../services/upload.service');
const AppError = require('../utils/AppError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new AppError('Invalid image format. Allowed: JPEG, PNG, WebP, GIF', 400));
    }
    return cb(null, true);
  },
});

function singleImage(fieldName = 'image') {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Image file is too large', 400));
        }
        return next(new AppError(err.message, 400));
      }
      return next(err);
    });
  };
}

module.exports = { singleImage };

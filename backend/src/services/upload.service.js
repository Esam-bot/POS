const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 2 * 1024 * 1024);

function ensureUploadDir() {
  const dir = path.join(__dirname, '../..', env.uploadDir, 'menu');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Persist an uploaded image.
 * Uses Cloudinary when CLOUDINARY_* env vars are set; otherwise stores locally under /uploads/menu.
 */
async function saveMenuImage(file) {
  if (!file) {
    throw new AppError('Image file is required', 400);
  }
  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError('Invalid image format. Allowed: JPEG, PNG, WebP, GIF', 400);
  }
  if (file.size > MAX_BYTES) {
    throw new AppError(`Image exceeds maximum size of ${Math.round(MAX_BYTES / 1024 / 1024)}MB`, 400);
  }

  if (cloudinaryConfigured()) {
    try {
      // Lazy-require so missing package does not break local-disk mode.
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'restaurant-pos/menu' },
          (err, res) => (err ? reject(err) : resolve(res))
        );
        stream.end(file.buffer);
      });
      return {
        url: result.secure_url,
        provider: 'cloudinary',
        publicId: result.public_id,
      };
    } catch (err) {
      throw new AppError(`Cloudinary upload failed: ${err.message}`, 502);
    }
  }

  const ext = path.extname(file.originalname || '').toLowerCase() || mimeToExt(file.mimetype);
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const dir = ensureUploadDir();
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, file.buffer);

  return {
    url: `/uploads/menu/${filename}`,
    provider: 'local',
    path: fullPath,
  };
}

function mimeToExt(mime) {
  switch (mime) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.bin';
  }
}

module.exports = {
  saveMenuImage,
  cloudinaryConfigured,
  ALLOWED_MIME,
  MAX_BYTES,
};

/**
 * Centralized JWT configuration.
 *
 * Single source of truth for HTTP (middleware/auth.js, controllers/authController.js)
 * and Socket.IO (services/socketService.js).
 *
 * - Production (NODE_ENV=production) REQUIRES JWT_SECRET to be set.
 *   Missing/empty secret throws immediately at startup or first use.
 * - Development/test fall back to a documented dev-only secret so local
 *   workflows keep working without real credentials in the repo.
 */
const DEV_FALLBACK_SECRET = 'socorre_ai_jwt_secret_dev_2024';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && String(secret).trim().length > 0) {
    return String(secret);
  }
  if (isProduction()) {
    throw new Error(
      'JWT_SECRET must be set in production (NODE_ENV=production). Refusing to start with a fallback secret.'
    );
  }
  return DEV_FALLBACK_SECRET;
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '7d';
}

module.exports = { getJwtSecret, getJwtExpiresIn, DEV_FALLBACK_SECRET };

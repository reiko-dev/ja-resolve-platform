/**
 * Production startup guard for required secrets.
 *
 * JWT_SECRET already fails fast in `src/config/jwt.js` when it is used,
 * DB_PASSWORD fails fast in `src/config/postgresConnection.js`, and the Google
 * adapter throws per operation when its key is missing. This module is the
 * single production-entrypoint check that aggregates all three so `npm start`
 * refuses to boot with a clear, actionable message.
 *
 * Development and test paths are untouched: with any NODE_ENV other than
 * `production` this is a no-op.
 */
'use strict';

function hasValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function missingProductionSecrets(env = process.env) {
  if ((env.NODE_ENV || 'development') !== 'production') {
    return [];
  }

  const missing = [];
  if (!hasValue(env.JWT_SECRET)) {
    missing.push('JWT_SECRET');
  }
  if (!hasValue(env.PostgreSQL) && !hasValue(env.DATABASE_URL) && !hasValue(env.DB_PASSWORD)) {
    missing.push('DB_PASSWORD');
  }
  if (!hasValue(env.GOOGLE_ROUTES_API_KEY)) {
    missing.push('GOOGLE_ROUTES_API_KEY');
  }
  return missing;
}

function assertProductionSecrets(env = process.env) {
  const missing = missingProductionSecrets(env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required production secret(s): ${missing.join(', ')}. ` +
        'Set them in the environment before starting the server (see env.production.example).'
    );
  }
}

module.exports = { missingProductionSecrets, assertProductionSecrets };

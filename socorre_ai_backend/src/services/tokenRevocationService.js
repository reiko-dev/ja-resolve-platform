const crypto = require('crypto');
const db = require('../config/database');
const { getJwtExpiresIn } = require('../config/jwt');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function toUtcIso(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  return String(value);
}

function fallbackExpiration() {
  const configured = String(getJwtExpiresIn());
  const match = configured.match(/^(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?|days?|s|m|h|d)?$/i);
  if (!match) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const factors = {
    s: 1000, second: 1000, seconds: 1000,
    m: 60000, minute: 60000, minutes: 60000,
    h: 3600000, hour: 3600000, hours: 3600000,
    d: 86400000, day: 86400000, days: 86400000,
  };
  const unit = (match[2] || 's').toLowerCase();
  return new Date(Date.now() + Number(match[1]) * factors[unit]).toISOString();
}

async function revokeToken(token, userId, expiresAt = fallbackExpiration()) {
  if (!token) {
    return;
  }

  const tokenHash = hashToken(token);

  await db('revoked_tokens')
    .insert({
      token_hash: tokenHash,
      user_id: userId,
      expires_at: toUtcIso(expiresAt),
    })
    .onConflict('token_hash')
    .ignore();

  await db('revoked_tokens')
    .where('expires_at', '<=', new Date().toISOString())
    .del();

}

async function isTokenRevoked(token) {
  if (!token) {
    return true;
  }

  const tokenHash = hashToken(token);
  const revoked = await db('revoked_tokens').where('token_hash', tokenHash).first();

  if (!revoked) {
    return false;
  }

  if (revoked.expires_at && new Date(revoked.expires_at).getTime() <= Date.now()) {
    await db('revoked_tokens').where('token_hash', tokenHash).del();
    return false;
  }

  return true;
}

module.exports = { hashToken, revokeToken, isTokenRevoked, fallbackExpiration };

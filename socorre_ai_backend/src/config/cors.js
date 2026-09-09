/**
 * Shared CORS allowlist for HTTP (Express) and Socket.IO.
 *
 * Production must explicitly list origins via CORS_ORIGIN
 * (comma-separated). No wildcard subdomains, no Easypanel
 * exceptions: only what is configured is allowed.
 * Requests without an Origin header (mobile apps, curl,
 * server-to-server) are still allowed.
 */

const DEFAULT_ORIGINS = [
  'https://admin.socorreja.com.br',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8080',
];

function getAllowedOrigins() {
  const raw = process.env.CORS_ORIGIN;
  if (raw && String(raw).trim().length > 0) {
    return String(raw)
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_ORIGINS];
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin) || allowed.includes('*');
}

module.exports = { getAllowedOrigins, isOriginAllowed, DEFAULT_ORIGINS };

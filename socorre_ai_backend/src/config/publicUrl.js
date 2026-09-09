/**
 * Public base URL used to build externally-visible file URLs
 * (e.g. upload responses). Replaces the previous hardcoded
 * `http://localhost:3001` so production never persists
 * localhost URLs.
 *
 * Set PUBLIC_API_URL=https://api.socorreja.com.br in production.
 * Falls back to http://localhost:<PORT> for local development.
 */
function getPublicApiBaseUrl() {
  const configured = process.env.PUBLIC_API_URL;
  if (configured && String(configured).trim().length > 0) {
    return String(configured).trim().replace(/\/+$/, '');
  }
  const port = process.env.PORT || 3001;
  return `http://localhost:${port}`;
}

module.exports = { getPublicApiBaseUrl };

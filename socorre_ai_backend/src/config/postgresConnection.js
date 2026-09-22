require('dotenv').config();

/**
 * EasyPanel e outros painéis costumam injetar `PostgreSQL` ou `DATABASE_URL` com o host
 * interno do Docker (ex.: socorre_socorredb). Dentro do container, DB_HOST=localhost NUNCA
 * alcança o Postgres de outro serviço — priorizamos a URL quando existir.
 *
 * @param {'development' | 'test' | 'production'} environment
 * @returns {string|object} connection string ou objeto para knex `connection`
 */
function getPostgresConnection(environment) {
  const url = process.env.PostgreSQL || process.env.DATABASE_URL;
  if (url && String(url).trim() && environment !== 'test') {
    return String(url).trim();
  }

  const database =
    environment === 'test'
      ? process.env.DB_NAME_TEST || 'socorre_ai_test'
      : process.env.DB_NAME || 'socorre_ai_db';

  const ssl =
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

  const password = process.env.DB_PASSWORD || '';

  // `database.js`/`knexfile.js` materialize every environment eagerly, so the
  // guard keys off the ACTIVE `NODE_ENV`, not the requested config key.
  if (
    environment === 'production' &&
    (process.env.NODE_ENV || 'development') === 'production' &&
    password.trim() === ''
  ) {
    throw new Error(
      'DB_PASSWORD must be set in production (NODE_ENV=production) unless DATABASE_URL (or PostgreSQL) supplies the credentials.'
    );
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database,
    user: process.env.DB_USER || 'postgres',
    password,
    ssl,
  };
}

module.exports = { getPostgresConnection };

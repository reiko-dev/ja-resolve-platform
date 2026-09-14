/**
 * Transport-test database helper.
 *
 * Backs the real Express / Socket.IO transports with an in-memory SQLite
 * schema and adds deterministic failure injection so the tests can exercise
 * database-outage paths without a live PostgreSQL server.
 *
 * The exported `db` is a transparent proxy over a knex SQLite instance:
 *   db('users')            -> real query builder (same as authTestDb)
 *   failQueries('users')   -> the next matching query throws a connection error
 */
const knex = require('knex');

const knexInstance = knex({
  client: 'sqlite3',
  connection: ':memory:',
  useNullAsDefault: true,
});

let failureRules = [];

function failQueries(table, { times = 1, skip = 0 } = {}) {
  failureRules.push({ table, remaining: times, skip });
}

function clearFailures() {
  failureRules = [];
}

function connectionError() {
  const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
  error.code = 'ECONNREFUSED';
  return error;
}

const db = new Proxy(knexInstance, {
  apply(target, thisArg, args) {
    const table = args[0];
    if (typeof table === 'string') {
      const rule = failureRules.find((r) => r.table === table && r.remaining > 0);
      if (rule) {
        if (rule.skip > 0) {
          rule.skip -= 1;
        } else {
          rule.remaining -= 1;
          throw connectionError();
        }
      }
    }
    return Reflect.apply(target, target, args);
  },
  get(target, prop) {
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

let schemaReady = null;

async function initSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await knexInstance.schema.createTable('users', (table) => {
        table.increments('id').primary();
        table.string('name', 100).notNullable();
        table.string('email', 100).unique().notNullable();
        table.string('password', 255).notNullable();
        table.string('phone', 20);
        table.string('role', 20).defaultTo('user');
        table.string('cpf', 14);
        table.string('cnpj', 18);
        table.integer('is_active').defaultTo(1);
        table.integer('email_verified').defaultTo(0);
        table.string('onboarding_partner_type', 50);
        table.string('onboarding_stage', 50);
        table.timestamp('created_at');
        table.timestamp('updated_at');
      });

      await knexInstance.schema.createTable('partners', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned();
        table.string('type', 50);
        table.string('business_name', 100);
        table.timestamp('created_at');
        table.timestamp('updated_at');
      });

      await knexInstance.schema.createTable('revoked_tokens', (table) => {
        table.string('token_hash', 64).primary();
        table.integer('user_id').unsigned().notNullable();
        table.timestamp('expires_at').notNullable();
        table.index('expires_at');
      });
    })();
  }
  return schemaReady;
}

async function reset() {
  await initSchema();
  clearFailures();
  await knexInstance('revoked_tokens').del();
  await knexInstance('partners').del();
  await knexInstance('users').del();
}

async function createUser(overrides = {}) {
  const [user] = await knexInstance('users')
    .insert({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashed-password',
      phone: '5511999999999',
      role: 'user',
      is_active: 1,
      email_verified: 0,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    })
    .returning('*');
  return user;
}

async function destroy() {
  await knexInstance.destroy();
}

module.exports = {
  db,
  initSchema,
  reset,
  createUser,
  failQueries,
  clearFailures,
  destroy,
};

afterAll(async () => {
  await destroy();
});

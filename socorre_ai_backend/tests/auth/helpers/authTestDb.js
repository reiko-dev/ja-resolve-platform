const knex = require('knex');

const db = knex({
  client: 'sqlite3',
  connection: ':memory:',
  useNullAsDefault: true,
});

let schemaReady = null;

async function initSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.schema.createTable('users', (table) => {
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

      await db.schema.createTable('partners', (table) => {
        table.increments('id').primary();
        table.integer('user_id').unsigned();
        table.string('type', 50);
        table.string('business_name', 100);
        table.timestamp('created_at');
        table.timestamp('updated_at');
      });

      await db.schema.createTable('revoked_tokens', (table) => {
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
  await db('revoked_tokens').del();
  await db('partners').del();
  await db('users').del();
}

async function createUser(overrides = {}) {
  const [user] = await db('users')
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

module.exports = { db, initSchema, reset, createUser };

afterAll(async () => {
  await db.destroy();
});

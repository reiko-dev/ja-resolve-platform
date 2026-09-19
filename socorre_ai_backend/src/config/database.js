const path = require('path');
const knex = require('knex');
require('dotenv').config();
const { getPostgresConnection } = require('./postgresConnection');

// T01: the relative paths used to resolve against `src/config/` and therefore
// pointed at `src/database/migrations` — a directory that does not exist — so
// this singleton disagreed with `knexfile.js` about where migrations live.
// Resolving from the backend root keeps both entry points identical.
const MIGRATIONS_DIRECTORY = path.resolve(__dirname, '..', '..', 'database', 'migrations');
const SEEDS_DIRECTORY = path.resolve(__dirname, '..', '..', 'database', 'seeds');

const dbConfig = {
  development: {
    client: 'postgresql',
    connection: getPostgresConnection('development'),
    migrations: {
      directory: MIGRATIONS_DIRECTORY,
    },
    seeds: {
      directory: SEEDS_DIRECTORY,
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
  test: {
    client: 'postgresql',
    connection: getPostgresConnection('test'),
    migrations: {
      directory: MIGRATIONS_DIRECTORY,
    },
    seeds: {
      directory: SEEDS_DIRECTORY,
    },
  },
  production: {
    client: 'postgresql',
    connection: getPostgresConnection('production'),
    migrations: {
      directory: MIGRATIONS_DIRECTORY,
    },
    seeds: {
      directory: SEEDS_DIRECTORY,
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
};

const environment = process.env.NODE_ENV || 'development';
const config = dbConfig[environment];

const db = knex(config);

module.exports = db;

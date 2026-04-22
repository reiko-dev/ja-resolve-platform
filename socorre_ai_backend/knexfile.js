require('dotenv').config();
const { getPostgresConnection } = require('./src/config/postgresConnection');

module.exports = {
  development: {
    client: 'postgresql',
    connection: getPostgresConnection('development'),
    migrations: {
      directory: './database/migrations',
    },
    seeds: {
      directory: './database/seeds',
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
      directory: './database/migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
  },
  production: {
    client: 'postgresql',
    connection: getPostgresConnection('production'),
    migrations: {
      directory: './database/migrations',
    },
    seeds: {
      directory: './database/seeds',
    },
    pool: {
      min: 2,
      max: 10,
    },
  },
};

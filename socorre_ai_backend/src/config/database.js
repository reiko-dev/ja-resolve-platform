const knex = require('knex');
require('dotenv').config();
const { getPostgresConnection } = require('./postgresConnection');

const dbConfig = {
  development: {
    client: 'postgresql',
    connection: getPostgresConnection('development'),
    migrations: {
      directory: '../database/migrations',
    },
    seeds: {
      directory: '../database/seeds',
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
      directory: '../database/migrations',
    },
    seeds: {
      directory: '../database/seeds',
    },
  },
  production: {
    client: 'postgresql',
    connection: getPostgresConnection('production'),
    migrations: {
      directory: '../database/migrations',
    },
    seeds: {
      directory: '../database/seeds',
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

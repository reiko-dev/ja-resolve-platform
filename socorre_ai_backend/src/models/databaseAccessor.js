'use strict';

const productionDatabase = require('../config/database');

/**
 * Acessor de banco por modelo.
 *
 * Em produção todas as chamadas usam o singleton exportado por
 * `src/config/database`. `setDatabase` existe exclusivamente para testes:
 * injeta uma conexão isolada (por exemplo SQLite em memória) apenas no modelo
 * que a recebeu, sem alterar o singleton nem os demais modelos. `resetDatabase`
 * devolve o modelo ao banco de produção.
 *
 * O acessor mantém a mesma forma de chamada do knex (`db('tabela')`,
 * `db.raw(...)`, `db.fn.now()`, `db.transaction(...)`), apenas resolvendo a
 * conexão ativa a cada chamada.
 */
function createDatabaseAccessor() {
  let activeDatabase = productionDatabase;

  const accessor = (...args) => activeDatabase(...args);

  Object.defineProperties(accessor, {
    raw: {
      value: (...args) => activeDatabase.raw(...args),
    },
    fn: {
      get: () => activeDatabase.fn,
    },
    transaction: {
      value: (...args) => activeDatabase.transaction(...args),
    },
    schema: {
      get: () => activeDatabase.schema,
    },
    client: {
      get: () => activeDatabase.client,
    },
    activeDatabase: {
      get: () => activeDatabase,
    },
  });

  return {
    accessor,

    setDatabase(database) {
      if (!database || typeof database !== 'function') {
        throw new TypeError('setDatabase espera uma instância knex válida');
      }
      activeDatabase = database;
    },

    resetDatabase() {
      activeDatabase = productionDatabase;
    },

    getDatabase() {
      return activeDatabase;
    },
  };
}

module.exports = { createDatabaseAccessor };

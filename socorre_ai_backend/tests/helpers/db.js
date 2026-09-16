/**
 * Acesso direto ao banco usado pela aplicação durante os testes.
 *
 * Aponta para o mesmo SQLite em memória injetado em `src/config/database`
 * (via `jest.mock`), permitindo inspecionar o que foi persistido.
 */
const { db, initSchema, reset, TABLES } = require('./testDb');

module.exports = { db, initSchema, reset, TABLES };

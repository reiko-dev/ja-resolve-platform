/**
 * MVP-04 — the row-lock helper shared by the persistence adapters.
 *
 * `SELECT ... FOR UPDATE` is a PostgreSQL concurrency primitive. It exists in
 * exactly one place so that "which engine am I on?" is answered once instead of
 * being re-guessed in every repository:
 *
 *   - on PostgreSQL the clause is applied, and two transactions that lock the
 *     same row serialize on it;
 *   - on the SQLite harness it is a documented NO-OP. SQLite serializes writers
 *     itself and has no such clause; asking for it there would be a syntax error.
 *
 * This is why concurrency is certified on PostgreSQL only: on SQLite the lock
 * does nothing, and the UNIQUE constraints remain the sole authority.
 */
'use strict';

/** True when the connection talks to PostgreSQL. */
function isPostgres(connection) {
  const client = connection && connection.client && connection.client.config
    ? connection.client.config.client
    : null;
  return client === 'pg' || client === 'postgres' || client === 'postgresql';
}

/**
 * Applies `FOR UPDATE` to a query when (and only when) the engine supports it.
 * The query is returned either way, so callers stay engine-agnostic.
 */
function applyRowLock(query, connection) {
  return isPostgres(connection) ? query.forUpdate() : query;
}

module.exports = { applyRowLock, isPostgres };

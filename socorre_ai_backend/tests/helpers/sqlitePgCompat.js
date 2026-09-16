/**
 * Compatibilidade PostgreSQL → SQLite para o harness de testes.
 *
 * A produção roda PostgreSQL; as suítes injetam um SQLite em memória
 * (`tests/helpers/testDb.js`) para serem determinísticas e herméticas. Alguns
 * models usam construções que só existem no dialeto PG e que quebrariam a
 * execução no SQLite, impedindo que a suíte chegue às asserções funcionais:
 *
 *   - `coluna::json->>'chave'` (DeliveryOrderModel: store_info/price_breakdown)
 *   - casts `::text` / `::numeric` (Mechanic, Product, DeliveryOrderModel)
 *   - `ILIKE` (Mechanic, Product)
 *
 * Esta camada reescreve **apenas o SQL gerado em tempo de execução no harness**,
 * traduzindo essas construções para equivalentes SQLite (`json_extract`, LIKE —
 * que no SQLite já é case-insensitive para ASCII, casts redundantes). Nenhum
 * arquivo de `src/` é alterado e o comportamento observável dos endpoints é o
 * mesmo que a produção teria no PG.
 *
 * Limitação conhecida (não traduzida de propósito, por ser ambígua):
 * aritmética de data com `INTERVAL` (Appointment) e operadores específicos de
 * arrays/jsonb do PG.
 */

/**
 * Traduz uma query SQL do dialeto PG para o subconjunto aceito pelo SQLite.
 * @param {string} sql
 * @returns {string}
 */
function translatePgSql(sql) {
  if (typeof sql !== 'string' || sql.length === 0) {
    return sql;
  }

  return sql
    // price_breakdown::json->>'motoboy_fee' → CAST(json_extract(price_breakdown, '$.motoboy_fee') AS TEXT)
    // (o cast garante o mesmo tipo textual que o operador ->> do PG devolve)
    .replace(
      /([A-Za-z_][\w.]*)::json->>'([^']*)'/g,
      "CAST(json_extract($1, '$.$2') AS TEXT)"
    )
    // store_info::json->'id' → json_extract(store_info, '$.id')
    .replace(/([A-Za-z_][\w.]*)::json->'([^']*)'/g, "json_extract($1, '$.$2')")
    // Casts que o SQLite (tipagem dinâmica) não precisa.
    .replace(/::(text|numeric|jsonb|json|integer|int|bigint|boolean|double precision|varchar)/gi, '')
    // ILIKE não existe no SQLite; LIKE lá já ignora caixa para ASCII.
    .replace(/\bILIKE\b/gi, 'LIKE');
}

/**
 * Instala a tradução no client do knex. `positionBindings` é chamado pelo
 * query-executioner para toda query antes de ir ao driver, o que torna o hook
 * único e cobrir raw/select/update/insert igualmente.
 *
 * @param {import('knex').Knex} knexInstance
 * @returns {import('knex').Knex}
 */
function installPgCompat(knexInstance) {
  const client = knexInstance.client;
  if (client.__pgCompatInstalled) {
    return knexInstance;
  }

  const basePositionBindings = client.positionBindings.bind(client);
  client.positionBindings = (sql) => basePositionBindings(translatePgSql(sql));
  client.__pgCompatInstalled = true;

  return knexInstance;
}

module.exports = { translatePgSql, installPgCompat };

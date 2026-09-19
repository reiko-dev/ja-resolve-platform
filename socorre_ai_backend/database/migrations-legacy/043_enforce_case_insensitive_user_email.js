exports.up = async function(knex) {
  const duplicates = await knex('users')
    .select(knex.raw('LOWER(email) AS normalized_email'))
    .count('* AS total')
    .groupBy(knex.raw('LOWER(email)'))
    .having(knex.raw('COUNT(*) > 1'));

  if (duplicates.length > 0) {
    const values = duplicates.map((row) => row.normalized_email).join(', ');
    throw new Error(`Não foi possível aplicar unicidade de email; duplicidades normalizadas: ${values}`);
  }

  await knex.raw(`
    CREATE UNIQUE INDEX users_email_lower_unique
      ON users (LOWER(email))
  `);
};

exports.down = function(knex) {
  return knex.raw('DROP INDEX IF EXISTS users_email_lower_unique');
};

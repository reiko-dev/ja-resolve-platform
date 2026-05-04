exports.up = async function(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'enum_partners_type'
      ) THEN
        ALTER TYPE enum_partners_type ADD VALUE IF NOT EXISTS 'gas_station';
        ALTER TYPE enum_partners_type ADD VALUE IF NOT EXISTS 'auto_parts';
        ALTER TYPE enum_partners_type ADD VALUE IF NOT EXISTS 'tow';
      END IF;
    END
    $$;
  `);
};

exports.down = async function() {
  // PostgreSQL não suporta remover valores individuais de enum com segurança.
};

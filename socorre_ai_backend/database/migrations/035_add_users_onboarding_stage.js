const { ONBOARDING_STAGES } = require('../../src/config/onboardingStages');

exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'onboarding_stage');

  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.string('onboarding_stage');
    });
  }

  await knex.raw(
    `
      UPDATE users
      SET onboarding_stage = CASE
        WHEN partners.approval_status = 'approved' THEN ?
        WHEN partners.approval_status = 'pending' THEN ?
        WHEN partners.id IS NOT NULL THEN ?
        WHEN users.onboarding_partner_type IS NOT NULL AND users.onboarding_partner_type <> '' THEN ?
        ELSE users.onboarding_stage
      END
      FROM partners
      WHERE partners.user_id = users.id
    `,
    [
      ONBOARDING_STAGES.APPROVED,
      ONBOARDING_STAGES.UNDER_REVIEW,
      ONBOARDING_STAGES.DOCUMENTS_PENDING,
      ONBOARDING_STAGES.ACCOUNT_CREATED,
    ]
  );

  await knex('users')
    .whereNull('onboarding_stage')
    .whereNotNull('onboarding_partner_type')
    .update({
      onboarding_stage: ONBOARDING_STAGES.ACCOUNT_CREATED,
      updated_at: knex.fn.now(),
    });
};

exports.down = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'onboarding_stage');

  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('onboarding_stage');
    });
  }
};

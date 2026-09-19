exports.up = async function(knex) {
  const now = knex.fn.now();
  const settings = [
    {
      setting_key: 'tow_price_per_km',
      setting_value: '6',
      data_type: 'number',
      description: 'Valor base por km para atendimento de guincho',
      category: 'guincho',
      is_public: false,
      is_editable: true,
      updated_at: now
    },
    {
      setting_key: 'tow_platform_fixed_fee',
      setting_value: '25',
      data_type: 'number',
      description: 'Taxa fixa da plataforma por atendimento de guincho',
      category: 'guincho',
      is_public: false,
      is_editable: true,
      updated_at: now
    },
    {
      setting_key: 'tow_minimum_charge',
      setting_value: '90',
      data_type: 'number',
      description: 'Cobrança mínima do atendimento de guincho',
      category: 'guincho',
      is_public: false,
      is_editable: true,
      updated_at: now
    },
    {
      setting_key: 'tow_cancellation_fee',
      setting_value: '40',
      data_type: 'number',
      description: 'Taxa de cancelamento do atendimento de guincho',
      category: 'guincho',
      is_public: false,
      is_editable: true,
      updated_at: now
    }
  ];

  for (const setting of settings) {
    const existing = await knex('system_settings')
      .where('setting_key', setting.setting_key)
      .first();

    if (!existing) {
      await knex('system_settings').insert(setting);
    }
  }
};

exports.down = async function(knex) {
  await knex('system_settings')
    .whereIn('setting_key', [
      'tow_price_per_km',
      'tow_platform_fixed_fee',
      'tow_minimum_charge',
      'tow_cancellation_fee'
    ])
    .del();
};

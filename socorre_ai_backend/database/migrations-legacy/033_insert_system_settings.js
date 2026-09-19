exports.up = function(knex) {
  return knex('system_settings').insert([
    // Configurações Gerais
    {
      setting_key: 'app_name',
      setting_value: 'Socorre AI',
      data_type: 'string',
      description: 'Nome do aplicativo',
      category: 'general',
      is_public: true
    },
    {
      setting_key: 'app_version',
      setting_value: '2.0.0',
      data_type: 'string',
      description: 'Versão atual do aplicativo',
      category: 'general',
      is_public: true
    },
    
    // Configurações de Guincho
    {
      setting_key: 'guincho_search_radius_km',
      setting_value: '15',
      data_type: 'number',
      description: 'Raio de busca para guinchos em km',
      category: 'guincho',
      is_public: false,
      min_value: '5',
      max_value: '50'
    },
    {
      setting_key: 'guincho_proposal_expiry_minutes',
      setting_value: '10',
      data_type: 'number',
      description: 'Validade das propostas de guincho em minutos',
      category: 'guincho',
      is_public: false,
      min_value: '5',
      max_value: '30'
    },
    {
      setting_key: 'guincho_max_proposals_per_request',
      setting_value: '5',
      data_type: 'number',
      description: 'Número máximo de propostas por solicitação de guincho',
      category: 'guincho',
      is_public: false,
      min_value: '3',
      max_value: '10'
    },
    
    // Configurações de Assinaturas
    {
      setting_key: 'mecanico_monthly_fee',
      setting_value: '99.00',
      data_type: 'number',
      description: 'Mensalidade para mecânicos',
      category: 'assinatura',
      is_public: false,
      min_value: '0',
      max_value: '500'
    },
    {
      setting_key: 'posto_combustivel_monthly_fee',
      setting_value: '199.00',
      data_type: 'number',
      description: 'Mensalidade para postos de combustível',
      category: 'assinatura',
      is_public: false,
      min_value: '0',
      max_value: '1000'
    },
    {
      setting_key: 'auto_pecas_monthly_fee',
      setting_value: '149.00',
      data_type: 'number',
      description: 'Mensalidade para auto peças',
      category: 'assinatura',
      is_public: false,
      min_value: '0',
      max_value: '500'
    },
    {
      setting_key: 'subscription_grace_period_days',
      setting_value: '7',
      data_type: 'number',
      description: 'Período de carência para assinaturas em dias',
      category: 'assinatura',
      is_public: false,
      min_value: '1',
      max_value: '30'
    },
    
    // Configurações de Delivery
    {
      setting_key: 'delivery_base_fee',
      setting_value: '8.00',
      data_type: 'number',
      description: 'Taxa base de delivery',
      category: 'delivery',
      is_public: false,
      min_value: '0',
      max_value: '50'
    },
    {
      setting_key: 'delivery_platform_fee_percent',
      setting_value: '20.0',
      data_type: 'number',
      description: 'Percentual de comissão da plataforma no delivery',
      category: 'delivery',
      is_public: false,
      min_value: '5',
      max_value: '50'
    },
    {
      setting_key: 'delivery_motoboy_fee_percent',
      setting_value: '80.0',
      data_type: 'number',
      description: 'Percentual para o motoboy no delivery',
      category: 'delivery',
      is_public: false,
      min_value: '50',
      max_value: '95'
    },
    {
      setting_key: 'delivery_search_radius_km',
      setting_value: '10',
      data_type: 'number',
      description: 'Raio de busca para motoboys em km',
      category: 'delivery',
      is_public: false,
      min_value: '5',
      max_value: '30'
    },
    {
      setting_key: 'delivery_max_distance_km',
      setting_value: '25',
      data_type: 'number',
      description: 'Distância máxima de delivery em km',
      category: 'delivery',
      is_public: false,
      min_value: '10',
      max_value: '100'
    },
    
    // Configurações de Pagamentos
    {
      setting_key: 'emergency_base_commission_percent',
      setting_value: '25.0',
      data_type: 'number',
      description: 'Comissão base para serviços de emergência',
      category: 'pagamentos',
      is_public: false,
      min_value: '10',
      max_value: '50'
    },
    {
      setting_key: 'min_payment_amount',
      setting_value: '5.00',
      data_type: 'number',
      description: 'Valor mínimo de pagamento',
      category: 'pagamentos',
      is_public: false,
      min_value: '1',
      max_value: '100'
    },
    {
      setting_key: 'max_payment_amount',
      setting_value: '5000.00',
      data_type: 'number',
      description: 'Valor máximo de pagamento',
      category: 'pagamentos',
      is_public: false,
      min_value: '1000',
      max_value: '10000'
    },
    
    // Configurações de Notificações
    {
      setting_key: 'notification_ttl_hours',
      setting_value: '24',
      data_type: 'number',
      description: 'Tempo de vida das notificações em horas',
      category: 'notificacoes',
      is_public: false,
      min_value: '1',
      max_value: '168'
    },
    {
      setting_key: 'max_notifications_per_user',
      setting_value: '50',
      data_type: 'number',
      description: 'Máximo de notificações por usuário',
      category: 'notificacoes',
      is_public: false,
      min_value: '10',
      max_value: '100'
    },
    
    // Configurações de Mapa
    {
      setting_key: 'map_default_zoom',
      setting_value: '15',
      data_type: 'number',
      description: 'Zoom padrão do mapa',
      category: 'mapa',
      is_public: false,
      min_value: '1',
      max_value: '20'
    },
    {
      setting_key: 'map_max_markers',
      setting_value: '100',
      data_type: 'number',
      description: 'Máximo de marcadores no mapa',
      category: 'mapa',
      is_public: false,
      min_value: '10',
      max_value: '1000'
    }
  ]);
};

exports.down = function(knex) {
  return knex('system_settings')
    .whereIn('setting_key', [
      'app_name', 'app_version',
      'guincho_search_radius_km', 'guincho_proposal_expiry_minutes', 'guincho_max_proposals_per_request',
      'mecanico_monthly_fee', 'posto_combustivel_monthly_fee', 'auto_pecas_monthly_fee', 'subscription_grace_period_days',
      'delivery_base_fee', 'delivery_platform_fee_percent', 'delivery_motoboy_fee_percent', 'delivery_search_radius_km', 'delivery_max_distance_km',
      'emergency_base_commission_percent', 'min_payment_amount', 'max_payment_amount',
      'notification_ttl_hours', 'max_notifications_per_user',
      'map_default_zoom', 'map_max_markers'
    ])
    .del();
};

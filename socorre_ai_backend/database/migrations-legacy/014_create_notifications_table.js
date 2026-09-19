exports.up = function(knex) {
  return knex.schema.createTable('notifications', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    
    // Tipo de notificação
    table.enum('type', [
      'emergency_request_created',
      'emergency_request_accepted',
      'emergency_request_completed',
      'delivery_order_created',
      'delivery_order_accepted',
      'delivery_order_delivered',
      'purchase_order_created',
      'purchase_order_confirmed',
      'purchase_order_delivered',
      'partner_location_update',
      'payment_confirmed',
      'rating_received',
      'system_announcement',
      'promotion',
      'reminder'
    ]).notNullable();
    
    // Título e conteúdo
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.text('detailed_message'); // Mensagem mais detalhada
    
    // Dados relacionados
    table.integer('related_emergency_request_id').unsigned().references('id').inTable('emergency_requests').onDelete('CASCADE');
    table.integer('related_delivery_order_id').unsigned().references('id').inTable('delivery_orders').onDelete('CASCADE');
    table.integer('related_purchase_order_id').unsigned().references('id').inTable('purchase_orders').onDelete('CASCADE');
    table.integer('related_partner_id').unsigned().references('id').inTable('partners').onDelete('CASCADE');
    
    // Status da notificação
    table.boolean('is_read').defaultTo(false);
    table.boolean('is_sent').defaultTo(false);
    table.boolean('is_delivered').defaultTo(false);
    
    // Canais de envio
    table.boolean('push_enabled').defaultTo(true);
    table.boolean('sms_enabled').defaultTo(false);
    table.boolean('email_enabled').defaultTo(false);
    table.boolean('in_app_enabled').defaultTo(true);
    
    // Prioridade
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    
    // Agendamento
    table.datetime('scheduled_at'); // Para notificações agendadas
    table.datetime('sent_at');
    table.datetime('delivered_at');
    table.datetime('read_at');
    
    // Configurações
    table.text('action_data'); // JSON com dados para ações (botões, links, etc.)
    table.text('metadata'); // JSON com metadados adicionais
    table.string('image_url'); // URL da imagem da notificação
    table.string('sound'); // Som da notificação
    
    // Estatísticas
    table.integer('retry_count').defaultTo(0);
    table.text('error_message'); // Mensagem de erro se houver falha
    
    table.timestamps(true, true);
    
    // Índices
    table.index(['user_id', 'is_read']);
    table.index(['type', 'priority']);
    table.index(['is_sent', 'scheduled_at']);
    table.index(['related_emergency_request_id']);
    table.index(['related_delivery_order_id']);
    table.index(['related_purchase_order_id']);
    table.index(['created_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('notifications');
};

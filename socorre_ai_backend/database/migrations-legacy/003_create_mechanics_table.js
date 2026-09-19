exports.up = function(knex) {
  return knex.schema.createTable('mechanics', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('business_name').notNullable();
    table.text('description');
    table.text('specialties').notNullable(); // JSON array de especialidades
    table.text('address').notNullable();
    table.decimal('latitude', 10, 8);
    table.decimal('longitude', 11, 8);
    table.string('phone').notNullable();
    table.string('whatsapp');
    table.string('website');
    table.string('instagram');
    table.string('facebook');
    table.decimal('hourly_rate', 10, 2);
    table.decimal('service_fee', 10, 2);
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_available').defaultTo(true);
    table.text('working_hours'); // JSON com horários
    table.text('payment_methods'); // JSON array de métodos
    table.text('service_areas'); // JSON array de áreas atendidas
    table.integer('experience_years');
    table.text('certifications'); // JSON array de certificações
    table.text('insurance_info');
    table.text('warranty_info');
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(true);
    table.decimal('rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    table.timestamps(true, true);
    
    // Índices para performance
    table.index(['latitude', 'longitude']);
    table.index(['is_available', 'is_verified']);
    table.index(['specialties']);
    table.index(['rating']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('mechanics');
};

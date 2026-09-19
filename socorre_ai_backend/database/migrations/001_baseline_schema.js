/**
 * T01 — clean schema baseline.
 *
 * This migration REPLACES the 43-file legacy chain (`database/migrations-legacy/`)
 * with the single canonical description of the schema the backend needs. It was
 * generated from the audited final state of that chain and is proven equivalent
 * to it by `docs/evidence/t01/schema-legacy-vs-baseline.txt` (only the
 * intentional deltas listed in `docs/tow/T01-DATABASE-BASELINE-DECISION.md`
 * differ).
 *
 * Properties this file guarantees:
 *   - runs from a TRULY empty schema (no dependency on data created by an
 *     earlier migration, no data migration at all — the legacy
 *     `015_migrate_existing_data` backfill was archived with the chain);
 *   - deterministic: same statements in the same order on every fresh database;
 *   - no secret, no environment value, no application rule;
 *   - `down()` is the exact reverse (drops every table it created).
 *
 * Structural defaults (the `system_settings` rows the application reads) live in
 * `002_baseline_settings.js`, not here: structure and reference data are
 * separate concerns.
 *
 * INTENTIONAL DELTAS vs the legacy chain (justified in the decision doc):
 *   + wallet_transactions.dispute_id -> disputes(id) ON DELETE SET NULL and its
 *     index (the legacy chain left the column without any referential integrity,
 *     so an orphan dispute_id was accepted — proven in the RED evidence);
 *   - five plain indexes that exactly duplicate a unique constraint on the same
 *     column list (products.sku, system_settings.setting_key, wallets.user_id,
 *     wallets.partner_id, user_documents.(user_id, document_type)): PostgreSQL
 *     already serves those lookups through the unique index.
 */
'use strict';

/** Tables created by this migration, in creation order (reverse for `down`). */
const TABLES = [
  'users',
  'categories',
  'mechanics',
  'services',
  'appointments',
  'reviews',
  'chat_messages',
  'partners',
  'emergency_requests',
  'delivery_orders',
  'purchase_orders',
  'partner_services',
  'real_time_tracking',
  'notifications',
  'payments',
  'wallets',
  'wallet_transactions',
  'commissions',
  'disputes',
  'subscriptions',
  'tow_proposals',
  'system_settings',
  'products',
  'partner_documents',
  'subscription_history',
  'user_documents',
  'revoked_tokens',
];

exports.up = async function up(knex) {
  // ---------------------------------------------------------------- users ----
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.string('email', 100).notNullable().unique();
    table.string('password', 255).notNullable();
    table.string('phone', 20).nullable();
    table.enum('role', ['user', 'partner', 'admin']).defaultTo('user');
    table.string('cpf', 14).nullable();
    table.string('cnpj', 18).nullable();
    table.jsonb('address').nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('email_verified').defaultTo(false);
    table.string('firebase_token', 255).nullable();
    table.timestamps(true, true);
    table.string('fcm_token', 255).nullable();
    table.string('onboarding_partner_type', 50).nullable();
    table.string('onboarding_stage', 255).nullable();
    table.index(['fcm_token']);
  });
  // Case-insensitive uniqueness is a real integrity rule of the login flow
  // (legacy migration 043); it needs an expression index, hence raw SQL.
  await knex.raw('CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email))');

  // ----------------------------------------------------------- categories ----
  await knex.schema.createTable('categories', (table) => {
    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.string('icon', 50).nullable();
    table.string('color', 7).nullable();
    table.boolean('is_active').defaultTo(true);
    table.integer('sort_order').defaultTo(0);
    table.timestamps(true, true);
  });

  // ------------------------------------------------------------ mechanics ----
  await knex.schema.createTable('mechanics', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.string('business_name', 255).notNullable();
    table.text('description').nullable();
    table.text('specialties').notNullable();
    table.text('address').notNullable();
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
    table.string('phone', 255).notNullable();
    table.string('whatsapp', 255).nullable();
    table.string('website', 255).nullable();
    table.string('instagram', 255).nullable();
    table.string('facebook', 255).nullable();
    table.decimal('hourly_rate', 10, 2).nullable();
    table.decimal('service_fee', 10, 2).nullable();
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_available').defaultTo(true);
    table.text('working_hours').nullable();
    table.text('payment_methods').nullable();
    table.text('service_areas').nullable();
    table.integer('experience_years').nullable();
    table.text('certifications').nullable();
    table.text('insurance_info').nullable();
    table.text('warranty_info').nullable();
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(true);
    table.decimal('rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    table.timestamps(true, true);
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['is_available', 'is_verified']);
    table.index(['latitude', 'longitude']);
    table.index(['rating']);
    table.index(['specialties']);
  });

  // ------------------------------------------------------------- services ----
  await knex.schema.createTable('services', (table) => {
    table.increments('id').primary();
    table.integer('mechanic_id').unsigned().nullable();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.decimal('price', 10, 2).notNullable();
    table.string('price_type', 255).notNullable();
    table.integer('estimated_duration').nullable();
    table.boolean('is_available').defaultTo(true);
    table.string('category', 255).notNullable();
    table.string('subcategory', 255).nullable();
    table.boolean('warranty_included').defaultTo(false);
    table.integer('warranty_days').nullable();
    table.timestamps(true, true);
    table.foreign('mechanic_id').references('id').inTable('mechanics').onDelete('CASCADE');
    table.index(['category']);
    table.index(['is_available']);
    table.index(['mechanic_id']);
  });

  // --------------------------------------------------------- appointments ----
  await knex.schema.createTable('appointments', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.integer('mechanic_id').unsigned().nullable();
    table.integer('service_id').unsigned().nullable();
    table.timestamp('scheduled_date').notNullable();
    table.string('status', 255).notNullable().defaultTo('pending');
    table.text('description').nullable();
    table.text('vehicle_info').nullable();
    table.string('location_type', 255).notNullable();
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
    table.text('address').nullable();
    table.decimal('estimated_price', 10, 2).nullable();
    table.decimal('final_price', 10, 2).nullable();
    table.text('notes').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamps(true, true);
    table.foreign('mechanic_id').references('id').inTable('mechanics').onDelete('CASCADE');
    table.foreign('service_id').references('id').inTable('services').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['mechanic_id']);
    table.index(['scheduled_date']);
    table.index(['status']);
    table.index(['user_id']);
  });

  // -------------------------------------------------------------- reviews ----
  await knex.schema.createTable('reviews', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.integer('mechanic_id').unsigned().nullable();
    table.integer('appointment_id').unsigned().nullable();
    table.integer('rating').notNullable();
    table.text('comment').nullable();
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_public').defaultTo(true);
    table.timestamps(true, true);
    table.integer('partner_id').unsigned().nullable();
    table.string('entity_type', 50).nullable();
    table.integer('entity_id').unsigned().nullable();
    table.foreign('appointment_id').references('id').inTable('appointments').onDelete('SET NULL');
    table.foreign('mechanic_id').references('id').inTable('mechanics').onDelete('CASCADE');
    // `partner_id` points at a table created later in this file; the FK is added
    // in the circular-reference block at the end (legacy migration 038 did the
    // same through an ALTER).
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['created_at']);
    table.index(['entity_type', 'entity_id']);
    table.index(['mechanic_id']);
    table.index(['partner_id']);
    table.index(['rating']);
  });
  // One review per user per entity (legacy migration 039 replaced the old
  // user+mechanic unique with this partial unique).
  await knex.raw(
    'CREATE UNIQUE INDEX reviews_user_entity_unique ON reviews (user_id, entity_type, entity_id) ' +
    'WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL'
  );

  // -------------------------------------------------------- chat_messages ----
  await knex.schema.createTable('chat_messages', (table) => {
    table.increments('id').primary();
    table.integer('sender_id').unsigned().nullable();
    table.integer('receiver_id').unsigned().nullable();
    table.integer('appointment_id').unsigned().nullable();
    table.text('message').notNullable();
    table.string('message_type', 255).defaultTo('text');
    table.text('file_url').nullable();
    table.string('file_name', 255).nullable();
    table.string('file_size', 255).nullable();
    table.boolean('is_read').defaultTo(false);
    table.timestamp('read_at').nullable();
    table.timestamps(true, true);
    table.foreign('appointment_id').references('id').inTable('appointments').onDelete('SET NULL');
    table.foreign('receiver_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('sender_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['appointment_id']);
    table.index(['created_at']);
    table.index(['sender_id', 'receiver_id']);
  });

  // ------------------------------------------------------------- partners ----
  await knex.schema.createTable('partners', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.enum('type', ['mechanic', 'motoboy', 'store', 'gas_station', 'auto_parts', 'tow']).notNullable();
    table.string('business_name', 255).notNullable();
    table.text('description').nullable();
    table.text('specialties').nullable();
    table.text('address').notNullable();
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
    table.string('phone', 255).notNullable();
    table.string('whatsapp', 255).nullable();
    table.string('website', 255).nullable();
    table.string('instagram', 255).nullable();
    table.string('facebook', 255).nullable();
    table.decimal('hourly_rate', 10, 2).nullable();
    table.decimal('service_fee', 10, 2).nullable();
    table.decimal('delivery_fee', 10, 2).nullable();
    table.boolean('is_verified').defaultTo(false);
    table.boolean('is_available').defaultTo(true);
    table.boolean('is_online').defaultTo(false);
    table.text('working_hours').nullable();
    table.text('payment_methods').nullable();
    table.text('service_areas').nullable();
    table.integer('experience_years').nullable();
    table.text('certifications').nullable();
    table.text('insurance_info').nullable();
    table.text('warranty_info').nullable();
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(true);
    table.boolean('delivery_service').defaultTo(false);
    table.decimal('service_radius', 5, 2).defaultTo(10);
    table.decimal('delivery_radius', 5, 2).defaultTo(15);
    table.string('vehicle_type', 255).nullable();
    table.string('license_plate', 255).nullable();
    table.string('cnh_number', 255).nullable();
    table.string('cnh_category', 255).nullable();
    table.text('store_categories').nullable();
    table.boolean('has_delivery').defaultTo(false);
    table.decimal('min_order_value', 10, 2).nullable();
    table.integer('delivery_time_minutes').nullable();
    table.decimal('rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    table.integer('total_services').defaultTo(0);
    table.integer('total_emergencies').defaultTo(0);
    table.integer('total_deliveries').defaultTo(0);
    table.integer('total_sales').defaultTo(0);
    table.timestamps(true, true);
    table.string('approval_status', 255).defaultTo('pending');
    table.timestamp('approved_at').nullable();
    table.integer('approved_by').unsigned().nullable();
    table.text('rejection_reason').nullable();
    table.foreign('approved_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['is_online']);
    table.index(['latitude', 'longitude']);
    table.index(['rating']);
    table.index(['type', 'is_available', 'is_verified']);
    table.index(['type', 'specialties']);
  });

  // --------------------------------------------------- emergency_requests ----
  await knex.schema.createTable('emergency_requests', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.enum('type', ['mechanical', 'fuel', 'tire', 'battery', 'other']).notNullable();
    table.text('description').notNullable();
    table.text('photos').nullable();
    table.text('vehicle_info').nullable();
    table.string('vehicle_plate', 255).nullable();
    table.string('vehicle_model', 255).nullable();
    table.string('vehicle_year', 255).nullable();
    table.string('vehicle_color', 255).nullable();
    table.enum('location_type', ['roadside', 'parking', 'home', 'other']).notNullable();
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.text('address').notNullable();
    table.text('landmarks').nullable();
    table.enum('status', ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'expired'])
      .defaultTo('pending');
    table.integer('partner_id').unsigned().nullable();
    table.integer('accepted_by').unsigned().nullable();
    table.decimal('estimated_price', 10, 2).nullable();
    table.decimal('final_price', 10, 2).nullable();
    table.text('price_breakdown').nullable();
    table.timestamp('accepted_at').nullable();
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.integer('estimated_duration_minutes').nullable();
    table.integer('actual_duration_minutes').nullable();
    table.text('notes').nullable();
    table.text('solution_description').nullable();
    table.text('parts_used').nullable();
    table.text('warranty_info').nullable();
    table.enum('urgency', ['low', 'medium', 'high', 'critical']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    table.integer('rating').nullable();
    table.text('review_comment').nullable();
    table.timestamp('reviewed_at').nullable();
    table.integer('view_count').defaultTo(0);
    table.integer('response_count').defaultTo(0);
    table.timestamps(true, true);
    // Tow flow columns (legacy migrations 036/045).
    table.text('request_type').nullable();
    table.text('proposal_status').nullable();
    table.timestamp('proposal_selection_deadline').nullable();
    table.integer('max_proposals').defaultTo(0);
    table.integer('proposals_received').defaultTo(0);
    table.timestamp('first_proposal_at').nullable();
    table.timestamp('last_proposal_at').nullable();
    table.decimal('search_radius_km', 8, 2).nullable();
    table.integer('selected_proposal_id').unsigned().nullable();
    table.text('cancellation_reason').nullable();
    table.text('cancellation_by').nullable();
    table.timestamp('cancelled_at').nullable();
    table.text('vehicle_origin_address').nullable();
    table.decimal('vehicle_origin_latitude', 10, 8).nullable();
    table.decimal('vehicle_origin_longitude', 11, 8).nullable();
    table.text('vehicle_destination_address').nullable();
    table.decimal('vehicle_destination_latitude', 10, 8).nullable();
    table.decimal('vehicle_destination_longitude', 11, 8).nullable();
    table.string('vehicle_type', 255).nullable();
    table.text('vehicle_notes').nullable();
    table.text('pickup_photo_url').nullable();
    table.text('delivery_photo_url').nullable();
    table.text('pickup_photo_metadata').nullable();
    table.text('delivery_photo_metadata').nullable();
    table.foreign('accepted_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['latitude', 'longitude']);
    table.index(['partner_id']);
    table.index(['status', 'created_at']);
    table.index(['type', 'status']);
    table.index(['urgency', 'is_urgent']);
    table.index(['user_id']);
  });

  // ------------------------------------------------------ delivery_orders ----
  await knex.schema.createTable('delivery_orders', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.integer('motoboy_id').unsigned().nullable();
    table.enum('type', ['fuel', 'parts', 'food', 'other']).notNullable();
    table.text('items').nullable();
    table.text('items_description').nullable();
    table.text('pickup_location').nullable();
    table.decimal('pickup_latitude', 10, 8).nullable();
    table.decimal('pickup_longitude', 11, 8).nullable();
    table.text('pickup_address').nullable();
    table.text('pickup_instructions').nullable();
    table.text('delivery_location').nullable();
    table.decimal('delivery_latitude', 10, 8).nullable();
    table.decimal('delivery_longitude', 11, 8).nullable();
    table.text('delivery_address').nullable();
    table.text('delivery_instructions').nullable();
    table.enum('status', ['pending', 'accepted', 'picked_up', 'in_transit', 'delivered', 'cancelled'])
      .defaultTo('pending');
    table.decimal('delivery_fee', 10, 2).nullable();
    table.decimal('items_price', 10, 2).nullable();
    table.decimal('total_price', 10, 2).nullable();
    table.text('price_breakdown').nullable();
    table.timestamp('accepted_at').nullable();
    table.timestamp('picked_up_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.integer('estimated_delivery_minutes').nullable();
    table.integer('actual_delivery_minutes').nullable();
    table.text('fuel_info').nullable();
    table.text('parts_info').nullable();
    table.text('store_info').nullable();
    table.enum('urgency', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    table.enum('payment_method', ['cash', 'card', 'pix', 'app']).defaultTo('cash');
    table.enum('payment_status', ['pending', 'paid', 'refunded']).defaultTo('pending');
    table.timestamp('paid_at').nullable();
    table.integer('rating').nullable();
    table.text('review_comment').nullable();
    table.timestamp('reviewed_at').nullable();
    table.text('notes').nullable();
    table.text('delivery_proof').nullable();
    table.text('tracking_info').nullable();
    table.decimal('distance_km', 8, 2).nullable();
    table.integer('view_count').defaultTo(0);
    table.integer('response_count').defaultTo(0);
    table.timestamps(true, true);
    table.foreign('motoboy_id').references('id').inTable('partners').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['delivery_latitude', 'delivery_longitude']);
    table.index(['motoboy_id']);
    table.index(['status', 'created_at']);
    table.index(['type', 'status']);
    table.index(['urgency', 'is_urgent']);
    table.index(['user_id']);
  });

  // ------------------------------------------------------ purchase_orders ----
  await knex.schema.createTable('purchase_orders', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.integer('store_id').unsigned().nullable();
    table.enum('type', ['emergency', 'regular', 'scheduled']).notNullable();
    table.text('items').nullable();
    table.text('items_description').nullable();
    table.integer('total_items_quantity').nullable();
    table.decimal('subtotal', 10, 2).nullable();
    table.decimal('delivery_fee', 10, 2).nullable();
    table.decimal('taxes', 10, 2).nullable();
    table.decimal('discount', 10, 2).nullable();
    table.decimal('total_price', 10, 2).nullable();
    table.text('price_breakdown').nullable();
    table.enum('status', ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'refunded'])
      .defaultTo('pending');
    table.text('delivery_address').nullable();
    table.decimal('delivery_latitude', 10, 8).nullable();
    table.decimal('delivery_longitude', 11, 8).nullable();
    table.text('delivery_instructions').nullable();
    table.string('delivery_contact_name', 255).nullable();
    table.string('delivery_contact_phone', 255).nullable();
    table.boolean('has_delivery').defaultTo(true);
    table.integer('estimated_delivery_minutes').nullable();
    table.timestamp('scheduled_delivery_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.integer('actual_delivery_minutes').nullable();
    table.integer('delivery_motoboy_id').unsigned().nullable();
    table.enum('payment_method', ['cash', 'card', 'pix', 'app']).defaultTo('cash');
    table.enum('payment_status', ['pending', 'paid', 'refunded']).defaultTo('pending');
    table.timestamp('paid_at').nullable();
    table.text('payment_info').nullable();
    table.enum('urgency', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    table.integer('rating').nullable();
    table.text('review_comment').nullable();
    table.timestamp('reviewed_at').nullable();
    table.text('notes').nullable();
    table.text('special_instructions').nullable();
    table.text('delivery_proof').nullable();
    table.text('invoice_info').nullable();
    table.integer('view_count').defaultTo(0);
    table.integer('response_count').defaultTo(0);
    table.integer('emergency_request_id').unsigned().nullable();
    table.timestamps(true, true);
    table.foreign('delivery_motoboy_id').references('id').inTable('partners').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('store_id').references('id').inTable('partners').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['delivery_latitude', 'delivery_longitude']);
    table.index(['delivery_motoboy_id']);
    table.index(['emergency_request_id']);
    table.index(['status', 'created_at']);
    table.index(['store_id']);
    table.index(['type', 'status']);
    table.index(['urgency', 'is_urgent']);
    table.index(['user_id']);
  });

  // ------------------------------------------------------ partner_services ----
  await knex.schema.createTable('partner_services', (table) => {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().nullable();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.text('detailed_description').nullable();
    table.decimal('price', 10, 2).nullable();
    table.enum('price_type', ['fixed', 'hourly', 'per_item', 'negotiable']).defaultTo('fixed');
    table.decimal('min_price', 10, 2).nullable();
    table.decimal('max_price', 10, 2).nullable();
    table.integer('estimated_duration_minutes').nullable();
    table.boolean('is_available').defaultTo(true);
    table.boolean('emergency_service').defaultTo(false);
    table.boolean('home_service').defaultTo(false);
    table.boolean('workshop_service').defaultTo(true);
    table.string('category', 255).notNullable();
    table.string('subcategory', 255).nullable();
    table.text('tags').nullable();
    table.text('specialties').nullable();
    table.text('required_tools').nullable();
    table.text('required_parts').nullable();
    table.text('technical_requirements').nullable();
    table.text('warranty_info').nullable();
    table.integer('warranty_days').nullable();
    table.integer('total_orders').defaultTo(0);
    table.integer('completed_orders').defaultTo(0);
    table.integer('cancelled_orders').defaultTo(0);
    table.decimal('average_rating', 3, 2).defaultTo(0);
    table.integer('total_reviews').defaultTo(0);
    table.boolean('requires_approval').defaultTo(false);
    table.boolean('is_featured').defaultTo(false);
    table.integer('sort_order').defaultTo(0);
    table.text('service_hours').nullable();
    table.text('unavailable_dates').nullable();
    table.text('images').nullable();
    table.text('before_after_images').nullable();
    table.timestamps(true, true);
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.index(['average_rating']);
    table.index(['category', 'subcategory']);
    table.index(['is_available', 'emergency_service']);
    table.index(['is_featured', 'sort_order']);
    table.index(['partner_id']);
    table.index(['price_type', 'price']);
  });

  // --------------------------------------------------- real_time_tracking ----
  await knex.schema.createTable('real_time_tracking', (table) => {
    table.increments('id').primary();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    table.integer('user_id').unsigned().nullable();
    table.integer('partner_id').unsigned().nullable();
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.text('address').nullable();
    table.decimal('accuracy', 8, 2).nullable();
    table.decimal('speed', 8, 2).nullable();
    table.decimal('heading', 5, 2).nullable();
    table.enum('status', ['waiting', 'en_route', 'arrived', 'working', 'completed']).defaultTo('waiting');
    table.text('status_message').nullable();
    table.timestamp('last_updated').notNullable();
    table.integer('update_interval_seconds').defaultTo(30);
    table.integer('estimated_arrival_minutes').nullable();
    table.decimal('estimated_distance_km', 8, 2).nullable();
    table.text('route_info').nullable();
    table.text('location_history').nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('user_notifications_enabled').defaultTo(true);
    table.boolean('partner_notifications_enabled').defaultTo(true);
    table.text('notes').nullable();
    table.text('metadata').nullable();
    table.timestamps(true, true);
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('CASCADE');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['delivery_order_id']);
    table.index(['emergency_request_id']);
    table.index(['last_updated']);
    table.index(['latitude', 'longitude']);
    table.index(['purchase_order_id']);
    table.index(['status', 'is_active']);
    table.index(['user_id', 'partner_id']);
  });

  // --------------------------------------------------------- notifications ----
  await knex.schema.createTable('notifications', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().nullable();
    table.enum('type', [
      'emergency_request_created', 'emergency_request_accepted', 'emergency_request_completed',
      'delivery_order_created', 'delivery_order_accepted', 'delivery_order_delivered',
      'purchase_order_created', 'purchase_order_confirmed', 'purchase_order_delivered',
      'partner_location_update', 'payment_confirmed', 'rating_received',
      'system_announcement', 'promotion', 'reminder',
    ]).notNullable();
    table.string('title', 255).notNullable();
    table.text('message').notNullable();
    table.text('detailed_message').nullable();
    table.integer('related_emergency_request_id').unsigned().nullable();
    table.integer('related_delivery_order_id').unsigned().nullable();
    table.integer('related_purchase_order_id').unsigned().nullable();
    table.integer('related_partner_id').unsigned().nullable();
    table.boolean('is_read').defaultTo(false);
    table.boolean('is_sent').defaultTo(false);
    table.boolean('is_delivered').defaultTo(false);
    table.boolean('push_enabled').defaultTo(true);
    table.boolean('sms_enabled').defaultTo(false);
    table.boolean('email_enabled').defaultTo(false);
    table.boolean('in_app_enabled').defaultTo(true);
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.boolean('is_urgent').defaultTo(false);
    table.timestamp('scheduled_at').nullable();
    table.timestamp('sent_at').nullable();
    table.timestamp('delivered_at').nullable();
    table.timestamp('read_at').nullable();
    table.text('action_data').nullable();
    table.text('metadata').nullable();
    table.string('image_url', 255).nullable();
    table.string('sound', 255).nullable();
    table.integer('retry_count').defaultTo(0);
    table.text('error_message').nullable();
    table.timestamps(true, true);
    table.foreign('related_delivery_order_id').references('id').inTable('delivery_orders').onDelete('CASCADE');
    table.foreign('related_emergency_request_id').references('id').inTable('emergency_requests').onDelete('CASCADE');
    table.foreign('related_partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('related_purchase_order_id').references('id').inTable('purchase_orders').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['created_at']);
    table.index(['is_sent', 'scheduled_at']);
    table.index(['related_delivery_order_id']);
    table.index(['related_emergency_request_id']);
    table.index(['related_purchase_order_id']);
    table.index(['type', 'priority']);
    table.index(['user_id', 'is_read']);
  });

  // -------------------------------------------------------------- payments ----
  await knex.schema.createTable('payments', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().nullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    table.decimal('amount', 10, 2).notNullable();
    table.string('currency', 3).defaultTo('BRL');
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'])
      .defaultTo('pending');
    table.enum('method', ['credit_card', 'debit_card', 'pix', 'bank_slip', 'cash', 'bank_transfer']).notNullable();
    table.string('gateway', 255).notNullable();
    table.string('gateway_transaction_id', 255).nullable();
    table.string('gateway_payment_id', 255).nullable();
    table.json('gateway_response').nullable();
    table.text('description').nullable();
    table.string('reference_id', 255).nullable();
    table.decimal('fee_amount', 10, 2).defaultTo(0);
    table.decimal('net_amount', 10, 2).nullable();
    table.string('card_last_four', 255).nullable();
    table.string('card_brand', 255).nullable();
    table.string('card_exp_month', 255).nullable();
    table.string('card_exp_year', 255).nullable();
    table.string('pix_code', 255).nullable();
    table.string('pix_qr_code', 255).nullable();
    table.timestamp('pix_expires_at').nullable();
    table.string('bank_slip_code', 255).nullable();
    table.string('bank_slip_url', 255).nullable();
    table.timestamp('bank_slip_expires_at').nullable();
    table.timestamp('processed_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('cancelled_at').nullable();
    table.timestamp('refunded_at').nullable();
    table.timestamps(true, true);
    table.text('payment_type').defaultTo('emergency_service');
    table.integer('subscription_id').unsigned().nullable();
    table.integer('tow_proposal_id').unsigned().nullable();
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('SET NULL');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['created_at']);
    table.index(['gateway_transaction_id']);
    table.index(['method']);
    table.index(['partner_id']);
    table.index(['payment_type']);
    table.index(['status']);
    table.index(['subscription_id']);
    table.index(['tow_proposal_id']);
    table.index(['user_id']);
  });

  // --------------------------------------------------------------- wallets ----
  await knex.schema.createTable('wallets', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().nullable();
    table.decimal('available_balance', 10, 2).defaultTo(0);
    table.decimal('pending_balance', 10, 2).defaultTo(0);
    table.decimal('total_earned', 10, 2).defaultTo(0);
    table.decimal('total_withdrawn', 10, 2).defaultTo(0);
    table.string('pix_key', 255).nullable();
    table.string('bank_name', 255).nullable();
    table.string('bank_agency', 255).nullable();
    table.string('bank_account', 255).nullable();
    table.enum('account_type', ['checking', 'savings']).nullable();
    table.string('account_holder_name', 255).nullable();
    table.string('account_holder_document', 255).nullable();
    table.decimal('platform_commission_rate', 5, 2).defaultTo(25);
    table.boolean('is_active').defaultTo(true);
    table.boolean('withdrawal_enabled').defaultTo(false);
    table.timestamps(true, true);
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.unique(['user_id']);
    table.unique(['partner_id']);
    table.index(['is_active']);
  });

  // -------------------------------------------------- wallet_transactions ----
  await knex.schema.createTable('wallet_transactions', (table) => {
    table.increments('id').primary();
    table.integer('wallet_id').unsigned().notNullable();
    table.enum('type', ['deposit', 'withdrawal', 'refund', 'commission', 'adjustment', 'fee']).notNullable();
    table.enum('direction', ['credit', 'debit']).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.decimal('balance_before', 10, 2).notNullable();
    table.decimal('balance_after', 10, 2).notNullable();
    table.integer('payment_id').unsigned().nullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    table.integer('dispute_id').unsigned().nullable();
    table.text('description').nullable();
    table.text('metadata').nullable();
    table.enum('status', ['pending', 'completed', 'failed', 'cancelled']).defaultTo('pending');
    table.timestamp('processed_at').nullable();
    table.timestamps(true, true);
    table.foreign('wallet_id').references('id').inTable('wallets').onDelete('CASCADE');
    table.foreign('payment_id').references('id').inTable('payments').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    table.index(['wallet_id']);
    table.index(['type']);
    table.index(['status']);
    table.index(['created_at']);
    table.index(['payment_id']);
    // T01 delta: the dispute link is a real reference and gets its own index.
    table.index(['dispute_id']);
  });

  // ----------------------------------------------------------- commissions ----
  await knex.schema.createTable('commissions', (table) => {
    table.increments('id').primary();
    table.integer('payment_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    table.decimal('total_amount', 10, 2).notNullable();
    table.decimal('platform_commission', 10, 2).notNullable();
    table.decimal('partner_earnings', 10, 2).notNullable();
    table.decimal('commission_rate', 5, 2).notNullable();
    table.decimal('gateway_fee', 10, 2).defaultTo(0);
    table.decimal('processing_fee', 10, 2).defaultTo(0);
    table.enum('status', ['pending', 'processed', 'paid', 'cancelled']).defaultTo('pending');
    table.timestamp('paid_at').nullable();
    table.integer('withdrawal_transaction_id').unsigned().nullable();
    table.timestamps(true, true);
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    table.foreign('withdrawal_transaction_id').references('id').inTable('wallet_transactions').onDelete('SET NULL');
    table.index(['created_at']);
    table.index(['partner_id']);
    table.index(['payment_id']);
    table.index(['status']);
  });

  // -------------------------------------------------------------- disputes ----
  await knex.schema.createTable('disputes', (table) => {
    table.increments('id').primary();
    table.integer('payment_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.integer('partner_id').unsigned().notNullable();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('delivery_order_id').unsigned().nullable();
    table.integer('purchase_order_id').unsigned().nullable();
    table.enum('type', ['refund_request', 'quality_issue', 'service_not_delivered', 'fraud', 'other']).notNullable();
    table.enum('initiated_by', ['user', 'partner', 'platform']).notNullable();
    table.text('reason').notNullable();
    table.text('description').nullable();
    table.enum('status', ['open', 'under_review', 'resolved', 'rejected', 'cancelled']).defaultTo('open');
    table.enum('resolution', ['refund_full', 'refund_partial', 'no_action', 'service_redelivery']).nullable();
    table.decimal('disputed_amount', 10, 2).notNullable();
    table.decimal('refund_amount', 10, 2).nullable();
    table.text('evidence').nullable();
    table.text('partner_response').nullable();
    table.text('platform_notes').nullable();
    table.integer('resolved_by').unsigned().nullable();
    table.text('resolution_notes').nullable();
    table.timestamp('resolved_at').nullable();
    table.enum('priority', ['low', 'medium', 'high', 'urgent']).defaultTo('medium');
    table.timestamps(true, true);
    table.foreign('delivery_order_id').references('id').inTable('delivery_orders').onDelete('SET NULL');
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('SET NULL');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('payment_id').references('id').inTable('payments').onDelete('CASCADE');
    table.foreign('purchase_order_id').references('id').inTable('purchase_orders').onDelete('SET NULL');
    table.foreign('resolved_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['created_at']);
    table.index(['partner_id']);
    table.index(['payment_id']);
    table.index(['priority']);
    table.index(['status']);
    table.index(['user_id']);
  });

  // --------------------------------------------------------- subscriptions ----
  await knex.schema.createTable('subscriptions', (table) => {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().nullable();
    table.enum('type', ['mecanico', 'posto_combustivel', 'auto_pecas']).notNullable();
    table.decimal('monthly_fee', 10, 2).notNullable();
    table.date('due_date').notNullable();
    table.date('next_billing_date').notNullable();
    table.enum('status', ['active', 'expired', 'cancelled', 'pending_payment', 'suspended']).defaultTo('pending_payment');
    table.string('payment_method', 255).nullable();
    table.string('payment_gateway', 255).nullable();
    table.string('gateway_subscription_id', 255).nullable();
    table.boolean('auto_renew').defaultTo(true);
    table.json('billing_address').nullable();
    table.text('notes').nullable();
    table.integer('failed_attempts').defaultTo(0);
    table.timestamp('last_payment_attempt').nullable();
    table.timestamp('last_successful_payment').nullable();
    table.timestamps(true, true);
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.index(['due_date']);
    table.index(['next_billing_date']);
    table.index(['partner_id']);
    table.index(['status']);
    table.index(['type']);
  });

  // -------------------------------------------------------- tow_proposals ----
  await knex.schema.createTable('tow_proposals', (table) => {
    table.increments('id').primary();
    table.integer('emergency_request_id').unsigned().nullable();
    table.integer('partner_id').unsigned().nullable();
    table.decimal('proposed_price', 10, 2).notNullable();
    table.integer('estimated_time_minutes').notNullable();
    table.text('message').nullable();
    table.string('tow_truck_type', 255).nullable();
    table.integer('tow_capacity_kg').nullable();
    table.boolean('has_winch').defaultTo(false);
    table.string('equipment_details', 255).nullable();
    table.enum('status', ['pending', 'accepted', 'rejected', 'expired', 'withdrawn']).defaultTo('pending');
    table.timestamp('expires_at').notNullable();
    table.timestamp('accepted_at').nullable();
    table.timestamp('responded_at').nullable();
    table.integer('view_count').defaultTo(0);
    table.timestamp('last_viewed_at').nullable();
    table.decimal('partner_distance_km', 5, 2).nullable();
    table.integer('partner_eta_minutes').nullable();
    table.timestamps(true, true);
    table.foreign('emergency_request_id').references('id').inTable('emergency_requests').onDelete('CASCADE');
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.index(['created_at']);
    table.index(['emergency_request_id']);
    table.index(['emergency_request_id', 'status']);
    table.index(['expires_at']);
    table.index(['partner_id']);
    table.index(['status']);
  });
  // One PENDING proposal per partner per request (legacy migration 044).
  await knex.raw(
    "CREATE UNIQUE INDEX tow_proposals_one_pending_per_partner ON tow_proposals (emergency_request_id, partner_id) " +
    "WHERE status = 'pending'"
  );

  // ------------------------------------------------------ system_settings ----
  await knex.schema.createTable('system_settings', (table) => {
    table.increments('id').primary();
    table.string('setting_key', 100).notNullable().unique();
    table.text('setting_value').nullable();
    table.string('data_type', 255).defaultTo('string');
    table.text('description').nullable();
    table.enum('category', [
      'general', 'guincho', 'assinatura', 'delivery', 'pagamentos', 'notificacoes', 'mapa',
    ]).defaultTo('general');
    table.boolean('is_public').defaultTo(false);
    table.boolean('is_editable').defaultTo(true);
    table.string('validation_rules', 255).nullable();
    table.text('default_value').nullable();
    table.text('min_value').nullable();
    table.text('max_value').nullable();
    table.integer('updated_by').unsigned().nullable();
    table.string('updated_by_role', 255).nullable();
    table.timestamps(true, true);
    table.foreign('updated_by').references('id').inTable('users').onDelete('SET NULL');
    table.index(['category']);
    table.index(['is_public']);
  });

  // -------------------------------------------------------------- products ----
  await knex.schema.createTable('products', (table) => {
    table.increments('id').primary();
    table.integer('store_id').unsigned().nullable();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.string('sku', 100).nullable().unique();
    table.string('barcode', 100).nullable();
    table.string('category', 100).nullable();
    table.string('subcategory', 100).nullable();
    table.enum('product_type', ['simple', 'variable', 'bundle']).defaultTo('simple');
    table.decimal('price', 10, 2).notNullable();
    table.decimal('cost_price', 10, 2).nullable();
    table.decimal('sale_price', 10, 2).nullable();
    table.decimal('wholesale_price', 10, 2).nullable();
    table.integer('stock').defaultTo(0);
    table.integer('min_stock').defaultTo(0);
    table.integer('max_stock').nullable();
    table.boolean('track_stock').defaultTo(true);
    table.boolean('allow_backorder').defaultTo(false);
    table.decimal('weight', 8, 3).nullable();
    table.decimal('length', 8, 2).nullable();
    table.decimal('width', 8, 2).nullable();
    table.decimal('height', 8, 2).nullable();
    table.json('images').nullable();
    table.string('featured_image', 500).nullable();
    table.json('attributes').nullable();
    table.json('specifications').nullable();
    table.json('compatibility').nullable();
    table.string('slug', 255).nullable();
    table.text('meta_title').nullable();
    table.text('meta_description').nullable();
    table.json('tags').nullable();
    table.boolean('is_active').defaultTo(true);
    table.boolean('is_featured').defaultTo(false);
    table.boolean('is_digital').defaultTo(false);
    table.integer('view_count').defaultTo(0);
    table.integer('sales_count').defaultTo(0);
    table.decimal('rating_average', 3, 2).defaultTo(0);
    table.integer('rating_count').defaultTo(0);
    table.string('fuel_type', 255).nullable();
    table.decimal('fuel_liters', 8, 3).nullable();
    table.timestamps(true, true);
    table.foreign('store_id').references('id').inTable('partners').onDelete('CASCADE');
    table.index(['barcode']);
    table.index(['category']);
    table.index(['description']);
    table.index(['is_active']);
    table.index(['is_featured']);
    table.index(['name']);
    table.index(['price']);
    table.index(['name', 'description'], 'products_search_index');
    table.index(['slug']);
    table.index(['stock']);
    table.index(['store_id']);
  });

  // ---------------------------------------------------- partner_documents ----
  await knex.schema.createTable('partner_documents', (table) => {
    table.increments('id').primary();
    table.integer('partner_id').unsigned().notNullable();
    table.string('document_type', 255).notNullable();
    table.string('filename', 255).notNullable();
    table.string('original_name', 255).notNullable();
    table.string('file_path', 255).notNullable();
    table.string('mime_type', 255).notNullable();
    table.integer('file_size').notNullable();
    table.string('status', 255).defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.json('verification_metadata').nullable();
    table.timestamp('uploaded_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('verified_at').nullable();
    table.integer('verified_by').unsigned().nullable();
    table.timestamps(true, true);
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('verified_by').references('id').inTable('users').onDelete('SET NULL');
    table.index(['partner_id', 'document_type']);
    table.index(['status']);
  });

  // -------------------------------------------------- subscription_history ----
  await knex.schema.createTable('subscription_history', (table) => {
    table.increments('id').primary();
    table.integer('subscription_id').unsigned().nullable();
    table.integer('partner_id').unsigned().nullable();
    table.enum('action', [
      'created', 'paid', 'expired', 'cancelled', 'renewed', 'suspended',
      'reactivated', 'payment_failed', 'method_changed',
    ]).notNullable();
    table.decimal('amount', 10, 2).nullable();
    table.decimal('previous_amount', 10, 2).nullable();
    table.string('currency', 3).defaultTo('BRL');
    table.integer('payment_id').unsigned().nullable();
    table.string('gateway_transaction_id', 255).nullable();
    table.string('payment_method', 255).nullable();
    table.date('billing_period_start').nullable();
    table.date('billing_period_end').nullable();
    table.date('next_billing_date').nullable();
    table.text('reason').nullable();
    table.text('admin_notes').nullable();
    table.text('system_notes').nullable();
    table.string('previous_status', 255).nullable();
    table.string('new_status', 255).nullable();
    table.integer('performed_by').unsigned().nullable();
    table.string('performed_by_role', 255).nullable();
    table.string('ip_address', 255).nullable();
    table.string('user_agent', 255).nullable();
    table.json('metadata').nullable();
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now());
    table.foreign('partner_id').references('id').inTable('partners').onDelete('CASCADE');
    table.foreign('payment_id').references('id').inTable('payments').onDelete('SET NULL');
    table.foreign('performed_by').references('id').inTable('users').onDelete('SET NULL');
    table.foreign('subscription_id').references('id').inTable('subscriptions').onDelete('CASCADE');
    table.index(['action']);
    table.index(['created_at']);
    table.index(['partner_id', 'created_at']);
    table.index(['partner_id']);
    table.index(['payment_id']);
    table.index(['performed_by']);
    table.index(['subscription_id']);
  });

  // ------------------------------------------------------- user_documents ----
  await knex.schema.createTable('user_documents', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable();
    table.string('document_type', 255).notNullable();
    table.string('filename', 255).notNullable();
    table.string('original_name', 255).notNullable();
    table.string('file_path', 255).notNullable();
    table.string('mime_type', 255).notNullable();
    table.integer('file_size').notNullable();
    table.enum('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.integer('verified_by').unsigned().nullable();
    table.timestamp('uploaded_at').nullable().defaultTo(knex.fn.now());
    table.timestamp('verified_at').nullable();
    table.timestamps(true, true);
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('verified_by').references('id').inTable('users').onDelete('SET NULL');
    // The unique constraint already indexes (user_id, document_type); the
    // legacy chain created a redundant plain index for the same columns.
    table.unique(['user_id', 'document_type']);
  });

  // -------------------------------------------------------- revoked_tokens ----
  await knex.schema.createTable('revoked_tokens', (table) => {
    table.string('token_hash', 64).primary();
    table.integer('user_id').unsigned().notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.index(['expires_at']);
  });

  // ------------------------------------------------- circular references ----
  // These four columns point at tables created later in the sequence above
  // (or that point back at `emergency_requests`), so the constraints are added
  // once every table exists — same effect as the legacy ALTER-based migrations.
  await knex.schema.alterTable('emergency_requests', (table) => {
    table.foreign('selected_proposal_id').references('id').inTable('tow_proposals').onDelete('SET NULL');
  });
  await knex.schema.alterTable('reviews', (table) => {
    table.foreign('partner_id').references('id').inTable('partners').onDelete('SET NULL');
  });
  await knex.schema.alterTable('payments', (table) => {
    table.foreign('subscription_id').references('id').inTable('subscriptions').onDelete('SET NULL');
    table.foreign('tow_proposal_id').references('id').inTable('tow_proposals').onDelete('SET NULL');
  });
  await knex.schema.alterTable('wallet_transactions', (table) => {
    table.foreign('dispute_id').references('id').inTable('disputes').onDelete('SET NULL');
  });
};

exports.down = async function down(knex) {
  for (const table of [...TABLES].reverse()) {
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.dropTableIfExists(table);
  }
};

module.exports.TABLES = TABLES;

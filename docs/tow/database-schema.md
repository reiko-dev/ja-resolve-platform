# T01 — Schema do Baseline (PostgreSQL)

> Artefato derivado de `docs/evidence/t01/schema-baseline.json` (snapshot do banco real).
> Fingerprint do schema: `0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926`
> Decisão que originou este schema: `docs/tow/T01-DATABASE-BASELINE-DECISION.md`.

O schema é criado do zero por `database/migrations/001_baseline_schema.js` (estrutura) e
`database/migrations/002_baseline_settings.js` (25 linhas estruturais de `system_settings`).
Nenhuma tabela ou coluna de Tow v1 (T02+) existe aqui.

## 1. Totais

| Métrica | Valor |
| --- | --- |
| Tabelas | 29 |
| Colunas | 692 |
| Chaves estrangeiras | 77 |
| Constraints UNIQUE | 6 |
| Constraints CHECK | 39 |
| Índices (inclui PK/UNIQUE) | 163 |
| Enums nativos | 0 |
| Sequences | 28 |

## 2. Mapa de dependências

```
users ─┬─< revoked_tokens                     (CASCADE)
       ├─< mechanics ──< services             (CASCADE)
       ├─< appointments >── services/mechanics
       ├─< reviews
       ├─< chat_messages
       ├─< notifications
       ├─< user_documents
       ├─< partners ─┬─< partner_services
       │             ├─< partner_documents
       │             ├─< products
       │             ├─< subscriptions ──< subscription_history
       │             ├─< wallets
       │             └─< commissions / disputes / reviews.partner_id
       ├─< emergency_requests ─┬─< tow_proposals
       │                       └─> selected_proposal_id (FK circular, SET NULL)
       ├─< delivery_orders
       ├─< purchase_orders
       ├─< payments ──< wallet_transactions / disputes
       └─< wallets ──< wallet_transactions ──> dispute_id (FK circular, SET NULL)

system_settings ──> users.updated_by (SET NULL)   [configuração, sem dono funcional]
categories      (catálogo independente)
knex_migrations / knex_migrations_lock            [controle do Knex]
```

Três FKs são **circulares** e por isso são criadas em um bloco `ALTER TABLE` depois de todas
as tabelas: `wallet_transactions.dispute_id → disputes`, `emergency_requests.selected_proposal_id
→ tow_proposals` e `payments.subscription_id/tow_proposal_id`. Todas usam `ON DELETE SET NULL`
para não transformar a remoção de uma linha em cascata destrutiva.

## 3. Listagem por domínio

### Identidade e acesso

#### `users`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('users_id_seq'::regclass)` |
| `name` | character varying(100) | não | — |
| `email` | character varying(100) | não | — |
| `password` | character varying(255) | não | — |
| `phone` | character varying(20) | sim | — |
| `role` | text | sim | `'user'::text` |
| `cpf` | character varying(14) | sim | — |
| `cnpj` | character varying(18) | sim | — |
| `address` | jsonb | sim | — |
| `is_active` | boolean | sim | `true` |
| `email_verified` | boolean | sim | `false` |
| `firebase_token` | character varying(255) | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `fcm_token` | character varying(255) | sim | — |
| `onboarding_partner_type` | character varying(50) | sim | — |
| `onboarding_stage` | character varying(255) | sim | — |

- **PK**: `users_pkey`
- **UNIQUE**: `users_email_unique` (email)
- **CHECK**:
  - `users_role_check`: `CHECK ((role = ANY (ARRAY['user'::text, 'partner'::text, 'admin'::text])))`
- **Índices**: `users_email_lower_unique` (unique), `users_fcm_token_index`

#### `revoked_tokens`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `token_hash` | character varying(64) | não | — |
| `user_id` | integer | não | — |
| `expires_at` | timestamp with time zone | não | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `revoked_tokens_pkey`
- **FKs**:
  - `user_id` → users.id (ON DELETE CASCADE)
- **Índices**: `revoked_tokens_expires_at_index`

### Catálogo / serviços

#### `categories`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('categories_id_seq'::regclass)` |
| `name` | character varying(100) | não | — |
| `description` | text | sim | — |
| `icon` | character varying(50) | sim | — |
| `color` | character varying(7) | sim | — |
| `is_active` | boolean | sim | `true` |
| `sort_order` | integer | sim | `0` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `categories_pkey`

#### `services`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('services_id_seq'::regclass)` |
| `mechanic_id` | integer | sim | — |
| `name` | character varying(255) | não | — |
| `description` | text | sim | — |
| `price` | numeric(10,2) | não | — |
| `price_type` | character varying(255) | não | — |
| `estimated_duration` | integer | sim | — |
| `is_available` | boolean | sim | `true` |
| `category` | character varying(255) | não | — |
| `subcategory` | character varying(255) | sim | — |
| `warranty_included` | boolean | sim | `false` |
| `warranty_days` | integer | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `services_pkey`
- **FKs**:
  - `mechanic_id` → mechanics.id (ON DELETE CASCADE)
- **Índices**: `services_category_index`, `services_is_available_index`, `services_mechanic_id_index`

#### `products`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('products_id_seq'::regclass)` |
| `store_id` | integer | sim | — |
| `name` | character varying(255) | não | — |
| `description` | text | sim | — |
| `sku` | character varying(100) | sim | — |
| `barcode` | character varying(100) | sim | — |
| `category` | character varying(100) | sim | — |
| `subcategory` | character varying(100) | sim | — |
| `product_type` | text | sim | `'simple'::text` |
| `price` | numeric(10,2) | não | — |
| `cost_price` | numeric(10,2) | sim | — |
| `sale_price` | numeric(10,2) | sim | — |
| `wholesale_price` | numeric(10,2) | sim | — |
| `stock` | integer | sim | `0` |
| `min_stock` | integer | sim | `0` |
| `max_stock` | integer | sim | — |
| `track_stock` | boolean | sim | `true` |
| `allow_backorder` | boolean | sim | `false` |
| `weight` | numeric(8,3) | sim | — |
| `length` | numeric(8,2) | sim | — |
| `width` | numeric(8,2) | sim | — |
| `height` | numeric(8,2) | sim | — |
| `images` | json | sim | — |
| `featured_image` | character varying(500) | sim | — |
| `attributes` | json | sim | — |
| `specifications` | json | sim | — |
| `compatibility` | json | sim | — |
| `slug` | character varying(255) | sim | — |
| `meta_title` | text | sim | — |
| `meta_description` | text | sim | — |
| `tags` | json | sim | — |
| `is_active` | boolean | sim | `true` |
| `is_featured` | boolean | sim | `false` |
| `is_digital` | boolean | sim | `false` |
| `view_count` | integer | sim | `0` |
| `sales_count` | integer | sim | `0` |
| `rating_average` | numeric(3,2) | sim | `'0'::numeric` |
| `rating_count` | integer | sim | `0` |
| `fuel_type` | character varying(255) | sim | — |
| `fuel_liters` | numeric(8,3) | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `products_pkey`
- **FKs**:
  - `store_id` → partners.id (ON DELETE CASCADE)
- **UNIQUE**: `products_sku_unique` (sku)
- **CHECK**:
  - `products_product_type_check`: `CHECK ((product_type = ANY (ARRAY['simple'::text, 'variable'::text, 'bundle'::text])))`
- **Índices**: `products_barcode_index`, `products_category_index`, `products_description_index`, `products_is_active_index`, `products_is_featured_index`, `products_name_index`, `products_price_index`, `products_search_index`, `products_slug_index`, `products_stock_index`, `products_store_id_index`

#### `partner_services`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('partner_services_id_seq'::regclass)` |
| `partner_id` | integer | sim | — |
| `name` | character varying(255) | não | — |
| `description` | text | sim | — |
| `detailed_description` | text | sim | — |
| `price` | numeric(10,2) | sim | — |
| `price_type` | text | sim | `'fixed'::text` |
| `min_price` | numeric(10,2) | sim | — |
| `max_price` | numeric(10,2) | sim | — |
| `estimated_duration_minutes` | integer | sim | — |
| `is_available` | boolean | sim | `true` |
| `emergency_service` | boolean | sim | `false` |
| `home_service` | boolean | sim | `false` |
| `workshop_service` | boolean | sim | `true` |
| `category` | character varying(255) | não | — |
| `subcategory` | character varying(255) | sim | — |
| `tags` | text | sim | — |
| `specialties` | text | sim | — |
| `required_tools` | text | sim | — |
| `required_parts` | text | sim | — |
| `technical_requirements` | text | sim | — |
| `warranty_info` | text | sim | — |
| `warranty_days` | integer | sim | — |
| `total_orders` | integer | sim | `0` |
| `completed_orders` | integer | sim | `0` |
| `cancelled_orders` | integer | sim | `0` |
| `average_rating` | numeric(3,2) | sim | `'0'::numeric` |
| `total_reviews` | integer | sim | `0` |
| `requires_approval` | boolean | sim | `false` |
| `is_featured` | boolean | sim | `false` |
| `sort_order` | integer | sim | `0` |
| `service_hours` | text | sim | — |
| `unavailable_dates` | text | sim | — |
| `images` | text | sim | — |
| `before_after_images` | text | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `partner_services_pkey`
- **FKs**:
  - `partner_id` → partners.id (ON DELETE CASCADE)
- **CHECK**:
  - `partner_services_price_type_check`: `CHECK ((price_type = ANY (ARRAY['fixed'::text, 'hourly'::text, 'per_item'::text, 'negotiable'::text])))`
- **Índices**: `partner_services_average_rating_index`, `partner_services_category_subcategory_index`, `partner_services_is_available_emergency_service_index`, `partner_services_is_featured_sort_order_index`, `partner_services_partner_id_index`, `partner_services_price_type_price_index`

### Parceiros

#### `partners`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('partners_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `type` | text | não | — |
| `business_name` | character varying(255) | não | — |
| `description` | text | sim | — |
| `specialties` | text | sim | — |
| `address` | text | não | — |
| `latitude` | numeric(10,8) | sim | — |
| `longitude` | numeric(11,8) | sim | — |
| `phone` | character varying(255) | não | — |
| `whatsapp` | character varying(255) | sim | — |
| `website` | character varying(255) | sim | — |
| `instagram` | character varying(255) | sim | — |
| `facebook` | character varying(255) | sim | — |
| `hourly_rate` | numeric(10,2) | sim | — |
| `service_fee` | numeric(10,2) | sim | — |
| `delivery_fee` | numeric(10,2) | sim | — |
| `is_verified` | boolean | sim | `false` |
| `is_available` | boolean | sim | `true` |
| `is_online` | boolean | sim | `false` |
| `working_hours` | text | sim | — |
| `payment_methods` | text | sim | — |
| `service_areas` | text | sim | — |
| `experience_years` | integer | sim | — |
| `certifications` | text | sim | — |
| `insurance_info` | text | sim | — |
| `warranty_info` | text | sim | — |
| `emergency_service` | boolean | sim | `false` |
| `home_service` | boolean | sim | `false` |
| `workshop_service` | boolean | sim | `true` |
| `delivery_service` | boolean | sim | `false` |
| `service_radius` | numeric(5,2) | sim | `'10'::numeric` |
| `delivery_radius` | numeric(5,2) | sim | `'15'::numeric` |
| `vehicle_type` | character varying(255) | sim | — |
| `license_plate` | character varying(255) | sim | — |
| `cnh_number` | character varying(255) | sim | — |
| `cnh_category` | character varying(255) | sim | — |
| `store_categories` | text | sim | — |
| `has_delivery` | boolean | sim | `false` |
| `min_order_value` | numeric(10,2) | sim | — |
| `delivery_time_minutes` | integer | sim | — |
| `rating` | numeric(3,2) | sim | `'0'::numeric` |
| `total_reviews` | integer | sim | `0` |
| `total_services` | integer | sim | `0` |
| `total_emergencies` | integer | sim | `0` |
| `total_deliveries` | integer | sim | `0` |
| `total_sales` | integer | sim | `0` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `approval_status` | character varying(255) | sim | `'pending'::character varying` |
| `approved_at` | timestamp with time zone | sim | — |
| `approved_by` | integer | sim | — |
| `rejection_reason` | text | sim | — |

- **PK**: `partners_pkey`
- **FKs**:
  - `approved_by` → users.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `partners_type_check`: `CHECK ((type = ANY (ARRAY['mechanic'::text, 'motoboy'::text, 'store'::text, 'gas_station'::text, 'auto_parts'::text, 'tow'::text])))`
- **Índices**: `partners_is_online_index`, `partners_latitude_longitude_index`, `partners_rating_index`, `partners_type_is_available_is_verified_index`, `partners_type_specialties_index`

#### `partner_documents`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('partner_documents_id_seq'::regclass)` |
| `partner_id` | integer | não | — |
| `document_type` | character varying(255) | não | — |
| `filename` | character varying(255) | não | — |
| `original_name` | character varying(255) | não | — |
| `file_path` | character varying(255) | não | — |
| `mime_type` | character varying(255) | não | — |
| `file_size` | integer | não | — |
| `status` | character varying(255) | sim | `'pending'::character varying` |
| `rejection_reason` | text | sim | — |
| `verification_metadata` | json | sim | — |
| `uploaded_at` | timestamp with time zone | sim | `CURRENT_TIMESTAMP` |
| `verified_at` | timestamp with time zone | sim | — |
| `verified_by` | integer | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `partner_documents_pkey`
- **FKs**:
  - `partner_id` → partners.id (ON DELETE CASCADE)
  - `verified_by` → users.id (ON DELETE SET NULL)
- **Índices**: `partner_documents_partner_id_document_type_index`, `partner_documents_status_index`

### Atendimento

#### `emergency_requests`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('emergency_requests_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `type` | text | não | — |
| `description` | text | não | — |
| `photos` | text | sim | — |
| `vehicle_info` | text | sim | — |
| `vehicle_plate` | character varying(255) | sim | — |
| `vehicle_model` | character varying(255) | sim | — |
| `vehicle_year` | character varying(255) | sim | — |
| `vehicle_color` | character varying(255) | sim | — |
| `location_type` | text | não | — |
| `latitude` | numeric(10,8) | não | — |
| `longitude` | numeric(11,8) | não | — |
| `address` | text | não | — |
| `landmarks` | text | sim | — |
| `status` | text | sim | `'pending'::text` |
| `partner_id` | integer | sim | — |
| `accepted_by` | integer | sim | — |
| `estimated_price` | numeric(10,2) | sim | — |
| `final_price` | numeric(10,2) | sim | — |
| `price_breakdown` | text | sim | — |
| `accepted_at` | timestamp with time zone | sim | — |
| `started_at` | timestamp with time zone | sim | — |
| `completed_at` | timestamp with time zone | sim | — |
| `estimated_duration_minutes` | integer | sim | — |
| `actual_duration_minutes` | integer | sim | — |
| `notes` | text | sim | — |
| `solution_description` | text | sim | — |
| `parts_used` | text | sim | — |
| `warranty_info` | text | sim | — |
| `urgency` | text | sim | `'medium'::text` |
| `is_urgent` | boolean | sim | `false` |
| `rating` | integer | sim | — |
| `review_comment` | text | sim | — |
| `reviewed_at` | timestamp with time zone | sim | — |
| `view_count` | integer | sim | `0` |
| `response_count` | integer | sim | `0` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `request_type` | text | sim | — |
| `proposal_status` | text | sim | — |
| `proposal_selection_deadline` | timestamp with time zone | sim | — |
| `max_proposals` | integer | sim | `0` |
| `proposals_received` | integer | sim | `0` |
| `first_proposal_at` | timestamp with time zone | sim | — |
| `last_proposal_at` | timestamp with time zone | sim | — |
| `search_radius_km` | numeric(8,2) | sim | — |
| `selected_proposal_id` | integer | sim | — |
| `cancellation_reason` | text | sim | — |
| `cancellation_by` | text | sim | — |
| `cancelled_at` | timestamp with time zone | sim | — |
| `vehicle_origin_address` | text | sim | — |
| `vehicle_origin_latitude` | numeric(10,8) | sim | — |
| `vehicle_origin_longitude` | numeric(11,8) | sim | — |
| `vehicle_destination_address` | text | sim | — |
| `vehicle_destination_latitude` | numeric(10,8) | sim | — |
| `vehicle_destination_longitude` | numeric(11,8) | sim | — |
| `vehicle_type` | character varying(255) | sim | — |
| `vehicle_notes` | text | sim | — |
| `pickup_photo_url` | text | sim | — |
| `delivery_photo_url` | text | sim | — |
| `pickup_photo_metadata` | text | sim | — |
| `delivery_photo_metadata` | text | sim | — |

- **PK**: `emergency_requests_pkey`
- **FKs**:
  - `accepted_by` → users.id (ON DELETE SET NULL)
  - `partner_id` → partners.id (ON DELETE SET NULL)
  - `selected_proposal_id` → tow_proposals.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `emergency_requests_location_type_check`: `CHECK ((location_type = ANY (ARRAY['roadside'::text, 'parking'::text, 'home'::text, 'other'::text])))`
  - `emergency_requests_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'expired'::text])))`
  - `emergency_requests_type_check`: `CHECK ((type = ANY (ARRAY['mechanical'::text, 'fuel'::text, 'tire'::text, 'battery'::text, 'other'::text])))`
  - `emergency_requests_urgency_check`: `CHECK ((urgency = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))`
- **Índices**: `emergency_requests_latitude_longitude_index`, `emergency_requests_partner_id_index`, `emergency_requests_status_created_at_index`, `emergency_requests_type_status_index`, `emergency_requests_urgency_is_urgent_index`, `emergency_requests_user_id_index`

#### `appointments`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('appointments_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `mechanic_id` | integer | sim | — |
| `service_id` | integer | sim | — |
| `scheduled_date` | timestamp with time zone | não | — |
| `status` | character varying(255) | não | `'pending'::character varying` |
| `description` | text | sim | — |
| `vehicle_info` | text | sim | — |
| `location_type` | character varying(255) | não | — |
| `latitude` | numeric(10,8) | sim | — |
| `longitude` | numeric(11,8) | sim | — |
| `address` | text | sim | — |
| `estimated_price` | numeric(10,2) | sim | — |
| `final_price` | numeric(10,2) | sim | — |
| `notes` | text | sim | — |
| `completed_at` | timestamp with time zone | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `appointments_pkey`
- **FKs**:
  - `mechanic_id` → mechanics.id (ON DELETE CASCADE)
  - `service_id` → services.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **Índices**: `appointments_mechanic_id_index`, `appointments_scheduled_date_index`, `appointments_status_index`, `appointments_user_id_index`

#### `chat_messages`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('chat_messages_id_seq'::regclass)` |
| `sender_id` | integer | sim | — |
| `receiver_id` | integer | sim | — |
| `appointment_id` | integer | sim | — |
| `message` | text | não | — |
| `message_type` | character varying(255) | sim | `'text'::character varying` |
| `file_url` | text | sim | — |
| `file_name` | character varying(255) | sim | — |
| `file_size` | character varying(255) | sim | — |
| `is_read` | boolean | sim | `false` |
| `read_at` | timestamp with time zone | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `chat_messages_pkey`
- **FKs**:
  - `appointment_id` → appointments.id (ON DELETE SET NULL)
  - `receiver_id` → users.id (ON DELETE CASCADE)
  - `sender_id` → users.id (ON DELETE CASCADE)
- **Índices**: `chat_messages_appointment_id_index`, `chat_messages_created_at_index`, `chat_messages_sender_id_receiver_id_index`

#### `reviews`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('reviews_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `mechanic_id` | integer | sim | — |
| `appointment_id` | integer | sim | — |
| `rating` | integer | não | — |
| `comment` | text | sim | — |
| `is_verified` | boolean | sim | `false` |
| `is_public` | boolean | sim | `true` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `partner_id` | integer | sim | — |
| `entity_type` | character varying(50) | sim | — |
| `entity_id` | integer | sim | — |

- **PK**: `reviews_pkey`
- **FKs**:
  - `appointment_id` → appointments.id (ON DELETE SET NULL)
  - `mechanic_id` → mechanics.id (ON DELETE CASCADE)
  - `partner_id` → partners.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **Índices**: `reviews_created_at_index`, `reviews_entity_type_entity_id_index`, `reviews_mechanic_id_index`, `reviews_partner_id_index`, `reviews_rating_index`, `reviews_user_entity_unique` (unique)

#### `notifications`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('notifications_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `type` | text | não | — |
| `title` | character varying(255) | não | — |
| `message` | text | não | — |
| `detailed_message` | text | sim | — |
| `related_emergency_request_id` | integer | sim | — |
| `related_delivery_order_id` | integer | sim | — |
| `related_purchase_order_id` | integer | sim | — |
| `related_partner_id` | integer | sim | — |
| `is_read` | boolean | sim | `false` |
| `is_sent` | boolean | sim | `false` |
| `is_delivered` | boolean | sim | `false` |
| `push_enabled` | boolean | sim | `true` |
| `sms_enabled` | boolean | sim | `false` |
| `email_enabled` | boolean | sim | `false` |
| `in_app_enabled` | boolean | sim | `true` |
| `priority` | text | sim | `'medium'::text` |
| `is_urgent` | boolean | sim | `false` |
| `scheduled_at` | timestamp with time zone | sim | — |
| `sent_at` | timestamp with time zone | sim | — |
| `delivered_at` | timestamp with time zone | sim | — |
| `read_at` | timestamp with time zone | sim | — |
| `action_data` | text | sim | — |
| `metadata` | text | sim | — |
| `image_url` | character varying(255) | sim | — |
| `sound` | character varying(255) | sim | — |
| `retry_count` | integer | sim | `0` |
| `error_message` | text | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `notifications_pkey`
- **FKs**:
  - `related_delivery_order_id` → delivery_orders.id (ON DELETE CASCADE)
  - `related_emergency_request_id` → emergency_requests.id (ON DELETE CASCADE)
  - `related_partner_id` → partners.id (ON DELETE CASCADE)
  - `related_purchase_order_id` → purchase_orders.id (ON DELETE CASCADE)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `notifications_priority_check`: `CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))`
  - `notifications_type_check`: `CHECK ((type = ANY (ARRAY['emergency_request_created'::text, 'emergency_request_accepted'::text, 'emergency_request_completed'::text, 'delivery_order_created'::text, 'delivery_order_accepted'::text, 'delivery_order_delivered'::text, 'purchase_order_created'::text, 'purchase_order_confirmed'::text, 'purchase_order_delivered'::text, 'partner_location_update'::text, 'payment_confirmed'::text, 'rating_received'::text, 'system_announcement'::text, 'promotion'::text, 'reminder'::text])))`
- **Índices**: `notifications_created_at_index`, `notifications_is_sent_scheduled_at_index`, `notifications_related_delivery_order_id_index`, `notifications_related_emergency_request_id_index`, `notifications_related_purchase_order_id_index`, `notifications_type_priority_index`, `notifications_user_id_is_read_index`

#### `real_time_tracking`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('real_time_tracking_id_seq'::regclass)` |
| `emergency_request_id` | integer | sim | — |
| `delivery_order_id` | integer | sim | — |
| `purchase_order_id` | integer | sim | — |
| `user_id` | integer | sim | — |
| `partner_id` | integer | sim | — |
| `latitude` | numeric(10,8) | não | — |
| `longitude` | numeric(11,8) | não | — |
| `address` | text | sim | — |
| `accuracy` | numeric(8,2) | sim | — |
| `speed` | numeric(8,2) | sim | — |
| `heading` | numeric(5,2) | sim | — |
| `status` | text | sim | `'waiting'::text` |
| `status_message` | text | sim | — |
| `last_updated` | timestamp with time zone | não | — |
| `update_interval_seconds` | integer | sim | `30` |
| `estimated_arrival_minutes` | integer | sim | — |
| `estimated_distance_km` | numeric(8,2) | sim | — |
| `route_info` | text | sim | — |
| `location_history` | text | sim | — |
| `is_active` | boolean | sim | `true` |
| `user_notifications_enabled` | boolean | sim | `true` |
| `partner_notifications_enabled` | boolean | sim | `true` |
| `notes` | text | sim | — |
| `metadata` | text | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `real_time_tracking_pkey`
- **FKs**:
  - `delivery_order_id` → delivery_orders.id (ON DELETE CASCADE)
  - `emergency_request_id` → emergency_requests.id (ON DELETE CASCADE)
  - `partner_id` → partners.id (ON DELETE CASCADE)
  - `purchase_order_id` → purchase_orders.id (ON DELETE CASCADE)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `real_time_tracking_status_check`: `CHECK ((status = ANY (ARRAY['waiting'::text, 'en_route'::text, 'arrived'::text, 'working'::text, 'completed'::text])))`
- **Índices**: `real_time_tracking_delivery_order_id_index`, `real_time_tracking_emergency_request_id_index`, `real_time_tracking_last_updated_index`, `real_time_tracking_latitude_longitude_index`, `real_time_tracking_purchase_order_id_index`, `real_time_tracking_status_is_active_index`, `real_time_tracking_user_id_partner_id_index`

### Logística / compras

#### `delivery_orders`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('delivery_orders_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `motoboy_id` | integer | sim | — |
| `type` | text | não | — |
| `items` | text | sim | — |
| `items_description` | text | sim | — |
| `pickup_location` | text | sim | — |
| `pickup_latitude` | numeric(10,8) | sim | — |
| `pickup_longitude` | numeric(11,8) | sim | — |
| `pickup_address` | text | sim | — |
| `pickup_instructions` | text | sim | — |
| `delivery_location` | text | sim | — |
| `delivery_latitude` | numeric(10,8) | sim | — |
| `delivery_longitude` | numeric(11,8) | sim | — |
| `delivery_address` | text | sim | — |
| `delivery_instructions` | text | sim | — |
| `status` | text | sim | `'pending'::text` |
| `delivery_fee` | numeric(10,2) | sim | — |
| `items_price` | numeric(10,2) | sim | — |
| `total_price` | numeric(10,2) | sim | — |
| `price_breakdown` | text | sim | — |
| `accepted_at` | timestamp with time zone | sim | — |
| `picked_up_at` | timestamp with time zone | sim | — |
| `delivered_at` | timestamp with time zone | sim | — |
| `estimated_delivery_minutes` | integer | sim | — |
| `actual_delivery_minutes` | integer | sim | — |
| `fuel_info` | text | sim | — |
| `parts_info` | text | sim | — |
| `store_info` | text | sim | — |
| `urgency` | text | sim | `'medium'::text` |
| `is_urgent` | boolean | sim | `false` |
| `payment_method` | text | sim | `'cash'::text` |
| `payment_status` | text | sim | `'pending'::text` |
| `paid_at` | timestamp with time zone | sim | — |
| `rating` | integer | sim | — |
| `review_comment` | text | sim | — |
| `reviewed_at` | timestamp with time zone | sim | — |
| `notes` | text | sim | — |
| `delivery_proof` | text | sim | — |
| `tracking_info` | text | sim | — |
| `distance_km` | numeric(8,2) | sim | — |
| `view_count` | integer | sim | `0` |
| `response_count` | integer | sim | `0` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `delivery_orders_pkey`
- **FKs**:
  - `motoboy_id` → partners.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `delivery_orders_payment_method_check`: `CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'pix'::text, 'app'::text])))`
  - `delivery_orders_payment_status_check`: `CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text])))`
  - `delivery_orders_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'picked_up'::text, 'in_transit'::text, 'delivered'::text, 'cancelled'::text])))`
  - `delivery_orders_type_check`: `CHECK ((type = ANY (ARRAY['fuel'::text, 'parts'::text, 'food'::text, 'other'::text])))`
  - `delivery_orders_urgency_check`: `CHECK ((urgency = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))`
- **Índices**: `delivery_orders_delivery_latitude_delivery_longitude_index`, `delivery_orders_motoboy_id_index`, `delivery_orders_status_created_at_index`, `delivery_orders_type_status_index`, `delivery_orders_urgency_is_urgent_index`, `delivery_orders_user_id_index`

#### `purchase_orders`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('purchase_orders_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `store_id` | integer | sim | — |
| `type` | text | não | — |
| `items` | text | sim | — |
| `items_description` | text | sim | — |
| `total_items_quantity` | integer | sim | — |
| `subtotal` | numeric(10,2) | sim | — |
| `delivery_fee` | numeric(10,2) | sim | — |
| `taxes` | numeric(10,2) | sim | — |
| `discount` | numeric(10,2) | sim | — |
| `total_price` | numeric(10,2) | sim | — |
| `price_breakdown` | text | sim | — |
| `status` | text | sim | `'pending'::text` |
| `delivery_address` | text | sim | — |
| `delivery_latitude` | numeric(10,8) | sim | — |
| `delivery_longitude` | numeric(11,8) | sim | — |
| `delivery_instructions` | text | sim | — |
| `delivery_contact_name` | character varying(255) | sim | — |
| `delivery_contact_phone` | character varying(255) | sim | — |
| `has_delivery` | boolean | sim | `true` |
| `estimated_delivery_minutes` | integer | sim | — |
| `scheduled_delivery_at` | timestamp with time zone | sim | — |
| `delivered_at` | timestamp with time zone | sim | — |
| `actual_delivery_minutes` | integer | sim | — |
| `delivery_motoboy_id` | integer | sim | — |
| `payment_method` | text | sim | `'cash'::text` |
| `payment_status` | text | sim | `'pending'::text` |
| `paid_at` | timestamp with time zone | sim | — |
| `payment_info` | text | sim | — |
| `urgency` | text | sim | `'medium'::text` |
| `is_urgent` | boolean | sim | `false` |
| `rating` | integer | sim | — |
| `review_comment` | text | sim | — |
| `reviewed_at` | timestamp with time zone | sim | — |
| `notes` | text | sim | — |
| `special_instructions` | text | sim | — |
| `delivery_proof` | text | sim | — |
| `invoice_info` | text | sim | — |
| `view_count` | integer | sim | `0` |
| `response_count` | integer | sim | `0` |
| `emergency_request_id` | integer | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `purchase_orders_pkey`
- **FKs**:
  - `delivery_motoboy_id` → partners.id (ON DELETE SET NULL)
  - `emergency_request_id` → emergency_requests.id (ON DELETE SET NULL)
  - `store_id` → partners.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `purchase_orders_payment_method_check`: `CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'pix'::text, 'app'::text])))`
  - `purchase_orders_payment_status_check`: `CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text])))`
  - `purchase_orders_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'preparing'::text, 'ready'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text])))`
  - `purchase_orders_type_check`: `CHECK ((type = ANY (ARRAY['emergency'::text, 'regular'::text, 'scheduled'::text])))`
  - `purchase_orders_urgency_check`: `CHECK ((urgency = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))`
- **Índices**: `purchase_orders_delivery_latitude_delivery_longitude_index`, `purchase_orders_delivery_motoboy_id_index`, `purchase_orders_emergency_request_id_index`, `purchase_orders_status_created_at_index`, `purchase_orders_store_id_index`, `purchase_orders_type_status_index`, `purchase_orders_urgency_is_urgent_index`, `purchase_orders_user_id_index`

### Financeiro

#### `payments`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('payments_id_seq'::regclass)` |
| `user_id` | integer | não | — |
| `partner_id` | integer | sim | — |
| `emergency_request_id` | integer | sim | — |
| `delivery_order_id` | integer | sim | — |
| `purchase_order_id` | integer | sim | — |
| `amount` | numeric(10,2) | não | — |
| `currency` | character varying(3) | sim | `'BRL'::character varying` |
| `status` | text | sim | `'pending'::text` |
| `method` | text | não | — |
| `gateway` | character varying(255) | não | — |
| `gateway_transaction_id` | character varying(255) | sim | — |
| `gateway_payment_id` | character varying(255) | sim | — |
| `gateway_response` | json | sim | — |
| `description` | text | sim | — |
| `reference_id` | character varying(255) | sim | — |
| `fee_amount` | numeric(10,2) | sim | `'0'::numeric` |
| `net_amount` | numeric(10,2) | sim | — |
| `card_last_four` | character varying(255) | sim | — |
| `card_brand` | character varying(255) | sim | — |
| `card_exp_month` | character varying(255) | sim | — |
| `card_exp_year` | character varying(255) | sim | — |
| `pix_code` | character varying(255) | sim | — |
| `pix_qr_code` | character varying(255) | sim | — |
| `pix_expires_at` | timestamp with time zone | sim | — |
| `bank_slip_code` | character varying(255) | sim | — |
| `bank_slip_url` | character varying(255) | sim | — |
| `bank_slip_expires_at` | timestamp with time zone | sim | — |
| `processed_at` | timestamp with time zone | sim | — |
| `completed_at` | timestamp with time zone | sim | — |
| `cancelled_at` | timestamp with time zone | sim | — |
| `refunded_at` | timestamp with time zone | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `payment_type` | text | sim | `'emergency_service'::text` |
| `subscription_id` | integer | sim | — |
| `tow_proposal_id` | integer | sim | — |

- **PK**: `payments_pkey`
- **FKs**:
  - `delivery_order_id` → delivery_orders.id (ON DELETE SET NULL)
  - `emergency_request_id` → emergency_requests.id (ON DELETE SET NULL)
  - `partner_id` → partners.id (ON DELETE SET NULL)
  - `purchase_order_id` → purchase_orders.id (ON DELETE SET NULL)
  - `subscription_id` → subscriptions.id (ON DELETE SET NULL)
  - `tow_proposal_id` → tow_proposals.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `payments_method_check`: `CHECK ((method = ANY (ARRAY['credit_card'::text, 'debit_card'::text, 'pix'::text, 'bank_slip'::text, 'cash'::text, 'bank_transfer'::text])))`
  - `payments_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text])))`
- **Índices**: `payments_created_at_index`, `payments_gateway_transaction_id_index`, `payments_method_index`, `payments_partner_id_index`, `payments_payment_type_index`, `payments_status_index`, `payments_subscription_id_index`, `payments_tow_proposal_id_index`, `payments_user_id_index`

#### `wallets`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('wallets_id_seq'::regclass)` |
| `user_id` | integer | não | — |
| `partner_id` | integer | sim | — |
| `available_balance` | numeric(10,2) | sim | `'0'::numeric` |
| `pending_balance` | numeric(10,2) | sim | `'0'::numeric` |
| `total_earned` | numeric(10,2) | sim | `'0'::numeric` |
| `total_withdrawn` | numeric(10,2) | sim | `'0'::numeric` |
| `pix_key` | character varying(255) | sim | — |
| `bank_name` | character varying(255) | sim | — |
| `bank_agency` | character varying(255) | sim | — |
| `bank_account` | character varying(255) | sim | — |
| `account_type` | text | sim | — |
| `account_holder_name` | character varying(255) | sim | — |
| `account_holder_document` | character varying(255) | sim | — |
| `platform_commission_rate` | numeric(5,2) | sim | `'25'::numeric` |
| `is_active` | boolean | sim | `true` |
| `withdrawal_enabled` | boolean | sim | `false` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `wallets_pkey`
- **FKs**:
  - `partner_id` → partners.id (ON DELETE CASCADE)
  - `user_id` → users.id (ON DELETE CASCADE)
- **UNIQUE**: `wallets_partner_id_unique` (partner_id), `wallets_user_id_unique` (user_id)
- **CHECK**:
  - `wallets_account_type_check`: `CHECK ((account_type = ANY (ARRAY['checking'::text, 'savings'::text])))`
- **Índices**: `wallets_is_active_index`

#### `wallet_transactions`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('wallet_transactions_id_seq'::regclass)` |
| `wallet_id` | integer | não | — |
| `type` | text | não | — |
| `direction` | text | não | — |
| `amount` | numeric(10,2) | não | — |
| `balance_before` | numeric(10,2) | não | — |
| `balance_after` | numeric(10,2) | não | — |
| `payment_id` | integer | sim | — |
| `emergency_request_id` | integer | sim | — |
| `delivery_order_id` | integer | sim | — |
| `purchase_order_id` | integer | sim | — |
| `dispute_id` | integer | sim | — |
| `description` | text | sim | — |
| `metadata` | text | sim | — |
| `status` | text | sim | `'pending'::text` |
| `processed_at` | timestamp with time zone | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `wallet_transactions_pkey`
- **FKs**:
  - `delivery_order_id` → delivery_orders.id (ON DELETE SET NULL)
  - `dispute_id` → disputes.id (ON DELETE SET NULL)
  - `emergency_request_id` → emergency_requests.id (ON DELETE SET NULL)
  - `payment_id` → payments.id (ON DELETE SET NULL)
  - `purchase_order_id` → purchase_orders.id (ON DELETE SET NULL)
  - `wallet_id` → wallets.id (ON DELETE CASCADE)
- **CHECK**:
  - `wallet_transactions_direction_check`: `CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text])))`
  - `wallet_transactions_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))`
  - `wallet_transactions_type_check`: `CHECK ((type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'refund'::text, 'commission'::text, 'adjustment'::text, 'fee'::text])))`
- **Índices**: `wallet_transactions_created_at_index`, `wallet_transactions_dispute_id_index`, `wallet_transactions_payment_id_index`, `wallet_transactions_status_index`, `wallet_transactions_type_index`, `wallet_transactions_wallet_id_index`

#### `commissions`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('commissions_id_seq'::regclass)` |
| `payment_id` | integer | não | — |
| `partner_id` | integer | não | — |
| `emergency_request_id` | integer | sim | — |
| `delivery_order_id` | integer | sim | — |
| `purchase_order_id` | integer | sim | — |
| `total_amount` | numeric(10,2) | não | — |
| `platform_commission` | numeric(10,2) | não | — |
| `partner_earnings` | numeric(10,2) | não | — |
| `commission_rate` | numeric(5,2) | não | — |
| `gateway_fee` | numeric(10,2) | sim | `'0'::numeric` |
| `processing_fee` | numeric(10,2) | sim | `'0'::numeric` |
| `status` | text | sim | `'pending'::text` |
| `paid_at` | timestamp with time zone | sim | — |
| `withdrawal_transaction_id` | integer | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `commissions_pkey`
- **FKs**:
  - `delivery_order_id` → delivery_orders.id (ON DELETE SET NULL)
  - `emergency_request_id` → emergency_requests.id (ON DELETE SET NULL)
  - `partner_id` → partners.id (ON DELETE CASCADE)
  - `payment_id` → payments.id (ON DELETE CASCADE)
  - `purchase_order_id` → purchase_orders.id (ON DELETE SET NULL)
  - `withdrawal_transaction_id` → wallet_transactions.id (ON DELETE SET NULL)
- **CHECK**:
  - `commissions_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'paid'::text, 'cancelled'::text])))`
- **Índices**: `commissions_created_at_index`, `commissions_partner_id_index`, `commissions_payment_id_index`, `commissions_status_index`

#### `disputes`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('disputes_id_seq'::regclass)` |
| `payment_id` | integer | não | — |
| `user_id` | integer | não | — |
| `partner_id` | integer | não | — |
| `emergency_request_id` | integer | sim | — |
| `delivery_order_id` | integer | sim | — |
| `purchase_order_id` | integer | sim | — |
| `type` | text | não | — |
| `initiated_by` | text | não | — |
| `reason` | text | não | — |
| `description` | text | sim | — |
| `status` | text | sim | `'open'::text` |
| `resolution` | text | sim | — |
| `disputed_amount` | numeric(10,2) | não | — |
| `refund_amount` | numeric(10,2) | sim | — |
| `evidence` | text | sim | — |
| `partner_response` | text | sim | — |
| `platform_notes` | text | sim | — |
| `resolved_by` | integer | sim | — |
| `resolution_notes` | text | sim | — |
| `resolved_at` | timestamp with time zone | sim | — |
| `priority` | text | sim | `'medium'::text` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `disputes_pkey`
- **FKs**:
  - `delivery_order_id` → delivery_orders.id (ON DELETE SET NULL)
  - `emergency_request_id` → emergency_requests.id (ON DELETE SET NULL)
  - `partner_id` → partners.id (ON DELETE CASCADE)
  - `payment_id` → payments.id (ON DELETE CASCADE)
  - `purchase_order_id` → purchase_orders.id (ON DELETE SET NULL)
  - `resolved_by` → users.id (ON DELETE SET NULL)
  - `user_id` → users.id (ON DELETE CASCADE)
- **CHECK**:
  - `disputes_initiated_by_check`: `CHECK ((initiated_by = ANY (ARRAY['user'::text, 'partner'::text, 'platform'::text])))`
  - `disputes_priority_check`: `CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))`
  - `disputes_resolution_check`: `CHECK ((resolution = ANY (ARRAY['refund_full'::text, 'refund_partial'::text, 'no_action'::text, 'service_redelivery'::text])))`
  - `disputes_status_check`: `CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved'::text, 'rejected'::text, 'cancelled'::text])))`
  - `disputes_type_check`: `CHECK ((type = ANY (ARRAY['refund_request'::text, 'quality_issue'::text, 'service_not_delivered'::text, 'fraud'::text, 'other'::text])))`
- **Índices**: `disputes_created_at_index`, `disputes_partner_id_index`, `disputes_payment_id_index`, `disputes_priority_index`, `disputes_status_index`, `disputes_user_id_index`

#### `subscriptions`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('subscriptions_id_seq'::regclass)` |
| `partner_id` | integer | sim | — |
| `type` | text | não | — |
| `monthly_fee` | numeric(10,2) | não | — |
| `due_date` | date | não | — |
| `next_billing_date` | date | não | — |
| `status` | text | sim | `'pending_payment'::text` |
| `payment_method` | character varying(255) | sim | — |
| `payment_gateway` | character varying(255) | sim | — |
| `gateway_subscription_id` | character varying(255) | sim | — |
| `auto_renew` | boolean | sim | `true` |
| `billing_address` | json | sim | — |
| `notes` | text | sim | — |
| `failed_attempts` | integer | sim | `0` |
| `last_payment_attempt` | timestamp with time zone | sim | — |
| `last_successful_payment` | timestamp with time zone | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `subscriptions_pkey`
- **FKs**:
  - `partner_id` → partners.id (ON DELETE CASCADE)
- **CHECK**:
  - `subscriptions_status_check`: `CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text, 'pending_payment'::text, 'suspended'::text])))`
  - `subscriptions_type_check`: `CHECK ((type = ANY (ARRAY['mecanico'::text, 'posto_combustivel'::text, 'auto_pecas'::text])))`
- **Índices**: `subscriptions_due_date_index`, `subscriptions_next_billing_date_index`, `subscriptions_partner_id_index`, `subscriptions_status_index`, `subscriptions_type_index`

#### `subscription_history`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('subscription_history_id_seq'::regclass)` |
| `subscription_id` | integer | sim | — |
| `partner_id` | integer | sim | — |
| `action` | text | não | — |
| `amount` | numeric(10,2) | sim | — |
| `previous_amount` | numeric(10,2) | sim | — |
| `currency` | character varying(3) | sim | `'BRL'::character varying` |
| `payment_id` | integer | sim | — |
| `gateway_transaction_id` | character varying(255) | sim | — |
| `payment_method` | character varying(255) | sim | — |
| `billing_period_start` | date | sim | — |
| `billing_period_end` | date | sim | — |
| `next_billing_date` | date | sim | — |
| `reason` | text | sim | — |
| `admin_notes` | text | sim | — |
| `system_notes` | text | sim | — |
| `previous_status` | character varying(255) | sim | — |
| `new_status` | character varying(255) | sim | — |
| `performed_by` | integer | sim | — |
| `performed_by_role` | character varying(255) | sim | — |
| `ip_address` | character varying(255) | sim | — |
| `user_agent` | character varying(255) | sim | — |
| `metadata` | json | sim | — |
| `created_at` | timestamp with time zone | sim | `CURRENT_TIMESTAMP` |

- **PK**: `subscription_history_pkey`
- **FKs**:
  - `partner_id` → partners.id (ON DELETE CASCADE)
  - `payment_id` → payments.id (ON DELETE SET NULL)
  - `performed_by` → users.id (ON DELETE SET NULL)
  - `subscription_id` → subscriptions.id (ON DELETE CASCADE)
- **CHECK**:
  - `subscription_history_action_check`: `CHECK ((action = ANY (ARRAY['created'::text, 'paid'::text, 'expired'::text, 'cancelled'::text, 'renewed'::text, 'suspended'::text, 'reactivated'::text, 'payment_failed'::text, 'method_changed'::text])))`
- **Índices**: `subscription_history_action_index`, `subscription_history_created_at_index`, `subscription_history_partner_id_created_at_index`, `subscription_history_partner_id_index`, `subscription_history_payment_id_index`, `subscription_history_performed_by_index`, `subscription_history_subscription_id_index`

### Tow (preparação)

#### `tow_proposals`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('tow_proposals_id_seq'::regclass)` |
| `emergency_request_id` | integer | sim | — |
| `partner_id` | integer | sim | — |
| `proposed_price` | numeric(10,2) | não | — |
| `estimated_time_minutes` | integer | não | — |
| `message` | text | sim | — |
| `tow_truck_type` | character varying(255) | sim | — |
| `tow_capacity_kg` | integer | sim | — |
| `has_winch` | boolean | sim | `false` |
| `equipment_details` | character varying(255) | sim | — |
| `status` | text | sim | `'pending'::text` |
| `expires_at` | timestamp with time zone | não | — |
| `accepted_at` | timestamp with time zone | sim | — |
| `responded_at` | timestamp with time zone | sim | — |
| `view_count` | integer | sim | `0` |
| `last_viewed_at` | timestamp with time zone | sim | — |
| `partner_distance_km` | numeric(5,2) | sim | — |
| `partner_eta_minutes` | integer | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `tow_proposals_pkey`
- **FKs**:
  - `emergency_request_id` → emergency_requests.id (ON DELETE CASCADE)
  - `partner_id` → partners.id (ON DELETE CASCADE)
- **CHECK**:
  - `tow_proposals_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'expired'::text, 'withdrawn'::text])))`
- **Índices**: `tow_proposals_created_at_index`, `tow_proposals_emergency_request_id_index`, `tow_proposals_emergency_request_id_status_index`, `tow_proposals_expires_at_index`, `tow_proposals_one_pending_per_partner` (unique), `tow_proposals_partner_id_index`, `tow_proposals_status_index`

### Documentos

#### `user_documents`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('user_documents_id_seq'::regclass)` |
| `user_id` | integer | não | — |
| `document_type` | character varying(255) | não | — |
| `filename` | character varying(255) | não | — |
| `original_name` | character varying(255) | não | — |
| `file_path` | character varying(255) | não | — |
| `mime_type` | character varying(255) | não | — |
| `file_size` | integer | não | — |
| `status` | text | não | `'pending'::text` |
| `rejection_reason` | text | sim | — |
| `verified_by` | integer | sim | — |
| `uploaded_at` | timestamp with time zone | sim | `CURRENT_TIMESTAMP` |
| `verified_at` | timestamp with time zone | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `user_documents_pkey`
- **FKs**:
  - `user_id` → users.id (ON DELETE CASCADE)
  - `verified_by` → users.id (ON DELETE SET NULL)
- **UNIQUE**: `user_documents_user_id_document_type_unique` (user_id, document_type)
- **CHECK**:
  - `user_documents_status_check`: `CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))`

### Configuração

#### `system_settings`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('system_settings_id_seq'::regclass)` |
| `setting_key` | character varying(100) | não | — |
| `setting_value` | text | sim | — |
| `data_type` | character varying(255) | sim | `'string'::character varying` |
| `description` | text | sim | — |
| `category` | text | sim | `'general'::text` |
| `is_public` | boolean | sim | `false` |
| `is_editable` | boolean | sim | `true` |
| `validation_rules` | character varying(255) | sim | — |
| `default_value` | text | sim | — |
| `min_value` | text | sim | — |
| `max_value` | text | sim | — |
| `updated_by` | integer | sim | — |
| `updated_by_role` | character varying(255) | sim | — |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `system_settings_pkey`
- **FKs**:
  - `updated_by` → users.id (ON DELETE SET NULL)
- **UNIQUE**: `system_settings_setting_key_unique` (setting_key)
- **CHECK**:
  - `system_settings_category_check`: `CHECK ((category = ANY (ARRAY['general'::text, 'guincho'::text, 'assinatura'::text, 'delivery'::text, 'pagamentos'::text, 'notificacoes'::text, 'mapa'::text])))`
- **Índices**: `system_settings_category_index`, `system_settings_is_public_index`

### Legado mantido

#### `mechanics`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('mechanics_id_seq'::regclass)` |
| `user_id` | integer | sim | — |
| `business_name` | character varying(255) | não | — |
| `description` | text | sim | — |
| `specialties` | text | não | — |
| `address` | text | não | — |
| `latitude` | numeric(10,8) | sim | — |
| `longitude` | numeric(11,8) | sim | — |
| `phone` | character varying(255) | não | — |
| `whatsapp` | character varying(255) | sim | — |
| `website` | character varying(255) | sim | — |
| `instagram` | character varying(255) | sim | — |
| `facebook` | character varying(255) | sim | — |
| `hourly_rate` | numeric(10,2) | sim | — |
| `service_fee` | numeric(10,2) | sim | — |
| `is_verified` | boolean | sim | `false` |
| `is_available` | boolean | sim | `true` |
| `working_hours` | text | sim | — |
| `payment_methods` | text | sim | — |
| `service_areas` | text | sim | — |
| `experience_years` | integer | sim | — |
| `certifications` | text | sim | — |
| `insurance_info` | text | sim | — |
| `warranty_info` | text | sim | — |
| `emergency_service` | boolean | sim | `false` |
| `home_service` | boolean | sim | `false` |
| `workshop_service` | boolean | sim | `true` |
| `rating` | numeric(3,2) | sim | `'0'::numeric` |
| `total_reviews` | integer | sim | `0` |
| `created_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | não | `CURRENT_TIMESTAMP` |

- **PK**: `mechanics_pkey`
- **FKs**:
  - `user_id` → users.id (ON DELETE CASCADE)
- **Índices**: `mechanics_is_available_is_verified_index`, `mechanics_latitude_longitude_index`, `mechanics_rating_index`, `mechanics_specialties_index`

### Controle do Knex

#### `knex_migrations`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `id` | integer | não | `nextval('knex_migrations_id_seq'::regclass)` |
| `name` | character varying(255) | sim | — |
| `batch` | integer | sim | — |
| `migration_time` | timestamp with time zone | sim | — |

- **PK**: `knex_migrations_pkey`

#### `knex_migrations_lock`

| Coluna | Tipo | Nulo | Default |
| --- | --- | --- | --- |
| `index` | integer | não | `nextval('knex_migrations_lock_index_seq'::regclass)` |
| `is_locked` | integer | sim | — |

- **PK**: `knex_migrations_lock_pkey`

## 4. O que o schema garante

| Garantia | Onde |
| --- | --- |
| E-mail de usuário único e case-insensitive | `users_email_unique` + `users_email_lower_unique` |
| Papel de usuário restrito | `users_role_check` (user/partner/admin) |
| Tipo de parceiro restrito (inclui `tow`) | `partners_type_check` (6 tipos) |
| Tipos de emergência restritos | `emergency_requests_type_check` |
| Métodos de pagamento restritos | `payments_method_check` |
| Tipo/direção de transação de carteira | `wallet_transactions_type_check`, `wallet_transactions_direction_check` |
| Uma carteira por usuário e por parceiro | `wallets_user_id_unique`, `wallets_partner_id_unique` |
| Uma avaliação por usuário/entidade | `reviews_user_entity_unique` |
| Uma proposta pendente por parceiro/request | `tow_proposals_one_pending_per_partner` (índice parcial) |
| Um documento por tipo/usuário | `user_documents_user_id_document_type_unique` |
| SKU de produto único | `products_sku_unique` |
| Chave de configuração única | `system_settings_setting_key_unique` |
| Integridade referencial completa | 77 FKs entre tabelas do schema |

### 4.1 Colunas `*_id` sem FK (exceções conscientes)

| Coluna | Por que não é FK |
| --- | --- |
| `payments.gateway_transaction_id`, `payments.gateway_payment_id`, `payments.reference_id`, `subscriptions.gateway_subscription_id`, `subscription_history.gateway_transaction_id` | Identificadores **externos** do provedor de pagamento (PSP/gateway); não referenciam nenhuma tabela local |
| `reviews.entity_id` | Referência **polimórfica**, discriminada por `reviews.entity_type` (`partner`/`mechanic`/…); a integridade é garantida pelo índice único parcial `reviews_user_entity_unique` e pela aplicação, não por uma FK simples |

Nenhuma outra coluna de domínio ficou sem integridade referencial: era exatamente essa a
falha RED-2 do baseline legado (`wallet_transactions.dispute_id`), corrigida no baseline.

## 5. Reprodutibilidade

| Comando | O que faz |
| --- | --- |
| `npm run db:migrate -- --purpose test` | aplica `001`+`002` em banco vazio |
| `npm run db:snapshot -- --purpose test --out <arquivo>` | grava o snapshot deste schema |
| `node scripts/tow/schema-snapshot.js --compare a.json b.json` | compara dois snapshots (fingerprint + deltas) |

Comparação com o schema produzido pela cadeia legada (43 migrations):
`docs/evidence/t01/schema-legacy-vs-baseline.txt` — 7 deltas intencionais, nenhum outro.

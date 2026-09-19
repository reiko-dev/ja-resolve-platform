/**
 * T01 — structural reference data of the clean baseline.
 *
 * WHY THIS IS NOT IN A SEED: these rows are the application's default
 * configuration (general + guincho + assinatura + delivery + pagamentos +
 * notificacoes + mapa categories) and the legacy chain created them inside
 * migrations 033 and 040, not in the dev seed. They are structural defaults the
 * app reads at runtime (SystemSettings model), NOT functional/demo data: no
 * user, partner, request, order, payment or wallet row is created here.
 *
 * Idempotent by construction: it inserts only the keys that are missing, so
 * re-running the migration on a database that already has the rows (or a
 * database where an operator changed a value) never duplicates or overwrites
 * anything.
 *
 * Values are transcribed from the audited legacy chain (evidence:
 * docs/evidence/t01/schema-legacy-chain.json / baseline-settings.json).
 */
'use strict';

const SETTINGS = [
    {"setting_key":"app_name","setting_value":"Socorre AI","data_type":"string","description":"Nome do aplicativo","category":"general","is_public":true,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":null,"max_value":null},
    {"setting_key":"app_version","setting_value":"2.0.0","data_type":"string","description":"Versão atual do aplicativo","category":"general","is_public":true,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":null,"max_value":null},
    {"setting_key":"guincho_search_radius_km","setting_value":"15","data_type":"number","description":"Raio de busca para guinchos em km","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"5","max_value":"50"},
    {"setting_key":"guincho_proposal_expiry_minutes","setting_value":"10","data_type":"number","description":"Validade das propostas de guincho em minutos","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"5","max_value":"30"},
    {"setting_key":"guincho_max_proposals_per_request","setting_value":"5","data_type":"number","description":"Número máximo de propostas por solicitação de guincho","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"3","max_value":"10"},
    {"setting_key":"mecanico_monthly_fee","setting_value":"99.00","data_type":"number","description":"Mensalidade para mecânicos","category":"assinatura","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"0","max_value":"500"},
    {"setting_key":"posto_combustivel_monthly_fee","setting_value":"199.00","data_type":"number","description":"Mensalidade para postos de combustível","category":"assinatura","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"0","max_value":"1000"},
    {"setting_key":"auto_pecas_monthly_fee","setting_value":"149.00","data_type":"number","description":"Mensalidade para auto peças","category":"assinatura","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"0","max_value":"500"},
    {"setting_key":"subscription_grace_period_days","setting_value":"7","data_type":"number","description":"Período de carência para assinaturas em dias","category":"assinatura","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"1","max_value":"30"},
    {"setting_key":"delivery_base_fee","setting_value":"8.00","data_type":"number","description":"Taxa base de delivery","category":"delivery","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"0","max_value":"50"},
    {"setting_key":"delivery_platform_fee_percent","setting_value":"20.0","data_type":"number","description":"Percentual de comissão da plataforma no delivery","category":"delivery","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"5","max_value":"50"},
    {"setting_key":"delivery_motoboy_fee_percent","setting_value":"80.0","data_type":"number","description":"Percentual para o motoboy no delivery","category":"delivery","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"50","max_value":"95"},
    {"setting_key":"delivery_search_radius_km","setting_value":"10","data_type":"number","description":"Raio de busca para motoboys em km","category":"delivery","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"5","max_value":"30"},
    {"setting_key":"delivery_max_distance_km","setting_value":"25","data_type":"number","description":"Distância máxima de delivery em km","category":"delivery","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"10","max_value":"100"},
    {"setting_key":"emergency_base_commission_percent","setting_value":"25.0","data_type":"number","description":"Comissão base para serviços de emergência","category":"pagamentos","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"10","max_value":"50"},
    {"setting_key":"min_payment_amount","setting_value":"5.00","data_type":"number","description":"Valor mínimo de pagamento","category":"pagamentos","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"1","max_value":"100"},
    {"setting_key":"max_payment_amount","setting_value":"5000.00","data_type":"number","description":"Valor máximo de pagamento","category":"pagamentos","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"1000","max_value":"10000"},
    {"setting_key":"notification_ttl_hours","setting_value":"24","data_type":"number","description":"Tempo de vida das notificações em horas","category":"notificacoes","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"1","max_value":"168"},
    {"setting_key":"max_notifications_per_user","setting_value":"50","data_type":"number","description":"Máximo de notificações por usuário","category":"notificacoes","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"10","max_value":"100"},
    {"setting_key":"map_default_zoom","setting_value":"15","data_type":"number","description":"Zoom padrão do mapa","category":"mapa","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"1","max_value":"20"},
    {"setting_key":"map_max_markers","setting_value":"100","data_type":"number","description":"Máximo de marcadores no mapa","category":"mapa","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":"10","max_value":"1000"},
    {"setting_key":"tow_price_per_km","setting_value":"6","data_type":"number","description":"Valor base por km para atendimento de guincho","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":null,"max_value":null},
    {"setting_key":"tow_platform_fixed_fee","setting_value":"25","data_type":"number","description":"Taxa fixa da plataforma por atendimento de guincho","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":null,"max_value":null},
    {"setting_key":"tow_minimum_charge","setting_value":"90","data_type":"number","description":"Cobrança mínima do atendimento de guincho","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":null,"max_value":null},
    {"setting_key":"tow_cancellation_fee","setting_value":"40","data_type":"number","description":"Taxa de cancelamento do atendimento de guincho","category":"guincho","is_public":false,"is_editable":true,"validation_rules":null,"default_value":null,"min_value":null,"max_value":null},
];

const KEYS = SETTINGS.map((row) => row.setting_key);

exports.up = async function up(knex) {
  const existing = await knex('system_settings').whereIn('setting_key', KEYS).pluck('setting_key');
  const missing = SETTINGS.filter((row) => !existing.includes(row.setting_key));
  if (missing.length > 0) await knex('system_settings').insert(missing);
  return missing.length;
};

exports.down = async function down(knex) {
  await knex('system_settings').whereIn('setting_key', KEYS).del();
};

module.exports.SETTINGS = SETTINGS;
module.exports.KEYS = KEYS;

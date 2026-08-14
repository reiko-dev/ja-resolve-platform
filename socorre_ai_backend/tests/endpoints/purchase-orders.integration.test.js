/**
 * Contrato de integracao do checkout (E2E-010 / E2E-011).
 *
 * Reproduz EXATAMENTE o payload enviado pelo app cliente no device real
 * (PHASE 4) e define o COMPORTAMENTO ESPERADO do backend.
 *
 * Este arquivo NAO altera codigo de producao. Resultado esperado contra a
 * main atual:
 *   - grupo A: PASS (fluxos que ja funcionam);
 *   - grupo B: FAIL (blockers E2E-010 / E2E-011 pendentes de implementacao).
 * Apos o backend developer implementar os fixes, grupo A + grupo B = 100% PASS.
 *
 * Requer o backend test harness (PR #5): helpers em `tests/helpers` e
 * PostgreSQL de teste via `npm run test:db:up`.
 */
const { api } = require('../helpers/api');
const { db } = require('../helpers/db');
const { createAuthedUser, createPartner } = require('../helpers/auth');

async function createStore({ type = 'gas_station' } = {}) {
  const { user, partner } = await createPartner({
    partnerOverrides: { type },
  });
  await db('subscriptions').insert({
    partner_id: partner.id,
    type: type === 'gas_station' ? 'posto_combustivel' : 'auto_pecas',
    monthly_fee: 199.9,
    due_date: new Date('2026-08-01'),
    next_billing_date: new Date('2026-09-01'),
    status: 'active',
  });
  return { user, partner };
}

const REAL_DEVICE_PAYLOAD = (storeId) => ({
  store_id: storeId,
  items: [
    { product_id: 1, name: 'Filtro de oleo Tecfil', quantity: 1, unit_price: 39.9 },
    { product_id: 2, name: 'Oleo 5W30 sintetico', quantity: 4, unit_price: 44.95 },
    { product_id: 3, name: 'E2E Oleo Motor 5W30', quantity: 2, unit_price: 89.9 },
    { product_id: 4, name: 'E2E Kit Lampadas LED', quantity: 1, unit_price: 59.9 },
  ],
  subtotal: 459.4,
  total_price: 475.3,
  delivery_mode: 'store_delivery',
  delivery_fee: 15.9,
  delivery_address: 'AV. PAULISTA, 1578 - Bela Vista, Sao Paulo - SP, 01310-200',
  payment_method: 'credit_card',
  notes: 'Pedido via app Ja Resolve',
});

const SQL_LEAK_PATTERNS = [
  /insert into/i,
  /values/i,
  /check constraint/i,
  /purchase_orders/i,
  /at Object\./,
  /at parseErrorMessage/,
  /PostgreSQL/i,
];

function expectNoSqlLeak(body) {
  const raw = JSON.stringify(body);
  for (const pattern of SQL_LEAK_PATTERNS) {
    expect(pattern.test(raw)).toBe(false);
  }
}

describe('POST /api/purchase-orders — contrato de integracao', () => {
  describe('GRUPO A — ja funciona contra o backend atual (nao e blocker)', () => {
    it('exige autenticacao (401 sem token)', async () => {
      const { partner } = await createStore();
      const res = await api().post('/api/purchase-orders').send(REAL_DEVICE_PAYLOAD(partner.id));
      expect(res.status).toBe(401);
    });

    it('aceita o payment_method canonico card (201)', async () => {
      const { partner } = await createStore();
      const { headers } = await createAuthedUser();

      const payload = REAL_DEVICE_PAYLOAD(partner.id);
      payload.payment_method = 'card';

      const res = await api().post('/api/purchase-orders').set(headers).send(payload);
      expect(res.status).toBe(201);
    });

    it('aceita o payment_method canonico pix (201)', async () => {
      const { partner } = await createStore();
      const { headers } = await createAuthedUser();

      const payload = REAL_DEVICE_PAYLOAD(partner.id);
      payload.payment_method = 'pix';

      const res = await api().post('/api/purchase-orders').set(headers).send(payload);
      expect(res.status).toBe(201);
    });
  });

  describe('GRUPO B — blockers E2E-010/E2E-011 (falham contra o backend atual)', () => {
    it('cria a PO com o payload real do device (HTTP 201) [E2E-010]', async () => {
      const { partner } = await createStore();
      const { headers, user } = await createAuthedUser();

      const res = await api().post('/api/purchase-orders').set(headers)
        .send(REAL_DEVICE_PAYLOAD(partner.id));

      expect(res.status).toBe(201);
      expectNoSqlLeak(res.body);

      const order = await db('purchase_orders').where({ id: res.body.data.id }).first();
      expect(order).toBeDefined();
      expect(order.user_id).toBe(user.id);
      expect(order.store_id).toBe(partner.id);
      expect(Number(order.subtotal)).toBeCloseTo(459.4, 2);
      expect(Number(order.delivery_fee)).toBeCloseTo(15.9, 2);
      expect(Number(order.total_price)).toBeCloseTo(475.3, 2);
      expect(JSON.parse(order.price_breakdown).delivery_mode).toBe('store_delivery');
      expect(order.payment_method).toBe('card');
    });

    it('persiste os items corretamente (product_id/name/quantity/unit_price) [E2E-010]', async () => {
      const { partner } = await createStore();
      const { headers } = await createAuthedUser();

      const res = await api().post('/api/purchase-orders').set(headers)
        .send(REAL_DEVICE_PAYLOAD(partner.id));

      expect(res.status).toBe(201);

      const items = res.body.data.items;
      expect(items).toHaveLength(4);
      expect(items[0]).toEqual(
        expect.objectContaining({
          product_id: 1,
          name: 'Filtro de oleo Tecfil',
          quantity: 1,
          unit_price: 39.9,
        })
      );
    });

    it('rejeita payment_method invalido com HTTP 400, sem INSERT [E2E-010]', async () => {
      const { partner } = await createStore();
      const { headers } = await createAuthedUser();

      const payload = REAL_DEVICE_PAYLOAD(partner.id);
      payload.payment_method = 'bitcoin';

      const before = await db('purchase_orders').count({ n: '*' });

      const res = await api().post('/api/purchase-orders').set(headers).send(payload);

      expect(res.status).toBe(400);
      expectNoSqlLeak(res.body);

      const after = await db('purchase_orders').count({ n: '*' });
      expect(Number(after[0].n)).toBe(Number(before[0].n));
    });

    it('nao vaza SQL/constraint/stack em erro interno [E2E-011]', async () => {
      const { partner } = await createStore();
      const { headers } = await createAuthedUser();

      const payload = REAL_DEVICE_PAYLOAD(partner.id);
      payload.delivery_latitude = 'valor-que-quebra-o-binding-do-insert';

      const res = await api().post('/api/purchase-orders').set(headers).send(payload);

      expect([400, 500]).toContain(res.status);
      expectNoSqlLeak(res.body);
      if (res.status === 500) {
        expect(res.body.message).toBe('Erro interno do servidor');
      }
    });

    it('loja inexistente retorna 404 com mensagem segura [E2E-011]', async () => {
      const { headers } = await createAuthedUser();

      const payload = REAL_DEVICE_PAYLOAD(99999);

      const res = await api().post('/api/purchase-orders').set(headers).send(payload);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Loja não encontrada');
      expectNoSqlLeak(res.body);
    });
  });
});
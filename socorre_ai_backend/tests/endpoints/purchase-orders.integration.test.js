/**
 * Contrato de integracao do checkout (E2E-010 / E2E-011).
 *
 * Reproduz EXATAMENTE o payload enviado pelo app cliente no device real
 * (PHASE 4): `payment_method = 'credit_card'` nao pertence ao CHECK
 * `purchase_orders_payment_method_check` (`['cash','card','pix','app']`) e o
 * backend atual responde 500 com o SQL do constraint vazado.
 *
 * Estes testes definem o COMPORTAMENTO ESPERADO do backend. Eles nao alteram
 * codigo de producao: se falharem contra a main atual, o resultado documenta o
 * blocker a ser implementado pelo backend developer.
 *
 * Requer o test harness (PR #5): helpers em `tests/helpers` e PostgreSQL de
 * teste via `npm run test:db:up`.
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

describe('POST /api/purchase-orders — contrato de integracao (E2E-010/E2E-011)', () => {
  it('exige autenticacao (401 sem token)', async () => {
    const { partner } = await createStore();
    const res = await api().post('/api/purchase-orders').send(REAL_DEVICE_PAYLOAD(partner.id));
    expect(res.status).toBe(401);
  });

  it('cria a PO com o payload real do device (HTTP 201) [E2E-010 — contrato pendente]', async () => {
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
    expect(order.subtotal).toBe(459.4);
    expect(order.delivery_fee).toBe(15.9);
    expect(order.total_price).toBe(475.3);
    expect(order.delivery_mode).toBe('store_delivery');
    expect(order.payment_method).toBe('card');
  });

  it('persiste os items corretamente (product_id/name/quantity/unit_price)', async () => {
    const { partner } = await createStore();
    const { headers } = await createAuthedUser();

    const res = await api().post('/api/purchase-orders').set(headers)
      .send(REAL_DEVICE_PAYLOAD(partner.id));

    expect(res.status).toBe(201);

    const items = await db('purchase_order_items').where({ purchase_order_id: res.body.data.id });
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

  it('rejeita payment_method invalido com HTTP 400, sem INSERT [E2E-010 — contrato pendente]', async () => {
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

  it('nao vaza SQL/constraint/stack em erro interno (E2E-011) [contrato pendente]', async () => {
    const { partner } = await createStore();
    const { headers } = await createAuthedUser();

    const payload = REAL_DEVICE_PAYLOAD(partner.id);
    payload.payment_method = 'credit_card';

    const res = await api().post('/api/purchase-orders').set(headers).send(payload);

    expect([400, 500]).toContain(res.status);
    expectNoSqlLeak(res.body);
    expect(res.body.message).not.toContain('constraint');
    expect(res.body.message).not.toContain('insert into');
  });
});
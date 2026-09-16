/**
 * Delivery Orders — contrato ATUAL (`src/routes/deliveryOrders.js` +
 * `src/controllers/DeliveryOrderControllerNew.js`).
 *
 * Histórico: a suíte original usava token legado (`{ id }` → 401), rotas
 * inexistentes (`PATCH /:id/status`, `POST /:id/tracking`, `POST /:id/rating`)
 * e mensagens/formatos antigos. O contrato publicado hoje é:
 *   - criação via `POST /` com `{order_type, store_id, items, pickup_*, delivery_*}`,
 *     exigindo loja compatível (`gas_station`/`auto_parts`/`posto_combustivel`/`auto_pecas`)
 *     com assinatura ativa e produtos da própria loja com estoque;
 *   - ciclo `pending → accepted → picked_up → in_transit → delivered`
 *     (`/accept`, `/start`|`/pickup`, `/in-transit`, `/complete`) restrito ao
 *     motoboy designado, e `/cancel` com autoria registrada em `notes`;
 *   - leituras (`/`, `/customer`, `/store`, `/motoboy`, `/available`, `/stats`)
 *     respondem `data` (lista) + `pagination` no caso de `/`.
 *
 * Fixtures determinísticas no SQLite de `tests/helpers/testDb.js`; as
 * construções PG-only do model (`store_info::json->>'x'`) são traduzidas pelo
 * harness (`tests/helpers/sqlitePgCompat.js`).
 */
jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const { api } = require('../helpers/api');
const { reset, createProduct, createActiveSubscription } = require('../helpers/testDb');
const { createAuthedUser, createPartner } = require('../helpers/auth');

// Mesmas coordenadas usadas por `createPartner` (evita depender de geolocalização).
const STORE_LAT = -23.561684;
const STORE_LNG = -46.655981;

describe('Delivery Orders API', () => {
  let admin;
  let customer;
  let otherCustomer;
  let store;
  let storeWithoutSubscription;
  let incompatStore;
  let product;
  let motoboy;
  let otherMotoboy;
  let payload;

  const newPayload = (overrides = {}) => ({
    order_type: 'fuel',
    store_id: store.partner.id,
    items: [{ product_id: product.id, quantity: 2 }],
    pickup_address: 'Av. Paulista, 1000 - São Paulo - SP',
    pickup_latitude: STORE_LAT,
    pickup_longitude: STORE_LNG,
    delivery_address: 'Rua Augusta, 500 - São Paulo - SP',
    delivery_latitude: -23.55,
    delivery_longitude: -46.64,
    customer_notes: 'Entregar na portaria',
    ...overrides,
  });

  beforeEach(async () => {
    await reset();

    admin = await createAuthedUser({ role: 'admin', name: 'Admin Teste' });
    customer = await createAuthedUser({ name: 'Cliente Teste' });
    otherCustomer = await createAuthedUser({ name: 'Outro Cliente' });

    store = await createPartner({
      userOverrides: { name: 'Dono do Posto' },
      partnerOverrides: {
        type: 'gas_station',
        business_name: 'Posto Teste',
        phone: '1133334444',
        address: 'Av. Paulista, 1000 - São Paulo - SP',
        latitude: STORE_LAT,
        longitude: STORE_LNG,
      },
    });

    storeWithoutSubscription = await createPartner({
      partnerOverrides: { type: 'gas_station', business_name: 'Posto Sem Assinatura' },
    });

    incompatStore = await createPartner({
      partnerOverrides: { type: 'mechanic', business_name: 'Oficina Teste' },
    });

    await createActiveSubscription(store.partner.id, { type: 'posto_combustivel' });

    product = await createProduct({
      store_id: store.partner.id,
      name: 'Gasolina Comum',
      price: 5.5,
      stock: 100,
    });

    motoboy = await createPartner({
      partnerOverrides: { type: 'motoboy', business_name: 'Motoboy Teste' },
    });
    otherMotoboy = await createPartner({
      partnerOverrides: { type: 'motoboy', business_name: 'Motoboy Dois' },
    });

    payload = newPayload();
  });

  /** Cria um pedido via API e devolve o corpo de `data`. */
  const createOrder = async (overrides = {}, headers = customer.headers) => {
    const response = await api()
      .post('/api/delivery-orders')
      .set(headers)
      .send(newPayload(overrides))
      .expect(201);

    return response.body.data;
  };

  /** Cria e percorre o ciclo até o status desejado. */
  const advanceTo = async (target) => {
    const order = await createOrder();

    if (target === 'pending') return order;

    const accepted = await api()
      .post(`/api/delivery-orders/${order.id}/accept`)
      .set(motoboy.headers)
      .expect(200);
    if (target === 'accepted') return accepted.body.data;

    const started = await api()
      .post(`/api/delivery-orders/${order.id}/start`)
      .set(motoboy.headers)
      .expect(200);
    if (target === 'picked_up') return started.body.data;

    const inTransit = await api()
      .post(`/api/delivery-orders/${order.id}/in-transit`)
      .set(motoboy.headers)
      .expect(200);
    if (target === 'in_transit') return inTransit.body.data;

    const delivered = await api()
      .post(`/api/delivery-orders/${order.id}/complete`)
      .set(motoboy.headers)
      .send({ actual_time_minutes: 35 })
      .expect(200);

    return delivered.body.data;
  };

  describe('POST /api/delivery-orders', () => {
    it('cria o pedido com itens, taxas e store_info serializados (201)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(payload)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Pedido criado com sucesso');

      const order = response.body.data;
      expect(order.id).toBeDefined();
      expect(order.status).toBe('pending');
      expect(order.order_type).toBe('fuel');
      expect(order.type).toBe('fuel');
      expect(String(order.store_id)).toBe(String(store.partner.id));
      expect(order.store_name).toBe('Posto Teste');
      expect(order.store_phone).toBe('1133334444');
      expect(order.customer_id).toBe(customer.user.id);
      expect(order.customer_name).toBe('Cliente Teste');
      expect(order.payment_status).toBe('pending');
      expect(order.customer_notes).toBe('Entregar na portaria');

      expect(order.items).toHaveLength(1);
      expect(order.items[0]).toMatchObject({
        product_id: product.id,
        name: 'Gasolina Comum',
        price: 5.5,
        quantity: 2,
        total: 11,
      });
      expect(order.items_total).toBe(11);
      expect(order.items_count).toBe(2);
      expect(order.motoboy_fee).toBeGreaterThan(0);
      expect(order.platform_fee).toBeGreaterThan(0);
      expect(order.total_amount).toBeCloseTo(11 + order.delivery_fee, 2);
      expect(order.estimated_time_minutes).toBeGreaterThanOrEqual(20);
      expect(order.distance_km).toBeGreaterThan(0);
    });

    it('exige os campos obrigatórios (400)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send({ order_type: 'fuel' })
        .expect(400);

      expect(response.body.message).toBe(
        'Dados obrigatórios: order_type, store_id, items, pickup_address, delivery_address'
      );
    });

    it('rejeita tipo de pedido inválido (400)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ order_type: 'food' }))
        .expect(400);

      expect(response.body.message).toBe('Tipo de pedido inválido');
    });

    it('retorna 404 para loja inexistente', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ store_id: 9999 }))
        .expect(404);

      expect(response.body.message).toBe('Loja não encontrada');
    });

    it('rejeita loja incompatível com delivery (400)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ store_id: incompatStore.partner.id }))
        .expect(400);

      expect(response.body.message).toBe('Loja não é compatível com este tipo de pedido');
    });

    it('rejeita loja sem assinatura ativa (400)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ store_id: storeWithoutSubscription.partner.id }))
        .expect(400);

      expect(response.body.message).toBe('Loja não possui assinatura ativa');
    });

    it('retorna 404 para produto inexistente', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ items: [{ product_id: 9999, quantity: 1 }] }))
        .expect(404);

      expect(response.body.message).toBe('Produto 9999 não encontrado');
    });

    it('rejeita produto de outra loja (400)', async () => {
      const otherStoreProduct = await createProduct({
        store_id: storeWithoutSubscription.partner.id,
        name: 'Produto de Outra Loja',
      });

      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ items: [{ product_id: otherStoreProduct.id, quantity: 1 }] }))
        .expect(400);

      expect(response.body.message).toBe('Produto de Outra Loja não pertence a esta loja');
    });

    it('rejeita quantidade acima do estoque (400)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .set(customer.headers)
        .send(newPayload({ items: [{ product_id: product.id, quantity: 101 }] }))
        .expect(400);

      expect(response.body.message).toBe('Produto Gasolina Comum sem estoque suficiente');
    });

    it('exige autenticação (401)', async () => {
      const response = await api()
        .post('/api/delivery-orders')
        .send(payload)
        .expect(401);

      expect(response.body.message).toBe('Token de acesso não fornecido');
    });
  });

  describe('GET /api/delivery-orders', () => {
    it('lista com paginação e dados da loja/motoboy', async () => {
      const order = await createOrder();

      const response = await api()
        .get('/api/delivery-orders')
        .set(admin.headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(order.id);
      expect(response.body.data[0].store_name).toBe('Posto Teste');
      expect(response.body.data[0].customer_name).toBe('Cliente Teste');
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });

    it('filtra por status, tipo e loja', async () => {
      const order = await createOrder();

      const byStatus = await api()
        .get('/api/delivery-orders?status=pending')
        .set(admin.headers)
        .expect(200);
      expect(byStatus.body.data).toHaveLength(1);

      const emptyStatus = await api()
        .get('/api/delivery-orders?status=delivered')
        .set(admin.headers)
        .expect(200);
      expect(emptyStatus.body.data).toHaveLength(0);

      const byType = await api()
        .get('/api/delivery-orders?order_type=fuel')
        .set(admin.headers)
        .expect(200);
      expect(byType.body.data).toHaveLength(1);

      const byStore = await api()
        .get(`/api/delivery-orders?store_id=${store.partner.id}`)
        .set(admin.headers)
        .expect(200);
      expect(byStore.body.data).toHaveLength(1);
      expect(byStore.body.data[0].id).toBe(order.id);

      const emptyStore = await api()
        .get(`/api/delivery-orders?store_id=${incompatStore.partner.id}`)
        .set(admin.headers)
        .expect(200);
      expect(emptyStore.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/delivery-orders/customer', () => {
    it('lista apenas os pedidos do cliente autenticado', async () => {
      const order = await createOrder();
      await createOrder({}, otherCustomer.headers);

      const response = await api()
        .get('/api/delivery-orders/customer')
        .set(customer.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(order.id);
      expect(response.body.data[0].customer_id).toBe(customer.user.id);
    });

    it('filtra por status', async () => {
      await createOrder();

      const response = await api()
        .get('/api/delivery-orders/customer?status=delivered')
        .set(customer.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/delivery-orders/store', () => {
    it('lista os pedidos da loja autenticada', async () => {
      const order = await createOrder();

      const response = await api()
        .get('/api/delivery-orders/store')
        .set(store.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(order.id);
    });

    it('retorna 403 sem parceiro vinculado', async () => {
      const response = await api()
        .get('/api/delivery-orders/store')
        .set(customer.headers)
        .expect(403);

      expect(response.body.message).toBe('Parceiro da loja não encontrado');
    });
  });

  describe('GET /api/delivery-orders/motoboy', () => {
    it('lista os pedidos atribuídos ao motoboy', async () => {
      const order = await advanceTo('accepted');

      const response = await api()
        .get('/api/delivery-orders/motoboy')
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(order.id);
      expect(response.body.data[0].motoboy_id).toBe(motoboy.partner.id);
      expect(response.body.data[0].motoboy_name).toBe('Motoboy Teste');
    });

    it('retorna 403 sem parceiro vinculado', async () => {
      await api().get('/api/delivery-orders/motoboy').set(customer.headers).expect(403);
    });
  });

  describe('GET /api/delivery-orders/:id', () => {
    it('retorna o pedido para o cliente dono', async () => {
      const order = await createOrder();

      const response = await api()
        .get(`/api/delivery-orders/${order.id}`)
        .set(customer.headers)
        .expect(200);

      expect(response.body.data.id).toBe(order.id);
    });

    it('permite admin, loja e motoboy designado', async () => {
      const order = await advanceTo('accepted');

      await api().get(`/api/delivery-orders/${order.id}`).set(admin.headers).expect(200);
      await api().get(`/api/delivery-orders/${order.id}`).set(store.headers).expect(200);
      await api().get(`/api/delivery-orders/${order.id}`).set(motoboy.headers).expect(200);
    });

    it('nega acesso a terceiros (403)', async () => {
      const order = await createOrder();

      const response = await api()
        .get(`/api/delivery-orders/${order.id}`)
        .set(otherCustomer.headers)
        .expect(403);

      expect(response.body.message).toBe('Acesso negado');
    });

    it('retorna 404 para pedido inexistente', async () => {
      const response = await api()
        .get('/api/delivery-orders/9999')
        .set(customer.headers)
        .expect(404);

      expect(response.body.message).toBe('Pedido não encontrado');
    });
  });

  describe('GET /api/delivery-orders/available', () => {
    it('lista pedidos pendentes próximos', async () => {
      const order = await createOrder();

      const response = await api()
        .get(`/api/delivery-orders/available?latitude=${STORE_LAT}&longitude=${STORE_LNG}`)
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(order.id);
    });

    it('informa a distância calculada até o ponto de coleta', async () => {
      await createOrder();

      const response = await api()
        .get(`/api/delivery-orders/available?latitude=${STORE_LAT}&longitude=${STORE_LNG}`)
        .set(motoboy.headers)
        .expect(200);

      // `findAvailableForMotoboys` seleciona `... AS pickup_distance_km`, mas o
      // knex descarta o segundo argumento de `.select(array, raw)` (normalizeArr
      // devolve só `args[0]` quando ele é array) — o campo nunca chega ao cliente.
      expect(response.body.data[0].pickup_distance_km).toBeDefined();
      expect(Number(response.body.data[0].pickup_distance_km)).toBeCloseTo(0, 2);
    });

    it('respeita o raio de busca', async () => {
      await createOrder();

      const response = await api()
        .get('/api/delivery-orders/available?latitude=-23.5&longitude=-46.6&radius=1')
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
    });

    it('usa as coordenadas do parceiro quando não informadas', async () => {
      await createOrder();

      const response = await api()
        .get('/api/delivery-orders/available')
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('exige coordenadas quando o usuário não tem parceiro geolocalizado', async () => {
      const response = await api()
        .get('/api/delivery-orders/available')
        .set(customer.headers)
        .expect(400);

      expect(response.body.message).toBe('Coordenadas obrigatórias: latitude, longitude');
    });
  });

  describe('POST /api/delivery-orders/:id/accept', () => {
    it('aceita o pedido e registra o motoboy', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/accept`)
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.message).toBe('Pedido aceito com sucesso');
      expect(response.body.data.status).toBe('accepted');
      expect(response.body.data.motoboy_id).toBe(motoboy.partner.id);
      expect(response.body.data.accepted_at).toBeTruthy();
    });

    it('rejeita quando o pedido já foi aceito (400)', async () => {
      const order = await advanceTo('accepted');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/accept`)
        .set(otherMotoboy.headers)
        .expect(400);

      expect(response.body.message).toBe('Pedido não está mais disponível');
    });

    it('rejeita parceiro que não é motoboy (403)', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/accept`)
        .set(store.headers)
        .expect(403);

      expect(response.body.message).toBe('Apenas motoboys podem aceitar pedidos');
    });

    it('retorna 404 para pedido inexistente', async () => {
      const response = await api()
        .post('/api/delivery-orders/9999/accept')
        .set(motoboy.headers)
        .expect(404);

      expect(response.body.message).toBe('Pedido não encontrado');
    });
  });

  describe('ciclo de vida do delivery', () => {
    it('percorre accepted → picked_up → in_transit → delivered', async () => {
      const order = await advanceTo('accepted');

      const started = await api()
        .post(`/api/delivery-orders/${order.id}/start`)
        .set(motoboy.headers)
        .expect(200);
      expect(started.body.message).toBe('Coleta iniciada com sucesso');
      expect(started.body.data.status).toBe('picked_up');
      expect(started.body.data.picked_up_at).toBeTruthy();

      const inTransit = await api()
        .post(`/api/delivery-orders/${order.id}/in-transit`)
        .set(motoboy.headers)
        .expect(200);
      expect(inTransit.body.message).toBe('Pedido em trânsito');
      expect(inTransit.body.data.status).toBe('in_transit');

      const delivered = await api()
        .post(`/api/delivery-orders/${order.id}/complete`)
        .set(motoboy.headers)
        .send({ actual_time_minutes: 42 })
        .expect(200);
      expect(delivered.body.message).toBe('Pedido entregue com sucesso');
      expect(delivered.body.data.status).toBe('delivered');
      expect(delivered.body.data.delivered_at).toBeTruthy();
      expect(delivered.body.data.actual_time_minutes).toBe(42);
    });

    it('aceita /pickup como alias de /start', async () => {
      const order = await advanceTo('accepted');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/pickup`)
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.data.status).toBe('picked_up');
    });

    it('nega start para motoboy não designado (403)', async () => {
      const order = await advanceTo('accepted');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/start`)
        .set(otherMotoboy.headers)
        .expect(403);

      expect(response.body.message).toBe('Acesso negado');
    });

    it('rejeita start em pedido ainda pendente (403)', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/start`)
        .set(motoboy.headers)
        .expect(403);

      expect(response.body.message).toBe('Acesso negado');
    });

    it('rejeita start repetido (400)', async () => {
      const order = await advanceTo('picked_up');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/start`)
        .set(motoboy.headers)
        .expect(400);

      expect(response.body.message).toBe('Status inválido para iniciar delivery');
    });

    it('registra pontos de rastreamento do motoboy designado', async () => {
      const order = await advanceTo('picked_up');

      const response = await api()
        .patch(`/api/delivery-orders/${order.id}/location`)
        .set(motoboy.headers)
        .send({ latitude: -23.56, longitude: -46.65 })
        .expect(200);

      expect(response.body.message).toBe('Localização atualizada com sucesso');
      expect(response.body.data.tracking_history).toHaveLength(1);
      expect(response.body.data.tracking_history[0].latitude).toBeCloseTo(-23.56, 5);

      const second = await api()
        .post(`/api/delivery-orders/${order.id}/location`)
        .set(motoboy.headers)
        .send({ latitude: -23.57, longitude: -46.66 })
        .expect(200);

      expect(second.body.data.tracking_history).toHaveLength(2);
    });

    it('nega atualização de localização para outro motoboy (403)', async () => {
      const order = await advanceTo('accepted');

      await api()
        .post(`/api/delivery-orders/${order.id}/location`)
        .set(otherMotoboy.headers)
        .send({ latitude: -23.56, longitude: -46.65 })
        .expect(403);
    });
  });

  describe('POST /api/delivery-orders/:id/cancel', () => {
    it('cancela como cliente e registra a autoria em notes', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/cancel`)
        .set(customer.headers)
        .send({ reason: 'Desisti da compra' })
        .expect(200);

      expect(response.body.message).toBe('Pedido cancelado com sucesso');
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancellation_reason).toBe('[customer] Desisti da compra');
    });

    it('cancela como loja', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/cancel`)
        .set(store.headers)
        .send({ reason: 'Sem estoque' })
        .expect(200);

      expect(response.body.data.cancellation_reason).toBe('[store] Sem estoque');
    });

    it('nega cancelamento de terceiros (403)', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/cancel`)
        .set(otherCustomer.headers)
        .expect(403);

      expect(response.body.message).toBe('Acesso negado');
    });

    it('retorna 404 para pedido inexistente', async () => {
      await api()
        .post('/api/delivery-orders/9999/cancel')
        .set(customer.headers)
        .expect(404);
    });
  });

  describe('POST /api/delivery-orders/:id/rate', () => {
    it('avalia um pedido entregue', async () => {
      const order = await advanceTo('delivered');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/rate`)
        .set(customer.headers)
        .send({ rating: 5, comment: 'Entrega rápida' })
        .expect(200);

      expect(response.body.message).toBe('Avaliação registrada com sucesso');
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.review_comment).toBe('Entrega rápida');
    });

    it('rejeita nota fora de 1..5 (400)', async () => {
      const order = await advanceTo('delivered');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/rate`)
        .set(customer.headers)
        .send({ rating: 6 })
        .expect(400);

      expect(response.body.message).toBe('Rating deve ser entre 1 e 5');
    });

    it('rejeita pedido que não foi entregue (400)', async () => {
      const order = await createOrder();

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/rate`)
        .set(customer.headers)
        .send({ rating: 5 })
        .expect(400);

      expect(response.body.message).toBe('Apenas pedidos entregues podem ser avaliados');
    });

    it('nega avaliação de quem não é o cliente (403)', async () => {
      const order = await advanceTo('delivered');

      const response = await api()
        .post(`/api/delivery-orders/${order.id}/rate`)
        .set(otherCustomer.headers)
        .send({ rating: 5 })
        .expect(403);

      expect(response.body.message).toBe('Acesso negado');
    });
  });

  describe('estatísticas', () => {
    it('GET /stats agrega todos os pedidos', async () => {
      await advanceTo('delivered');
      await createOrder();

      const response = await api()
        .get('/api/delivery-orders/stats')
        .set(admin.headers)
        .expect(200);

      const stats = response.body.data;
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.delivered).toBe(1);
      expect(stats.fuel).toBe(2);
      expect(Number(stats.total_revenue)).toBeGreaterThan(0);
    });

    it('GET /motoboy/stats agrega os ganhos do motoboy', async () => {
      await advanceTo('delivered');

      const response = await api()
        .get('/api/delivery-orders/motoboy/stats')
        .set(motoboy.headers)
        .expect(200);

      const stats = response.body.data;
      expect(stats.total).toBe(1);
      expect(stats.delivered).toBe(1);
      expect(Number(stats.total_earnings)).toBeGreaterThan(0);
    });

    it('GET /motoboy/history pagina o histórico do motoboy', async () => {
      const order = await advanceTo('delivered');

      const response = await api()
        .get('/api/delivery-orders/motoboy/history?page=1&limit=10')
        .set(motoboy.headers)
        .expect(200);

      expect(response.body.data.orders).toHaveLength(1);
      expect(response.body.data.orders[0].id).toBe(order.id);
      expect(response.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });
});

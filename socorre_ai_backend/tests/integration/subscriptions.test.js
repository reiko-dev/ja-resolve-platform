/**
 * Subscriptions — contrato ATUAL (`src/routes/subscriptions.js` +
 * `src/controllers/SubscriptionController.js`).
 *
 * Histórico: a suíte original assinava o token legado `{ id }` (401 em tudo),
 * mandava `monthly_fee`/`start_date`/`end_date` no body e esperava
 * `status: 'active'` na criação. O contrato publicado hoje é:
 *   - `POST /` exige `{partner_id, type}`; o tipo aceita o legado
 *     (`mecanico`/`posto_combustivel`/`auto_pecas`) e é canonicalizado
 *     (`mechanic`/`gas_station`/`auto_parts`); a mensalidade vem de
 *     `system_settings.<legacy>_monthly_fee` (default 99.00) e a assinatura
 *     nasce `pending_payment`;
 *   - `GET /` responde `data: {subscriptions, total, page, limit, totalPages}`;
 *   - `DELETE /:id` cancela (não remove);
 *   - pagamento/renovação/falha são ações explícitas com histórico.
 *
 * Fixtures determinísticas no SQLite de `tests/helpers/testDb.js`.
 */
jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const { api } = require('../helpers/api');
const {
  db,
  reset,
  setSetting,
  createActiveSubscription,
} = require('../helpers/testDb');
const { createAuthedUser, createPartner } = require('../helpers/auth');

// Data 'YYYY-MM-DD' no fuso local — mesmo critério de `toDateOnly` no modelo.
const dateOnly = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

describe('Subscriptions API', () => {
  let admin;
  let user;
  let mechanic;
  let gasStation;

  beforeEach(async () => {
    await reset();

    admin = await createAuthedUser({ role: 'admin', name: 'Admin' });
    user = await createAuthedUser({ name: 'Usuário' });

    mechanic = await createPartner({
      partnerOverrides: { type: 'mechanic', business_name: 'Oficina Teste' },
    });
    gasStation = await createPartner({
      partnerOverrides: { type: 'gas_station', business_name: 'Posto Teste' },
    });
  });

  describe('POST /api/subscriptions', () => {
    it('cria a assinatura com type canônico e status pending_payment (201)', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: mechanic.partner.id, type: 'mechanic', payment_method: 'credit_card' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Assinatura criada com sucesso');

      const subscription = response.body.data;
      expect(subscription.id).toBeDefined();
      expect(subscription.partner_id).toBe(mechanic.partner.id);
      expect(subscription.type).toBe('mechanic');
      expect(subscription.legacy_type).toBe('mecanico');
      expect(subscription.monthly_fee).toBe(99);
      expect(subscription.status).toBe('pending_payment');
      expect(subscription.payment_method).toBe('credit_card');
      // `create` devolve a linha crua (sem join de parceiro) → fallback ''.
      expect(subscription.partner_name).toBe('');
      expect(subscription.next_billing_date).toBeTruthy();
    });

    it('aceita o type legado e canonicaliza a resposta', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: gasStation.partner.id, type: 'posto_combustivel' })
        .expect(201);

      expect(response.body.data.type).toBe('gas_station');
      expect(response.body.data.legacy_type).toBe('posto_combustivel');
    });

    it('usa a mensalidade configurada em system_settings', async () => {
      await setSetting('mecanico_monthly_fee', '149.90');

      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: mechanic.partner.id, type: 'mecanico' })
        .expect(201);

      expect(response.body.data.monthly_fee).toBe(149.9);
    });

    it('registra o evento de criação no histórico', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: mechanic.partner.id, type: 'mechanic' })
        .expect(201);

      const history = await db('subscription_history')
        .where({ subscription_id: response.body.data.id })
        .first();
      expect(history.action).toBe('created');
      expect(history.performed_by).toBe(admin.user.id);
    });

    it('exige partner_id e type (400)', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ monthly_fee: 99.9 })
        .expect(400);

      expect(response.body.error).toBe('Dados obrigatórios: partner_id, type');
    });

    it('rejeita type inválido (400)', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: mechanic.partner.id, type: 'invalido' })
        .expect(400);

      expect(response.body.error).toBe('Tipo de assinatura inválido');
    });

    it('rejeita parceiro inexistente (404)', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: 9999, type: 'mechanic' })
        .expect(404);

      expect(response.body.error).toBe('Parceiro não encontrado');
    });

    it('rejeita tipo incompatível com o parceiro (400)', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: mechanic.partner.id, type: 'gas_station' })
        .expect(400);

      expect(response.body.error).toBe('Tipo de assinatura incompatível com o tipo do parceiro');
    });

    it('rejeita assinatura ativa duplicada para o mesmo parceiro (400)', async () => {
      await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const response = await api()
        .post('/api/subscriptions')
        .set(admin.headers)
        .send({ partner_id: mechanic.partner.id, type: 'mechanic' })
        .expect(400);

      expect(response.body.error).toBe('Parceiro já possui assinatura ativa');
    });

    it('exige autenticação (401)', async () => {
      const response = await api()
        .post('/api/subscriptions')
        .send({ partner_id: mechanic.partner.id, type: 'mechanic' })
        .expect(401);

      expect(response.body.message).toBe('Token de acesso não fornecido');
    });
  });

  describe('GET /api/subscriptions', () => {
    beforeEach(async () => {
      await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });
      await createActiveSubscription(gasStation.partner.id, {
        type: 'posto_combustivel',
        status: 'cancelled',
      });
    });

    it('lista com paginação e totais', async () => {
      const response = await api()
        .get('/api/subscriptions')
        .set(admin.headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.subscriptions).toHaveLength(2);
      expect(response.body.data.total).toBe(2);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.totalPages).toBe(1);
      expect(response.body.data.subscriptions[0].legacy_type).toBeDefined();
    });

    it('filtra por status', async () => {
      const response = await api()
        .get('/api/subscriptions?status=active')
        .set(admin.headers)
        .expect(200);

      expect(response.body.data.subscriptions).toHaveLength(1);
      expect(response.body.data.subscriptions[0].status).toBe('active');
    });

    it('filtra por type canônico e legado', async () => {
      const canonical = await api()
        .get('/api/subscriptions?type=mechanic')
        .set(admin.headers)
        .expect(200);
      expect(canonical.body.data.subscriptions).toHaveLength(1);

      const legacy = await api()
        .get('/api/subscriptions?type=posto_combustivel')
        .set(admin.headers)
        .expect(200);
      expect(legacy.body.data.subscriptions).toHaveLength(1);
    });

    it('rejeita filtro de type inválido (400)', async () => {
      const response = await api()
        .get('/api/subscriptions?type=invalido')
        .set(admin.headers)
        .expect(400);

      expect(response.body.error).toBe('Tipo de assinatura inválido');
    });

    it('exige autenticação (401)', async () => {
      await api().get('/api/subscriptions').expect(401);
    });
  });

  describe('GET /api/subscriptions/:id', () => {
    it('retorna a assinatura serializada', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const response = await api()
        .get(`/api/subscriptions/${created.id}`)
        .set(admin.headers)
        .expect(200);

      expect(response.body.data.id).toBe(created.id);
      expect(response.body.data.type).toBe('mechanic');
      expect(response.body.data.partner_name).toBe('Oficina Teste');
      expect(response.body.data.failed_payment_attempts).toBe(0);
    });

    it('retorna 404 quando não existe', async () => {
      const response = await api()
        .get('/api/subscriptions/9999')
        .set(admin.headers)
        .expect(404);

      expect(response.body.error).toBe('Assinatura não encontrada');
    });
  });

  describe('GET /api/subscriptions/partner/:partner_id/status', () => {
    it('informa o status da assinatura do parceiro', async () => {
      await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const response = await api()
        .get(`/api/subscriptions/partner/${mechanic.partner.id}/status`)
        .set(admin.headers)
        .expect(200);

      expect(response.body.data.partner_id).toBe(String(mechanic.partner.id));
      expect(response.body.data.has_active_subscription).toBe(true);
      expect(response.body.data.partner_type).toBe('mechanic');
      expect(response.body.data.subscription.status).toBe('active');
    });

    it('retorna has_active_subscription false sem assinatura', async () => {
      const response = await api()
        .get(`/api/subscriptions/partner/${gasStation.partner.id}/status`)
        .set(admin.headers)
        .expect(200);

      expect(response.body.data.has_active_subscription).toBe(false);
      expect(response.body.data.subscription).toBeNull();
    });

    it('retorna 404 para parceiro inexistente', async () => {
      await api()
        .get('/api/subscriptions/partner/9999/status')
        .set(admin.headers)
        .expect(404);
    });
  });

  describe('GET /api/subscriptions/active|expired|expiring-soon|auto-billing', () => {
    beforeEach(async () => {
      await createActiveSubscription(mechanic.partner.id, {
        type: 'mecanico',
        next_billing_date: dateOnly(3),
      });
      await createActiveSubscription(gasStation.partner.id, {
        type: 'posto_combustivel',
        next_billing_date: dateOnly(-10),
      });
    });

    it('lista apenas assinaturas ativas', async () => {
      const response = await api()
        .get('/api/subscriptions/active')
        .set(admin.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      response.body.data.forEach((subscription) => {
        expect(subscription.status).toBe('active');
      });
    });

    it('lista assinaturas vencidas (next_billing_date no passado)', async () => {
      const response = await api()
        .get('/api/subscriptions/expired')
        .set(admin.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].partner_id).toBe(gasStation.partner.id);
    });

    it('lista assinaturas vencendo na janela de dias', async () => {
      const response = await api()
        .get('/api/subscriptions/expiring-soon?days=7')
        .set(admin.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].partner_id).toBe(mechanic.partner.id);
    });

    it('lista assinaturas elegíveis para cobrança automática', async () => {
      const response = await api()
        .get('/api/subscriptions/auto-billing')
        .set(admin.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].partner_id).toBe(gasStation.partner.id);
    });
  });

  describe('GET /api/subscriptions/stats', () => {
    it('retorna agregados e aliases do contrato', async () => {
      await createActiveSubscription(mechanic.partner.id, { type: 'mecanico', monthly_fee: 100 });
      await createActiveSubscription(gasStation.partner.id, {
        type: 'posto_combustivel',
        monthly_fee: 50,
        status: 'cancelled',
      });

      const response = await api()
        .get('/api/subscriptions/stats')
        .set(admin.headers)
        .expect(200);

      const stats = response.body.data;
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.cancelled).toBe(1);
      expect(stats.total_subscriptions).toBe(2);
      expect(stats.active_subscriptions).toBe(1);
      expect(stats.mechanic).toBe(1);
      expect(stats.gas_station).toBe(1);
      expect(stats.monthly_revenue).toBe('100.00');
    });
  });

  describe('PUT /api/subscriptions/:id', () => {
    it('atualiza payment_method, auto_renew e notes', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const response = await api()
        .put(`/api/subscriptions/${created.id}`)
        .set(admin.headers)
        .send({ payment_method: 'pix', auto_renew: false, notes: 'Contato por e-mail' })
        .expect(200);

      expect(response.body.message).toBe('Assinatura atualizada com sucesso');
      expect(response.body.data.payment_method).toBe('pix');
      expect(response.body.data.auto_renew).toBe(0);
      expect(response.body.data.notes).toBe('Contato por e-mail');
    });

    it('retorna 404 quando não existe', async () => {
      await api()
        .put('/api/subscriptions/9999')
        .set(admin.headers)
        .send({ payment_method: 'pix' })
        .expect(404);
    });
  });

  describe('DELETE /api/subscriptions/:id (cancelamento)', () => {
    it('cancela a assinatura e registra histórico', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const response = await api()
        .delete(`/api/subscriptions/${created.id}`)
        .set(admin.headers)
        .send({ reason: 'Cliente solicitou' })
        .expect(200);

      expect(response.body.message).toBe('Assinatura cancelada com sucesso');
      expect(response.body.data.status).toBe('cancelled');
      // O model grava o motivo em `notes`; `cancellation_reason` não é usado.
      expect(response.body.data.notes).toBe('Cliente solicitou');
      expect(response.body.data.cancellation_reason).toBeNull();

      const history = await db('subscription_history')
        .where({ subscription_id: created.id, action: 'cancelled' })
        .first();
      expect(history.reason).toBe('Cliente solicitou');
    });

    it('rejeita cancelamento repetido (400)', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, {
        type: 'mecanico',
        status: 'cancelled',
      });

      const response = await api()
        .delete(`/api/subscriptions/${created.id}`)
        .set(admin.headers)
        .expect(400);

      expect(response.body.error).toBe('Assinatura já está cancelada');
    });
  });

  describe('POST /api/subscriptions/:id/payment', () => {
    it('marca como ativa, avança a cobrança e registra histórico', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, {
        type: 'mecanico',
        status: 'pending_payment',
        next_billing_date: dateOnly(0),
      });

      const response = await api()
        .post(`/api/subscriptions/${created.id}/payment`)
        .set(admin.headers)
        .send({ payment_method: 'credit_card', gateway_transaction_id: 'tx-1' })
        .expect(200);

      expect(response.body.message).toBe('Pagamento processado com sucesso');
      expect(response.body.data.status).toBe('active');
      expect(String(response.body.data.next_billing_date) > dateOnly(0)).toBe(true);

      const history = await db('subscription_history')
        .where({ subscription_id: created.id, action: 'paid' })
        .first();
      expect(history).toBeDefined();
    });
  });

  describe('POST /api/subscriptions/:id/payment-failure', () => {
    it('incrementa falhas e suspende na terceira', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const first = await api()
        .post(`/api/subscriptions/${created.id}/payment-failure`)
        .set(admin.headers)
        .send({ reason: 'Cartão recusado' })
        .expect(200);
      expect(first.body.data.failed_attempts).toBe(1);
      expect(first.body.data.status).toBe('active');

      await api().post(`/api/subscriptions/${created.id}/payment-failure`).set(admin.headers).expect(200);
      const third = await api()
        .post(`/api/subscriptions/${created.id}/payment-failure`)
        .set(admin.headers)
        .expect(200);

      expect(third.body.data.failed_attempts).toBe(3);

      const stored = await db('subscriptions').where({ id: created.id }).first();
      expect(stored.status).toBe('suspended');

      const history = await db('subscription_history')
        .where({ subscription_id: created.id, action: 'payment_failed' })
        .first();
      expect(history.reason).toBe('Cartão recusado');
    });
  });

  describe('POST /api/subscriptions/:id/renew', () => {
    it('reativa a assinatura e zera as falhas', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, {
        type: 'mecanico',
        status: 'suspended',
        failed_attempts: 3,
      });

      const response = await api()
        .post(`/api/subscriptions/${created.id}/renew`)
        .set(admin.headers)
        .expect(200);

      expect(response.body.message).toBe('Assinatura renovada com sucesso');
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.failed_attempts).toBe(0);

      const history = await db('subscription_history')
        .where({ subscription_id: created.id, action: 'renewed' })
        .first();
      expect(history).toBeDefined();
    });

    it('retorna 404 quando não existe', async () => {
      await api().post('/api/subscriptions/9999/renew').set(admin.headers).expect(404);
    });
  });

  describe('GET /api/subscriptions/:id/history', () => {
    it('lista o histórico da assinatura', async () => {
      const created = await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      await api()
        .delete(`/api/subscriptions/${created.id}`)
        .set(admin.headers)
        .send({ reason: 'Sem uso' })
        .expect(200);

      const response = await api()
        .get(`/api/subscriptions/${created.id}/history`)
        .set(admin.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].action).toBe('cancelled');
      expect(response.body.data[0].performed_by_name).toBe('Admin');
    });
  });

  describe('acesso de usuário comum', () => {
    it('rotas de leitura são autenticadas (não apenas admin)', async () => {
      await createActiveSubscription(mechanic.partner.id, { type: 'mecanico' });

      const response = await api()
        .get('/api/subscriptions')
        .set(user.headers)
        .expect(200);

      expect(response.body.data.total).toBe(1);
    });
  });
});

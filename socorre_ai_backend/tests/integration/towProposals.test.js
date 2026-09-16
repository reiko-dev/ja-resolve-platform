/**
 * Tow Proposals — contrato ATUAL (`src/routes/towProposals.js`).
 *
 * Histórico: a suíte original usava o token legado `{ id }` (401 em toda rota),
 * mandava `partner_id`/`estimated_value`/`notes` no body e esperava rotas que
 * não existem mais (`DELETE /:id`) e mensagens em inglês. Aqui o contrato é o
 * publicado hoje:
 *   - todas as rotas exigem `Authorization: Bearer <jwt com claim userId>`;
 *   - o vínculo do parceiro vem do token (`req.user.partner_id`), nunca do body;
 *   - criação usa `{emergency_request_id, proposed_price, estimated_time_minutes, message}`;
 *   - papéis: criar/retirar = partner; aceitar/rejeitar = user|admin;
 *     listar tudo/estatísticas/expirar = admin; listar por emergência = user|admin.
 *
 * As fixtures usam o SQLite de `tests/helpers/testDb.js`. Datas comparadas em
 * SQL com `Date` (ex.: `findExpiringSoon`) usam o TEXT ISO de
 * `sqliteTimestamp`; `expires_at` comparado com a referência de deadline do
 * SQLite do harness (`Date.now()`, ver `resolveProposalDeadlineReference`) usa
 * `sqliteEpochMs`. O parceiro `tow` tem coordenadas operacionais reais.
 */
jest.mock('../../src/config/database', () => require('../helpers/testDb').db);

const { api } = require('../helpers/api');
const {
  db,
  reset,
  sqliteTimestamp,
  sqliteEpochMs,
  createEmergencyRequest,
} = require('../helpers/testDb');
const { createAuthedUser, createPartner } = require('../helpers/auth');

const FUTURE_ISO = () => new Date(Date.now() + 30 * 60 * 1000).toISOString();

describe('Tow Proposals API', () => {
  let client;
  let otherClient;
  let admin;
  let tow;
  let mechanic;
  let emergency;
  let proposal;

  const proposalPayload = (overrides = {}) => ({
    emergency_request_id: emergency.id,
    proposed_price: 250,
    estimated_time_minutes: 40,
    message: 'Chego em 40 minutos',
    ...overrides,
  });

  // Emergência nova (sem a proposta do fixture) para os cenários de criação.
  const freshEmergency = (overrides = {}) => createEmergencyRequest({
    user_id: client.user.id,
    type: 'tow',
    request_type: 'tow',
    status: 'pending',
    proposal_status: 'awaiting_proposals',
    proposal_selection_deadline: FUTURE_ISO(),
    max_proposals: 5,
    proposals_received: 0,
    price_breakdown: JSON.stringify({ total_estimated_price: 200, minimum_charge: 100 }),
    latitude: -23.561684,
    longitude: -46.655981,
    ...overrides,
  });

  beforeEach(async () => {
    await reset();

    client = await createAuthedUser({ name: 'Cliente Emergência' });
    otherClient = await createAuthedUser({ name: 'Outro Cliente' });
    admin = await createAuthedUser({ role: 'admin', name: 'Admin' });

    tow = await createPartner({
      partnerOverrides: {
        type: 'tow',
        business_name: 'Guincho Teste',
        phone: '11988887777',
        rating: 4.8,
        latitude: -23.561684,
        longitude: -46.655981,
      },
    });

    mechanic = await createPartner({
      partnerOverrides: { type: 'mechanic', business_name: 'Oficina Teste' },
    });

    emergency = await createEmergencyRequest({
      user_id: client.user.id,
      type: 'tow',
      request_type: 'tow',
      status: 'pending',
      proposal_status: 'awaiting_proposals',
      proposal_selection_deadline: FUTURE_ISO(),
      max_proposals: 5,
      proposals_received: 0,
      price_breakdown: JSON.stringify({ total_estimated_price: 200, minimum_charge: 100 }),
      latitude: -23.561684,
      longitude: -46.655981,
    });

    proposal = await db('tow_proposals')
      .insert({
        emergency_request_id: emergency.id,
        partner_id: tow.partner.id,
        proposed_price: 250,
        estimated_time_minutes: 40,
        message: 'Chego em 40 minutos',
        status: 'pending',
        expires_at: sqliteEpochMs(Date.now() + 10 * 60 * 1000),
      })
      .returning('*')
      .then(([row]) => row);
  });

  describe('POST /api/tow-proposals', () => {
    it('cria a proposta do parceiro tow autenticado (201)', async () => {
      const target = await freshEmergency();

      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload({
          emergency_request_id: target.id,
          proposed_price: 320,
          estimated_time_minutes: 25,
        }))
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Proposta enviada com sucesso');
      expect(response.body.data.emergency_request_id).toBe(target.id);
      expect(response.body.data.partner_id).toBe(tow.partner.id);
      expect(Number(response.body.data.proposed_price)).toBe(320);
      expect(response.body.data.estimated_time_minutes).toBe(25);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.expires_at).toBeTruthy();

      const stored = await db('emergency_requests').where({ id: target.id }).first();
      expect(stored.proposals_received).toBe(1);
    });

    it('ignora partner_id do body: o vínculo vem do token', async () => {
      const target = await freshEmergency();

      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload({ emergency_request_id: target.id, partner_id: mechanic.partner.id }))
        .expect(201);

      expect(response.body.data.partner_id).toBe(tow.partner.id);
      expect(response.body.data.partner_id).not.toBe(mechanic.partner.id);
    });

    it('exige autenticação (401)', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .send(proposalPayload())
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Token de acesso não fornecido');
    });

    it('rejeita usuário comum (403)', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .set(client.headers)
        .send(proposalPayload())
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('rejeita parceiro que não é guincho (403)', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .set(mechanic.headers)
        .send(proposalPayload())
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Apenas guinchos podem enviar propostas');
    });

    it('valida payload obrigatório (400)', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send({ emergency_request_id: emergency.id })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('proposed_price');
    });

    it('valida estimated_time_minutes (400)', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload({ estimated_time_minutes: 0 }))
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('estimated_time_minutes');
    });

    it('retorna 404 para emergência inexistente', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload({ emergency_request_id: 9999 }))
        .expect(404);

      expect(response.body.message).toBe('Emergência não encontrada');
    });

    it('retorna 409 para proposta duplicada do mesmo parceiro', async () => {
      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload())
        .expect(409);

      expect(response.body.message).toBe('Você já enviou uma proposta para esta emergência');
    });

    it('retorna 400 quando a proposta fica abaixo do mínimo da emergência', async () => {
      const target = await freshEmergency();

      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload({ emergency_request_id: target.id, proposed_price: 50 }))
        .expect(400);

      expect(response.body.message).toContain('abaixo do mínimo');
    });

    it('retorna 400 quando a emergência não aceita mais propostas', async () => {
      const closed = await createEmergencyRequest({
        user_id: client.user.id,
        request_type: 'tow',
        status: 'accepted',
        proposal_status: 'proposal_selected',
        proposal_selection_deadline: FUTURE_ISO(),
        max_proposals: 5,
        proposals_received: 0,
        latitude: -23.561684,
        longitude: -46.655981,
      });

      const response = await api()
        .post('/api/tow-proposals')
        .set(tow.headers)
        .send(proposalPayload({ emergency_request_id: closed.id }))
        .expect(400);

      expect(response.body.message).toBe('Esta emergência não está mais aceitando propostas');
    });
  });

  describe('GET /api/tow-proposals (admin)', () => {
    it('lista com paginação e totais', async () => {
      const response = await api()
        .get('/api/tow-proposals')
        .set(admin.headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.proposals).toHaveLength(1);
      expect(response.body.data.proposals[0].id).toBe(proposal.id);
      expect(response.body.data.total).toBe(1);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(10);
      expect(response.body.data.totalPages).toBe(1);
    });

    it('filtra por status e faixa de preço', async () => {
      const pendingOnly = await api()
        .get('/api/tow-proposals?status=pending&price_min=100&price_max=300')
        .set(admin.headers)
        .expect(200);
      expect(pendingOnly.body.data.proposals).toHaveLength(1);

      const outOfRange = await api()
        .get('/api/tow-proposals?status=pending&price_min=1000')
        .set(admin.headers)
        .expect(200);
      expect(outOfRange.body.data.proposals).toHaveLength(0);
    });

    it('nega acesso a não-admin (403)', async () => {
      await api().get('/api/tow-proposals').set(client.headers).expect(403);
      await api().get('/api/tow-proposals').set(tow.headers).expect(403);
    });
  });

  describe('GET /api/tow-proposals/stats (admin)', () => {
    it('retorna os agregados do contrato', async () => {
      const response = await api()
        .get('/api/tow-proposals/stats')
        .set(admin.headers)
        .expect(200);

      const stats = response.body.data;
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.accepted).toBe(0);
      expect(stats.rejected).toBe(0);
      // aliases de compatibilidade do contrato legado
      expect(stats.total_proposals).toBe(1);
      expect(stats.pending_proposals).toBe(1);
      expect(stats.proposal_success_rate).toBe(0);
    });

    it('nega acesso a parceiro (403)', async () => {
      await api().get('/api/tow-proposals/stats').set(tow.headers).expect(403);
    });
  });

  describe('GET /api/tow-proposals/partner', () => {
    it('lista as propostas do próprio parceiro', async () => {
      const response = await api()
        .get('/api/tow-proposals/partner?status=pending')
        .set(tow.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].partner_id).toBe(tow.partner.id);
      expect(response.body.data[0].user_name).toBe('Cliente Emergência');
    });

    it('nega acesso a usuário comum (403)', async () => {
      await api().get('/api/tow-proposals/partner').set(client.headers).expect(403);
    });
  });

  describe('GET /api/tow-proposals/emergency/:emergency_request_id', () => {
    it('lista as propostas para o dono da emergência', async () => {
      const response = await api()
        .get(`/api/tow-proposals/emergency/${emergency.id}`)
        .set(client.headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].business_name).toBe('Guincho Teste');
      expect(response.body.data[0].partner_distance_km).toBeDefined();
    });

    it('permite admin', async () => {
      const response = await api()
        .get(`/api/tow-proposals/emergency/${emergency.id}`)
        .set(admin.headers)
        .expect(200);
      expect(response.body.data).toHaveLength(1);
    });

    it('nega acesso a quem não é dono (403)', async () => {
      await api()
        .get(`/api/tow-proposals/emergency/${emergency.id}`)
        .set(otherClient.headers)
        .expect(403);
    });

    it('retorna 404 para emergência inexistente', async () => {
      await api()
        .get('/api/tow-proposals/emergency/9999')
        .set(admin.headers)
        .expect(404);
    });
  });

  describe('GET /api/tow-proposals/:id', () => {
    it('retorna a proposta para o dono da emergência', async () => {
      const response = await api()
        .get(`/api/tow-proposals/${proposal.id}`)
        .set(client.headers)
        .expect(200);

      expect(response.body.data.id).toBe(proposal.id);
      expect(response.body.data.emergency_user_id).toBe(client.user.id);
    });

    it('retorna a proposta para o parceiro dono', async () => {
      const response = await api()
        .get(`/api/tow-proposals/${proposal.id}`)
        .set(tow.headers)
        .expect(200);
      expect(response.body.data.partner_id).toBe(tow.partner.id);
    });

    it('nega acesso a terceiros (403)', async () => {
      await api()
        .get(`/api/tow-proposals/${proposal.id}`)
        .set(otherClient.headers)
        .expect(403);
    });

    it('retorna 404 quando não existe', async () => {
      await api().get('/api/tow-proposals/9999').set(admin.headers).expect(404);
    });
  });

  describe('POST /api/tow-proposals/:id/views', () => {
    it('incrementa o contador de visualizações', async () => {
      const response = await api()
        .post(`/api/tow-proposals/${proposal.id}/views`)
        .set(client.headers)
        .expect(200);

      expect(response.body.message).toBe('Visualização registrada');
      const stored = await db('tow_proposals').where({ id: proposal.id }).first();
      expect(stored.view_count).toBe(1);
    });
  });

  describe('POST /api/tow-proposals/:id/accept', () => {
    it('aceita a proposta, rejeita as concorrentes e fecha a emergência', async () => {
      const rival = await createPartner({
        partnerOverrides: { type: 'tow', business_name: 'Guincho Rival', latitude: -23.55, longitude: -46.64 },
      });
      const rivalProposal = await db('tow_proposals')
        .insert({
          emergency_request_id: emergency.id,
          partner_id: rival.partner.id,
          proposed_price: 280,
          estimated_time_minutes: 50,
          status: 'pending',
          expires_at: sqliteEpochMs(Date.now() + 10 * 60 * 1000),
        })
        .returning('*')
        .then(([row]) => row);

      const response = await api()
        .post(`/api/tow-proposals/${proposal.id}/accept`)
        .set(client.headers)
        .expect(200);

      expect(response.body.message).toBe('Proposta aceita com sucesso');
      expect(response.body.data.proposal.status).toBe('accepted');
      expect(response.body.data.request.status).toBe('accepted');
      expect(response.body.data.request.selected_proposal_id).toBe(proposal.id);

      const rivalAfter = await db('tow_proposals').where({ id: rivalProposal.id }).first();
      expect(rivalAfter.status).toBe('rejected');
    });

    it('nega aceite de quem não é dono da emergência (403)', async () => {
      await api()
        .post(`/api/tow-proposals/${proposal.id}/accept`)
        .set(otherClient.headers)
        .expect(403);
    });

    it('retorna 404 para proposta inexistente', async () => {
      await api()
        .post('/api/tow-proposals/9999/accept')
        .set(client.headers)
        .expect(404);
    });
  });

  describe('POST /api/tow-proposals/:id/reject', () => {
    it('rejeita a proposta do parceiro', async () => {
      const response = await api()
        .post(`/api/tow-proposals/${proposal.id}/reject`)
        .set(client.headers)
        .send({ reason: 'Preço alto' })
        .expect(200);

      expect(response.body.message).toBe('Proposta rejeitada');
      expect(response.body.data.status).toBe('rejected');
    });

    it('nega rejeição de terceiros (403)', async () => {
      await api()
        .post(`/api/tow-proposals/${proposal.id}/reject`)
        .set(otherClient.headers)
        .expect(403);
    });
  });

  describe('POST /api/tow-proposals/:id/withdraw', () => {
    it('retira a própria proposta pendente', async () => {
      const response = await api()
        .post(`/api/tow-proposals/${proposal.id}/withdraw`)
        .set(tow.headers)
        .expect(200);

      expect(response.body.message).toBe('Proposta retirada');
      expect(response.body.data.status).toBe('withdrawn');
    });

    it('nega retirada de proposta de outro parceiro (403)', async () => {
      await api()
        .post(`/api/tow-proposals/${proposal.id}/withdraw`)
        .set(mechanic.headers)
        .expect(403);
    });
  });

  describe('GET /api/tow-proposals/expiring-soon (admin)', () => {
    it('lista propostas pendentes expirando na janela', async () => {
      // `findExpiringSoon` compara `expires_at` com `Date` (não com a referência
      // de deadline), então aqui a linha precisa do TEXT ISO de sqliteTimestamp.
      await db('tow_proposals')
        .where({ id: proposal.id })
        .update({ expires_at: sqliteTimestamp(Date.now() + 2 * 60 * 1000) });

      const response = await api()
        .get('/api/tow-proposals/expiring-soon?minutes=5')
        .set(admin.headers)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(proposal.id);
    });
  });

  describe('POST /api/tow-proposals/emergency/:id/expire (admin)', () => {
    it('expira as propostas vencidas da emergência', async () => {
      // `expireProposals` compara `expires_at` com a referência de deadline do
      // SQLite do harness (epoch ms) — por isso o fixture usa sqliteEpochMs.
      await db('tow_proposals')
        .where({ id: proposal.id })
        .update({ expires_at: sqliteEpochMs(Date.now() - 60 * 1000) });

      const response = await api()
        .post(`/api/tow-proposals/emergency/${emergency.id}/expire`)
        .set(admin.headers)
        .expect(200);

      expect(response.body.data.expired_count).toBe(1);
      const stored = await db('tow_proposals').where({ id: proposal.id }).first();
      expect(stored.status).toBe('expired');
    });

    it('nega acesso a parceiro (403)', async () => {
      await api()
        .post(`/api/tow-proposals/emergency/${emergency.id}/expire`)
        .set(tow.headers)
        .expect(403);
    });
  });

  describe('rotas legadas removidas', () => {
    it('DELETE /:id não está mais publicado (404)', async () => {
      await api()
        .delete(`/api/tow-proposals/${proposal.id}`)
        .set(admin.headers)
        .expect(404);

      const stored = await db('tow_proposals').where({ id: proposal.id }).first();
      expect(stored.status).toBe('pending');
    });

    it('PATCH /:id/status não está mais publicado (404)', async () => {
      await api()
        .patch(`/api/tow-proposals/${proposal.id}/status`)
        .set(admin.headers)
        .send({ status: 'accepted' })
        .expect(404);
    });
  });
});

const express = require('express');
const router = express.Router();
const EmergencyRequestController = require('../controllers/emergencyRequestController');
const { auth, requireRole } = require('../middleware/auth');
const { emergencyRequestSchemas, validate, emergencyRequestSchemaErrorCode } = require('../middleware/validation');
const {
  legacyTowCreateDeprecation,
  legacyTowNearbyDeprecation,
} = require('../middleware/legacyTowDeprecation');

// B4 — this router is shared by the mechanical flow (KEPT) and by the legacy
// Tow branches (DEPRECATED in favor of `/api/tow/*`, header-only, behavior
// untouched). Non-Tow routes must not be annotated, so the signal is applied
// only where the runtime really resolves a tow request: `POST /` with
// `request_type: 'tow'`, `GET /nearby?type=tow`, and the `/:id` operations
// whose loaded resource is `request_type === 'tow'` (see the controller).
//
// Guarda de boot do contrato mobile (docs/MOBILE-AUTH-TOW-CONTRACT-V1.md §4.4):
// start/complete são endpoints oficiais do ciclo tow. Um merge/deploy que perca
// os handlers deve falhar no start do processo, não responder 404 em produção.
for (const handler of ['start', 'complete']) {
  if (typeof EmergencyRequestController[handler] !== 'function') {
    throw new Error(`[routes/emergency-requests] handler ausente no controller: ${handler}`);
  }
}

// Listar solicitações de emergência
router.get('/', 
  auth, 
  requireRole(['admin']), 
  EmergencyRequestController.getAll
);

// Buscar solicitações do usuário
router.get('/user',
  auth,
  requireRole(['user']),
  EmergencyRequestController.getByUser
);

// Buscar solicitações do parceiro
router.get('/partner',
  auth,
  requireRole(['partner']),
  EmergencyRequestController.getByPartner
);

// Buscar solicitações próximas
// B4 — `?type=tow` is the legacy Tow opportunity read; annotate only that
// branch (mechanical nearby reads stay unannotated).
router.get('/nearby',
  auth,
  requireRole(['partner', 'admin']),
  legacyTowNearbyDeprecation,
  EmergencyRequestController.getNearby
);

// Obter estatísticas
router.get('/stats',
  auth,
  requireRole(['admin']),
  EmergencyRequestController.getStats
);

// Criar nova solicitação de emergência
// B4 — `request_type: 'tow'` is a deprecated Tow branch; the mechanical create
// stays unannotated.
router.post('/', 
  auth, 
  requireRole(['user']), 
  legacyTowCreateDeprecation,
  validate(emergencyRequestSchemas.create, { codeResolver: emergencyRequestSchemaErrorCode }),
  EmergencyRequestController.create
);

// Aceitar solicitação (apenas para mecânicos)
router.post('/:id/accept', 
  auth, 
  requireRole(['partner']), 
  EmergencyRequestController.accept
);

// Buscar propostas de uma emergência (para cliente)
router.get('/:id/proposals', 
  auth, 
  requireRole(['user', 'admin']),
  EmergencyRequestController.getProposals
);

// Aceitar proposta (cliente)
router.post('/:id/accept-proposal', 
  auth, 
  requireRole(['user', 'admin']),
  EmergencyRequestController.acceptProposal
);

router.post('/:id/cancel',
  auth,
  requireRole(['user', 'admin']),
  EmergencyRequestController.cancel
);

// Transições oficiais do ciclo de vida (accepted → in_progress → completed).
// Papéis na rota: parceiro ou administrador; o vínculo "parceiro atribuído" é
// validado no controller (outro parceiro e cliente recebem 403).
router.post('/:id/start',
  auth,
  requireRole(['partner', 'admin']),
  EmergencyRequestController.start
);

router.post('/:id/complete',
  auth,
  requireRole(['partner', 'admin']),
  EmergencyRequestController.complete
);

router.get('/:id/payment-summary',
  auth,
  requireRole(['user', 'partner', 'admin']),
  EmergencyRequestController.getPaymentSummary
);

router.post('/:id/payment',
  auth,
  requireRole(['user', 'admin']),
  EmergencyRequestController.createPayment
);

router.post('/:id/rate',
  auth,
  requireRole(['user', 'admin']),
  EmergencyRequestController.rate
);

// Buscar solicitação por ID
router.get('/:id',
  auth,
  requireRole(['user', 'partner', 'admin']),
  EmergencyRequestController.getById
);

module.exports = router;

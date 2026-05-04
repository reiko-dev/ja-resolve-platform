const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const PartnerController = require('../controllers/partnerController');
const DocumentController = require('../controllers/DocumentController');
const { auth, requireRole } = require('../middleware/auth');
const { partnerSchemas, validate } = require('../middleware/validation');
const { validateMechanic, validateStore, validateMotoboy, handleValidationErrors } = require('../middleware/partnerValidation');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/documents');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
  ];

  const allowedExtensions = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.heic',
    '.heif',
    '.pdf',
  ]);

  const normalizedMimeType = (file.mimetype || '').toLowerCase();
  const normalizedExtension = path.extname(file.originalname || '').toLowerCase();
  const mimeTypeAllowed =
    allowedMimeTypes.includes(normalizedMimeType) ||
    normalizedMimeType === 'application/octet-stream';
  const extensionAllowed = allowedExtensions.has(normalizedExtension);

  if (mimeTypeAllowed && extensionAllowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Tipo de arquivo nao permitido. Recebido: mime=${normalizedMimeType || 'desconhecido'}, extensao=${normalizedExtension || 'sem_extensao'}. Apenas JPG, PNG, WEBP, HEIC e PDF sao aceitos.`,
      ),
      false,
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Rotas públicas
router.get('/nearby', PartnerController.getNearby);
router.get('/specialty', PartnerController.getBySpecialty);
router.get('/emergency', PartnerController.getAvailableForEmergency);
router.get('/motoboys', PartnerController.getAvailableMotoboys);
router.get('/stores', PartnerController.getStoresByCategory);

router.get('/me/onboarding-status',
  auth,
  PartnerController.getCurrentOnboardingStatus
);

router.post('/onboarding/complete',
  auth,
  PartnerController.completeOnboarding
);

router.get('/documents',
  auth,
  PartnerController.listCurrentPartnerDocuments
);

router.get('/documents/admin/pending',
  auth,
  requireRole(['admin']),
  DocumentController.getPendingDocuments
);

router.put('/documents/admin/:documentId/verify',
  auth,
  requireRole(['admin']),
  DocumentController.verifyDocument
);

router.get('/documents/admin/:documentId/download',
  auth,
  requireRole(['admin']),
  DocumentController.downloadDocument
);

router.delete('/documents/admin/:documentId',
  auth,
  requireRole(['admin']),
  DocumentController.deleteDocument
);

router.post('/documents/admin/:documentId/metadata',
  auth,
  requireRole(['admin']),
  DocumentController.addVerificationMetadata
);

router.get('/:partnerId/documents',
  auth,
  requireRole(['admin', 'partner']),
  DocumentController.getPartnerDocuments
);

router.get('/:partnerId/documents/status',
  auth,
  requireRole(['admin', 'partner']),
  DocumentController.checkDocumentStatus
);

router.get('/:partnerId/documents/stats',
  auth,
  requireRole(['admin', 'partner']),
  DocumentController.getDocumentStats
);

router.post('/documents/upload',
  auth,
  upload.single('file'),
  (req, res, next) => DocumentController.uploadCurrentPartnerDocument(req, res, next)
);

router.post('/:partnerId/documents/upload',
  auth,
  requireRole(['admin', 'partner']),
  upload.array('documents', 5),
  (req, res, next) => {
    req.body.partnerId = req.params.partnerId;
    return DocumentController.uploadDocuments(req, res, next);
  }
);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Arquivo muito grande. O limite é 5 MB.',
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Erro ao processar upload do arquivo',
    });
  }

  return next();
});

router.post('/documents/submit',
  auth,
  PartnerController.submitCurrentPartnerDocuments
);

router.delete('/documents/:documentId',
  auth,
  DocumentController.deleteCurrentPartnerDocument
);

// Rotas protegidas (parceiros)
router.post('/', 
  auth, 
  requireRole(['partner']), 
  validate(partnerSchemas.create),
  PartnerController.create
);

// Rotas específicas por tipo de parceiro
router.post('/mechanic', 
  auth, 
  validateMechanic,
  handleValidationErrors,
  PartnerController.createMechanic
);

router.post('/store', 
  auth, 
  validateStore,
  handleValidationErrors,
  PartnerController.createStore
);

router.post('/motoboy', 
  auth, 
  validateMotoboy,
  handleValidationErrors,
  PartnerController.createMotoboy
);

router.put('/:id', 
  auth, 
  requireRole(['partner']), 
  validate(partnerSchemas.update),
  PartnerController.update
);

router.put('/:id/online-status', 
  auth, 
  requireRole(['partner']), 
  PartnerController.updateOnlineStatus
);

router.put('/:id/location', 
  auth, 
  requireRole(['partner']), 
  PartnerController.updateLocation
);

router.get('/:id', PartnerController.getById);

// Rotas administrativas
router.get('/', 
  auth, 
  requireRole(['admin']), 
  PartnerController.getAll
);

router.delete('/:id', 
  auth, 
  requireRole(['admin']), 
  PartnerController.delete
);

// Rota para aprovar/rejeitar parceiros (admin)
router.put('/:id/approve', 
  auth, 
  requireRole(['admin']), 
  PartnerController.approvePartner
);

module.exports = router;

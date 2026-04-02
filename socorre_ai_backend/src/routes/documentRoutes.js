const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DocumentController = require('../controllers/DocumentController');
const { auth } = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

// Configuração do Multer para upload de documentos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/documents');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Apenas JPG, PNG e PDF são aceitos.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Upload de múltiplos documentos
router.post('/upload/:partnerId', auth, upload.array('documents', 10), DocumentController.uploadDocuments);

// Listar documentos de um parceiro
router.get('/partner/:partnerId', auth, DocumentController.getPartnerDocuments);

// Obter documento específico
router.get('/:documentId', auth, DocumentController.downloadDocument);

// Verificar documento (aprovar/rejeitar) - Admin
router.put('/:documentId/verify', auth, adminMiddleware, DocumentController.verifyDocument);

// Excluir documento
router.delete('/:documentId', auth, DocumentController.deleteDocument);

// Verificar status dos documentos de um parceiro
router.get('/partner/:partnerId/status', auth, DocumentController.checkDocumentStatus);

// Listar documentos pendentes de verificação - Admin
router.get('/pending', auth, adminMiddleware, DocumentController.getPendingDocuments);

// Obter estatísticas de documentos de um parceiro
router.get('/partner/:partnerId/stats', auth, DocumentController.getDocumentStats);

// Adicionar metadados de verificação - Admin
router.post('/:documentId/metadata', auth, adminMiddleware, DocumentController.addVerificationMetadata);

module.exports = router;

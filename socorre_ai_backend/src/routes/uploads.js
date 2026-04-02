const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');
const DocumentController = require('../controllers/documentController');

const router = express.Router();

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/documents');
    
    // Criar diretório se não existir
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens e PDFs
    const allowedTypes = /jpeg|jpg|png|gif|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem (JPEG, PNG, GIF) e PDF são permitidos'));
    }
  }
});

// Upload de documentos do parceiro
router.post('/partner-documents', 
  auth, 
  requireRole(['admin', 'partner']), 
  upload.array('documents', 5), // Máximo 5 arquivos
  DocumentController.uploadDocuments
);

// Listar documentos de um parceiro
router.get('/partner-documents/list/:partnerId', 
  auth, 
  requireRole(['admin', 'partner']), 
  DocumentController.getPartnerDocuments
);

// Verificar documento (aprovar/rejeitar)
router.put('/partner-documents/:documentId/verify', 
  auth, 
  requireRole(['admin']), 
  DocumentController.verifyDocument
);

// Download de documento
router.get('/partner-documents/:documentId/download', 
  auth, 
  requireRole(['admin', 'partner']), 
  DocumentController.downloadDocument
);

// Excluir documento
router.delete('/partner-documents/:documentId', 
  auth, 
  requireRole(['admin', 'partner']), 
  DocumentController.deleteDocument
);

// Verificar status de documentos de um parceiro
router.get('/partner-documents/:partnerId/status', 
  auth, 
  requireRole(['admin', 'partner']), 
  DocumentController.checkDocumentStatus
);

// Listar documentos pendentes de verificação (admin)
router.get('/partner-documents/pending', 
  auth, 
  requireRole(['admin']), 
  DocumentController.getPendingDocuments
);

// Obter estatísticas de documentos
router.get('/partner-documents/:partnerId/stats', 
  auth, 
  requireRole(['admin', 'partner']), 
  DocumentController.getDocumentStats
);

// Adicionar metadados de verificação
router.post('/partner-documents/:documentId/metadata', 
  auth, 
  requireRole(['admin']), 
  DocumentController.addVerificationMetadata
);

module.exports = router;

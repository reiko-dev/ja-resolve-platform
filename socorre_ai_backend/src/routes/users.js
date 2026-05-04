const express = require('express');
const router = express.Router();
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const userController = require('../controllers/userController');
const { validate, userSchemas } = require('../middleware/validation');
const { auth, requireRole } = require('../middleware/auth');
const {
  MAX_UPLOAD_SIZE_BYTES,
  PARTNER_DOCUMENT_EXTENSIONS,
  PARTNER_DOCUMENT_MIME_TYPES,
  validateMimeAndExtension,
} = require('../config/uploadPolicies');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/user-documents');
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

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    const allowed = validateMimeAndExtension({
      mimeType: file.mimetype,
      filename: file.originalname,
      allowedMimeTypes: PARTNER_DOCUMENT_MIME_TYPES,
      allowedExtensions: PARTNER_DOCUMENT_EXTENSIONS,
    });

    if (allowed) {
      return cb(null, true);
    }

    cb(new Error('Tipo de arquivo não permitido.'));
  },
});

// Rotas protegidas - usuário logado
router.get('/profile', auth, userController.getProfile);
router.put('/profile', auth, validate(userSchemas.updateProfile), userController.updateProfile);
router.get('/me/documents', auth, userController.listCurrentUserDocuments);
router.post('/me/documents', auth, upload.single('document'), userController.uploadCurrentUserDocument);
router.delete('/me/documents/:documentId', auth, userController.deleteCurrentUserDocument);

// Rotas protegidas - apenas admin
router.get('/', auth, requireRole(['admin']), userController.getUsers);
router.get('/:id', auth, requireRole(['admin']), userController.getUserById);
router.post('/', auth, requireRole(['admin']), validate(userSchemas.createUser), userController.createUser);
router.put('/:id', auth, requireRole(['admin']), validate(userSchemas.updateUser), userController.updateUser);
router.delete('/:id', auth, requireRole(['admin']), userController.deleteUser);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo muito grande. O limite é 5 MB.'
        : error.message,
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Erro ao processar upload do arquivo.',
    });
  }

  return next();
});

module.exports = router;

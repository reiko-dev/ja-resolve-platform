const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const {
  decodeBase64Image,
  getNormalizedExtension,
  validateGenericImagePayload,
} = require('../config/uploadPolicies');

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Upload de imagem única
router.post('/image', async (req, res) => {
  try {
    const { image, filename, mimeType } = req.body;
    const validationError = validateGenericImagePayload({ image, filename, mimeType });
    
    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    const buffer = decodeBase64Image(image);
    
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = getNormalizedExtension(filename);
    const fileName = `image-${uniqueSuffix}${fileExtension}`;
    
    // Criar diretório se não existir
    const uploadDir = 'uploads/images';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    // Salvar arquivo
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);
    
    // URL do arquivo (em produção, usar CDN ou S3)
    const fileUrl = `http://localhost:3001/uploads/images/${fileName}`;
    
    res.json({
      success: true,
      data: {
        url: fileUrl,
        filename: fileName,
        size: buffer.length
      },
      message: 'Imagem enviada com sucesso'
    });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Upload múltiplo de imagens
router.post('/images', async (req, res) => {
  try {
    const { images } = req.body;
    
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({
        success: false,
        message: 'Lista de imagens é obrigatória'
      });
    }

    const uploadedFiles = [];
    
    for (const imageData of images) {
      const { image, filename, mimeType } = imageData;
      const validationError = validateGenericImagePayload({ image, filename, mimeType });

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError
        });
      }

      const buffer = decodeBase64Image(image);
      
      // Gerar nome único para o arquivo
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileExtension = getNormalizedExtension(filename);
      const fileName = `image-${uniqueSuffix}${fileExtension}`;
      
      // Criar diretório se não existir
      const uploadDir = 'uploads/images';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Salvar arquivo
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);
      
      // URL do arquivo
      const fileUrl = `http://localhost:3001/uploads/images/${fileName}`;
      uploadedFiles.push({
        url: fileUrl,
        filename: fileName,
        size: buffer.length
      });
    }
    
    res.json({
      success: true,
      data: {
        files: uploadedFiles,
        urls: uploadedFiles.map((file) => file.url),
        count: uploadedFiles.length
      },
      message: 'Imagens enviadas com sucesso'
    });
  } catch (error) {
    console.error('Erro no upload múltiplo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;

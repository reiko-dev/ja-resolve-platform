const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

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

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG, GIF ou WEBP.'));
    }
  }
});

// Upload de imagem única
router.post('/image', async (req, res) => {
  try {
    const { image, filename, mimeType } = req.body;
    
    if (!image || !filename) {
      return res.status(400).json({
        success: false,
        message: 'Imagem e nome do arquivo são obrigatórios'
      });
    }

    // Decodificar base64
    const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(filename);
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

    const uploadedUrls = [];
    
    for (const imageData of images) {
      const { image, filename, mimeType } = imageData;
      
      if (!image || !filename) {
        continue;
      }

      // Decodificar base64
      const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Gerar nome único para o arquivo
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const fileExtension = path.extname(filename);
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
      uploadedUrls.push(fileUrl);
    }
    
    res.json({
      success: true,
      data: {
        urls: uploadedUrls,
        count: uploadedUrls.length
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

// Servir arquivos estáticos
router.use('/images', express.static('uploads/images'));

module.exports = router;

const PartnerDocument = require('../models/PartnerDocument');
const Partner = require('../models/Partner');

class DocumentController {
  // Upload de documentos do parceiro
  static async uploadDocuments(req, res) {
    try {
      const { partnerId } = req.body;
      const files = req.files;

      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: 'ID do parceiro é obrigatório'
        });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum arquivo enviado'
        });
      }

      // Verificar se o parceiro existe
      const partner = await Partner.findById(partnerId);
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      // Verificar se o parceiro precisa de documentos
      const requiredDocs = Partner.getRequiredDocuments(partner.type);
      if (requiredDocs.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Este tipo de parceiro não precisa de documentos'
        });
      }

      const uploadedDocuments = [];

      for (const file of files) {
        // Determinar o tipo de documento baseado no nome do arquivo
        const documentType = this.determineDocumentType(file.originalname);

        // Verificar se este tipo de documento é obrigatório
        if (!requiredDocs.includes(documentType)) {
          continue; // Pular documentos não obrigatórios
        }

        const documentData = {
          partner_id: partnerId,
          document_type: documentType,
          filename: file.filename,
          original_name: file.originalname,
          file_path: file.path,
          mime_type: file.mimetype,
          file_size: file.size,
          status: 'pending'
        };

        const savedDocument = await PartnerDocument.create(documentData);
        uploadedDocuments.push(savedDocument);
      }

      // Atualizar status do parceiro para documents_required
      if (uploadedDocuments.length > 0) {
        await Partner.updateApprovalStatus(partnerId, 'documents_required');
      }

      res.json({
        success: true,
        message: 'Documentos enviados com sucesso',
        data: {
          documents: uploadedDocuments,
          count: uploadedDocuments.length,
          required_documents: requiredDocs,
          uploaded_types: uploadedDocuments.map(d => d.document_type)
        }
      });

    } catch (error) {
      console.error('Erro no upload de documentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao fazer upload dos documentos'
      });
    }
  }

  // Listar documentos de um parceiro
  static async getPartnerDocuments(req, res) {
    try {
      const { partnerId } = req.params;
      const { status, document_type, limit, offset } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (document_type) filters.document_type = document_type;
      if (limit) filters.limit = parseInt(limit);
      if (offset) filters.offset = parseInt(offset);

      const documents = await PartnerDocument.findByPartnerId(partnerId, filters);

      res.json({
        success: true,
        data: {
          documents,
          count: documents.length
        }
      });

    } catch (error) {
      console.error('Erro ao listar documentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar documentos'
      });
    }
  }

  // Verificar documento (aprovar/rejeitar)
  static async verifyDocument(req, res) {
    try {
      const { documentId } = req.params;
      const { status, rejection_reason } = req.body;
      const verifiedBy = req.user.id;

      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status inválido'
        });
      }

      if (status === 'rejected' && !rejection_reason) {
        return res.status(400).json({
          success: false,
          message: 'Motivo da rejeição é obrigatório'
        });
      }

      const document = await PartnerDocument.updateStatus(
        documentId, 
        status, 
        verifiedBy, 
        rejection_reason
      );

      // Se aprovou, verificar se todos os documentos obrigatórios foram aprovados
      if (status === 'approved') {
        // Buscar o parceiro para obter o tipo
        const partner = await Partner.findById(document.partner_id);
        
        const hasAllRequired = await Partner.hasAllRequiredDocuments(document.partner_id);

        if (hasAllRequired) {
          // Atualizar status do parceiro para aprovado
          await Partner.updateApprovalStatus(document.partner_id, 'approved', verifiedBy);
        }
      }

      res.json({
        success: true,
        message: `Documento ${status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso`,
        data: { document }
      });

    } catch (error) {
      console.error('Erro ao verificar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar documento'
      });
    }
  }

  // Download de documento
  static async downloadDocument(req, res) {
    try {
      const { documentId } = req.params;

      const document = await PartnerDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Documento não encontrado'
        });
      }

      const fs = require('fs');
      const path = require('path');

      if (!fs.existsSync(document.file_path)) {
        return res.status(404).json({
          success: false,
          message: 'Arquivo não encontrado'
        });
      }

      res.download(document.file_path, document.original_name);

    } catch (error) {
      console.error('Erro ao baixar documento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao baixar documento'
      });
    }
  }

  // Excluir documento
  static async deleteDocument(req, res) {
    try {
      const { documentId } = req.params;

      await PartnerDocument.delete(documentId);

      res.json({
        success: true,
        message: 'Documento excluído com sucesso'
      });

    } catch (error) {
      console.error('Erro ao excluir documento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao excluir documento'
      });
    }
  }

  // Verificar status de documentos de um parceiro
  static async checkDocumentStatus(req, res) {
    try {
      const { partnerId } = req.params;

      const documentCheck = await PartnerDocument.checkRequiredDocuments(partnerId);

      res.json({
        success: true,
        data: documentCheck
      });

    } catch (error) {
      console.error('Erro ao verificar status dos documentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao verificar status dos documentos'
      });
    }
  }

  // Listar documentos pendentes de verificação (admin)
  static async getPendingDocuments(req, res) {
    try {
      const { limit = 50 } = req.query;

      const documents = await PartnerDocument.findPendingVerification(parseInt(limit));

      res.json({
        success: true,
        data: {
          documents,
          count: documents.length
        }
      });

    } catch (error) {
      console.error('Erro ao listar documentos pendentes:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar documentos pendentes'
      });
    }
  }

  // Obter estatísticas de documentos
  static async getDocumentStats(req, res) {
    try {
      const { partnerId } = req.params;

      const stats = await PartnerDocument.getStats(partnerId);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas'
      });
    }
  }

  // Determinar tipo de documento baseado no nome do arquivo
  static determineDocumentType(filename) {
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.includes('cpf') || lowerFilename.includes('identidade')) {
      return 'cpf';
    }
    if (lowerFilename.includes('cnpj') || lowerFilename.includes('cnpj')) {
      return 'cnpj';
    }
    if (lowerFilename.includes('cnh') || lowerFilename.includes('habilitacao')) {
      return 'cnh';
    }
    if (lowerFilename.includes('crlv') || lowerFilename.includes('veiculo') || lowerFilename.includes('vehicle_document')) {
      return 'vehicle_document';
    }
    if (lowerFilename.includes('residencia') || lowerFilename.includes('endereco') || lowerFilename.includes('comprovante') || lowerFilename.includes('address_proof')) {
      return 'address_proof';
    }
    if (lowerFilename.includes('certificado') || lowerFilename.includes('certification')) {
      return 'certification';
    }
    if (lowerFilename.includes('licenca') || lowerFilename.includes('alvara') || lowerFilename.includes('business') || lowerFilename.includes('business_license')) {
      return 'business_license';
    }

    return 'other';
  }

  // Adicionar metadados de verificação (OCR, validação, etc)
  static async addVerificationMetadata(req, res) {
    try {
      const { documentId } = req.params;
      const { metadata } = req.body;

      const document = await PartnerDocument.addVerificationMetadata(documentId, metadata);

      res.json({
        success: true,
        message: 'Metadados adicionados com sucesso',
        data: { document }
      });

    } catch (error) {
      console.error('Erro ao adicionar metadados:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao adicionar metadados'
      });
    }
  }
}

module.exports = DocumentController;

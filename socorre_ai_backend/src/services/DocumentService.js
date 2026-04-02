const Partner = require('../models/Partner');
const PartnerDocument = require('../models/PartnerDocument');

class DocumentService {
  // Obter documentos obrigatórios para um tipo de parceiro
  static getRequiredDocuments(partnerType) {
    return Partner.getRequiredDocuments(partnerType);
  }

  // Verificar se parceiro precisa de documentos
  static requiresDocuments(partnerType) {
    return Partner.requiresDocuments(partnerType);
  }

  // Verificar se todos os documentos obrigatórios foram enviados
  static async checkRequiredDocuments(partnerId) {
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      throw new Error('Parceiro não encontrado');
    }

    const requiredDocs = this.getRequiredDocuments(partner.type);
    if (requiredDocs.length === 0) {
      return {
        requiresDocuments: false,
        requiredDocuments: [],
        uploadedDocuments: [],
        missingDocuments: [],
        allVerified: true,
        canAccessDashboard: partner.approval_status === 'approved'
      };
    }

    const uploadedDocs = await PartnerDocument.findByPartnerId(partnerId);
    const uploadedTypes = uploadedDocs.map(doc => doc.document_type);
    const verifiedTypes = uploadedDocs
      .filter(doc => doc.status === 'verified')
      .map(doc => doc.document_type);

    const missingDocuments = requiredDocs.filter(doc => !uploadedTypes.includes(doc));
    const pendingDocuments = requiredDocs.filter(doc => 
      uploadedTypes.includes(doc) && !verifiedTypes.includes(doc)
    );

    const allVerified = requiredDocs.every(doc => verifiedTypes.includes(doc));
    const canAccessDashboard = Partner.canAccessDashboard(partner);

    return {
      requiresDocuments: true,
      requiredDocuments,
      uploadedDocuments: uploadedDocs,
      missingDocuments,
      pendingDocuments,
      allVerified,
      canAccessDashboard,
      partnerStatus: partner.approval_status
    };
  }

  // Obter status detalhado dos documentos
  static async getDocumentStatus(partnerId) {
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      throw new Error('Parceiro não encontrado');
    }

    const requiredDocs = this.getRequiredDocuments(partner.type);
    const uploadedDocs = await PartnerDocument.findByPartnerId(partnerId);

    const statusMap = {};
    
    // Inicializar todos os documentos obrigatórios como não enviados
    requiredDocs.forEach(docType => {
      statusMap[docType] = {
        required: true,
        uploaded: false,
        status: 'missing',
        uploadedAt: null,
        verifiedAt: null,
        rejectionReason: null
      };
    });

    // Atualizar status dos documentos enviados
    uploadedDocs.forEach(doc => {
      statusMap[doc.document_type] = {
        required: requiredDocs.includes(doc.document_type),
        uploaded: true,
        status: doc.status,
        uploadedAt: doc.uploaded_at,
        verifiedAt: doc.verified_at,
        rejectionReason: doc.rejection_reason,
        documentId: doc.id,
        fileName: doc.original_name
      };
    });

    return {
      partnerType: partner.type,
      partnerStatus: partner.approval_status,
      requiresDocuments: this.requiresDocuments(partner.type),
      canAccessDashboard: Partner.canAccessDashboard(partner),
      documentStatus: statusMap,
      summary: {
        totalRequired: requiredDocs.length,
        totalUploaded: uploadedDocs.length,
        totalVerified: uploadedDocs.filter(doc => doc.status === 'verified').length,
        totalPending: uploadedDocs.filter(doc => doc.status === 'pending').length,
        totalRejected: uploadedDocs.filter(doc => doc.status === 'rejected').length,
        allVerified: requiredDocs.every(doc => 
          uploadedDocs.some(uploaded => 
            uploaded.document_type === doc && uploaded.status === 'verified'
          )
        )
      }
    };
  }

  // Processar upload de documentos
  static async processDocumentUpload(partnerId, files) {
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      throw new Error('Parceiro não encontrado');
    }

    const requiredDocs = this.getRequiredDocuments(partner.type);
    if (requiredDocs.length === 0) {
      throw new Error('Este tipo de parceiro não precisa de documentos');
    }

    const processedDocuments = [];
    const errors = [];

    for (const file of files) {
      try {
        const documentType = this.determineDocumentType(file.originalname);
        
        // Verificar se é um documento obrigatório
        if (!requiredDocs.includes(documentType)) {
          errors.push({
            file: file.originalname,
            error: 'Tipo de documento não obrigatório para este parceiro'
          });
          continue;
        }

        // Verificar se já existe um documento deste tipo
        const existingDoc = await PartnerDocument.findByType(partnerId, documentType);
        if (existingDoc) {
          errors.push({
            file: file.originalname,
            error: 'Já existe um documento deste tipo'
          });
          continue;
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
        processedDocuments.push(savedDocument);

      } catch (error) {
        errors.push({
          file: file.originalname,
          error: error.message
        });
      }
    }

    // Atualizar status do parceiro se documentos foram enviados
    if (processedDocuments.length > 0) {
      await Partner.updateApprovalStatus(partnerId, 'documents_required');
    }

    return {
      success: processedDocuments.length > 0,
      processedDocuments,
      errors,
      summary: {
        totalFiles: files.length,
        processedFiles: processedDocuments.length,
        errorFiles: errors.length
      }
    };
  }

  // Determinar tipo de documento baseado no nome
  static determineDocumentType(filename) {
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.includes('cpf') || lowerFilename.includes('identidade')) {
      return 'cpf';
    }
    if (lowerFilename.includes('cnpj')) {
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

  // Validar documento antes do upload
  static validateDocument(file, partnerType) {
    const requiredDocs = this.getRequiredDocuments(partnerType);
    const documentType = this.determineDocumentType(file.originalname);

    // Verificar se o tipo é obrigatório
    if (!requiredDocs.includes(documentType)) {
      return {
        valid: false,
        error: 'Tipo de documento não obrigatório para este tipo de parceiro'
      };
    }

    // Verificar tamanho do arquivo (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return {
        valid: false,
        error: 'Arquivo muito grande. Máximo permitido: 5MB'
      };
    }

    // Verificar tipo MIME
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return {
        valid: false,
        error: 'Tipo de arquivo não permitido. Apenas JPG, PNG e PDF'
      };
    }

    return {
      valid: true,
      documentType
    };
  }

  // Obter estatísticas de documentos
  static async getDocumentStats(partnerId) {
    const documents = await PartnerDocument.findByPartnerId(partnerId);
    
    const stats = {
      total: documents.length,
      pending: documents.filter(doc => doc.status === 'pending').length,
      verified: documents.filter(doc => doc.status === 'verified').length,
      rejected: documents.filter(doc => doc.status === 'rejected').length,
      byType: {}
    };

    // Agrupar por tipo
    documents.forEach(doc => {
      if (!stats.byType[doc.document_type]) {
        stats.byType[doc.document_type] = {
          total: 0,
          pending: 0,
          verified: 0,
          rejected: 0
        };
      }
      stats.byType[doc.document_type].total++;
      stats.byType[doc.document_type][doc.status]++;
    });

    return stats;
  }
}

module.exports = DocumentService;

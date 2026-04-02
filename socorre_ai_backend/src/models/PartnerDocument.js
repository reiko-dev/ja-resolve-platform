const knex = require('../config/database');

class PartnerDocument {
  // Criar registro de documento
  static async create(documentData) {
    try {
      const [id] = await knex('partner_documents').insert(documentData);
      return this.findById(id);
    } catch (error) {
      console.error('Erro ao criar documento do parceiro:', error);
      throw error;
    }
  }

  // Buscar documento por ID
  static async findById(id) {
    try {
      const document = await knex('partner_documents')
        .select('*')
        .where('id', id)
        .first();
      
      return document;
    } catch (error) {
      console.error('Erro ao buscar documento:', error);
      throw error;
    }
  }

  // Listar documentos de um parceiro
  static async findByPartnerId(partnerId, filters = {}) {
    try {
      let query = knex('partner_documents')
        .select('*')
        .where('partner_id', partnerId);

      // Aplicar filtros
      if (filters.status) {
        query = query.where('status', filters.status);
      }
      
      if (filters.document_type) {
        query = query.where('document_type', filters.document_type);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.offset(filters.offset);
      }

      const documents = await query.orderBy('uploaded_at', 'desc');
      
      return documents;
    } catch (error) {
      console.error('Erro ao listar documentos do parceiro:', error);
      throw error;
    }
  }

  // Atualizar status do documento
  static async updateStatus(id, status, verifiedBy = null, rejectionReason = null) {
    try {
      const updateData = {
        status,
        verified_at: knex.fn.now(),
        updated_at: knex.fn.now()
      };

      if (verifiedBy) {
        updateData.verified_by = verifiedBy;
      }

      if (rejectionReason) {
        updateData.rejection_reason = rejectionReason;
      }

      await knex('partner_documents')
        .where('id', id)
        .update(updateData);

      return this.findById(id);
    } catch (error) {
      console.error('Erro ao atualizar status do documento:', error);
      throw error;
    }
  }

  // Excluir documento
  static async delete(id) {
    try {
      const document = await this.findById(id);
      
      if (!document) {
        throw new Error('Documento não encontrado');
      }

      // Excluir arquivo do sistema de arquivos
      const fs = require('fs');
      const path = require('path');
      
      if (fs.existsSync(document.file_path)) {
        fs.unlinkSync(document.file_path);
      }

      // Excluir registro do banco
      await knex('partner_documents').where('id', id).del();
      
      return true;
    } catch (error) {
      console.error('Erro ao excluir documento:', error);
      throw error;
    }
  }

  // Verificar se parceiro tem todos os documentos obrigatórios
  static async checkRequiredDocuments(partnerId, partnerType) {
    try {
      const requiredDocuments = this.getRequiredDocuments(partnerType);
      
      const existingDocuments = await knex('partner_documents')
        .select('document_type', 'status')
        .where('partner_id', partnerId)
        .whereIn('document_type', requiredDocuments);

      const documentStatus = {};
      
      requiredDocuments.forEach(docType => {
        const doc = existingDocuments.find(d => d.document_type === docType);
        documentStatus[docType] = {
          required: true,
          uploaded: !!doc,
          status: doc ? doc.status : 'missing',
          verified: doc && doc.status === 'approved'
        };
      });

      return {
        allUploaded: requiredDocuments.every(docType => 
          existingDocuments.some(d => d.document_type === docType)
        ),
        allVerified: requiredDocuments.every(docType => 
          existingDocuments.some(d => d.document_type === docType && d.status === 'approved')
        ),
        documents: documentStatus
      };
    } catch (error) {
      console.error('Erro ao verificar documentos obrigatórios:', error);
      throw error;
    }
  }

  // Obter documentos obrigatórios por tipo de parceiro
  static getRequiredDocuments(partnerType) {
    const baseDocuments = ['rg_cpf', 'residence_proof'];
    
    switch (partnerType) {
      case 'mechanic':
        return [...baseDocuments, 'cnh', 'certification'];
      case 'motoboy':
        return [...baseDocuments, 'cnh', 'crlv'];
      case 'tow':
        return [...baseDocuments, 'cnh', 'crlv'];
      case 'gas_station':
        return [...baseDocuments, 'business_license'];
      case 'auto_parts':
        return [...baseDocuments, 'business_license'];
      default:
        return baseDocuments;
    }
  }

  // Obter estatísticas de documentos
  static async getStats(partnerId = null) {
    try {
      let query = knex('partner_documents');

      if (partnerId) {
        query = query.where('partner_id', partnerId);
      }

      const stats = await query
        .select(
          knex.raw('COUNT(*) as total'),
          knex.raw('SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending'),
          knex.raw('SUM(CASE WHEN status = "approved" THEN 1 ELSE 0 END) as approved'),
          knex.raw('SUM(CASE WHEN status = "rejected" THEN 1 ELSE 0 END) as rejected')
        )
        .first();

      return {
        total: parseInt(stats.total) || 0,
        pending: parseInt(stats.pending) || 0,
        approved: parseInt(stats.approved) || 0,
        rejected: parseInt(stats.rejected) || 0
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas de documentos:', error);
      throw error;
    }
  }

  // Buscar documentos pendentes de verificação
  static async findPendingVerification(limit = 50) {
    try {
      const documents = await knex('partner_documents')
        .select(
          'partner_documents.*',
          'partners.business_name',
          'partners.type as partner_type',
          'users.name as verified_by_name'
        )
        .leftJoin('partners', 'partner_documents.partner_id', 'partners.id')
        .leftJoin('users', 'partner_documents.verified_by', 'users.id')
        .where('partner_documents.status', 'pending')
        .orderBy('partner_documents.uploaded_at', 'asc')
        .limit(limit);

      return documents;
    } catch (error) {
      console.error('Erro ao buscar documentos pendentes:', error);
      throw error;
    }
  }

  // Adicionar metadados de verificação
  static async addVerificationMetadata(id, metadata) {
    try {
      await knex('partner_documents')
        .where('id', id)
        .update({
          verification_metadata: JSON.stringify(metadata),
          updated_at: knex.fn.now()
        });

      return this.findById(id);
    } catch (error) {
      console.error('Erro ao adicionar metadados de verificação:', error);
      throw error;
    }
  }
}

module.exports = PartnerDocument;

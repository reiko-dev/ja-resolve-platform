const Partner = require('../models/Partner');
const PartnerDocument = require('../models/PartnerDocument');
const User = require('../models/User');
const DocumentService = require('../services/DocumentService');
const { normalizePartnerType } = require('../config/partnerDocumentRules');
const { ONBOARDING_STAGES, nextStepFromStage } = require('../config/onboardingStages');
const { validate } = require('../middleware/validation');
const { validateMechanic, validateStore, validateMotoboy, validatePartner, handleValidationErrors } = require('../middleware/partnerValidation');
const { validationResult } = require('express-validator');

class PartnerController {
  static _buildAddressFromPayload(payload) {
    const parts = [
      payload.address,
      payload.number,
      payload.complement,
      payload.neighborhood,
      payload.city,
      payload.state,
      payload.cep,
    ].filter((part) => typeof part === 'string' && part.trim().length > 0);

    return parts.join(', ');
  }

  static _serializeIfPresent(value) {
    if (value == null) {
      return null;
    }

    if (Array.isArray(value) || typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value;
  }

  static _resolveOnboardingStage(user, partner, partnerType) {
    if (user?.onboarding_stage) {
      return user.onboarding_stage;
    }

    if (!partner) {
      return partnerType ? ONBOARDING_STAGES.ACCOUNT_CREATED : null;
    }

    if (partner.approval_status === 'approved') {
      return ONBOARDING_STAGES.APPROVED;
    }

    if (partner.approval_status === 'pending') {
      return ONBOARDING_STAGES.UNDER_REVIEW;
    }

    return ONBOARDING_STAGES.DOCUMENTS_PENDING;
  }

  static async _buildOnboardingStatus(userId, fallbackPartnerType = null) {
    const partner = await Partner.findByUserId(userId);
    const user = await User.findById(userId);
    const partnerType = partner?.type || normalizePartnerType(fallbackPartnerType || user?.onboarding_partner_type || '');
    const onboardingStage = PartnerController._resolveOnboardingStage(user, partner, partnerType);

    if (!partner) {
      const requiredDocuments = DocumentService.getRequiredDocuments(partnerType);
      return {
        hasPartner: false,
        partnerType,
        onboardingStage,
        profileCompleted: false,
        documentsRequired: requiredDocuments.length > 0,
        documentsSubmitted: false,
        approvalStatus: null,
        canAccessDashboard: false,
        nextStep: nextStepFromStage(onboardingStage, partnerType),
        documents: [],
        requiredDocuments,
        missingDocuments: requiredDocuments,
        pendingDocuments: [],
      };
    }

    const documentStatus = await DocumentService.checkRequiredDocuments(partner.id);
    const documentsSubmitted = onboardingStage === ONBOARDING_STAGES.UNDER_REVIEW || onboardingStage === ONBOARDING_STAGES.APPROVED;
    const canAccessDashboard = onboardingStage === ONBOARDING_STAGES.APPROVED;
    const nextStep = nextStepFromStage(onboardingStage, partner.type);

    return {
      hasPartner: true,
      partnerId: partner.id,
      partnerType: partner.type,
      onboardingStage,
      profileCompleted: true,
      documentsRequired: documentStatus.requiresDocuments,
      documentsSubmitted,
      approvalStatus: partner.approval_status,
      canAccessDashboard,
      nextStep,
      documents: documentStatus.uploadedDocuments,
      requiredDocuments: documentStatus.requiredDocuments,
      missingDocuments: documentStatus.missingDocuments,
      pendingDocuments: documentStatus.pendingDocuments,
      rejectionReason: partner.rejection_reason,
    };
  }

  // Buscar parceiros por proximidade
  static async getNearby(req, res) {
    try {
      const { latitude, longitude, radius = 10, type } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórios'
        });
      }

      const partners = await Partner.findByProximity(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius),
        type
      );

      res.json({
        success: true,
        data: partners,
        count: partners.length
      });
    } catch (error) {
      console.error('Erro ao buscar parceiros próximos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar parceiros por especialidade
  static async getBySpecialty(req, res) {
    try {
      const { specialty, latitude, longitude, radius = 10 } = req.query;
      
      if (!specialty || !latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Especialidade, latitude e longitude são obrigatórios'
        });
      }

      const partners = await Partner.findBySpecialty(
        specialty,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius)
      );

      res.json({
        success: true,
        data: partners,
        count: partners.length
      });
    } catch (error) {
      console.error('Erro ao buscar parceiros por especialidade:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar parceiros disponíveis para emergência
  static async getAvailableForEmergency(req, res) {
    try {
      const { type, latitude, longitude, radius = 15 } = req.query;
      
      if (!type || !latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Tipo, latitude e longitude são obrigatórios'
        });
      }

      const partners = await Partner.findAvailableForEmergency(
        type,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius)
      );

      res.json({
        success: true,
        data: partners,
        count: partners.length
      });
    } catch (error) {
      console.error('Erro ao buscar parceiros para emergência:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar motoboys disponíveis
  static async getAvailableMotoboys(req, res) {
    try {
      const { latitude, longitude, radius = 20 } = req.query;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórios'
        });
      }

      const motoboys = await Partner.findAvailableMotoboys(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius)
      );

      res.json({
        success: true,
        data: motoboys,
        count: motoboys.length
      });
    } catch (error) {
      console.error('Erro ao buscar motoboys:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar lojas por categoria
  static async getStoresByCategory(req, res) {
    try {
      const { category, latitude, longitude, radius = 25 } = req.query;
      
      if (!category || !latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Categoria, latitude e longitude são obrigatórios'
        });
      }

      const stores = await Partner.findStoresByCategory(
        category,
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(radius)
      );

      res.json({
        success: true,
        data: stores,
        count: stores.length
      });
    } catch (error) {
      console.error('Erro ao buscar lojas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar todos os parceiros (admin)
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, type, is_verified, is_available, search } = req.query;
      
      const filters = {
        type,
        is_verified: is_verified !== undefined ? is_verified === 'true' : undefined,
        is_available: is_available !== undefined ? is_available === 'true' : undefined,
        search
      };

      const result = await Partner.findAll(
        parseInt(page),
        parseInt(limit),
        filters
      );

      res.json({
        success: true,
        data: result.partners,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      console.error('Erro ao buscar parceiros:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar parceiro por ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      
      const partner = await Partner.findById(id);
      
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      res.json({
        success: true,
        data: partner
      });
    } catch (error) {
      console.error('Erro ao buscar parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar novo parceiro
  static async create(req, res) {
    try {
      const { type } = req.body;

      // Validações específicas por tipo
      let validationErrors = [];
      if (type === 'mechanic') {
        const mechanicValidation = validateMechanic;
        for (const rule of mechanicValidation) {
          await rule.run(req);
        }
        validationErrors = validationResult(req).array();
      } else if (type === 'store') {
        const storeValidation = validateStore;
        for (const rule of storeValidation) {
          await rule.run(req);
        }
        validationErrors = validationResult(req).array();
      } else if (type === 'motoboy') {
        const motoboyValidation = validateMotoboy;
        for (const rule of motoboyValidation) {
          await rule.run(req);
        }
        validationErrors = validationResult(req).array();
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Dados inválidos',
          errors: validationErrors
        });
      }

      const partnerData = {
        ...req.body,
        user_id: req.user.id,
        is_verified: false, // Aguarda aprovação
        is_available: true,
        is_online: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      const partner = await Partner.create(partnerData);

      res.status(201).json({
        success: true,
        data: partner,
        message: 'Parceiro criado com sucesso. Aguarde a aprovação da administração.'
      });
    } catch (error) {
      console.error('Erro ao criar parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar parceiro
  static async update(req, res) {
    try {
      const { id } = req.params;

      const partner = await Partner.update(id, req.body);
      
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      res.json({
        success: true,
        data: partner,
        message: 'Parceiro atualizado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao atualizar parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  static async getCurrentOnboardingStatus(req, res) {
    try {
      const fallbackPartnerType = req.query.partner_type;
      const status = await PartnerController._buildOnboardingStatus(req.user.id, fallbackPartnerType);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      console.error('Erro ao buscar status do onboarding do parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async completeOnboarding(req, res) {
    try {
      const normalizedPartnerType = normalizePartnerType(
        req.body.partner_type ||
        req.body.partnerType ||
        req.user.onboarding_partner_type ||
        '',
      );
      const businessName = (req.body.company_name || req.body.companyName || req.body.trade_name || req.body.tradeName || req.user.name || '').trim();
      const phone = (req.body.phone || req.user.phone || '').trim();
      const address = PartnerController._buildAddressFromPayload(req.body);

      if (!normalizedPartnerType) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de parceiro é obrigatório',
        });
      }

      if (!businessName) {
        return res.status(400).json({
          success: false,
          message: 'Nome do estabelecimento é obrigatório',
        });
      }

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Telefone é obrigatório',
        });
      }

      if (!address) {
        return res.status(400).json({
          success: false,
          message: 'Endereço é obrigatório',
        });
      }

      const partnerPayload = {
        user_id: req.user.id,
        type: normalizedPartnerType,
        business_name: businessName,
        description: req.body.description || null,
        specialties: PartnerController._serializeIfPresent(req.body.specialties),
        address,
        phone,
        whatsapp: req.body.whatsapp || phone,
        website: req.body.website || null,
        instagram: req.body.instagram || null,
        facebook: req.body.facebook || null,
        working_hours: PartnerController._serializeIfPresent(req.body.working_hours || req.body.workingHours),
        service_areas: PartnerController._serializeIfPresent(req.body.service_areas || req.body.serviceAreas),
        certifications: PartnerController._serializeIfPresent(req.body.certifications),
        emergency_service: !!req.body.emergency_service,
        home_service: !!req.body.home_service,
        workshop_service: normalizedPartnerType === 'mechanic',
        delivery_service: normalizedPartnerType === 'motoboy' || !!req.body.delivery_service,
        vehicle_type: req.body.vehicle_type || req.body.vehicleType || null,
        cnh_category: req.body.cnh_category || req.body.cnhCategory || null,
      };

      const partner = await Partner.createOrUpdate(partnerPayload);
      await User.update(req.user.id, {
        onboarding_partner_type: normalizedPartnerType,
        onboarding_stage: ONBOARDING_STAGES.DOCUMENTS_PENDING,
      });
      const status = await PartnerController._buildOnboardingStatus(req.user.id, normalizedPartnerType);

      res.status(201).json({
        success: true,
        message: 'Onboarding do parceiro salvo com sucesso',
        data: {
          partner,
          onboarding: status,
        },
      });
    } catch (error) {
      console.error('Erro ao concluir onboarding do parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async listCurrentPartnerDocuments(req, res) {
    try {
      const partner = await Partner.findByUserId(req.user.id);

      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro ainda não completou o cadastro',
        });
      }

      const documents = await PartnerDocument.findByPartnerId(partner.id);

      res.json({
        success: true,
        data: {
          documents,
          partner_id: partner.id,
          partner_type: partner.type,
        },
      });
    } catch (error) {
      console.error('Erro ao listar documentos do parceiro atual:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  static async submitCurrentPartnerDocuments(req, res) {
    try {
      const partner = await Partner.findByUserId(req.user.id);

      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro ainda não completou o cadastro',
        });
      }

      const documentCheck = await DocumentService.checkRequiredDocuments(partner.id);

      if (documentCheck.missingDocuments.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Ainda faltam documentos obrigatórios',
          data: documentCheck,
        });
      }

      await Partner.updateApprovalStatus(partner.id, 'pending');
      await User.update(req.user.id, {
        onboarding_stage: ONBOARDING_STAGES.UNDER_REVIEW,
      });
      const status = await PartnerController._buildOnboardingStatus(req.user.id, partner.type);

      res.json({
        success: true,
        message: 'Documentos enviados para análise com sucesso',
        data: status,
      });
    } catch (error) {
      console.error('Erro ao submeter documentos do parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  // Deletar parceiro
  static async delete(req, res) {
    try {
      const { id } = req.params;
      
      const deleted = await Partner.delete(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Parceiro deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar status online/offline
  static async updateOnlineStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_online } = req.body;
      
      const partner = await Partner.updateOnlineStatus(id, is_online);
      
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Status atualizado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar localização
  static async updateLocation(req, res) {
    try {
      const { id } = req.params;
      const { latitude, longitude, address } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórios'
        });
      }

      const partner = await Partner.updateLocation(id, latitude, longitude, address);
      
      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      res.json({
        success: true,
        message: 'Localização atualizada com sucesso'
      });
    } catch (error) {
      console.error('Erro ao atualizar localização:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar mecânico via admin (POST /partners/admin/mechanic).
  // Insere em partners (não na tabela legada mechanics); user_id null,
  // sem upsert por user_id.
  static async createAdminMechanic(req, res) {
    try {
      const {
        business_name,
        description = null,
        specialties = [],
        address = null,
        phone,
        latitude = null,
        longitude = null,
        hourly_rate = null,
        experience_years = null,
        emergency_service = false,
        home_service = false,
        workshop_service = true,
      } = req.body;

      const digits = String(phone || '').replace(/\D/g, '');

      const partnerData = {
        user_id: null,
        type: 'mechanic',
        business_name: String(business_name).trim(),
        description: description != null && String(description).trim() !== '' ? description : null,
        specialties: Array.isArray(specialties) ? specialties : [],
      address: address != null && String(address).trim() !== '' ? String(address).trim() : null,
        latitude: latitude === '' || latitude == null ? null : Number(latitude),
        longitude: longitude === '' || longitude == null ? null : Number(longitude),
        phone: digits,
        hourly_rate: hourly_rate === '' || hourly_rate == null ? null : Number(hourly_rate),
        experience_years: experience_years === '' || experience_years == null ? null : parseInt(experience_years, 10),
        emergency_service: !!emergency_service,
        home_service: !!home_service,
        workshop_service: workshop_service == null ? true : !!workshop_service,
        is_verified: false,
        is_available: true,
        is_online: false,
        approval_status: 'pending',
      };

      const partner = await Partner.createRaw(partnerData);

      return res.status(201).json({
        success: true,
        data: partner,
        message: 'Mecânico cadastrado com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao criar mecânico (admin):', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
      });
    }
  }

  // Criar mecânico específico
  static async createMechanic(req, res) {
    try {
      const { specialties, ...otherData } = req.body;
      
      const partnerData = {
        ...otherData,
        type: 'mechanic',
        user_id: req.user.id,
        is_verified: false,
        is_available: true,
        is_online: false,
        specialties: Array.isArray(specialties) ? specialties : [],
        created_at: new Date(),
        updated_at: new Date()
      };

      const partner = await Partner.create(partnerData);

      res.status(201).json({
        success: true,
        data: partner,
        message: 'Mecânico cadastrado com sucesso. Aguarde a aprovação da administração.'
      });
    } catch (error) {
      console.error('Erro ao criar mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar lojista específico
  static async createStore(req, res) {
    try {
      const partnerData = {
        ...req.body,
        type: 'store',
        user_id: req.user.id,
        is_verified: false,
        is_available: true,
        is_online: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      const partner = await Partner.create(partnerData);

      res.status(201).json({
        success: true,
        data: partner,
        message: 'Lojista cadastrado com sucesso. Aguarde a aprovação da administração.'
      });
    } catch (error) {
      console.error('Erro ao criar lojista:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar motoboy específico
  static async createMotoboy(req, res) {
    try {
      const partnerData = {
        ...req.body,
        type: 'motoboy',
        user_id: req.user.id,
        is_verified: false,
        is_available: true,
        is_online: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      const partner = await Partner.create(partnerData);

      res.status(201).json({
        success: true,
        data: partner,
        message: 'Motoboy cadastrado com sucesso. Aguarde a aprovação da administração.'
      });
    } catch (error) {
      console.error('Erro ao criar motoboy:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Aprovar parceiro (admin)
  static async approvePartner(req, res) {
    try {
      const { id } = req.params;
      const { is_verified, status, rejection_reason } = req.body;
      const existingPartner = await Partner.findById(id);

      if (!existingPartner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      const shouldApprove = status === 'approved' || (status == null && is_verified === true);
      const approvalStatus = shouldApprove ? 'approved' : 'rejected';

      const partner = await Partner.updateApprovalStatus(
        id,
        approvalStatus,
        req.user.id,
        shouldApprove ? null : (rejection_reason || null),
      );

      await PartnerDocument.updateStatusByPartner(
        id,
        shouldApprove ? 'approved' : 'rejected',
        req.user.id,
        shouldApprove ? null : (rejection_reason || null),
        ['pending'],
      );

      await User.update(existingPartner.user_id, {
        onboarding_stage: shouldApprove
          ? ONBOARDING_STAGES.APPROVED
          : ONBOARDING_STAGES.DOCUMENTS_PENDING,
      });

      if (!shouldApprove && rejection_reason) {
        partner.rejection_reason = rejection_reason;
      }

      res.json({
        success: true,
        data: partner,
        message: shouldApprove ? 'Parceiro aprovado com sucesso' : 'Parceiro rejeitado'
      });
    } catch (error) {
      console.error('Erro ao aprovar parceiro:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = PartnerController;

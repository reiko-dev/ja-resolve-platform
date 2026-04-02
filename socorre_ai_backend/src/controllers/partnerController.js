const Partner = require('../models/Partner');
const { validate } = require('../middleware/validation');
const { validateMechanic, validateStore, validateMotoboy, validatePartner, handleValidationErrors } = require('../middleware/partnerValidation');
const { validationResult } = require('express-validator');

class PartnerController {
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
      const { is_verified } = req.body;

      const partner = await Partner.update(id, { 
        is_verified,
        updated_at: new Date()
      });

      if (!partner) {
        return res.status(404).json({
          success: false,
          message: 'Parceiro não encontrado'
        });
      }

      res.json({
        success: true,
        data: partner,
        message: is_verified ? 'Parceiro aprovado com sucesso' : 'Parceiro rejeitado'
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

const Mechanic = require('../models/Mechanic');
const Service = require('../models/Service');
const Review = require('../models/Review');

class MechanicController {
  // Listar todos os mecânicos
  static async getAllMechanics(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await Mechanic.findAll(parseInt(page), parseInt(limit));
      
      res.json({
        success: true,
        data: result.mechanics,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar mecânicos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar mecânico por ID
  static async getMechanicById(req, res) {
    try {
      const { id } = req.params;
      const mechanic = await Mechanic.findByIdWithDetails(parseInt(id));
      
      if (!mechanic) {
        return res.status(404).json({
          success: false,
          message: 'Mecânico não encontrado'
        });
      }
      
      res.json({
        success: true,
        data: mechanic
      });
    } catch (error) {
      console.error('Erro ao buscar mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar mecânicos por proximidade
  static async getMechanicsByProximity(req, res) {
    try {
      const { lat, lng, radius = 10, limit = 20 } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          message: 'Latitude e longitude são obrigatórias'
        });
      }
      
      const mechanics = await Mechanic.findByProximity(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(radius),
        parseInt(limit)
      );
      
      res.json({
        success: true,
        data: mechanics
      });
    } catch (error) {
      console.error('Erro ao buscar mecânicos por proximidade:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar mecânicos por especialidade
  static async getMechanicsBySpecialty(req, res) {
    try {
      const { specialty } = req.params;
      const { limit = 20 } = req.query;
      
      if (!specialty) {
        return res.status(400).json({
          success: false,
          message: 'Especialidade é obrigatória'
        });
      }
      
      const mechanics = await Mechanic.findBySpecialty(specialty, parseInt(limit));
      
      res.json({
        success: true,
        data: mechanics
      });
    } catch (error) {
      console.error('Erro ao buscar mecânicos por especialidade:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar mecânicos com filtros avançados
  static async searchMechanics(req, res) {
    try {
      const { limit = 20, ...filters } = req.query;
      
      // Converter filtros para tipos corretos
      if (filters.minRating) filters.minRating = parseFloat(filters.minRating);
      if (filters.maxPrice) filters.maxPrice = parseFloat(filters.maxPrice);
      if (filters.lat) filters.lat = parseFloat(filters.lat);
      if (filters.lng) filters.lng = parseFloat(filters.lng);
      if (filters.radius) filters.radius = parseFloat(filters.radius);
      if (filters.homeService !== undefined) filters.homeService = filters.homeService === 'true';
      if (filters.emergencyService !== undefined) filters.emergencyService = filters.emergencyService === 'true';
      
      const mechanics = await Mechanic.findByFilters(filters, parseInt(limit));
      
      res.json({
        success: true,
        data: mechanics
      });
    } catch (error) {
      console.error('Erro ao buscar mecânicos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar novo mecânico
  static async createMechanic(req, res) {
    try {
      const mechanicData = {
        ...req.body,
        user_id: req.user.id // ID do usuário logado
      };
      
      // Verificar se o usuário já é um mecânico
      const existingMechanic = await Mechanic.findByUserId(req.user.id);
      if (existingMechanic) {
        return res.status(400).json({
          success: false,
          message: 'Usuário já possui perfil de mecânico'
        });
      }
      
      const mechanic = await Mechanic.create(mechanicData);
      
      res.status(201).json({
        success: true,
        message: 'Mecânico criado com sucesso',
        data: mechanic
      });
    } catch (error) {
      console.error('Erro ao criar mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar mecânico
  static async updateMechanic(req, res) {
    try {
      const { id } = req.params;
      const mechanic = await Mechanic.findById(parseInt(id));
      
      if (!mechanic) {
        return res.status(404).json({
          success: false,
          message: 'Mecânico não encontrado'
        });
      }
      
      // Verificar se o usuário é o dono do perfil ou admin
      if (mechanic.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const updatedMechanic = await Mechanic.update(parseInt(id), req.body);
      
      res.json({
        success: true,
        message: 'Mecânico atualizado com sucesso',
        data: updatedMechanic
      });
    } catch (error) {
      console.error('Erro ao atualizar mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar mecânico
  static async deleteMechanic(req, res) {
    try {
      const { id } = req.params;
      const mechanic = await Mechanic.findById(parseInt(id));
      
      if (!mechanic) {
        return res.status(404).json({
          success: false,
          message: 'Mecânico não encontrado'
        });
      }
      
      // Verificar se o usuário é o dono do perfil ou admin
      if (mechanic.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      await Mechanic.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Mecânico deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Verificar mecânico (admin)
  static async verifyMechanic(req, res) {
    try {
      const { id } = req.params;
      const { is_verified } = req.body;
      
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const mechanic = await Mechanic.findById(parseInt(id));
      if (!mechanic) {
        return res.status(404).json({
          success: false,
          message: 'Mecânico não encontrado'
        });
      }
      
      const updatedMechanic = await Mechanic.update(parseInt(id), { is_verified });
      
      res.json({
        success: true,
        message: `Mecânico ${is_verified ? 'verificado' : 'desverificado'} com sucesso`,
        data: updatedMechanic
      });
    } catch (error) {
      console.error('Erro ao verificar mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar serviços do mecânico
  static async getMechanicServices(req, res) {
    try {
      const { id } = req.params;
      const services = await Service.findByMechanicId(parseInt(id));
      
      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      console.error('Erro ao buscar serviços do mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar avaliações do mecânico
  static async getMechanicReviews(req, res) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;
      
      const reviews = await Review.findByMechanicId(parseInt(id), parseInt(page), parseInt(limit));
      
      res.json({
        success: true,
        data: reviews.reviews,
        pagination: reviews.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar avaliações do mecânico:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = MechanicController;

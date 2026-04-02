const Service = require('../models/Service');

class ServiceController {
  // Listar todos os serviços
  static async getAllServices(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await Service.findAll(parseInt(page), parseInt(limit));
      
      res.json({
        success: true,
        data: result.services,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar serviços:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar serviço por ID
  static async getServiceById(req, res) {
    try {
      const { id } = req.params;
      const service = await Service.findById(parseInt(id));
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Serviço não encontrado'
        });
      }
      
      res.json({
        success: true,
        data: service
      });
    } catch (error) {
      console.error('Erro ao buscar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar serviços por categoria
  static async getServicesByCategory(req, res) {
    try {
      const { category } = req.params;
      const { limit = 20 } = req.query;
      
      const services = await Service.findByCategory(category, parseInt(limit));
      
      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      console.error('Erro ao buscar serviços por categoria:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar serviços por faixa de preço
  static async getServicesByPriceRange(req, res) {
    try {
      const { minPrice, maxPrice, limit = 20 } = req.query;
      
      if (!minPrice || !maxPrice) {
        return res.status(400).json({
          success: false,
          message: 'Preço mínimo e máximo são obrigatórios'
        });
      }
      
      const services = await Service.findByPriceRange(
        parseFloat(minPrice),
        parseFloat(maxPrice),
        parseInt(limit)
      );
      
      res.json({
        success: true,
        data: services
      });
    } catch (error) {
      console.error('Erro ao buscar serviços por preço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar categorias disponíveis
  static async getCategories(req, res) {
    try {
      const categories = await Service.getCategories();
      
      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar subcategorias por categoria
  static async getSubcategories(req, res) {
    try {
      const { category } = req.params;
      const subcategories = await Service.getSubcategories(category);
      
      res.json({
        success: true,
        data: subcategories
      });
    } catch (error) {
      console.error('Erro ao buscar subcategorias:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar novo serviço
  static async createService(req, res) {
    try {
      const serviceData = {
        ...req.body,
        mechanic_id: req.user.id // ID do usuário logado
      };
      
      const service = await Service.create(serviceData);
      
      res.status(201).json({
        success: true,
        message: 'Serviço criado com sucesso',
        data: service
      });
    } catch (error) {
      console.error('Erro ao criar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar serviço
  static async updateService(req, res) {
    try {
      const { id } = req.params;
      const service = await Service.findById(parseInt(id));
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Serviço não encontrado'
        });
      }
      
      // Verificar se o usuário é o dono do serviço ou admin
      if (service.mechanic_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const updatedService = await Service.update(parseInt(id), req.body);
      
      res.json({
        success: true,
        message: 'Serviço atualizado com sucesso',
        data: updatedService
      });
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar serviço
  static async deleteService(req, res) {
    try {
      const { id } = req.params;
      const service = await Service.findById(parseInt(id));
      
      if (!service) {
        return res.status(404).json({
          success: false,
          message: 'Serviço não encontrado'
        });
      }
      
      // Verificar se o usuário é o dono do serviço ou admin
      if (service.mechanic_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      await Service.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Serviço deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar serviço:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = ServiceController;

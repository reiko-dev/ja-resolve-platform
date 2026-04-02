const knex = require('../config/database');

class Service {
  static tableName = 'services';

  // Buscar serviços por mecânico
  static async findByMechanicId(mechanicId) {
    return knex(this.tableName)
      .where('mechanic_id', mechanicId)
      .where('is_available', true)
      .orderBy('name');
  }

  // Buscar serviços por categoria
  static async findByCategory(category, limit = 20) {
    return knex(this.tableName)
      .select('services.*', 'mechanics.business_name', 'mechanics.rating')
      .join('mechanics', 'services.mechanic_id', 'mechanics.id')
      .where('services.category', category)
      .where('services.is_available', true)
      .where('mechanics.is_available', true)
      .where('mechanics.is_verified', true)
      .orderBy('mechanics.rating', 'desc')
      .limit(limit);
  }

  // Buscar serviços por preço
  static async findByPriceRange(minPrice, maxPrice, limit = 20) {
    return knex(this.tableName)
      .select('services.*', 'mechanics.business_name', 'mechanics.rating')
      .join('mechanics', 'services.mechanic_id', 'mechanics.id')
      .where('services.price', '>=', minPrice)
      .where('services.price', '<=', maxPrice)
      .where('services.is_available', true)
      .where('mechanics.is_available', true)
      .where('mechanics.is_verified', true)
      .orderBy('services.price')
      .limit(limit);
  }

  // Criar novo serviço
  static async create(serviceData) {
    const [id] = await knex(this.tableName).insert(serviceData);
    return this.findById(id);
  }

  // Atualizar serviço
  static async update(id, serviceData) {
    await knex(this.tableName).where('id', id).update(serviceData);
    return this.findById(id);
  }

  // Deletar serviço
  static async delete(id) {
    return knex(this.tableName).where('id', id).del();
  }

  // Buscar por ID
  static async findById(id) {
    return knex(this.tableName).where('id', id).first();
  }

  // Listar todos com paginação
  static async findAll(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    const [services, total] = await Promise.all([
      knex(this.tableName)
        .select('services.*', 'mechanics.business_name')
        .join('mechanics', 'services.mechanic_id', 'mechanics.id')
        .orderBy('services.created_at', 'desc')
        .limit(limit)
        .offset(offset),
      knex(this.tableName).count('* as total').first()
    ]);

    return {
      services,
      pagination: {
        page,
        limit,
        total: parseInt(total.total),
        pages: Math.ceil(total.total / limit)
      }
    };
  }

  // Buscar categorias disponíveis
  static async getCategories() {
    return knex(this.tableName)
      .distinct('category')
      .where('is_available', true)
      .orderBy('category');
  }

  // Buscar subcategorias por categoria
  static async getSubcategories(category) {
    return knex(this.tableName)
      .distinct('subcategory')
      .where('category', category)
      .where('is_available', true)
      .whereNotNull('subcategory')
      .orderBy('subcategory');
  }
}

module.exports = Service;

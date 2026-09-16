const knex = require('../config/database');

class User {
  // Buscar usuário por ID
  static async findById(id) {
    const user = await knex('users').where('id', id).first();
    return user;
  }

  // Buscar usuário por email
  static async findByEmail(email) {
    const user = await knex('users').where('email', email).first();
    return user;
  }

  // Criar usuário
  static async create(userData) {
    const [user] = await knex('users')
      .insert({
        ...userData,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      })
      .returning('*');
    return user;
  }

  // Atualizar usuário (aceita transação opcional para gravações atômicas)
  static async update(id, data, { trx } = {}) {
    const db = trx || knex;
    const [user] = await db('users')
      .where('id', id)
      .update({
        ...data,
        updated_at: knex.fn.now()
      })
      .returning('*');
    return user;
  }

  // Verificar se usuário é admin
  static async isAdmin(userId) {
    const user = await this.findById(userId);
    return user && user.role === 'admin';
  }
}

module.exports = User;

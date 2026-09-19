const bcrypt = require('bcryptjs');

exports.seed = function(knex) {
  // Deletar usuários clientes existentes
  return knex('users').where('role', 'user').del()
    .then(function () {
      // Inserir usuários clientes
      return knex('users').insert([
        {
          name: 'Carlos Silva',
          email: 'carlos@email.com',
          password: bcrypt.hashSync('123456', 10),
          phone: '+5511999888777',
          role: 'user',
          is_active: true,
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          name: 'Ana Costa',
          email: 'ana@email.com',
          password: bcrypt.hashSync('123456', 10),
          phone: '+5511888777666',
          role: 'user',
          is_active: true,
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          name: 'Roberto Santos',
          email: 'roberto@email.com',
          password: bcrypt.hashSync('123456', 10),
          phone: '+5511777666555',
          role: 'user',
          is_active: true,
          email_verified: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    });
};

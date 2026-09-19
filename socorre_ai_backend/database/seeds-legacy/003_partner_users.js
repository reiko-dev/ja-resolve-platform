const bcrypt = require('bcryptjs');

exports.seed = function(knex) {
  // Deletar usuários parceiros existentes
  return knex('users').where('role', 'partner').del()
    .then(function () {
      // Inserir usuários parceiros
      return knex('users').insert([
        {
          name: 'João Silva',
          email: 'joao@autocentersp.com',
          password: bcrypt.hashSync('123456', 10),
          phone: '+5511999999999',
          role: 'partner',
          is_active: true,
          email_verified: true
        },
        {
          name: 'Maria Santos',
          email: 'maria@mecanicaexpress.com',
          password: bcrypt.hashSync('123456', 10),
          phone: '+5511888888888',
          role: 'partner',
          is_active: true,
          email_verified: true
        },
        {
          name: 'Pedro Oliveira',
          email: 'pedro@oficinadojoao.com',
          password: bcrypt.hashSync('123456', 10),
          phone: '+5511777777777',
          role: 'partner',
          is_active: true,
          email_verified: true
        }
      ]);
    });
};

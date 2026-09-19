const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Deletar dados existentes
  await knex('users').del();
  await knex('categories').del();

  // Inserir usuário admin
  const hashedPassword = await bcrypt.hash('admin123', 12);
  await knex('users').insert([
    {
      name: 'Administrador',
      email: 'admin@socorreai.com',
      password: hashedPassword,
      phone: '+5511999999999',
      role: 'admin',
      is_active: true,
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Inserir categorias padrão
  await knex('categories').insert([
    {
      name: 'Mecânico',
      description: 'Serviços de mecânica automotiva',
      icon: 'build',
      color: '#E30613',
      is_active: true,
      sort_order: 1,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'Peças',
      description: 'Venda de peças automotivas',
      icon: 'settings',
      color: '#002F6C',
      is_active: true,
      sort_order: 2,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'Guincho',
      description: 'Serviços de guincho e reboque',
      icon: 'local_shipping',
      color: '#FF9800',
      is_active: true,
      sort_order: 3,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'Cursos',
      description: 'Cursos de mecânica e manutenção',
      icon: 'school',
      color: '#4CAF50',
      is_active: true,
      sort_order: 4,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
};

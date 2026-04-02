const bcrypt = require('bcryptjs');

exports.seed = async function(knex) {
  // Deletar usuários parceiros existentes
  await knex('users').where('role', 'partner').del();

  // Inserir usuários parceiros
  await knex('users').insert([
    {
      name: 'João Mecânico',
      email: 'parceiro@email.com',
      password: await bcrypt.hash('123456', 10),
      phone: '+5511999888777',
      role: 'partner',
      is_active: true,
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'Maria Mecânica',
      email: 'maria@email.com',
      password: await bcrypt.hash('123456', 10),
      phone: '+5511888777666',
      role: 'partner',
      is_active: true,
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      name: 'Pedro Motoboy',
      email: 'pedro@email.com',
      password: await bcrypt.hash('123456', 10),
      phone: '+5511777666555',
      role: 'partner',
      is_active: true,
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);

  // Inserir dados dos parceiros
  const users = await knex('users').where('role', 'partner');
  
  for (const user of users) {
    await knex('partners').insert({
      user_id: user.id,
      type: user.name.includes('Motoboy') ? 'motoboy' : 'mechanic',
      business_name: user.name.includes('Motoboy') ? 'Delivery Express' : 'Auto Socorro 24h',
      cnpj: '12.345.678/0001-90',
      address: JSON.stringify({
        street: 'Rua das Flores, 123',
        city: 'São Paulo',
        state: 'SP',
        zip_code: '01234-567',
        latitude: -23.5505,
        longitude: -46.6333
      }),
      specialties: JSON.stringify(['emergency', 'towing', 'battery']),
      is_online: false,
      rating: 4.8,
      total_services: 0,
      created_at: new Date(),
      updated_at: new Date()
    });
  }
};

exports.seed = function(knex) {
  // Deletar dados existentes
  return knex('mechanics').del()
    .then(function () {
      // Inserir mecânicos de exemplo
      return knex('mechanics').insert([
        {
          user_id: 2, // Assumindo que o usuário 2 é um parceiro
          business_name: 'Auto Center São Paulo',
          description: 'Especialistas em mecânica geral, elétrica e injeção eletrônica. Atendimento com qualidade e garantia.',
          specialties: JSON.stringify(['Mecânica Geral', 'Elétrica', 'Injeção Eletrônica', 'Freios', 'Suspensão']),
          address: 'Rua das Flores, 123 - Vila Madalena, São Paulo - SP',
          latitude: -23.5505,
          longitude: -46.6333,
          phone: '+5511999999999',
          whatsapp: '+5511999999999',
          website: 'https://autocentersp.com.br',
          instagram: '@autocentersp',
          hourly_rate: 80.00,
          service_fee: 50.00,
          is_verified: true,
          is_available: true,
          working_hours: JSON.stringify({
            'segunda': { start: '08:00', end: '18:00' },
            'terça': { start: '08:00', end: '18:00' },
            'quarta': { start: '08:00', end: '18:00' },
            'quinta': { start: '08:00', end: '18:00' },
            'sexta': { start: '08:00', end: '18:00' },
            'sábado': { start: '08:00', end: '12:00' }
          }),
          payment_methods: JSON.stringify(['Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito']),
          service_areas: JSON.stringify(['Vila Madalena', 'Pinheiros', 'Vila Olímpia', 'Itaim Bibi']),
          experience_years: 15,
          certifications: JSON.stringify(['SENAI', 'FENASENAI', 'Bosch']),
          insurance_info: 'Seguro de responsabilidade civil',
          warranty_info: 'Garantia de 90 dias para peças e mão de obra',
          emergency_service: true,
          home_service: true,
          workshop_service: true,
          rating: 4.8,
          total_reviews: 127
        },
        {
          user_id: 3, // Assumindo que o usuário 3 é outro parceiro
          business_name: 'Mecânica Express',
          description: 'Mecânica especializada em diagnósticos rápidos e reparos de emergência. Atendimento 24h para emergências.',
          specialties: JSON.stringify(['Diagnóstico', 'Emergências', 'Mecânica Rápida', 'Troca de Óleo']),
          address: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP',
          latitude: -23.5631,
          longitude: -46.6544,
          phone: '+5511888888888',
          whatsapp: '+5511888888888',
          hourly_rate: 120.00,
          service_fee: 80.00,
          is_verified: true,
          is_available: true,
          working_hours: JSON.stringify({
            'segunda': { start: '07:00', end: '19:00' },
            'terça': { start: '07:00', end: '19:00' },
            'quarta': { start: '07:00', end: '19:00' },
            'quinta': { start: '07:00', end: '19:00' },
            'sexta': { start: '07:00', end: '19:00' },
            'sábado': { start: '07:00', end: '17:00' },
            'domingo': { start: '08:00', end: '16:00' }
          }),
          payment_methods: JSON.stringify(['PIX', 'Cartão de Crédito', 'Cartão de Débito']),
          service_areas: JSON.stringify(['Bela Vista', 'Consolação', 'Vila Buarque', 'Higienópolis']),
          experience_years: 8,
          certifications: JSON.stringify(['SENAI', 'Ford']),
          emergency_service: true,
          home_service: false,
          workshop_service: true,
          rating: 4.6,
          total_reviews: 89
        },
        {
          user_id: 4, // Assumindo que o usuário 4 é outro parceiro
          business_name: 'Oficina do João',
          description: 'Oficina familiar com mais de 20 anos de experiência. Especializada em carros antigos e clássicos.',
          specialties: JSON.stringify(['Carros Antigos', 'Clássicos', 'Restauração', 'Mecânica Tradicional']),
          address: 'Rua dos Carros, 456 - Centro, São Paulo - SP',
          latitude: -23.5489,
          longitude: -46.6388,
          phone: '+5511777777777',
          hourly_rate: 60.00,
          service_fee: 30.00,
          is_verified: true,
          is_available: true,
          working_hours: JSON.stringify({
            'segunda': { start: '08:00', end: '17:00' },
            'terça': { start: '08:00', end: '17:00' },
            'quarta': { start: '08:00', end: '17:00' },
            'quinta': { start: '08:00', end: '17:00' },
            'sexta': { start: '08:00', end: '17:00' }
          }),
          payment_methods: JSON.stringify(['Dinheiro', 'PIX']),
          service_areas: JSON.stringify(['Centro', 'Sé', 'República', 'Santa Ifigênia']),
          experience_years: 25,
          emergency_service: false,
          home_service: false,
          workshop_service: true,
          rating: 4.9,
          total_reviews: 203
        }
      ]);
    });
};

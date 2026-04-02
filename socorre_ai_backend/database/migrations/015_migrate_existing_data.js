exports.up = async function(knex) {
  // Migrar dados de mecânicos para a nova tabela de parceiros
  const existingMechanics = await knex('mechanics').select('*');
  
  for (const mechanic of existingMechanics) {
    await knex('partners').insert({
      user_id: mechanic.user_id,
      type: 'mechanic',
      business_name: mechanic.business_name,
      description: mechanic.description,
      specialties: mechanic.specialties,
      address: mechanic.address,
      latitude: mechanic.latitude,
      longitude: mechanic.longitude,
      phone: mechanic.phone,
      whatsapp: mechanic.whatsapp,
      website: mechanic.website,
      instagram: mechanic.instagram,
      facebook: mechanic.facebook,
      hourly_rate: mechanic.hourly_rate,
      service_fee: mechanic.service_fee,
      is_verified: mechanic.is_verified,
      is_available: mechanic.is_available,
      working_hours: mechanic.working_hours,
      payment_methods: mechanic.payment_methods,
      service_areas: mechanic.service_areas,
      experience_years: mechanic.experience_years,
      certifications: mechanic.certifications,
      insurance_info: mechanic.insurance_info,
      warranty_info: mechanic.warranty_info,
      emergency_service: mechanic.emergency_service,
      home_service: mechanic.home_service,
      workshop_service: mechanic.workshop_service,
      rating: mechanic.rating,
      total_reviews: mechanic.total_reviews,
      created_at: mechanic.created_at,
      updated_at: mechanic.updated_at
    });
  }

  // Migrar dados de serviços para a nova tabela de serviços de parceiros
  const existingServices = await knex('services').select('*');
  
  for (const service of existingServices) {
    // Buscar o partner_id correspondente
    const partner = await knex('partners')
      .where('user_id', service.mechanic_id)
      .andWhere('type', 'mechanic')
      .first();
    
    if (partner) {
      await knex('partner_services').insert({
        partner_id: partner.id,
        name: service.name,
        description: service.description,
        price: service.price,
        price_type: service.price_type,
        estimated_duration_minutes: service.estimated_duration,
        category: service.category,
        subcategory: service.subcategory,
        is_available: service.is_available,
        emergency_service: service.category === 'emergency',
        created_at: service.created_at,
        updated_at: service.updated_at
      });
    }
  }

  // Migrar dados de agendamentos para solicitações de emergência
  const existingAppointments = await knex('appointments').select('*');
  
  for (const appointment of existingAppointments) {
    // Buscar o partner_id correspondente
    const partner = await knex('partners')
      .where('user_id', appointment.mechanic_id)
      .andWhere('type', 'mechanic')
      .first();
    
    if (partner) {
      await knex('emergency_requests').insert({
        user_id: appointment.user_id,
        type: 'mechanical',
        description: appointment.description || 'Serviço mecânico agendado',
        vehicle_info: appointment.vehicle_info,
        location_type: appointment.location_type,
        latitude: appointment.latitude,
        longitude: appointment.longitude,
        address: appointment.address,
        status: appointment.status === 'pending' ? 'pending' : 
                appointment.status === 'confirmed' ? 'accepted' :
                appointment.status === 'in_progress' ? 'in_progress' :
                appointment.status === 'completed' ? 'completed' : 'cancelled',
        partner_id: partner.id,
        estimated_price: appointment.estimated_price,
        final_price: appointment.final_price,
        notes: appointment.notes,
        accepted_at: appointment.status === 'confirmed' ? appointment.scheduled_date : null,
        started_at: appointment.status === 'in_progress' ? appointment.scheduled_date : null,
        completed_at: appointment.completed_at,
        created_at: appointment.created_at,
        updated_at: appointment.updated_at
      });
    }
  }

  console.log('✅ Migração de dados concluída com sucesso!');
};

exports.down = async function(knex) {
  // Reverter a migração (opcional - apenas se necessário)
  await knex('emergency_requests').del();
  await knex('partner_services').del();
  await knex('partners').del();
  
  console.log('✅ Reversão da migração concluída!');
};

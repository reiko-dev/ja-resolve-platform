const Joi = require('joi');

// Schemas de autenticação
const authSchemas = {
  register: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    role: Joi.string().valid('user', 'partner', 'admin').default('user'),
    cpf: Joi.string().pattern(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/).optional(),
    partnerType: Joi.string().optional(),
    partner_type: Joi.string().optional(),
    cnpj: Joi.string().optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  })
};

// Schemas existentes
const userSchemas = {
  createUser: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    role: Joi.string().valid('user', 'partner', 'admin').default('user'),
    cpf: Joi.string().pattern(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/).optional(),
    cnpj: Joi.string().pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).optional(),
    address: Joi.string().max(255).optional(),
    is_active: Joi.boolean().default(true),
    email_verified: Joi.boolean().default(false),
    firebase_token: Joi.string().optional()
  }),

  updateUser: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    role: Joi.string().valid('user', 'partner', 'admin').optional(),
    cpf: Joi.string().pattern(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/).optional(),
    cnpj: Joi.string().pattern(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/).optional(),
    address: Joi.string().max(255).optional(),
    is_active: Joi.boolean().optional(),
    email_verified: Joi.boolean().optional(),
    firebase_token: Joi.string().optional()
  })
};

// Novos schemas para mecânicos
const mechanicSchemas = {
  createMechanic: Joi.object({
    business_name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(1000).optional(),
    specialties: Joi.array().items(Joi.string()).min(1).required(),
    address: Joi.string().max(255).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    whatsapp: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    website: Joi.string().uri().optional(),
    instagram: Joi.string().max(100).optional(),
    facebook: Joi.string().max(100).optional(),
    hourly_rate: Joi.number().min(0).precision(2).optional(),
    service_fee: Joi.number().min(0).precision(2).optional(),
    working_hours: Joi.object().optional(),
    payment_methods: Joi.array().items(Joi.string()).optional(),
    service_areas: Joi.array().items(Joi.string()).optional(),
    experience_years: Joi.number().integer().min(0).max(50).optional(),
    certifications: Joi.array().items(Joi.string()).optional(),
    insurance_info: Joi.string().max(500).optional(),
    warranty_info: Joi.string().max(500).optional(),
    emergency_service: Joi.boolean().default(false),
    home_service: Joi.boolean().default(false),
    workshop_service: Joi.boolean().default(true)
  }),

  updateMechanic: Joi.object({
    business_name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(1000).optional(),
    specialties: Joi.array().items(Joi.string()).min(1).optional(),
    address: Joi.string().max(255).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    whatsapp: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    website: Joi.string().uri().optional(),
    instagram: Joi.string().max(100).optional(),
    facebook: Joi.string().max(100).optional(),
    hourly_rate: Joi.number().min(0).precision(2).optional(),
    service_fee: Joi.number().min(0).precision(2).optional(),
    working_hours: Joi.object().optional(),
    payment_methods: Joi.array().items(Joi.string()).optional(),
    service_areas: Joi.array().items(Joi.string()).optional(),
    experience_years: Joi.number().integer().min(0).max(50).optional(),
    certifications: Joi.array().items(Joi.string()).optional(),
    insurance_info: Joi.string().max(500).optional(),
    warranty_info: Joi.string().max(500).optional(),
    emergency_service: Joi.boolean().optional(),
    home_service: Joi.boolean().optional(),
    workshop_service: Joi.boolean().optional(),
    is_available: Joi.boolean().optional()
  })
};

// Schemas para serviços
const serviceSchemas = {
  createService: Joi.object({
    mechanic_id: Joi.number().integer().positive().required(),
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(1000).optional(),
    price: Joi.number().min(0).precision(2).required(),
    price_type: Joi.string().valid('fixed', 'hourly', 'variable').required(),
    estimated_duration: Joi.number().integer().min(1).max(1440).optional(), // em minutos
    category: Joi.string().max(50).required(),
    subcategory: Joi.string().max(50).optional(),
    warranty_included: Joi.boolean().default(false),
    warranty_days: Joi.number().integer().min(0).optional()
  }),

  updateService: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(1000).optional(),
    price: Joi.number().min(0).precision(2).optional(),
    price_type: Joi.string().valid('fixed', 'hourly', 'variable').optional(),
    estimated_duration: Joi.number().integer().min(1).max(1440).optional(),
    category: Joi.string().max(50).optional(),
    subcategory: Joi.string().max(50).optional(),
    warranty_included: Joi.boolean().optional(),
    warranty_days: Joi.number().integer().min(0).optional(),
    is_available: Joi.boolean().optional()
  })
};

// Schemas para agendamentos
const appointmentSchemas = {
  createAppointment: Joi.object({
    mechanic_id: Joi.number().integer().positive().required(),
    service_id: Joi.number().integer().positive().optional(),
    scheduled_date: Joi.date().greater('now').required(),
    description: Joi.string().max(1000).optional(),
    vehicle_info: Joi.object({
      brand: Joi.string().max(50).required(),
      model: Joi.string().max(50).required(),
      year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1).required(),
      license_plate: Joi.string().max(10).optional(),
      color: Joi.string().max(30).optional(),
      engine: Joi.string().max(50).optional()
    }).required(),
    location_type: Joi.string().valid('workshop', 'home', 'roadside').required(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    address: Joi.string().max(255).optional(),
    estimated_price: Joi.number().min(0).precision(2).optional(),
    notes: Joi.string().max(1000).optional()
  }),

  updateAppointment: Joi.object({
    scheduled_date: Joi.date().greater('now').optional(),
    description: Joi.string().max(1000).optional(),
    vehicle_info: Joi.object({
      brand: Joi.string().max(50).optional(),
      model: Joi.string().max(50).optional(),
      year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1).optional(),
      license_plate: Joi.string().max(10).optional(),
      color: Joi.string().max(30).optional(),
      engine: Joi.string().max(50).optional()
    }).optional(),
    location_type: Joi.string().valid('workshop', 'home', 'roadside').optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    address: Joi.string().max(255).optional(),
    estimated_price: Joi.number().min(0).precision(2).optional(),
    notes: Joi.string().max(1000).optional()
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid('pending', 'confirmed', 'in_progress', 'completed', 'cancelled').required(),
    notes: Joi.string().max(1000).optional()
  })
};

// Schemas para avaliações
const reviewSchemas = {
  createReview: Joi.object({
    mechanic_id: Joi.number().integer().positive().optional(),
    partner_id: Joi.number().integer().positive().optional(),
    appointment_id: Joi.number().integer().positive().optional(),
    entity_type: Joi.string().valid('appointment', 'purchase_order', 'delivery_order', 'emergency_request').optional(),
    entity_id: Joi.number().integer().positive().optional(),
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).optional()
  }).or('mechanic_id', 'partner_id').with('entity_type', 'entity_id').with('entity_id', 'entity_type'),

  updateReview: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    comment: Joi.string().max(1000).optional()
  })
};

// Novos schemas para parceiros
const partnerSchemas = {
  create: Joi.object({
    type: Joi.string().valid('mechanic', 'motoboy', 'store').required(),
    business_name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(1000).optional(),
    specialties: Joi.array().items(Joi.string()).min(1).optional(),
    address: Joi.string().max(255).required(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    whatsapp: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    website: Joi.string().uri().optional(),
    instagram: Joi.string().max(100).optional(),
    facebook: Joi.string().max(100).optional(),
    hourly_rate: Joi.number().min(0).precision(2).optional(),
    service_fee: Joi.number().min(0).precision(2).optional(),
    delivery_fee: Joi.number().min(0).precision(2).optional(),
    working_hours: Joi.object().optional(),
    payment_methods: Joi.array().items(Joi.string()).optional(),
    service_areas: Joi.array().items(Joi.string()).optional(),
    experience_years: Joi.number().integer().min(0).max(50).optional(),
    certifications: Joi.array().items(Joi.string()).optional(),
    insurance_info: Joi.string().max(500).optional(),
    warranty_info: Joi.string().max(500).optional(),
    emergency_service: Joi.boolean().default(false),
    home_service: Joi.boolean().default(false),
    workshop_service: Joi.boolean().default(true),
    delivery_service: Joi.boolean().default(false),
    service_radius: Joi.number().min(0).max(100).default(10),
    delivery_radius: Joi.number().min(0).max(100).default(15),
    vehicle_type: Joi.string().valid('moto', 'carro', 'van').optional(),
    license_plate: Joi.string().max(10).optional(),
    cnh_number: Joi.string().max(20).optional(),
    cnh_category: Joi.string().valid('A', 'B', 'AB').optional(),
    store_categories: Joi.array().items(Joi.string()).optional(),
    has_delivery: Joi.boolean().default(false),
    min_order_value: Joi.number().min(0).precision(2).optional(),
    delivery_time_minutes: Joi.number().integer().min(1).max(1440).optional()
  }),

  update: Joi.object({
    business_name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(1000).optional(),
    specialties: Joi.array().items(Joi.string()).min(1).optional(),
    address: Joi.string().max(255).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    whatsapp: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    website: Joi.string().uri().optional(),
    instagram: Joi.string().max(100).optional(),
    facebook: Joi.string().max(100).optional(),
    hourly_rate: Joi.number().min(0).precision(2).optional(),
    service_fee: Joi.number().min(0).precision(2).optional(),
    delivery_fee: Joi.number().min(0).precision(2).optional(),
    working_hours: Joi.object().optional(),
    payment_methods: Joi.array().items(Joi.string()).optional(),
    service_areas: Joi.array().items(Joi.string()).optional(),
    experience_years: Joi.number().integer().min(0).max(50).optional(),
    certifications: Joi.array().items(Joi.string()).optional(),
    insurance_info: Joi.string().max(500).optional(),
    warranty_info: Joi.string().max(500).optional(),
    emergency_service: Joi.boolean().optional(),
    home_service: Joi.boolean().optional(),
    workshop_service: Joi.boolean().optional(),
    delivery_service: Joi.boolean().optional(),
    service_radius: Joi.number().min(0).max(100).optional(),
    delivery_radius: Joi.number().min(0).max(100).optional(),
    vehicle_type: Joi.string().valid('moto', 'carro', 'van').optional(),
    license_plate: Joi.string().max(10).optional(),
    cnh_number: Joi.string().max(20).optional(),
    cnh_category: Joi.string().valid('A', 'B', 'AB').optional(),
    store_categories: Joi.array().items(Joi.string()).optional(),
    has_delivery: Joi.boolean().optional(),
    min_order_value: Joi.number().min(0).precision(2).optional(),
    delivery_time_minutes: Joi.number().integer().min(1).max(1440).optional(),
    is_available: Joi.boolean().optional(),
    is_verified: Joi.boolean().optional()
  })
};

// Schemas para solicitações de emergência
const emergencyRequestSchemas = {
  create: Joi.object({
    type: Joi.string().valid('mechanical', 'fuel', 'tire', 'battery', 'other').required(),
    request_type: Joi.string().valid('mechanic', 'mecanico', 'tow', 'guincho').default('mechanic'),
    description: Joi.string().min(10).max(1000).required(),
    photos: Joi.array().items(Joi.string().uri()).max(5).optional(),
    vehicle_info: Joi.object({
      brand: Joi.string().max(50).required(),
      model: Joi.string().max(50).required(),
      year: Joi.number().integer().min(1900).max(new Date().getFullYear() + 1).required(),
      license_plate: Joi.string().max(10).optional(),
      color: Joi.string().max(30).optional(),
      engine: Joi.string().max(50).optional()
    }).required(),
    location_type: Joi.string().valid('roadside', 'parking', 'home', 'other').required(),
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    address: Joi.string().max(255).required(),
    vehicle_origin_address: Joi.string().max(255).optional(),
    vehicle_origin_latitude: Joi.number().min(-90).max(90).optional(),
    vehicle_origin_longitude: Joi.number().min(-180).max(180).optional(),
    vehicle_destination_address: Joi.string().max(255).optional(),
    vehicle_destination_latitude: Joi.number().min(-90).max(90).optional(),
    vehicle_destination_longitude: Joi.number().min(-180).max(180).optional(),
    vehicle_type: Joi.string().max(100).optional(),
    vehicle_notes: Joi.string().max(1000).optional(),
    landmarks: Joi.string().max(255).optional(),
    urgency: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    is_urgent: Joi.boolean().default(false),
    notes: Joi.string().max(1000).optional()
  }),

  accept: Joi.object({
    estimated_price: Joi.number().min(0).precision(2).required(),
    estimated_duration: Joi.number().integer().min(1).max(1440).required()
  }),

  complete: Joi.object({
    final_price: Joi.number().min(0).precision(2).required(),
    solution_description: Joi.string().min(10).max(1000).required(),
    parts_used: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
      price: Joi.number().min(0).precision(2).required()
    })).optional()
  }),

  rate: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).optional()
  })
};

// Schemas para ordens de entrega
const deliveryOrderSchemas = {
  create: Joi.object({
    type: Joi.string().valid('fuel', 'parts', 'food', 'other').required(),
    items: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
      description: Joi.string().max(255).optional()
    })).min(1).required(),
    items_description: Joi.string().max(1000).optional(),
    pickup_location: Joi.object({
      name: Joi.string().required(),
      address: Joi.string().required(),
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      instructions: Joi.string().max(255).optional()
    }).required(),
    delivery_location: Joi.object({
      name: Joi.string().required(),
      address: Joi.string().required(),
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      instructions: Joi.string().max(255).optional()
    }).required(),
    delivery_fee: Joi.number().min(0).precision(2).optional(),
    items_price: Joi.number().min(0).precision(2).optional(),
    urgency: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    is_urgent: Joi.boolean().default(false),
    payment_method: Joi.string().valid('cash', 'card', 'pix', 'app').default('cash'),
    notes: Joi.string().max(1000).optional()
  }),

  rate: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).optional()
  })
};

// Schemas para pedidos de compra
const purchaseOrderSchemas = {
  create: Joi.object({
    type: Joi.string().valid('emergency', 'regular', 'scheduled').default('regular'),
    store_id: Joi.number().integer().positive().required(),
    items: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
      price: Joi.number().min(0).precision(2).required(),
      description: Joi.string().max(255).optional()
    })).min(1).required(),
    items_description: Joi.string().max(1000).optional(),
    delivery_address: Joi.object({
      street: Joi.string().required(),
      number: Joi.string().required(),
      complement: Joi.string().max(100).optional(),
      neighborhood: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      zip_code: Joi.string().pattern(/^\d{5}-?\d{3}$/).required(),
      latitude: Joi.number().min(-90).max(90).optional(),
      longitude: Joi.number().min(-180).max(180).optional()
    }).required(),
    delivery_instructions: Joi.string().max(255).optional(),
    delivery_contact_name: Joi.string().max(100).required(),
    delivery_contact_phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    has_delivery: Joi.boolean().default(true),
    scheduled_delivery_at: Joi.date().greater('now').optional(),
    payment_method: Joi.string().valid('cash', 'card', 'pix', 'app').default('cash'),
    urgency: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
    is_urgent: Joi.boolean().default(false),
    special_instructions: Joi.string().max(1000).optional(),
    emergency_request_id: Joi.number().integer().positive().optional()
  }),

  rate: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).optional()
  })
};

// Middleware de validação
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: error.details.map(detail => detail.message)
      });
    }
    next();
  };
};

module.exports = {
  validate,
  authSchemas,
  userSchemas,
  mechanicSchemas,
  serviceSchemas,
  appointmentSchemas,
  reviewSchemas,
  partnerSchemas,
  emergencyRequestSchemas,
  deliveryOrderSchemas,
  purchaseOrderSchemas
};

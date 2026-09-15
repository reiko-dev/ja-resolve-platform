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

// G2 — campos comuns do payload de conclusão. O schema mechanic/legado e o
// schema tow compartilham exatamente estes campos; a única diferença é a
// obrigatoriedade de `final_price` no tow.
const completePayloadFields = Object.freeze({
  solution_description: Joi.string().max(1000).optional().allow(null),
  parts_used: Joi.array().items(Joi.alternatives().try(
    Joi.string(),
    Joi.object({
      name: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required(),
      price: Joi.number().min(0).precision(2).required()
    })
  )).optional().allow(null)
});

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
  })
    // G3 — pares opcionais de origem/destino precisam vir completos já no schema:
    // não existe rota que aceite só uma das metades.
    .and('vehicle_origin_latitude', 'vehicle_origin_longitude')
    .and('vehicle_destination_latitude', 'vehicle_destination_longitude')
    // G3 — (0,0) nunca é coordenada operacional; o par principal já é obrigatório
    // pelo schema, então a checagem de par incompleto é do `.and` acima.
    .custom((value, helpers) => {
      const coordinatePairs = [
        ['latitude', 'longitude'],
        ['vehicle_origin_latitude', 'vehicle_origin_longitude'],
        ['vehicle_destination_latitude', 'vehicle_destination_longitude'],
      ];

      for (const [latitudeKey, longitudeKey] of coordinatePairs) {
        if (value[latitudeKey] === 0 && value[longitudeKey] === 0) {
          return helpers.error('any.invalid');
        }
      }

      return value;
    })
    .messages({
      'any.invalid': 'latitude e longitude não podem ser 0,0',
      'object.and': '{{#label}} exige o par completo de latitude/longitude',
    }),

  accept: Joi.object({
    estimated_price: Joi.number().min(0).precision(2).required(),
    estimated_duration: Joi.number().integer().min(1).max(1440).required()
  }),

  // G2 — payload de conclusão do fluxo mechanic/legado. Preserva o contrato
  // vigente desde G1: `final_price` é OPCIONAL (mechanic conclui sem preço) e,
  // quando presente, precisa ser número finito >= 0; `null` é sempre 400.
  // `solution_description` e `parts_used` seguem opcionais como no
  // comportamento documentado/testado em G1/G2.
  completeMechanic: Joi.object({
    ...completePayloadFields,
    final_price: Joi.number().min(0).precision(2).optional()
  }).unknown(true),

  // Alias do contrato mechanic (nome histórico usado por rotas/integrações).
  complete: Joi.object({
    ...completePayloadFields,
    final_price: Joi.number().min(0).precision(2).optional()
  }).unknown(true),

  // G2 — guincho exige preço final. Única diferença em relação ao schema
  // mechanic é `final_price` obrigatório; não há teto (o piso vem de
  // system_settings e ausência de piso não vira default inventado).
  completeTow: Joi.object({
    ...completePayloadFields,
    final_price: Joi.number().min(0).precision(2).required()
  }).unknown(true),

  // G2 — upload de foto privada de guincho (JSON com base64 real).
  uploadPhoto: Joi.object({
    photo_type: Joi.string().valid('pickup', 'delivery').required(),
    image: Joi.string().min(1).required(),
    filename: Joi.string().min(1).max(255).required(),
    mimeType: Joi.string().valid('image/jpeg', 'image/webp').required()
  }).unknown(true),

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
const validate = (schema, options = {}) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      const body = {
        success: false,
        message: 'Dados inválidos',
        errors: error.details.map(detail => detail.message)
      };

      // G3 — falhas de coordenadas no POST de emergência viram `code` estável
      // (`invalid_coordinates`) em vez de um 400 anônimo, sem alterar o formato
      // das demais rotas (o resolver é opt-in por schema).
      if (typeof options.codeResolver === 'function') {
        const code = options.codeResolver(error);
        if (code) {
          body.code = code;
        }
      }

      return res.status(400).json(body);
    }
    next();
  };
};

/**
 * G3 — deriva o código estável de uma falha do schema `emergencyRequestSchemas.create`.
 *
 * Coordenadas (principal ou pares opcionais de origem/destino) => `invalid_coordinates`;
 * qualquer outra violação de payload => `invalid_payload`.
 */
const emergencyRequestSchemaErrorCode = (error) => {
  const coordinateFields = new Set([
    'latitude',
    'longitude',
    'vehicle_origin_latitude',
    'vehicle_origin_longitude',
    'vehicle_destination_latitude',
    'vehicle_destination_longitude',
  ]);

  const isCoordinateFailure = (error?.details || []).some((detail) => {
    if (detail.type === 'object.and') {
      // Joi expõe `present`/`missing` (não `peers`) no contexto de object.and.
      const involvedFields = [
        ...(detail.context?.present || []),
        ...(detail.context?.missing || []),
      ];
      return involvedFields.some((field) => coordinateFields.has(field));
    }

    // Custom de (0,0) no objeto raiz: `any.invalid` sem path de campo.
    if (detail.type === 'any.invalid' && (detail.path || []).length === 0) {
      return true;
    }

    return coordinateFields.has(detail.path?.[0]);
  });

  return isCoordinateFailure ? 'invalid_coordinates' : 'invalid_payload';
};

module.exports = {
  validate,
  emergencyRequestSchemaErrorCode,
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

const { body, validationResult } = require('express-validator');

// Validações específicas para mecânico
const validateMechanic = [
  body('business_name')
    .notEmpty()
    .withMessage('Nome da oficina é obrigatório')
    .isLength({ min: 3, max: 100 })
    .withMessage('Nome deve ter entre 3 e 100 caracteres'),
  
  body('description')
    .notEmpty()
    .withMessage('Descrição é obrigatória')
    .isLength({ min: 10, max: 500 })
    .withMessage('Descrição deve ter entre 10 e 500 caracteres'),
  
  body('phone')
    .notEmpty()
    .withMessage('Telefone é obrigatório')
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('Telefone deve estar no formato (XX) XXXX-XXXX'),
  
  body('whatsapp')
    .optional()
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('WhatsApp deve estar no formato (XX) XXXX-XXXX'),
  
  body('address')
    .notEmpty()
    .withMessage('Endereço é obrigatório')
    .isLength({ min: 10, max: 200 })
    .withMessage('Endereço deve ter entre 10 e 200 caracteres'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude deve ser um número válido'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude deve ser um número válido'),
  
  body('specialties')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos uma especialidade'),
  
  body('services')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos um serviço'),
  
  body('hourly_rate')
    .isFloat({ min: 0 })
    .withMessage('Taxa por hora deve ser um número positivo'),
  
  body('experience_years')
    .isInt({ min: 0, max: 50 })
    .withMessage('Anos de experiência deve ser entre 0 e 50'),
  
  body('service_radius')
    .isFloat({ min: 1, max: 100 })
    .withMessage('Raio de atendimento deve ser entre 1 e 100 km'),
  
  body('emergency_service')
    .isBoolean()
    .withMessage('Serviço de emergência deve ser verdadeiro ou falso'),
  
  body('home_service')
    .isBoolean()
    .withMessage('Serviço domiciliar deve ser verdadeiro ou falso'),
  
  body('workshop_service')
    .isBoolean()
    .withMessage('Serviço na oficina deve ser verdadeiro ou falso'),
];

// Validações específicas para lojista
const validateStore = [
  body('business_name')
    .notEmpty()
    .withMessage('Nome da loja é obrigatório')
    .isLength({ min: 3, max: 100 })
    .withMessage('Nome deve ter entre 3 e 100 caracteres'),
  
  body('description')
    .notEmpty()
    .withMessage('Descrição é obrigatória')
    .isLength({ min: 10, max: 500 })
    .withMessage('Descrição deve ter entre 10 e 500 caracteres'),
  
  body('phone')
    .notEmpty()
    .withMessage('Telefone é obrigatório')
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('Telefone deve estar no formato (XX) XXXX-XXXX'),
  
  body('whatsapp')
    .optional()
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('WhatsApp deve estar no formato (XX) XXXX-XXXX'),
  
  body('address')
    .notEmpty()
    .withMessage('Endereço é obrigatório')
    .isLength({ min: 10, max: 200 })
    .withMessage('Endereço deve ter entre 10 e 200 caracteres'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude deve ser um número válido'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude deve ser um número válido'),
  
  body('store_categories')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos uma categoria de produtos'),
  
  body('payment_methods')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos um método de pagamento'),
  
  body('has_delivery')
    .isBoolean()
    .withMessage('Serviço de entrega deve ser verdadeiro ou falso'),
  
  body('min_order_value')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Valor mínimo deve ser um número positivo'),
  
  body('delivery_time')
    .optional()
    .isInt({ min: 1, max: 480 })
    .withMessage('Tempo de entrega deve ser entre 1 e 480 minutos'),
  
  body('delivery_radius')
    .optional()
    .isFloat({ min: 1, max: 100 })
    .withMessage('Raio de entrega deve ser entre 1 e 100 km'),
  
  body('website')
    .optional()
    .isURL()
    .withMessage('Website deve ser uma URL válida'),
  
  body('instagram')
    .optional()
    .matches(/^@?[a-zA-Z0-9._]+$/)
    .withMessage('Instagram deve ser um usuário válido'),
  
  body('is_online_store')
    .isBoolean()
    .withMessage('Loja online deve ser verdadeiro ou falso'),
];

// Validações específicas para motoboy
const validateMotoboy = [
  body('name')
    .notEmpty()
    .withMessage('Nome completo é obrigatório')
    .isLength({ min: 3, max: 100 })
    .withMessage('Nome deve ter entre 3 e 100 caracteres'),
  
  body('phone')
    .notEmpty()
    .withMessage('Telefone é obrigatório')
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('Telefone deve estar no formato (XX) XXXX-XXXX'),
  
  body('whatsapp')
    .optional()
    .matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/)
    .withMessage('WhatsApp deve estar no formato (XX) XXXX-XXXX'),
  
  body('address')
    .notEmpty()
    .withMessage('Endereço é obrigatório')
    .isLength({ min: 10, max: 200 })
    .withMessage('Endereço deve ter entre 10 e 200 caracteres'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude deve ser um número válido'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude deve ser um número válido'),
  
  body('cnh_number')
    .notEmpty()
    .withMessage('Número da CNH é obrigatório')
    .matches(/^\d{11}$/)
    .withMessage('CNH deve ter 11 dígitos'),
  
  body('cnh_category')
    .isIn(['A', 'B', 'AB'])
    .withMessage('Categoria da CNH deve ser A, B ou AB'),
  
  body('vehicle_type')
    .isIn(['moto', 'carro', 'van'])
    .withMessage('Tipo de veículo deve ser moto, carro ou van'),
  
  body('license_plate')
    .notEmpty()
    .withMessage('Placa do veículo é obrigatória')
    .matches(/^[A-Z]{3}\d{4}$|^[A-Z]{3}\d[A-Z]\d{2}$/)
    .withMessage('Placa deve estar no formato ABC1234 ou ABC1D23'),
  
  body('delivery_types')
    .isArray({ min: 1 })
    .withMessage('Selecione pelo menos um tipo de entrega'),
  
  body('delivery_fee')
    .isFloat({ min: 0 })
    .withMessage('Taxa de entrega deve ser um número positivo'),
  
  body('experience_years')
    .isInt({ min: 0, max: 50 })
    .withMessage('Anos de experiência deve ser entre 0 e 50'),
  
  body('service_radius')
    .isFloat({ min: 1, max: 100 })
    .withMessage('Raio de atendimento deve ser entre 1 e 100 km'),
  
  body('is_available')
    .isBoolean()
    .withMessage('Disponibilidade deve ser verdadeiro ou falso'),
];

// Middleware para verificar erros de validação
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Dados inválidos',
      errors: errors.array()
    });
  }
  next();
};

// Validações gerais para parceiro
const validatePartner = [
  body('type')
    .isIn(['mechanic', 'store', 'motoboy'])
    .withMessage('Tipo deve ser mechanic, store ou motoboy'),
  
  body('business_name')
    .notEmpty()
    .withMessage('Nome do negócio é obrigatório'),
  
  body('description')
    .notEmpty()
    .withMessage('Descrição é obrigatória'),
  
  body('phone')
    .notEmpty()
    .withMessage('Telefone é obrigatório'),
  
  body('address')
    .notEmpty()
    .withMessage('Endereço é obrigatório'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude deve ser um número válido'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude deve ser um número válido'),
];

module.exports = {
  validateMechanic,
  validateStore,
  validateMotoboy,
  validatePartner,
  handleValidationErrors
};

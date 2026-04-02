class AppConstants {
  // API Configuration
  static const String apiBaseUrl = 'http://192.168.15.3:3001/api';
  static const String wsUrl = 'ws://192.168.15.3:3001';
  static const bool isDebugMode = true;
  
  // App Configuration
  static const String appName = 'Socorre AI Partner';
  static const String appVersion = '1.0.0';
  
  // Storage Keys
  static const String tokenKey = 'auth_token';
  static const String userKey = 'user_data';
  static const String partnerTypeKey = 'partner_type';
  static const String onboardingCompletedKey = 'onboarding_completed';
  
  // Partner Types
  static const Map<String, String> partnerTypeLabels = {
    'mechanic': 'Mecânico',
    'gasStation': 'Posto de Combustível',
    'autoParts': 'Auto Peças',
    'towTruck': 'Guincho',
    'delivery': 'Motoboy',
  };
  
  // Subscription Plans
  static const Map<String, Map<String, dynamic>> subscriptionPlans = {
    'basic': {
      'name': 'Básico',
      'price': 99.90,
      'features': [
        'Até 20 solicitações/mês',
        'Suporte por email',
        'Perfil básico',
      ],
    },
    'professional': {
      'name': 'Profissional',
      'price': 199.90,
      'features': [
        'Solicitações ilimitadas',
        'Suporte prioritário',
        'Perfil destacado',
        'Analytics básico',
      ],
    },
    'enterprise': {
      'name': 'Empresarial',
      'price': 299.90,
      'features': [
        'Solicitações ilimitadas',
        'Suporte 24/7',
        'Perfil premium',
        'Analytics avançado',
        'API access',
      ],
    },
  };
  
  // Commission Rates
  static const double marketplaceCommission = 0.25; // 25%
  static const double storeCommission = 0.10; // 10%
  static const double deliveryCommission = 0.15; // 15%
  
  // Service Categories
  static const List<Map<String, dynamic>> mechanicSpecialties = [
    {'id': 'engine', 'name': 'Motor', 'icon': 'settings'},
    {'id': 'brakes', 'name': 'Freios', 'icon': 'pan_tool'},
    {'id': 'electrical', 'name': 'Elétrica', 'icon': 'electric_bolt'},
    {'id': 'suspension', 'name': 'Suspensão', 'icon': 'vertical_align_center'},
    {'id': 'transmission', 'name': 'Câmbio', 'icon': 'sync'},
    {'id': 'air_conditioning', 'name': 'Ar Condicionado', 'icon': 'ac_unit'},
    {'id': 'alignment', 'name': 'Alinhamento/Balanceamento', 'icon': 'straighten'},
    {'id': 'oil_change', 'name': 'Troca de Óleo', 'icon': 'opacity'},
  ];
  
  static const List<Map<String, dynamic>> fuelTypes = [
    {'id': 'gasoline', 'name': 'Gasolina', 'icon': 'local_gas_station'},
    {'id': 'ethanol', 'name': 'Etanol', 'icon': 'local_gas_station'},
    {'id': 'diesel', 'name': 'Diesel', 'icon': 'local_gas_station'},
    {'id': 'flex', 'name': 'Flex', 'icon': 'local_gas_station'},
    {'id': 'adBlue', 'name': 'AdBlue', 'icon': 'local_gas_station'},
  ];
  
  static const List<Map<String, dynamic>> gasStationServices = [
    {'id': 'tire_service', 'name': 'Serviço de Pneus', 'icon': 'tire_repair'},
    {'id': 'car_wash', 'name': 'Lava Rápido', 'icon': 'local_car_wash'},
    {'id': 'oil_change', 'name': 'Troca de Óleo', 'icon': 'opacity'},
    {'id': 'convenience_store', 'name': 'Loja de Conveniência', 'icon': 'store'},
    {'id': 'mechanical_service', 'name': 'Serviço Mecânico', 'icon': 'build'},
    {'id': 'calibration', 'name': 'Calibragem', 'icon': 'speed'},
  ];
  
  static const List<Map<String, dynamic>> autoPartsCategories = [
    {'id': 'engine_parts', 'name': 'Peças de Motor', 'icon': 'settings'},
    {'id': 'brake_parts', 'name': 'Peças de Freio', 'icon': 'pan_tool'},
    {'id': 'suspension_parts', 'name': 'Peças de Suspensão', 'icon': 'vertical_align_center'},
    {'id': 'electrical_parts', 'name': 'Peças Elétricas', 'icon': 'electric_bolt'},
    {'id': 'body_parts', 'name': 'Peças de Lataria', 'icon': 'directions_car'},
    {'id': 'transmission_parts', 'name': 'Peças de Câmbio', 'icon': 'sync'},
    {'id': 'filters', 'name': 'Filtros', 'icon': 'filter_alt'},
    {'id': 'fluids', 'name': 'Fluidos', 'icon': 'opacity'},
  ];
  
  // Emergency Types
  static const List<Map<String, dynamic>> emergencyTypes = [
    {'id': 'mechanical', 'name': 'Mecânica', 'icon': 'build', 'color': '#E53E3E'},
    {'id': 'fuel', 'name': 'Combustível', 'icon': 'local_gas_station', 'color': '#3182CE'},
    {'id': 'tire', 'name': 'Pneu', 'icon': 'tire_repair', 'color': '#38A169'},
    {'id': 'battery', 'name': 'Bateria', 'icon': 'battery_full', 'color': '#D69E2E'},
    {'id': 'towing', 'name': 'Guincho', 'icon': 'local_tow_truck', 'color': '#805AD5'},
    {'id': 'other', 'name': 'Outros', 'icon': 'more_horiz', 'color': '#718096'},
  ];
  
  // Urgency Levels
  static const List<Map<String, dynamic>> urgencyLevels = [
    {'id': 'low', 'name': 'Baixa', 'color': '#38A169'},
    {'id': 'medium', 'name': 'Média', 'color': '#D69E2E'},
    {'id': 'high', 'name': 'Alta', 'color': '#DD6B20'},
    {'id': 'critical', 'name': 'Crítica', 'color': '#E53E3E'},
  ];
  
  // Payment Methods
  static const List<Map<String, dynamic>> paymentMethods = [
    {'id': 'credit_card', 'name': 'Cartão de Crédito', 'icon': 'credit_card'},
    {'id': 'debit_card', 'name': 'Cartão de Débito', 'icon': 'debit_card'},
    {'id': 'pix', 'name': 'PIX', 'icon': 'qr_code'},
    {'id': 'bank_transfer', 'name': 'Transferência Bancária', 'icon': 'account_balance'},
    {'id': 'cash', 'name': 'Dinheiro', 'icon': 'payments'},
  ];
  
  // Notification Types
  static const List<Map<String, dynamic>> notificationTypes = [
    {'id': 'emergency_request', 'name': 'Nova Emergência', 'icon': 'emergency'},
    {'id': 'service_accepted', 'name': 'Serviço Aceito', 'icon': 'check_circle'},
    {'id': 'payment_received', 'name': 'Pagamento Recebido', 'icon': 'attach_money'},
    {'id': 'new_review', 'name': 'Nova Avaliação', 'icon': 'star'},
    {'id': 'system_update', 'name': 'Atualização do Sistema', 'icon': 'system_update'},
  ];
  
  // Working Hours
  static const List<String> weekDays = [
    'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'
  ];
  
  static const List<String> timeSlots = [
    '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
  ];
  
  // Validation Rules
  static const int minPasswordLength = 8;
  static const int maxPhoneLength = 15;
  static const int maxDocumentLength = 14;
  static const double maxDeliveryRadius = 50.0; // km
  
  // File Upload Limits
  static const int maxFileSize = 5 * 1024 * 1024; // 5MB
  static const List<String> allowedImageFormats = ['jpg', 'jpeg', 'png', 'webp'];
  static const List<String> allowedDocumentFormats = ['pdf', 'jpg', 'jpeg', 'png'];
  
  // Map Configuration
  static const double defaultMapZoom = 15.0;
  static const double maxMapZoom = 18.0;
  static const double minMapZoom = 2.0;
  
  // Pagination
  static const int defaultPageSize = 20;
  static const int maxPageSize = 100;
  
  // Cache Duration
  static const Duration cacheDuration = Duration(hours: 1);
  static const Duration longCacheDuration = Duration(hours: 24);
  
  // Animation Durations
  static const Duration shortAnimation = Duration(milliseconds: 200);
  static const Duration mediumAnimation = Duration(milliseconds: 300);
  static const Duration longAnimation = Duration(milliseconds: 500);
  
  // Spacing
  static const double xsSpacing = 4.0;
  static const double smSpacing = 8.0;
  static const double mdSpacing = 16.0;
  static const double lgSpacing = 24.0;
  static const double xlSpacing = 32.0;
  static const double xxlSpacing = 48.0;
}

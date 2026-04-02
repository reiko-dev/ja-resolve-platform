class AppConfig {
  // Configuração de ambiente
  static const String _environment = String.fromEnvironment(
    'ENV',
    defaultValue: 'development', // Padrão: desenvolvimento
  );

  // URLs base
  static const String _productionBaseUrl = 'https://admin.socorreja.com.br/api';
  static const String _developmentBaseUrl = 'http://192.168.15.3:3001/api';

  // Getters públicos
  static bool get isDevelopment => _environment == 'development';
  static bool get isProduction => _environment == 'production';

  static String get baseUrl {
    return isProduction ? _productionBaseUrl : _developmentBaseUrl;
  }

  static String get authUrl => '$baseUrl/auth';
  static String get usersUrl => '$baseUrl/users';
  static String get emergencyUrl => '$baseUrl/emergency-requests';
  static String get partnersUrl => '$baseUrl/partners';

  // Configurações de timeout
  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  // Configurações de geolocalização
  static const double defaultRadius = 15.0; // km
  static const double maxRadius = 50.0; // km

  // Método para debug
  static void printConfig() {
    print('🌍 Ambiente: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}');
    print('🔗 Base URL: $baseUrl');
    print('🔑 Auth URL: $authUrl');
  }

  // Método para forçar ambiente (útil para testes)
  static String _overrideEnvironment = '';
  
  static void setEnvironment(String env) {
    _overrideEnvironment = env;
  }

  static String get currentEnvironment {
    if (_overrideEnvironment.isNotEmpty) return _overrideEnvironment;
    return _environment;
  }
}


class AppConfig {
  static const String _environment = String.fromEnvironment(
    'ENV',
    defaultValue: 'development',
  );
  static const String _apiBaseUrlOverride = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static const String _productionBaseUrl = 'https://admin.socorreja.com.br/api';
  static const String _developmentBaseUrl = 'http://localhost:3001/api';

  static bool get isDevelopment => _environment == 'development';
  static bool get isProduction => _environment == 'production';

  static String get baseUrl {
    if (_apiBaseUrlOverride.isNotEmpty) {
      return _normalizeApiBaseUrl(_apiBaseUrlOverride);
    }

    return isProduction ? _productionBaseUrl : _developmentBaseUrl;
  }

  static String get serverUrl => _stripApiSuffix(baseUrl);
  static String get authUrl => '$baseUrl/auth';
  static String get usersUrl => '$baseUrl/users';
  static String get emergencyUrl => '$baseUrl/emergency-requests';
  static String get partnersUrl => '$baseUrl/partners';
  static String get uploadUrl => '$baseUrl/upload';

  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  static const double defaultRadius = 15.0; // km
  static const double maxRadius = 50.0; // km

  static void printConfig() {
    print('🌍 Ambiente: ${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}');
    print('🔗 Base URL: $baseUrl');
    print('🖥️ Server URL: $serverUrl');
    print('🔑 Auth URL: $authUrl');
  }

  static String _overrideEnvironment = '';
  
  static void setEnvironment(String env) {
    _overrideEnvironment = env;
  }

  static String get currentEnvironment {
    if (_overrideEnvironment.isNotEmpty) return _overrideEnvironment;
    return _environment;
  }

  static String _normalizeApiBaseUrl(String url) {
    final trimmed = url.trim().replaceAll(RegExp(r'/+$'), '');
    return trimmed.endsWith('/api') ? trimmed : '$trimmed/api';
  }

  static String _stripApiSuffix(String url) {
    return url.replaceFirst(RegExp(r'/api$'), '');
  }
}

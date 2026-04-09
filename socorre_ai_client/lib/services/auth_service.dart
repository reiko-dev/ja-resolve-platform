import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  static User? _currentUser;
  static bool _isLoading = false;

  // Getters
  static User? get currentUser => _currentUser;
  static bool get isLoading => _isLoading;
  static bool get isLoggedIn => _currentUser != null;

  // Obter token
  static Future<String?> getToken() async {
    return await ApiService.getToken();
  }

  // Inicializar serviço
  static Future<void> initialize() async {
    _isLoading = true;
    
    try {
      // Verificar se há token válido
      if (await ApiService.isLoggedIn()) {
        final userData = await ApiService.getUserData();
        if (userData != null) {
          _currentUser = User.fromJson(userData);
        }

        // Sincronizar perfil mais recente
        final refreshed = await ApiService.fetchProfile();
        if (refreshed != null) {
          _currentUser = User.fromJson(refreshed);
        }
      }
    } catch (e) {
      print('Erro ao inicializar AuthService: $e');
    } finally {
      _isLoading = false;
    }
  }

  // Login
  static Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    _isLoading = true;
    
    try {
      final response = await ApiService.login(
        email: email,
        password: password,
      );

      if (response['success']) {
        final userData = response['data']['user'];
        _currentUser = User.fromJson(userData);
      }

      return response;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro durante login: $e',
      };
    } finally {
      _isLoading = false;
    }
  }

  // Registro
  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
    required String phone,
  }) async {
    _isLoading = true;
    
    try {
      final response = await ApiService.register(
        name: name,
        email: email,
        password: password,
        phone: phone,
      );

      if (response['success']) {
        final userData = response['data']['user'];
        _currentUser = User.fromJson(userData);
      }

      return response;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro durante registro: $e',
      };
    } finally {
      _isLoading = false;
    }
  }

  // Logout
  static Future<void> logout() async {
    await ApiService.logout();
    _currentUser = null;
  }

  // Atualizar dados do usuário
  static Future<void> refreshUserData() async {
    try {
      if (await ApiService.isLoggedIn()) {
        final userData = await ApiService.fetchProfile();
        if (userData != null) {
          _currentUser = User.fromJson(userData);
        }
      }
    } catch (e) {
      print('Erro ao atualizar dados do usuário: $e');
    }
  }
}

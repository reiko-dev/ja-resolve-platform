import 'package:flutter/rendering.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/user.dart';
import 'api_service.dart';

class AuthService {
  static User? _currentUser;
  static bool _isLoading = false;

  // Getters
  static User? get currentUser => _currentUser;
  static bool get isLoading => _isLoading;
  static bool get isLoggedIn => _currentUser != null;

  // Inicializar serviço
  static Future<void> initialize() async {
    _isLoading = true;
    
    try {
      // Verificar se há token salvo
      final isLoggedIn = await ApiService.isLoggedIn();
      
      if (isLoggedIn) {
        // Verificar se o token ainda é válido
        final response = await ApiService.verifyToken();
        
        if (response['success']) {
          final userData = response['data']['user'];
          _currentUser = User.fromJson(userData);
        } else {
          // Token inválido, limpar dados
          await ApiService.clearLocalData();
        }
      }
    } catch (e) {
      debugPrint('Erro ao inicializar AuthService: $e');
      await ApiService.clearLocalData();
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
    String role = 'user',
    String? cpf,
    String? cnpj,
  }) async {
    _isLoading = true;
    
    try {
      final response = await ApiService.register(
        name: name,
        email: email,
        password: password,
        phone: phone,
        role: role,
        cpf: cpf,
        cnpj: cnpj,
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
  static Future<Map<String, dynamic>> logout() async {
    _isLoading = true;
    
    try {
      final response = await ApiService.logout();
      _currentUser = null;
      return response;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro durante logout: $e',
      };
    } finally {
      _isLoading = false;
    }
  }

  // Atualizar perfil
  static Future<Map<String, dynamic>> updateProfile({
    String? name,
    String? phone,
    Map<String, dynamic>? address,
  }) async {
    if (_currentUser == null) {
      return {
        'success': false,
        'message': 'Usuário não autenticado',
      };
    }

    try {
      final response = await ApiService.updateProfile(
        name: name,
        phone: phone,
        address: address,
      );

      if (response['success']) {
        final userData = response['data']['user'];
        _currentUser = User.fromJson(userData);
      }

      return response;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro ao atualizar perfil: $e',
      };
    }
  }

  // Buscar perfil atualizado
  static Future<Map<String, dynamic>> refreshProfile() async {
    if (_currentUser == null) {
      return {
        'success': false,
        'message': 'Usuário não autenticado',
      };
    }

    try {
      final response = await ApiService.getProfile();

      if (response['success']) {
        final userData = response['data']['user'];
        _currentUser = User.fromJson(userData);
      }

      return response;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro ao buscar perfil: $e',
      };
    }
  }

  // Verificar se é parceiro
  static bool get isPartner => _currentUser?.role == 'partner';
  
  // Verificar se é admin
  static bool get isAdmin => _currentUser?.role == 'admin';
  
  // Verificar se é usuário comum
  static bool get isUser => _currentUser?.role == 'user';

  // Limpar dados
  static void clearUser() {
    _currentUser = null;
  }

  // Obter token de autenticação
  static Future<String?> getToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('auth_token');
    } catch (e) {
      return null;
    }
  }

  // Obter usuário atual
  static Future<Map<String, dynamic>?> getCurrentUser() async {
    if (_currentUser != null) {
      return _currentUser!.toJson();
    }
    return null;
  }
}

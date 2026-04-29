import 'package:flutter/foundation.dart';
import '../../models/user.dart';
import '../../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;
  
  AuthProvider(this._authService);
  
  // Estado
  User? _user;
  bool _isLoading = false;
  String? _error;
  
  // Getters
  User? get user => _user;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _user != null;
  
  // Login
  Future<bool> login(String email, String password) async {
    _setLoading(true);
    _clearError();
    
    try {
      final result = await _authService.login(email, password);
      
      if (result.success) {
        _user = result.data!;
        notifyListeners();
        return true;
      } else {
        _setError(result.error ?? 'Erro ao fazer login');
        return false;
      }
    } catch (e) {
      _setError('Erro inesperado: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }
  
  // Registro
  Future<bool> register(Map<String, dynamic> userData) async {
    _setLoading(true);
    _clearError();
    
    try {
      final result = await _authService.register(userData);
      
      if (result.success) {
        _user = result.data!;
        notifyListeners();
        return true;
      } else {
        _setError(result.error ?? 'Erro ao fazer cadastro');
        return false;
      }
    } catch (e) {
      debugPrint('AuthProvider.register error: $e');
      _setError('Erro inesperado: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }
  
  // Logout
  Future<void> logout() async {
    try {
      await _authService.logout();
    } catch (e) {
      debugPrint('Erro ao fazer logout: $e');
    } finally {
      _user = null;
      notifyListeners();
    }
  }
  
  // Verificar sessão atual
  Future<void> checkAuthStatus() async {
    _setLoading(true);
    
    try {
      final user = await _authService.getCurrentUser();
      if (user != null) {
        _user = user;
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Erro ao verificar status de autenticação: $e');
    } finally {
      _setLoading(false);
    }
  }
  
  // Esqueci senha
  Future<bool> forgotPassword(String email) async {
    _setLoading(true);
    _clearError();
    
    try {
      final result = await _authService.forgotPassword(email);
      
      if (result.success) {
        return true;
      } else {
        _setError(result.error ?? 'Erro ao enviar email de recuperação');
        return false;
      }
    } catch (e) {
      _setError('Erro inesperado: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }
  
  // Atualizar perfil
  Future<bool> updateProfile(Map<String, dynamic> userData) async {
    _setLoading(true);
    _clearError();
    
    try {
      final result = await _authService.updateProfile(userData);
      
      if (result.success && result.data != null) {
        _user = result.data!;
        notifyListeners();
        return true;
      } else {
        _setError(result.error ?? 'Erro ao atualizar perfil');
        return false;
      }
    } catch (e) {
      _setError('Erro inesperado: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }
  
  // Métodos privados
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }
  
  void _setError(String error) {
    _error = error;
    notifyListeners();
  }
  
  void _clearError() {
    _error = null;
    notifyListeners();
  }
}

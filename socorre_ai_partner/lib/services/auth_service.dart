import '../core/services/api_service.dart';
import '../models/user.dart';

// Re-export ApiResult from api_service
export '../core/services/api_service.dart' show ApiResult;

class AuthService {
  final ApiService _apiService;
  
  AuthService(this._apiService);
  
  // Login
  Future<ApiResult<User>> login(String email, String password) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/auth/login',
        data: {
          'email': email,
          'password': password,
        },
      );
      
      if (result.success && result.data != null) {
        final userData = result.data!['data']['user'];
        if (userData != null) {
          final user = User.fromJson(userData);
          
          // TODO: Salvar token e dados do usuário
          
          return ApiResult.success(user);
        } else {
          return ApiResult.error('Dados do usuário não encontrados na resposta');
        }
      } else {
        return ApiResult.error(result.error ?? 'Erro ao fazer login');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Registro
  Future<ApiResult<User>> register(Map<String, dynamic> userData) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/auth/register',
        data: userData,
      );
      
      if (result.success && result.data != null) {
        print('AuthService.register - result.data: ${result.data}');
        final userData = result.data!['data']['user'];
        print('AuthService.register - userData: $userData');
        if (userData != null) {
          final user = User.fromJson(userData);
          
          // TODO: Salvar token e dados do usuário
          
          return ApiResult.success(user);
        } else {
          print('AuthService.register - userData is null');
          return ApiResult.error('Dados do usuário não encontrados na resposta');
        }
      } else {
        return ApiResult.error(result.error ?? 'Erro ao fazer cadastro');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Logout
  Future<ApiResult<bool>> logout() async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/auth/logout',
      );
      
      if (result.success) {
        // TODO: Remover token e dados do usuário
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao fazer logout');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Esqueci senha
  Future<ApiResult<bool>> forgotPassword(String email) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/auth/forgot-password',
        data: {'email': email},
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao enviar email');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Obter usuário atual
  Future<User?> getCurrentUser() async {
    try {
      final result = await _apiService.get<Map<String, dynamic>>('/auth/me');
      
      if (result.success && result.data != null) {
        return User.fromJson(result.data!['user']);
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
  }
  
  // Atualizar perfil
  Future<ApiResult<User>> updateProfile(Map<String, dynamic> userData) async {
    try {
      final result = await _apiService.put<Map<String, dynamic>>(
        '/auth/profile',
        data: userData,
      );
      
      if (result.success && result.data != null) {
        final userData = result.data!['data']['user'];
        if (userData != null) {
          final user = User.fromJson(userData);
          return ApiResult.success(user);
        } else {
          return ApiResult.error('Dados do usuário não encontrados na resposta');
        }
      } else {
        return ApiResult.error(result.error ?? 'Erro ao atualizar perfil');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
}

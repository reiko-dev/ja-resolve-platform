import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/profile.dart';

class ProfileService {
  static String get _baseUrl => AppConfig.baseUrl;

  // Headers padrão
  static Map<String, String> get _headers {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // Headers com autenticação
  static Map<String, String> _headersWithAuth(String token) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Buscar perfil
  static Future<Map<String, dynamic>> getProfile({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/profile'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Profile.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar perfil',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar perfil
  static Future<Map<String, dynamic>> updateProfile({
    required String token,
    required Map<String, dynamic> profileData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/profile'),
        headers: _headersWithAuth(token),
        body: jsonEncode(profileData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Profile.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar perfil',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Upload de avatar
  static Future<Map<String, dynamic>> uploadAvatar({
    required String token,
    required String imagePath,
  }) async {
    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$_baseUrl/profile/avatar'),
      );
      
      request.headers.addAll(_headersWithAuth(token));
      request.files.add(await http.MultipartFile.fromPath('avatar', imagePath));
      
      final response = await request.send();
      final responseBody = await response.stream.bytesToString();
      final data = jsonDecode(responseBody);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao fazer upload do avatar',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar configurações
  static Future<Map<String, dynamic>> getSettings({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/profile/settings'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Settings.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar configurações',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar configurações
  static Future<Map<String, dynamic>> updateSettings({
    required String token,
    required Map<String, dynamic> settingsData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/profile/settings'),
        headers: _headersWithAuth(token),
        body: jsonEncode(settingsData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Settings.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar configurações',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar informações do negócio
  static Future<Map<String, dynamic>> getBusinessInfo({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/profile/business'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': BusinessInfo.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar informações do negócio',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar informações do negócio
  static Future<Map<String, dynamic>> updateBusinessInfo({
    required String token,
    required Map<String, dynamic> businessData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/profile/business'),
        headers: _headersWithAuth(token),
        body: jsonEncode(businessData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': BusinessInfo.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar informações do negócio',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Upload de imagens do negócio
  static Future<Map<String, dynamic>> uploadBusinessImages({
    required String token,
    required List<String> imagePaths,
  }) async {
    try {
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$_baseUrl/profile/business/images'),
      );
      
      request.headers.addAll(_headersWithAuth(token));
      
      for (int i = 0; i < imagePaths.length; i++) {
        request.files.add(
          await http.MultipartFile.fromPath('images[$i]', imagePaths[i]),
        );
      }
      
      final response = await request.send();
      final responseBody = await response.stream.bytesToString();
      final data = jsonDecode(responseBody);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao fazer upload das imagens',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Alterar senha
  static Future<Map<String, dynamic>> changePassword({
    required String token,
    required String currentPassword,
    required String newPassword,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/profile/password'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'current_password': currentPassword,
          'new_password': newPassword,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao alterar senha',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Alterar email
  static Future<Map<String, dynamic>> changeEmail({
    required String token,
    required String newEmail,
    required String password,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/profile/email'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'new_email': newEmail,
          'password': password,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao alterar email',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Deletar conta
  static Future<Map<String, dynamic>> deleteAccount({
    required String token,
    required String password,
    String? reason,
  }) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/profile/account'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'password': password,
          'reason': reason,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao deletar conta',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Exportar dados
  static Future<Map<String, dynamic>> exportData({
    required String token,
    String format = 'json',
  }) async {
    try {
      final queryParams = {
        'format': format,
      };

      final uri = Uri.parse('$_baseUrl/profile/export').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': response.bodyBytes,
          'contentType': response.headers['content-type'],
        };
      } else {
        final data = jsonDecode(response.body);
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao exportar dados',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Verificar status da conta
  static Future<Map<String, dynamic>> getAccountStatus({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/profile/status'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao verificar status da conta',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Solicitar verificação
  static Future<Map<String, dynamic>> requestVerification({
    required String token,
    required Map<String, dynamic> verificationData,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/profile/verification'),
        headers: _headersWithAuth(token),
        body: jsonEncode(verificationData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao solicitar verificação',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }
}

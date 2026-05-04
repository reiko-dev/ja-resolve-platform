import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import 'partner_type_service.dart';

class ApiService {
  static String get baseUrl => AppConfig.baseUrl;
  static String get authUrl => AppConfig.authUrl;
  static String get usersUrl => AppConfig.usersUrl;

  // Headers padrão
  static Map<String, String> get _defaultHeaders => {
    'Content-Type': 'application/json',
  };

  // Headers com token de autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // Registrar usuário
  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
    required String phone,
    String role = 'user',
    String? cpf,
    String? cnpj,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$authUrl/register'),
        headers: _defaultHeaders,
        body: jsonEncode({
          'name': name,
          'email': email,
          'password': password,
          'phone': phone,
          'role': role,
          if (cpf != null) 'cpf': cpf,
          if (cnpj != null) 'cnpj': cnpj,
        }),
      );

      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        // Salvar token
        if (data['data']?['token'] != null) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('auth_token', data['data']['token']);
          await prefs.setString('user_data', jsonEncode(data['data']['user']));
        }
      }

      return data;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Login
  static Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$authUrl/login'),
        headers: _defaultHeaders,
        body: jsonEncode({
          'email': email,
          'password': password,
        }),
      );

      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        // Salvar token
        if (data['data']?['token'] != null) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('auth_token', data['data']['token']);
          await prefs.setString('user_data', jsonEncode(data['data']['user']));
        }
      }

      return data;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Verificar token
  static Future<Map<String, dynamic>> verifyToken() async {
    try {
      final headers = await _authHeaders;
      final response = await http.get(
        Uri.parse('$authUrl/verify'),
        headers: headers,
      );

      return jsonDecode(response.body);
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Logout
  static Future<Map<String, dynamic>> logout() async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$authUrl/logout'),
        headers: headers,
      );

      // Limpar dados locais
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_token');
      await prefs.remove('user_data');

      return jsonDecode(response.body);
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar perfil do usuário
  static Future<Map<String, dynamic>> getProfile() async {
    try {
      final headers = await _authHeaders;
      final response = await http.get(
        Uri.parse('$usersUrl/profile'),
        headers: headers,
      );

      return jsonDecode(response.body);
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar perfil
  static Future<Map<String, dynamic>> updateProfile({
    String? name,
    String? phone,
    Map<String, dynamic>? address,
  }) async {
    try {
      final headers = await _authHeaders;
      final body = <String, dynamic>{};
      
      if (name != null) body['name'] = name;
      if (phone != null) body['phone'] = phone;
      if (address != null) body['address'] = address;

      final response = await http.put(
        Uri.parse('$usersUrl/profile'),
        headers: headers,
        body: jsonEncode(body),
      );

      return jsonDecode(response.body);
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Verificar se usuário está logado
  static Future<bool> isLoggedIn() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    return token != null;
  }

  // Buscar dados do usuário local
  static Future<Map<String, dynamic>?> getUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final userData = prefs.getString('user_data');
    if (userData != null) {
      return jsonDecode(userData);
    }
    return null;
  }

  // Limpar dados locais
  static Future<void> clearLocalData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_data');
  }

  static Future<Map<String, dynamic>> getPartnerOnboardingStatus() async {
    try {
      final headers = await _authHeaders;
      final partnerType = await PartnerTypeService.getPartnerType();
      final uri = Uri.parse('$baseUrl/partners/me/onboarding-status').replace(
        queryParameters: partnerType != null && partnerType.isNotEmpty
            ? {'partner_type': partnerType}
            : null,
      );

      final response = await http.get(uri, headers: headers);
      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        return {'success': true, 'data': data['data']};
      }

      return {'success': false, 'message': data['message'] ?? 'Erro ao buscar status do onboarding'};
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  static Future<Map<String, dynamic>> getPartnerDocuments() async {
    try {
      final headers = await _authHeaders;
      final response = await http.get(
        Uri.parse('$baseUrl/partners/documents'),
        headers: headers,
      );
      final data = jsonDecode(response.body);

      if (response.statusCode == 200) {
        return {'success': true, 'data': data['data']};
      }

      return {'success': false, 'message': data['message'] ?? 'Erro ao buscar documentos'};
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  // Iniciar chamada de vídeo
  static Future<Map<String, dynamic>> startVideoCall(String appointmentId) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/appointments/$appointmentId/video-call/start'),
        headers: headers,
      );
      final data = jsonDecode(response.body);
      return response.statusCode == 200
          ? {'success': true, 'data': data['data']}
          : {'success': false, 'message': data['message'] ?? 'Erro ao iniciar chamada'};
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  // Encerrar chamada de vídeo
  static Future<Map<String, dynamic>> endVideoCall(String appointmentId) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/appointments/$appointmentId/video-call/end'),
        headers: headers,
      );
      final data = jsonDecode(response.body);
      return response.statusCode == 200
          ? {'success': true}
          : {'success': false, 'message': data['message'] ?? 'Erro ao encerrar chamada'};
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  // Upload de documento do parceiro
  static Future<Map<String, dynamic>> uploadPartnerDocument({
    required XFile file,
    required String documentType,
    required String partnerType,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token');

      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/partners/documents/upload'),
      );

      if (token != null) {
        request.headers['Authorization'] = 'Bearer $token';
      }

      request.fields['document_type'] = documentType;
      request.fields['partner_type'] = partnerType;
      request.files.add(await http.MultipartFile.fromPath('file', file.path));

      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);
      final data = jsonDecode(response.body);

      if (response.statusCode == 200 || response.statusCode == 201) {
        return {'success': true, 'data': data['data']};
      } else {
        return {'success': false, 'message': data['message'] ?? 'Erro ao enviar documento'};
      }
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  // Remover documento do parceiro
  static Future<Map<String, dynamic>> deletePartnerDocument(String documentId) async {
    try {
      final headers = await _authHeaders;
      final response = await http.delete(
        Uri.parse('$baseUrl/partners/documents/$documentId'),
        headers: headers,
      );
      final data = jsonDecode(response.body);
      return response.statusCode == 200
          ? {'success': true}
          : {'success': false, 'message': data['message'] ?? 'Erro ao remover documento'};
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  // Enviar documentos para verificação
  static Future<Map<String, dynamic>> submitDocumentsForVerification({
    required String partnerType,
    required List<String> documentIds,
  }) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/partners/documents/submit'),
        headers: headers,
        body: jsonEncode({
          'partner_type': partnerType,
          'document_ids': documentIds,
        }),
      );
      final data = jsonDecode(response.body);
      return response.statusCode == 200 || response.statusCode == 201
          ? {'success': true, 'data': data['data']}
          : {'success': false, 'message': data['message'] ?? 'Erro ao enviar para verificação'};
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }

  // Completar onboarding do parceiro
  static Future<Map<String, dynamic>> completePartnerOnboarding(
    Map<String, dynamic> partnerData,
  ) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/partners/onboarding/complete'),
        headers: headers,
        body: jsonEncode(partnerData),
      );
      final data = jsonDecode(response.body);
      if (response.statusCode == 200 || response.statusCode == 201) {
        return {'success': true, 'data': data['data']};
      } else {
        return {'success': false, 'message': data['message'] ?? 'Erro ao concluir onboarding'};
      }
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }
}

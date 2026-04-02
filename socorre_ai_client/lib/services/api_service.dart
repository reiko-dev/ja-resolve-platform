import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:image_picker/image_picker.dart';

import '../config/app_config.dart';

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

  // Obter token
  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
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

      if (response.statusCode == 200 && data['success']) {
        // Salvar token
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_token', data['data']['token']);
        await _cacheUserData(data['data']['user']);
      }

      return data;
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Registro
  static Future<Map<String, dynamic>> register({
    required String name,
    required String email,
    required String password,
    required String phone,
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
          'role': 'user',
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 201 && data['success']) {
        // Salvar token
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('auth_token', data['data']['token']);
        await _cacheUserData(data['data']['user']);
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
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('user_data');
  }

  // Obter dados do usuário
  static Future<Map<String, dynamic>?> getUserData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userDataString = prefs.getString('user_data');
      
      if (userDataString != null) {
        return jsonDecode(userDataString);
      }

      return await fetchProfile();
    } catch (e) {
      return null;
    }
  }

  // Verificar se está logado
  static Future<bool> isLoggedIn() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token');
      
      if (token == null) return false;
      
      final response = await verifyToken();
      return response['success'] == true;
    } catch (e) {
      return false;
    }
  }

  // Buscar perfil completo do usuário autenticado
  static Future<Map<String, dynamic>?> fetchProfile() async {
    try {
      final headers = await _authHeaders;
      if (!headers.containsKey('Authorization')) return null;

      final response = await http.get(
        Uri.parse('$usersUrl/profile'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final user = data['data']['user'];
        await _cacheUserData(user);
        return user;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // Atualizar perfil do usuário autenticado
  static Future<Map<String, dynamic>> updateProfile({
    String? name,
    String? phone,
    Map<String, dynamic>? address,
  }) async {
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

    final data = jsonDecode(response.body);

    if (response.statusCode == 200 && data['success'] == true) {
      final user = data['data']['user'];
      await _cacheUserData(user);
      return data;
    }

    throw Exception(data['message'] ?? 'Não foi possível atualizar o perfil');
  }

  static Future<void> _cacheUserData(Map<String, dynamic> user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('user_data', jsonEncode(user));
  }

  // Upload de documentos
  static Future<Map<String, dynamic>> uploadDocument({
    required XFile file,
    required String documentType,
    required String userType,
    String partnerType = '',
  }) async {
    try {
      final headers = await _authHeaders;
      final request = http.MultipartRequest(
        'POST',
        Uri.parse('$baseUrl/api/uploads/client-documents'),
      );

      // Adicionar headers
      request.headers.addAll(headers);

      // Adicionar campos do formulário
      request.fields['document_type'] = documentType;
      request.fields['user_type'] = userType;
      if (partnerType.isNotEmpty) {
        request.fields['partner_type'] = partnerType;
      }

      // Adicionar arquivo
      final fileBytes = await file.readAsBytes();
      final multipartFile = http.MultipartFile.fromBytes(
        'document',
        fileBytes,
        filename: file.name,
      );
      request.files.add(multipartFile);

      // Enviar requisição
      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao fazer upload do documento');
    } catch (e) {
      throw Exception('Erro ao fazer upload do documento: $e');
    }
  }

  // Obter agendamentos
  static Future<Map<String, dynamic>> getAppointments({
    String filter = 'all',
    DateTime? date,
  }) async {
    try {
      final headers = await _authHeaders;
      final queryParams = <String, String>{
        'filter': filter,
      };

      if (date != null) {
        queryParams['date'] = date.toIso8601String();
      }

      final uri = Uri.parse('$baseUrl/api/appointments')
          .replace(queryParameters: queryParams);

      final response = await http.get(uri, headers: headers);
      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao carregar agendamentos');
    } catch (e) {
      throw Exception('Erro ao carregar agendamentos: $e');
    }
  }

  // Cancelar agendamento
  static Future<Map<String, dynamic>> cancelAppointment(int appointmentId) async {
    try {
      final headers = await _authHeaders;
      final response = await http.put(
        Uri.parse('$baseUrl/api/appointments/$appointmentId/cancel'),
        headers: headers,
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao cancelar agendamento');
    } catch (e) {
      throw Exception('Erro ao cancelar agendamento: $e');
    }
  }

  // Reagendar agendamento
  static Future<Map<String, dynamic>> rescheduleAppointment(
    int appointmentId,
    DateTime newDate,
  ) async {
    try {
      final headers = await _authHeaders;
      final response = await http.put(
        Uri.parse('$baseUrl/api/appointments/$appointmentId/reschedule'),
        headers: headers,
        body: jsonEncode({
          'new_date': newDate.toIso8601String(),
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao reagendar agendamento');
    } catch (e) {
      throw Exception('Erro ao reagendar agendamento: $e');
    }
  }

  // Atualizar status de onboarding
  static Future<Map<String, dynamic>> updateUserOnboardingStatus(bool completed) async {
    try {
      final headers = await _authHeaders;
      final response = await http.put(
        Uri.parse('$usersUrl/onboarding'),
        headers: headers,
        body: jsonEncode({
          'onboarding_completed': completed,
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao atualizar onboarding');
    } catch (e) {
      throw Exception('Erro ao atualizar onboarding: $e');
    }
  }

  // Deletar documento
  static Future<Map<String, dynamic>> deleteDocument(String documentId) async {
    try {
      final headers = await _authHeaders;
      final response = await http.delete(
        Uri.parse('$baseUrl/api/uploads/client-documents/$documentId'),
        headers: headers,
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao deletar documento');
    } catch (e) {
      throw Exception('Erro ao deletar documento: $e');
    }
  }
}

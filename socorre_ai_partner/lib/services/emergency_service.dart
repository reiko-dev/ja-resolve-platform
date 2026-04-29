import 'dart:convert';
import 'package:flutter/rendering.dart';
import 'package:http/http.dart' as http;
import '../models/emergency_request.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class EmergencyService {
  static String get baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // Buscar emergências próximas
  static Future<List<EmergencyRequest>> getNearbyRequests() async {
    try {
      final headers = await _authHeaders;
      final response = await http.get(
        Uri.parse('$baseUrl/emergency-requests/nearby'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true) {
          final List<dynamic> requests = data['data'] ?? [];
          return requests.map((json) => EmergencyRequest.fromJson(json)).toList();
        }
      }
      return [];
    } catch (e) {
      debugPrint('Erro ao buscar emergências: $e');
      return [];
    }
  }

  // Aceitar emergência
  static Future<bool> acceptEmergency(String emergencyId) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/emergency-requests/$emergencyId/accept'),
        headers: headers,
        body: json.encode({}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      debugPrint('Erro ao aceitar emergência: $e');
      return false;
    }
  }

  // Atualizar status da emergência
  static Future<bool> updateEmergencyStatus(String emergencyId, String status) async {
    try {
      final headers = await _authHeaders;
      final response = await http.put(
        Uri.parse('$baseUrl/emergency-requests/$emergencyId/status'),
        headers: headers,
        body: json.encode({'status': status}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      debugPrint('Erro ao atualizar status: $e');
      return false;
    }
  }

  // Buscar emergência ativa do parceiro
  static Future<EmergencyRequest?> getActiveEmergency() async {
    try {
      final headers = await _authHeaders;
      final response = await http.get(
        Uri.parse('$baseUrl/emergency-requests/active'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        if (data['success'] == true && data['data'] != null) {
          return EmergencyRequest.fromJson(data['data']);
        }
      }
      return null;
    } catch (e) {
      debugPrint('Erro ao buscar emergência ativa: $e');
      return null;
    }
  }

  // Concluir emergência
  static Future<bool> completeEmergency(String emergencyId, String notes) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/emergency-requests/$emergencyId/complete'),
        headers: headers,
        body: json.encode({'notes': notes}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      debugPrint('Erro ao concluir emergência: $e');
      return false;
    }
  }

  // Cancelar emergência
  static Future<bool> cancelEmergency(String emergencyId, String reason) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/emergency-requests/$emergencyId/cancel'),
        headers: headers,
        body: json.encode({'reason': reason}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      debugPrint('Erro ao cancelar emergência: $e');
      return false;
    }
  }

  // Atualizar localização do parceiro
  static Future<bool> updateLocation(double latitude, double longitude) async {
    try {
      final headers = await _authHeaders;
      final response = await http.post(
        Uri.parse('$baseUrl/partners/location'),
        headers: headers,
        body: json.encode({
          'latitude': latitude,
          'longitude': longitude,
        }),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      debugPrint('Erro ao atualizar localização: $e');
      return false;
    }
  }

  // Atualizar status online/offline
  static Future<bool> updateOnlineStatus(bool isOnline) async {
    try {
      final headers = await _authHeaders;
      final response = await http.put(
        Uri.parse('$baseUrl/partners/status'),
        headers: headers,
        body: json.encode({'is_online': isOnline}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['success'] == true;
      }
      return false;
    } catch (e) {
      debugPrint('Erro ao atualizar status: $e');
      return false;
    }
  }
}

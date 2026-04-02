import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/emergency_request.dart';
import '../models/partner.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class EmergencyService {
  static String get baseUrl => AppConfig.baseUrl;
  static String get emergencyUrl => AppConfig.emergencyUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Atualizar status da emergência
  static Future<Map<String, dynamic>> updateEmergencyStatus(
    String emergencyId,
    String status,
  ) async {
    try {
      final headers = await _authHeaders;
      final response = await http.put(
        Uri.parse('$emergencyUrl/$emergencyId/status'),
        headers: headers,
        body: jsonEncode({
          'status': status,
        }),
      );

      final data = jsonDecode(response.body);

      if (response.statusCode == 200 && data['success'] == true) {
        return data;
      }

      throw Exception(data['message'] ?? 'Erro ao atualizar status');
    } catch (e) {
      throw Exception('Erro ao atualizar status: $e');
    }
  }

  // Criar solicitação de emergência
  static Future<EmergencyRequest> createEmergencyRequest({
    required EmergencyType type,
    required EmergencyUrgency urgency,
    required String description,
    required Map<String, dynamic> vehicleInfo,
    required double latitude,
    required double longitude,
    required String address,
    List<String> photos = const [],
  }) async {
    try {
      final headers = await _authHeaders;
      
      final body = {
        'type': type.toString().split('.').last,
        'urgency': urgency.toString().split('.').last,
        'description': description.trim(),
        'vehicle_info': {
          'brand': vehicleInfo['brand'] ?? vehicleInfo['model'] ?? 'Não informado',
          'model': vehicleInfo['model'] ?? 'Não informado',
          'year': vehicleInfo['year'] ?? new DateTime.now().year,
          'license_plate': vehicleInfo['plate'] ?? vehicleInfo['license_plate'] ?? null,
          'color': vehicleInfo['color'] ?? null,
        },
        'location_type': 'roadside', // padrão para emergências
        'latitude': latitude,
        'longitude': longitude,
        'address': address,
        'photos': photos,
      };

      print('📤 Enviando requisição para: $emergencyUrl');
      print('📦 Body: ${jsonEncode(body)}');

      final response = await http.post(
        Uri.parse(emergencyUrl),
        headers: headers,
        body: jsonEncode(body),
      ).timeout(
        const Duration(seconds: 30),
        onTimeout: () {
          throw Exception('Timeout ao conectar com o servidor');
        },
      );

      print('📥 Response status: ${response.statusCode}');
      print('📥 Response body: ${response.body}');

      if (response.statusCode == 201 || response.statusCode == 200) {
        final data = jsonDecode(response.body);
        // Pode vir como data['data'] ou diretamente como data
        final requestData = data['data'] ?? data;
        return EmergencyRequest.fromJson(requestData);
      } else {
        String errorMessage = 'Erro ao criar solicitação';
        try {
          final error = jsonDecode(response.body);
          // Montar mensagem com detalhes dos erros
          if (error['errors'] != null && error['errors'] is List) {
            final errors = (error['errors'] as List).join(', ');
            errorMessage = '${error['message'] ?? errorMessage}\n$errors';
          } else {
            errorMessage = error['message'] ?? error['error'] ?? errorMessage;
          }
        } catch (_) {
          errorMessage = 'Erro ${response.statusCode}: ${response.body.substring(0, response.body.length > 200 ? 200 : response.body.length)}';
        }
        throw Exception(errorMessage);
      }
    } catch (e) {
      if (e is Exception) {
        rethrow;
      }
      throw Exception('Erro de conexão: $e');
    }
  }

  // Buscar solicitações do usuário
  static Future<List<EmergencyRequest>> getUserRequests() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$emergencyUrl/user'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return (data['data'] as List)
            .map((json) => EmergencyRequest.fromJson(json))
            .toList();
      } else {
        throw Exception('Erro ao buscar solicitações');
      }
    } catch (e) {
      throw Exception('Erro de conexão: $e');
    }
  }

  // Cancelar solicitação
  static Future<void> cancelRequest(String requestId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.put(
        Uri.parse('$emergencyUrl/$requestId/cancel'),
        headers: headers,
      );

      if (response.statusCode != 200) {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao cancelar solicitação');
      }
    } catch (e) {
      throw Exception('Erro de conexão: $e');
    }
  }

  // Avaliar parceiro
  static Future<void> ratePartner(String requestId, double rating, String? comment) async {
    try {
      final headers = await _authHeaders;
      
      final body = {
        'rating': rating,
        'comment': comment,
      };

      final response = await http.post(
        Uri.parse('$emergencyUrl/$requestId/rate'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode != 200) {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao avaliar parceiro');
      }
    } catch (e) {
      throw Exception('Erro de conexão: $e');
    }
  }

  // Buscar parceiros próximos
  static Future<List<Partner>> getNearbyPartners({
    required double latitude,
    required double longitude,
    double radius = 15.0,
    EmergencyType? type,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final queryParams = {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'radius': radius.toString(),
        if (type != null) 'type': type.toString().split('.').last,
      };

      final uri = Uri.parse('$baseUrl/partners/nearby').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: headers);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return (data['data'] as List)
            .map((json) => Partner.fromJson(json))
            .toList();
      } else {
        throw Exception('Erro ao buscar parceiros');
      }
    } catch (e) {
      throw Exception('Erro de conexão: $e');
    }
  }
}

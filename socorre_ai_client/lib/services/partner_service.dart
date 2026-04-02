import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/partner.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class PartnerService {
  static String get baseUrl => AppConfig.baseUrl;
  static String get partnersUrl => AppConfig.partnersUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Buscar parceiros próximos
  static Future<List<Partner>> getNearbyPartners({
    required double latitude,
    required double longitude,
    double radius = 15.0,
    String? type,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final queryParams = {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'radius': radius.toString(),
        if (type != null) 'type': type,
      };

      final uri = Uri.parse('$baseUrl/partners/nearby').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: headers);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['data'] != null) {
          return (data['data'] as List)
              .map((json) => Partner.fromJson(json))
              .toList();
        }
        return [];
      } else {
        throw Exception('Erro ao buscar parceiros');
      }
    } catch (e) {
      print('Erro ao buscar parceiros: $e');
      throw Exception('Erro de conexão: $e');
    }
  }

  // Buscar parceiro por ID
  static Future<Partner> getPartnerById(String partnerId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$partnersUrl/$partnerId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['data'] != null) {
          return Partner.fromJson(data['data']);
        }
        throw Exception('Parceiro não encontrado');
      } else {
        throw Exception('Erro ao buscar parceiro');
      }
    } catch (e) {
      print('Erro ao buscar parceiro: $e');
      throw Exception('Erro de conexão: $e');
    }
  }

  // Buscar todos os parceiros
  static Future<List<Partner>> getAllPartners({
    int page = 1,
    int limit = 20,
    String? type,
    bool? isAvailable,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (type != null) 'type': type,
        if (isAvailable != null) 'is_available': isAvailable.toString(),
      };

      final uri = Uri.parse(partnersUrl).replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: headers);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['data'] != null) {
          return (data['data'] as List)
              .map((json) => Partner.fromJson(json))
              .toList();
        }
        return [];
      } else {
        throw Exception('Erro ao buscar parceiros');
      }
    } catch (e) {
      print('Erro ao buscar parceiros: $e');
      throw Exception('Erro de conexão: $e');
    }
  }
}



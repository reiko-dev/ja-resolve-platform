import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class PartnerService {
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

  // Cadastrar mecânico
  static Future<Map<String, dynamic>> createMechanic({
    required String token,
    required String businessName,
    required String description,
    required String phone,
    String? whatsapp,
    required String address,
    required double latitude,
    required double longitude,
    required List<String> specialties,
    required List<String> services,
    required double hourlyRate,
    required int experienceYears,
    required double serviceRadius,
    required bool emergencyService,
    required bool homeService,
    required bool workshopService,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/partners/mechanic'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'business_name': businessName,
          'description': description,
          'phone': phone,
          'whatsapp': whatsapp,
          'address': address,
          'latitude': latitude,
          'longitude': longitude,
          'specialties': specialties,
          'services': services,
          'hourly_rate': hourlyRate,
          'experience_years': experienceYears,
          'service_radius': serviceRadius,
          'emergency_service': emergencyService,
          'home_service': homeService,
          'workshop_service': workshopService,
        }),
      );

      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao cadastrar mecânico',
          'errors': data['errors'],
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Cadastrar lojista
  static Future<Map<String, dynamic>> createStore({
    required String token,
    required String businessName,
    required String description,
    required String phone,
    String? whatsapp,
    required String address,
    required double latitude,
    required double longitude,
    required List<String> storeCategories,
    required List<String> paymentMethods,
    required bool hasDelivery,
    double? minOrderValue,
    int? deliveryTime,
    double? deliveryRadius,
    String? website,
    String? instagram,
    required bool isOnlineStore,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/partners/store'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'business_name': businessName,
          'description': description,
          'phone': phone,
          'whatsapp': whatsapp,
          'address': address,
          'latitude': latitude,
          'longitude': longitude,
          'store_categories': storeCategories,
          'payment_methods': paymentMethods,
          'has_delivery': hasDelivery,
          'min_order_value': minOrderValue,
          'delivery_time': deliveryTime,
          'delivery_radius': deliveryRadius,
          'website': website,
          'instagram': instagram,
          'is_online_store': isOnlineStore,
        }),
      );

      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao cadastrar lojista',
          'errors': data['errors'],
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Cadastrar motoboy
  static Future<Map<String, dynamic>> createMotoboy({
    required String token,
    required String name,
    required String phone,
    String? whatsapp,
    required String address,
    required double latitude,
    required double longitude,
    required String cnhNumber,
    required String cnhCategory,
    required String vehicleType,
    required String licensePlate,
    required List<String> deliveryTypes,
    required double deliveryFee,
    required int experienceYears,
    required double serviceRadius,
    required bool isAvailable,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/partners/motoboy'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'name': name,
          'phone': phone,
          'whatsapp': whatsapp,
          'address': address,
          'latitude': latitude,
          'longitude': longitude,
          'cnh_number': cnhNumber,
          'cnh_category': cnhCategory,
          'vehicle_type': vehicleType,
          'license_plate': licensePlate,
          'delivery_types': deliveryTypes,
          'delivery_fee': deliveryFee,
          'experience_years': experienceYears,
          'service_radius': serviceRadius,
          'is_available': isAvailable,
        }),
      );

      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao cadastrar motoboy',
          'errors': data['errors'],
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar parceiros próximos
  static Future<Map<String, dynamic>> getNearby({
    required double latitude,
    required double longitude,
    double radius = 10.0,
    String? type,
  }) async {
    try {
      final queryParams = {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'radius': radius.toString(),
        if (type != null) 'type': type,
      };

      final uri = Uri.parse('$_baseUrl/partners/nearby').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'count': data['count'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar parceiros',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar motoboys disponíveis
  static Future<Map<String, dynamic>> getAvailableMotoboys({
    required double latitude,
    required double longitude,
    double radius = 20.0,
  }) async {
    try {
      final queryParams = {
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'radius': radius.toString(),
      };

      final uri = Uri.parse('$_baseUrl/partners/motoboys').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'count': data['count'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar motoboys',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar lojas por categoria
  static Future<Map<String, dynamic>> getStoresByCategory({
    required String category,
    required double latitude,
    required double longitude,
    double radius = 25.0,
  }) async {
    try {
      final queryParams = {
        'category': category,
        'latitude': latitude.toString(),
        'longitude': longitude.toString(),
        'radius': radius.toString(),
      };

      final uri = Uri.parse('$_baseUrl/partners/stores').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'count': data['count'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar lojas',
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

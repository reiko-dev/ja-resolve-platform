import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/services/api_service.dart';
import '../models/subscription.dart';
import '../config/app_config.dart';

class PartnerService {
  final ApiService _apiService;

  static String get _baseUrl => AppConfig.baseUrl;

  static Future<Map<String, String>> _headersWithToken(String token) async {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Cadastrar mecânico (static, usado por MechanicRegistrationScreen)
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
        headers: await _headersWithToken(token),
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
        return {'success': true, 'data': data['data'], 'message': data['message']};
      } else {
        return {'success': false, 'message': data['message'] ?? 'Erro ao cadastrar mecânico'};
      }
    } catch (e) {
      return {'success': false, 'message': 'Erro de conexão: $e'};
    }
  }
  
  PartnerService(this._apiService);
  
  // Completar cadastro
  Future<ApiResult<bool>> completeRegistration({
    required SubscriptionType type,
    required Map<String, dynamic> data,
  }) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/partner/complete-registration',
        data: {
          'type': type.name,
          'data': data,
        },
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao completar cadastro');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Obter status da assinatura
  Future<ApiResult<Subscription>> getSubscriptionStatus() async {
    try {
      final result = await _apiService.get<Map<String, dynamic>>('/partner/subscription');
      
      if (result.success && result.data != null) {
        final subscription = Subscription.fromJson(result.data!);
        return ApiResult.success(subscription);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao buscar assinatura');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Criar assinatura
  Future<ApiResult<Subscription>> createSubscription({
    required SubscriptionType type,
    required String planId,
    required Map<String, dynamic> paymentData,
  }) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/partner/subscription',
        data: {
          'type': type.name,
          'planId': planId,
          'paymentData': paymentData,
        },
      );
      
      if (result.success && result.data != null) {
        final subscription = Subscription.fromJson(result.data!);
        return ApiResult.success(subscription);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao criar assinatura');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Cancelar assinatura
  Future<ApiResult<bool>> cancelSubscription({String? reason}) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/partner/subscription/cancel',
        data: {'reason': reason},
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao cancelar assinatura');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Obter dados do parceiro
  Future<ApiResult<Map<String, dynamic>>> getPartnerData() async {
    try {
      final result = await _apiService.get<Map<String, dynamic>>('/partner/data');
      
      if (result.success && result.data != null) {
        return ApiResult.success(result.data!);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao buscar dados');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Atualizar dados do parceiro
  Future<ApiResult<bool>> updatePartnerData(Map<String, dynamic> data) async {
    try {
      final result = await _apiService.put<Map<String, dynamic>>(
        '/partner/data',
        data: data,
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao atualizar dados');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Obter métricas do dashboard
  Future<ApiResult<Map<String, dynamic>>> getDashboardMetrics() async {
    try {
      final result = await _apiService.get<Map<String, dynamic>>('/partner/dashboard/metrics');
      
      if (result.success && result.data != null) {
        return ApiResult.success(result.data!);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao buscar métricas');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Obter solicitações de serviço
  Future<ApiResult<List<Map<String, dynamic>>>> getServiceRequests({
    String? status,
    int? limit,
    int? offset,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null) queryParams['status'] = status;
      if (limit != null) queryParams['limit'] = limit;
      if (offset != null) queryParams['offset'] = offset;
      
      final result = await _apiService.get<Map<String, dynamic>>(
        '/partner/service-requests',
        queryParameters: queryParams,
      );
      
      if (result.success && result.data != null) {
        final requests = List<Map<String, dynamic>>.from(result.data!['requests'] ?? []);
        return ApiResult.success(requests);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao buscar solicitações');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Aceitar solicitação de serviço
  Future<ApiResult<bool>> acceptServiceRequest(String requestId) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/partner/service-requests/$requestId/accept',
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao aceitar solicitação');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Rejeitar solicitação de serviço
  Future<ApiResult<bool>> rejectServiceRequest(String requestId, {String? reason}) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/partner/service-requests/$requestId/reject',
        data: {'reason': reason},
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao rejeitar solicitação');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Obter histórico financeiro
  Future<ApiResult<List<Map<String, dynamic>>>> getFinancialHistory({
    String? startDate,
    String? endDate,
    int? limit,
    int? offset,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (startDate != null) queryParams['startDate'] = startDate;
      if (endDate != null) queryParams['endDate'] = endDate;
      if (limit != null) queryParams['limit'] = limit;
      if (offset != null) queryParams['offset'] = offset;
      
      final result = await _apiService.get<Map<String, dynamic>>(
        '/partner/financial/history',
        queryParameters: queryParams,
      );
      
      if (result.success && result.data != null) {
        final transactions = List<Map<String, dynamic>>.from(result.data!['transactions'] ?? []);
        return ApiResult.success(transactions);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao buscar histórico');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
  
  // Solicitar saque
  Future<ApiResult<bool>> requestWithdrawal({
    required double amount,
    required String method,
    Map<String, dynamic>? methodData,
  }) async {
    try {
      final result = await _apiService.post<Map<String, dynamic>>(
        '/partner/financial/withdraw',
        data: {
          'amount': amount,
          'method': method,
          'methodData': methodData,
        },
      );
      
      if (result.success) {
        return ApiResult.success(true);
      } else {
        return ApiResult.error(result.error ?? 'Erro ao solicitar saque');
      }
    } catch (e) {
      return ApiResult.error('Erro inesperado: $e');
    }
  }
}

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/review.dart';

class ReviewService {
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

  // Buscar avaliações de um parceiro
  static Future<Map<String, dynamic>> getPartnerReviews({
    required String partnerId,
    int page = 1,
    int limit = 10,
    String? sortBy,
    String? filter,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (sortBy != null) 'sort_by': sortBy,
        if (filter != null) 'filter': filter,
      };

      final uri = Uri.parse('$_baseUrl/reviews/partner/$partnerId').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar avaliações',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar estatísticas de avaliações
  static Future<Map<String, dynamic>> getReviewStats({
    required String partnerId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reviews/stats/$partnerId'),
        headers: _headers,
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': ReviewStats.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar estatísticas',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Responder a uma avaliação
  static Future<Map<String, dynamic>> respondToReview({
    required String token,
    required String reviewId,
    required String response,
  }) async {
    try {
      final responseData = await http.post(
        Uri.parse('$_baseUrl/reviews/$reviewId/respond'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'response': response,
        }),
      );

      final data = jsonDecode(responseData.body);
      
      if (responseData.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao responder avaliação',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Reportar uma avaliação
  static Future<Map<String, dynamic>> reportReview({
    required String token,
    required String reviewId,
    required String reason,
    String? description,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/reviews/$reviewId/report'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'reason': reason,
          'description': description,
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
          'message': data['message'] ?? 'Erro ao reportar avaliação',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar avaliações recentes
  static Future<Map<String, dynamic>> getRecentReviews({
    required String partnerId,
    int limit = 5,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reviews/partner/$partnerId/recent'),
        headers: _headers,
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList(),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar avaliações recentes',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar avaliações por filtro
  static Future<Map<String, dynamic>> getFilteredReviews({
    required String partnerId,
    int? minRating,
    int? maxRating,
    String? serviceType,
    bool? verifiedOnly,
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (minRating != null) 'min_rating': minRating.toString(),
        if (maxRating != null) 'max_rating': maxRating.toString(),
        if (serviceType != null) 'service_type': serviceType,
        if (verifiedOnly != null) 'verified_only': verifiedOnly.toString(),
      };

      final uri = Uri.parse('$_baseUrl/reviews/partner/$partnerId/filter').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar avaliações filtradas',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar avaliações por cliente
  static Future<Map<String, dynamic>> getClientReviews({
    required String clientId,
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
      };

      final uri = Uri.parse('$_baseUrl/reviews/client/$clientId').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar avaliações do cliente',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar avaliações por serviço
  static Future<Map<String, dynamic>> getServiceReviews({
    required String serviceId,
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
      };

      final uri = Uri.parse('$_baseUrl/reviews/service/$serviceId').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar avaliações do serviço',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar avaliações por período
  static Future<Map<String, dynamic>> getReviewsByPeriod({
    required String partnerId,
    required DateTime startDate,
    required DateTime endDate,
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        'start_date': startDate.toIso8601String(),
        'end_date': endDate.toIso8601String(),
      };

      final uri = Uri.parse('$_baseUrl/reviews/partner/$partnerId/period').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headers);
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((review) => Review.fromJson(review))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar avaliações do período',
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

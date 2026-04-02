import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/analytics.dart';

class AnalyticsService {
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

  // Buscar resumo de analytics
  static Future<Map<String, dynamic>> getAnalyticsSummary({
    required String token,
    DateTime? startDate,
    DateTime? endDate,
    String? period,
  }) async {
    try {
      final queryParams = {
        if (startDate != null) 'start_date': startDate.toIso8601String(),
        if (endDate != null) 'end_date': endDate.toIso8601String(),
        if (period != null) 'period': period,
      };

      final uri = Uri.parse('$_baseUrl/analytics/summary').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': AnalyticsSummary.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar resumo de analytics',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar dados de analytics
  static Future<Map<String, dynamic>> getAnalyticsData({
    required String token,
    required String metric,
    DateTime? startDate,
    DateTime? endDate,
    String? category,
    String? subcategory,
    int page = 1,
    int limit = 100,
  }) async {
    try {
      final queryParams = {
        'metric': metric,
        'page': page.toString(),
        'limit': limit.toString(),
        if (startDate != null) 'start_date': startDate.toIso8601String(),
        if (endDate != null) 'end_date': endDate.toIso8601String(),
        if (category != null) 'category': category,
        if (subcategory != null) 'subcategory': subcategory,
      };

      final uri = Uri.parse('$_baseUrl/analytics/data').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => AnalyticsData.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar dados de analytics',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar gráficos de analytics
  static Future<Map<String, dynamic>> getAnalyticsCharts({
    required String token,
    required List<String> chartTypes,
    DateTime? startDate,
    DateTime? endDate,
    String? period,
  }) async {
    try {
      final queryParams = {
        'chart_types': chartTypes.join(','),
        if (startDate != null) 'start_date': startDate.toIso8601String(),
        if (endDate != null) 'end_date': endDate.toIso8601String(),
        if (period != null) 'period': period,
      };

      final uri = Uri.parse('$_baseUrl/analytics/charts').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => AnalyticsChart.fromJson(item))
              .toList(),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar gráficos',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar relatórios
  static Future<Map<String, dynamic>> getAnalyticsReports({
    required String token,
    int page = 1,
    int limit = 20,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (startDate != null) 'start_date': startDate.toIso8601String(),
        if (endDate != null) 'end_date': endDate.toIso8601String(),
      };

      final uri = Uri.parse('$_baseUrl/analytics/reports').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => AnalyticsReport.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar relatórios',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Gerar relatório
  static Future<Map<String, dynamic>> generateReport({
    required String token,
    required String title,
    required String description,
    required DateTime startDate,
    required DateTime endDate,
    required List<String> chartTypes,
    String format = 'pdf',
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/analytics/reports/generate'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'title': title,
          'description': description,
          'start_date': startDate.toIso8601String(),
          'end_date': endDate.toIso8601String(),
          'chart_types': chartTypes,
          'format': format,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': AnalyticsReport.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao gerar relatório',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar relatório por ID
  static Future<Map<String, dynamic>> getReport({
    required String token,
    required String reportId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/analytics/reports/$reportId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': AnalyticsReport.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar relatório',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Baixar relatório
  static Future<Map<String, dynamic>> downloadReport({
    required String token,
    required String reportId,
    String format = 'pdf',
  }) async {
    try {
      final queryParams = {
        'format': format,
      };

      final uri = Uri.parse('$_baseUrl/analytics/reports/$reportId/download').replace(
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
          'message': data['message'] ?? 'Erro ao baixar relatório',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar métricas disponíveis
  static Future<Map<String, dynamic>> getAvailableMetrics({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/analytics/metrics'),
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
          'message': data['message'] ?? 'Erro ao buscar métricas',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar categorias disponíveis
  static Future<Map<String, dynamic>> getAvailableCategories({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/analytics/categories'),
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
          'message': data['message'] ?? 'Erro ao buscar categorias',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar dados em tempo real
  static Future<Map<String, dynamic>> getRealTimeData({
    required String token,
    required List<String> metrics,
  }) async {
    try {
      final queryParams = {
        'metrics': metrics.join(','),
      };

      final uri = Uri.parse('$_baseUrl/analytics/realtime').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar dados em tempo real',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar comparação de períodos
  static Future<Map<String, dynamic>> getPeriodComparison({
    required String token,
    required DateTime currentStart,
    required DateTime currentEnd,
    required DateTime previousStart,
    required DateTime previousEnd,
    required List<String> metrics,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/analytics/compare'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'current_start': currentStart.toIso8601String(),
          'current_end': currentEnd.toIso8601String(),
          'previous_start': previousStart.toIso8601String(),
          'previous_end': previousEnd.toIso8601String(),
          'metrics': metrics,
        }),
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
          'message': data['message'] ?? 'Erro ao comparar períodos',
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

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/reports.dart';

class ReportsService {
  static String get _baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Map<String, String> _headersWithAuth(String token) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Criar relatório
  static Future<Map<String, dynamic>> createReport({
    required String token,
    required String title,
    required String description,
    required String type,
    required String category,
    required DateTime periodStart,
    required DateTime periodEnd,
    String format = 'pdf',
    Map<String, dynamic>? parameters,
    List<String>? charts,
    List<String>? filters,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/reports/create'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'title': title,
          'description': description,
          'type': type,
          'category': category,
          'period_start': periodStart.toIso8601String(),
          'period_end': periodEnd.toIso8601String(),
          'format': format,
          'parameters': parameters,
          'charts': charts,
          'filters': filters,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': Report.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao criar relatório',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar relatórios do usuário
  static Future<Map<String, dynamic>> getUserReports({
    required String token,
    String? type,
    String? category,
    String? status,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (type != null) 'type': type,
        if (category != null) 'category': category,
        if (status != null) 'status': status,
      };

      final uri = Uri.parse('$_baseUrl/reports/list').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => Report.fromJson(item))
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

  // Buscar relatório específico
  static Future<Map<String, dynamic>> getReport({
    required String token,
    required String reportId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reports/$reportId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Report.fromJson(data['data']),
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
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reports/$reportId/download'),
        headers: _headersWithAuth(token),
      );
      
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

  // Deletar relatório
  static Future<Map<String, dynamic>> deleteReport({
    required String token,
    required String reportId,
  }) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/reports/$reportId'),
        headers: _headersWithAuth(token),
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
          'message': data['message'] ?? 'Erro ao deletar relatório',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar templates de relatório
  static Future<Map<String, dynamic>> getReportTemplates({
    required String token,
    String? category,
    bool? isPublic,
  }) async {
    try {
      final queryParams = {
        if (category != null) 'category': category,
        if (isPublic != null) 'is_public': isPublic.toString(),
      };

      final uri = Uri.parse('$_baseUrl/reports/templates').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => ReportTemplate.fromJson(item))
              .toList(),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar templates',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar categorias de relatório
  static Future<Map<String, dynamic>> getReportCategories({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reports/categories'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => ReportCategory.fromJson(item))
              .toList(),
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

  // Buscar widgets do dashboard
  static Future<Map<String, dynamic>> getDashboardWidgets({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/dashboard/widgets'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => DashboardWidget.fromJson(item))
              .toList(),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar widgets',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar widget do dashboard
  static Future<Map<String, dynamic>> updateDashboardWidget({
    required String token,
    required String widgetId,
    required Map<String, dynamic> widgetData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/dashboard/widgets/$widgetId'),
        headers: _headersWithAuth(token),
        body: jsonEncode(widgetData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': DashboardWidget.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar widget',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar resumo executivo
  static Future<Map<String, dynamic>> getExecutiveSummary({
    required String token,
    DateTime? periodStart,
    DateTime? periodEnd,
  }) async {
    try {
      final queryParams = {
        if (periodStart != null) 'period_start': periodStart.toIso8601String(),
        if (periodEnd != null) 'period_end': periodEnd.toIso8601String(),
      };

      final uri = Uri.parse('$_baseUrl/reports/executive-summary').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': ExecutiveSummary.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar resumo executivo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar dados do dashboard
  static Future<Map<String, dynamic>> getDashboardData({
    required String token,
    DateTime? periodStart,
    DateTime? periodEnd,
  }) async {
    try {
      final queryParams = {
        if (periodStart != null) 'period_start': periodStart.toIso8601String(),
        if (periodEnd != null) 'period_end': periodEnd.toIso8601String(),
      };

      final uri = Uri.parse('$_baseUrl/dashboard/data').replace(
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
          'message': data['message'] ?? 'Erro ao buscar dados do dashboard',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar estatísticas de relatórios
  static Future<Map<String, dynamic>> getReportStats({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reports/stats'),
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

  // Agendar relatório
  static Future<Map<String, dynamic>> scheduleReport({
    required String token,
    required String templateId,
    required String schedule,
    required Map<String, dynamic> parameters,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/reports/schedule'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'template_id': templateId,
          'schedule': schedule,
          'parameters': parameters,
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
          'message': data['message'] ?? 'Erro ao agendar relatório',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar relatórios agendados
  static Future<Map<String, dynamic>> getScheduledReports({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/reports/scheduled'),
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
          'message': data['message'] ?? 'Erro ao buscar relatórios agendados',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Cancelar relatório agendado
  static Future<Map<String, dynamic>> cancelScheduledReport({
    required String token,
    required String scheduleId,
  }) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/reports/scheduled/$scheduleId'),
        headers: _headersWithAuth(token),
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
          'message': data['message'] ?? 'Erro ao cancelar relatório agendado',
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

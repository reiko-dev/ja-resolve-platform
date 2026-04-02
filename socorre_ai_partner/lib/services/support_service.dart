import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/support.dart';

class SupportService {
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

  // Criar ticket de suporte
  static Future<Map<String, dynamic>> createTicket({
    required String token,
    required String title,
    required String description,
    required String category,
    String priority = 'medium',
    List<String> attachments = const [],
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/support/tickets'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'title': title,
          'description': description,
          'category': category,
          'priority': priority,
          'attachments': attachments,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': SupportTicket.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao criar ticket',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar tickets do usuário
  static Future<Map<String, dynamic>> getUserTickets({
    required String token,
    String? status,
    String? category,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (status != null) 'status': status,
        if (category != null) 'category': category,
      };

      final uri = Uri.parse('$_baseUrl/support/tickets').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => SupportTicket.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar tickets',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar ticket específico
  static Future<Map<String, dynamic>> getTicket({
    required String token,
    required String ticketId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/tickets/$ticketId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': SupportTicket.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar ticket',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar ticket
  static Future<Map<String, dynamic>> updateTicket({
    required String token,
    required String ticketId,
    required Map<String, dynamic> updateData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/support/tickets/$ticketId'),
        headers: _headersWithAuth(token),
        body: jsonEncode(updateData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': SupportTicket.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar ticket',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Adicionar mensagem ao ticket
  static Future<Map<String, dynamic>> addMessage({
    required String token,
    required String ticketId,
    required String message,
    List<String> attachments = const [],
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/support/tickets/$ticketId/messages'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'message': message,
          'attachments': attachments,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': SupportMessage.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao adicionar mensagem',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar artigos de ajuda
  static Future<Map<String, dynamic>> getHelpArticles({
    required String token,
    String? category,
    String? search,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (category != null) 'category': category,
        if (search != null) 'search': search,
      };

      final uri = Uri.parse('$_baseUrl/support/articles').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => HelpArticle.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar artigos',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar artigo específico
  static Future<Map<String, dynamic>> getHelpArticle({
    required String token,
    required String articleId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/articles/$articleId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': HelpArticle.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar artigo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar categorias de ajuda
  static Future<Map<String, dynamic>> getHelpCategories({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/categories'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => HelpCategory.fromJson(item))
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

  // Buscar FAQs
  static Future<Map<String, dynamic>> getFAQs({
    required String token,
    String? category,
    String? search,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (category != null) 'category': category,
        if (search != null) 'search': search,
      };

      final uri = Uri.parse('$_baseUrl/support/faqs').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => FAQ.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar FAQs',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar FAQ específico
  static Future<Map<String, dynamic>> getFAQ({
    required String token,
    required String faqId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/faqs/$faqId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': FAQ.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar FAQ',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Avaliar artigo
  static Future<Map<String, dynamic>> rateArticle({
    required String token,
    required String articleId,
    required double rating,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/support/articles/$articleId/rate'),
        headers: _headersWithAuth(token),
        body: jsonEncode({'rating': rating}),
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
          'message': data['message'] ?? 'Erro ao avaliar artigo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar contato
  static Future<Map<String, dynamic>> getContactInfo({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/contact'),
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
          'message': data['message'] ?? 'Erro ao buscar informações de contato',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar estatísticas de suporte
  static Future<Map<String, dynamic>> getSupportStats({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/stats'),
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

  // Buscar sugestões de busca
  static Future<Map<String, dynamic>> getSearchSuggestions({
    required String token,
    required String query,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/support/search/suggestions?q=$query'),
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
          'message': data['message'] ?? 'Erro ao buscar sugestões',
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

import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/ai_models.dart';

class AIService {
  static String get _baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Map<String, String> _headersWithAuth(String token) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Buscar modelos de IA
  static Future<Map<String, dynamic>> getAIModels({
    required String token,
    String? category,
    String? status,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (category != null) 'category': category,
        if (status != null) 'status': status,
      };

      final uri = Uri.parse('$_baseUrl/ai/models').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => AIModel.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar modelos de IA',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Criar modelo de IA
  static Future<Map<String, dynamic>> createAIModel({
    required String token,
    required String name,
    required String description,
    required String type,
    required String category,
    Map<String, dynamic>? parameters,
    List<String>? features,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/ai/models'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'name': name,
          'description': description,
          'type': type,
          'category': category,
          'parameters': parameters,
          'features': features,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': AIModel.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao criar modelo de IA',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Treinar modelo
  static Future<Map<String, dynamic>> trainModel({
    required String token,
    required String modelId,
    required List<TrainingData> trainingData,
    Map<String, dynamic>? parameters,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/ai/models/$modelId/train'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'training_data': trainingData.map((data) => data.toJson()).toList(),
          'parameters': parameters,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao treinar modelo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Fazer predição
  static Future<Map<String, dynamic>> makePrediction({
    required String token,
    required String modelId,
    required Map<String, dynamic> inputData,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/ai/models/$modelId/predict'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'input_data': inputData,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Prediction.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao fazer predição',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar predições
  static Future<Map<String, dynamic>> getPredictions({
    required String token,
    String? modelId,
    String? status,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (modelId != null) 'model_id': modelId,
        if (status != null) 'status': status,
      };

      final uri = Uri.parse('$_baseUrl/ai/predictions').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => Prediction.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar predições',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar insights de IA
  static Future<Map<String, dynamic>> getAIInsights({
    required String token,
    String? type,
    bool? isActive,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (type != null) 'type': type,
        if (isActive != null) 'is_active': isActive.toString(),
      };

      final uri = Uri.parse('$_baseUrl/ai/insights').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => AIInsight.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar insights',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Criar insight de IA
  static Future<Map<String, dynamic>> createAIInsight({
    required String token,
    required String type,
    required String title,
    required String description,
    required double confidence,
    Map<String, dynamic>? data,
    List<String>? recommendations,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/ai/insights'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'type': type,
          'title': title,
          'description': description,
          'confidence': confidence,
          'data': data,
          'recommendations': recommendations,
        }),
      );
      final responseData = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': AIInsight.fromJson(responseData['data']),
          'message': responseData['message'],
        };
      } else {
        return {
          'success': false,
          'message': responseData['message'] ?? 'Erro ao criar insight',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar modelo
  static Future<Map<String, dynamic>> updateAIModel({
    required String token,
    required String modelId,
    required Map<String, dynamic> updateData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/ai/models/$modelId'),
        headers: _headersWithAuth(token),
        body: jsonEncode(updateData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': AIModel.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar modelo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Deletar modelo
  static Future<Map<String, dynamic>> deleteAIModel({
    required String token,
    required String modelId,
  }) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/ai/models/$modelId'),
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
          'message': data['message'] ?? 'Erro ao deletar modelo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar estatísticas de IA
  static Future<Map<String, dynamic>> getAIStats({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/ai/stats'),
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

  // Buscar dados de treinamento
  static Future<Map<String, dynamic>> getTrainingData({
    required String token,
    String? modelId,
    String? type,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (modelId != null) 'model_id': modelId,
        if (type != null) 'type': type,
      };

      final uri = Uri.parse('$_baseUrl/ai/training-data').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => TrainingData.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar dados de treinamento',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Adicionar dados de treinamento
  static Future<Map<String, dynamic>> addTrainingData({
    required String token,
    required String modelId,
    required String type,
    required Map<String, dynamic> features,
    required Map<String, dynamic> labels,
    required String source,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/ai/training-data'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'model_id': modelId,
          'type': type,
          'features': features,
          'labels': labels,
          'source': source,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': TrainingData.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao adicionar dados de treinamento',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Ativar/desativar modelo
  static Future<Map<String, dynamic>> toggleModelStatus({
    required String token,
    required String modelId,
    required bool isActive,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/ai/models/$modelId/toggle'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'is_active': isActive,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': AIModel.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao alterar status do modelo',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar modelo específico
  static Future<Map<String, dynamic>> getAIModel({
    required String token,
    required String modelId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/ai/models/$modelId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': AIModel.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar modelo',
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

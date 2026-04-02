import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/delivery_order.dart';
import '../models/product.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class DeliveryOrderService {
  static String get baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Buscar pedidos do motoboy
  static Future<List<DeliveryOrder>> getMotoboyOrders({DeliveryOrderStatus? status}) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/delivery-orders-new/motoboy';
      if (status != null) {
        url += '?status=${status.toString().split('.').last}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final ordersList = data['data'] as List;
        return ordersList.map((order) => DeliveryOrder.fromJson(order)).toList();
      } else {
        throw Exception('Falha ao buscar pedidos do motoboy: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar pedidos do motoboy: $e');
    }
  }

  // Buscar pedidos disponíveis para motoboys
  static Future<List<DeliveryOrder>> getAvailableOrders({
    required double latitude,
    required double longitude,
    double radius = 10,
    DeliveryOrderType? orderType,
  }) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/delivery-orders-new/available';
      url += '?latitude=$latitude&longitude=$longitude&radius=$radius';
      if (orderType != null) {
        url += '&order_type=${orderType.toString().split('.').last}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final ordersList = data['data'] as List;
        return ordersList.map((order) => DeliveryOrder.fromJson(order)).toList();
      } else {
        throw Exception('Falha ao buscar pedidos disponíveis: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar pedidos disponíveis: $e');
    }
  }

  // Aceitar pedido (motoboy)
  static Future<DeliveryOrder> acceptOrder(String orderId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId/accept'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else {
        throw Exception('Falha ao aceitar pedido: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao aceitar pedido: $e');
    }
  }

  // Iniciar delivery (motoboy pegou o produto)
  static Future<DeliveryOrder> startDelivery(String orderId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId/start'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else {
        throw Exception('Falha ao iniciar delivery: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao iniciar delivery: $e');
    }
  }

  // Em trânsito (motoboy a caminho)
  static Future<DeliveryOrder> inTransit(String orderId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId/in-transit'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else {
        throw Exception('Falha ao atualizar status: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar status: $e');
    }
  }

  // Completar delivery (motoboy entregou)
  static Future<DeliveryOrder> completeDelivery(String orderId, {int? actualTimeMinutes}) async {
    try {
      final headers = await _authHeaders;
      
      final body = {};
      if (actualTimeMinutes != null) {
        body['actual_time_minutes'] = actualTimeMinutes;
      }

      final response = await http.post(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId/complete'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else {
        throw Exception('Falha ao completar delivery: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao completar delivery: $e');
    }
  }

  // Cancelar pedido
  static Future<DeliveryOrder> cancelOrder(String orderId, {String? reason}) async {
    try {
      final headers = await _authHeaders;
      
      final body = {};
      if (reason != null) {
        body['reason'] = reason;
      }

      final response = await http.post(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId/cancel'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else {
        throw Exception('Falha ao cancelar pedido: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao cancelar pedido: $e');
    }
  }

  // Atualizar localização (rastreamento)
  static Future<DeliveryOrder> updateLocation(String orderId, double latitude, double longitude) async {
    try {
      final headers = await _authHeaders;
      
      final body = {
        'latitude': latitude,
        'longitude': longitude,
      };

      final response = await http.post(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId/location'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else {
        throw Exception('Falha ao atualizar localização: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar localização: $e');
    }
  }

  // Buscar pedido por ID
  static Future<DeliveryOrder?> getOrderById(String orderId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/delivery-orders-new/$orderId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DeliveryOrder.fromJson(data['data']);
      } else if (response.statusCode == 404) {
        return null;
      } else {
        throw Exception('Falha ao buscar pedido: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar pedido: $e');
    }
  }

  // Obter estatísticas do motoboy
  static Future<Map<String, dynamic>> getMotoboyStats() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/delivery-orders-new/motoboy/stats'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao buscar estatísticas: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar estatísticas: $e');
    }
  }

  // Calcular taxa de delivery baseada na distância
  static double calculateDeliveryFee(double distanceKm, DeliveryOrderType orderType) {
    // Taxa base: R$ 8,00 + R$ 2,00 por km
    const baseFee = 8.0;
    const feePerKm = 2.0;
    
    double fee = baseFee + (distanceKm * feePerKm);
    
    // Taxa mínima
    if (fee < 10.0) fee = 10.0;
    
    // Taxa máxima
    if (fee > 50.0) fee = 50.0;
    
    return fee;
  }

  // Calcular tempo estimado baseado na distância
  static int calculateEstimatedTime(double distanceKm) {
    // Tempo base: 20 minutos + 4 minutos por km
    const baseTime = 20;
    const timePerKm = 4;
    
    return baseTime + (distanceKm * timePerKm).round();
  }

  // Verificar se motoboy pode aceitar pedido
  static Future<bool> canAcceptOrder(String orderId) async {
    try {
      final order = await getOrderById(orderId);
      return order != null && order.status == DeliveryOrderStatus.pending;
    } catch (e) {
      return false;
    }
  }

  // Calcular ganho do motoboy
  static double calculateMotoboyEarning(DeliveryOrder order) {
    return order.motoboyFee;
  }

  // Buscar histórico de entregas do motoboy
  static Future<List<DeliveryOrder>> getDeliveryHistory({
    int page = 1,
    int limit = 20,
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/delivery-orders-new/motoboy/history?page=$page&limit=$limit';
      if (startDate != null) {
        url += '&start_date=${startDate.toIso8601String()}';
      }
      if (endDate != null) {
        url += '&end_date=${endDate.toIso8601String()}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final ordersList = data['data']['orders'] as List;
        return ordersList.map((order) => DeliveryOrder.fromJson(order)).toList();
      } else {
        throw Exception('Falha ao buscar histórico: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar histórico: $e');
    }
  }
}

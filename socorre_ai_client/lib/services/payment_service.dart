import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class PaymentService {
  static String get _baseUrl => '${AppConfig.baseUrl}/payments';

  static Future<Map<String, String>> _headers() async {
    final prefs = await SharedPreferences.getInstance();
    final userToken = prefs.getString('auth_token');

    if (userToken == null) {
      throw Exception('Usuário não autenticado');
    }

    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $userToken',
    };
  }

  static Future<Map<String, dynamic>> createPayment({
    required double amount,
    required String method,
    required String gateway,
    String? description,
    String? referenceId,
    int? partnerId,
    int? emergencyRequestId,
    int? deliveryOrderId,
    int? purchaseOrderId,
    Map<String, dynamic>? cardData,
    Map<String, dynamic>? pixData,
    Map<String, dynamic>? bankSlipData,
  }) async {
    try {
      final headers = await _headers();

      final response = await http.post(
        Uri.parse(_baseUrl),
        headers: headers,
        body: jsonEncode({
          'amount': amount,
          'method': method,
          'gateway': gateway,
          'description': description,
          'referenceId': referenceId,
          'partnerId': partnerId,
          'emergencyRequestId': emergencyRequestId,
          'deliveryOrderId': deliveryOrderId,
          'purchaseOrderId': purchaseOrderId,
          'cardData': cardData,
          'pixData': pixData,
          'bankSlipData': bankSlipData,
        }),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao criar pagamento');
      }
    } catch (e) {
      print('Erro ao criar pagamento: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> getPayment(String paymentId) async {
    try {
      final headers = await _headers();

      final response = await http.get(
        Uri.parse('$_baseUrl/$paymentId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao buscar pagamento');
      }
    } catch (e) {
      print('Erro ao buscar pagamento: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> confirmPayment(String paymentId) async {
    try {
      final headers = await _headers();

      final response = await http.post(
        Uri.parse('$_baseUrl/$paymentId/confirm'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao confirmar pagamento');
      }
    } catch (e) {
      print('Erro ao confirmar pagamento: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> cancelPayment(String paymentId, {String? reason}) async {
    try {
      final headers = await _headers();

      final response = await http.post(
        Uri.parse('$_baseUrl/$paymentId/cancel'),
        headers: headers,
        body: jsonEncode({
          'reason': reason,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao cancelar pagamento');
      }
    } catch (e) {
      print('Erro ao cancelar pagamento: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> refundPayment(String paymentId, {double? amount, String? reason}) async {
    try {
      final headers = await _headers();

      final response = await http.post(
        Uri.parse('$_baseUrl/$paymentId/refund'),
        headers: headers,
        body: jsonEncode({
          'amount': amount,
          'reason': reason,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao reembolsar pagamento');
      }
    } catch (e) {
      print('Erro ao reembolsar pagamento: $e');
      rethrow;
    }
  }

  static Future<List<Map<String, dynamic>>> getUserPayments({
    String? status,
    String? method,
    String? gateway,
    String? startDate,
    String? endDate,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final headers = await _headers();

      final queryParams = <String, String>{
        'page': page.toString(),
        'limit': limit.toString(),
      };

      if (status != null) queryParams['status'] = status;
      if (method != null) queryParams['method'] = method;
      if (gateway != null) queryParams['gateway'] = gateway;
      if (startDate != null) queryParams['startDate'] = startDate;
      if (endDate != null) queryParams['endDate'] = endDate;

      final uri = Uri.parse(_baseUrl).replace(
        queryParameters: queryParams,
      );

      final response = await http.get(
        uri,
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return List<Map<String, dynamic>>.from(data['data']);
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao buscar pagamentos');
      }
    } catch (e) {
      print('Erro ao buscar pagamentos: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> getPaymentStats() async {
    try {
      final headers = await _headers();

      final response = await http.get(
        Uri.parse('$_baseUrl/stats/summary'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Erro ao buscar estatísticas');
      }
    } catch (e) {
      print('Erro ao buscar estatísticas: $e');
      rethrow;
    }
  }

  static String getMethodLabel(String method) {
    switch (method) {
      case 'credit_card':
        return 'Cartão de Crédito';
      case 'debit_card':
        return 'Cartão de Débito';
      case 'pix':
        return 'PIX';
      case 'bank_slip':
        return 'Boleto Bancário';
      case 'cash':
        return 'Dinheiro';
      case 'bank_transfer':
        return 'Transferência Bancária';
      default:
        return method;
    }
  }

  static String getStatusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'processing':
        return 'Processando';
      case 'completed':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
      case 'cancelled':
        return 'Cancelado';
      case 'refunded':
        return 'Reembolsado';
      default:
        return status;
    }
  }

  static String getGatewayLabel(String gateway) {
    switch (gateway) {
      case 'stripe':
        return 'Stripe';
      case 'mercadopago':
        return 'Mercado Pago';
      case 'pagseguro':
        return 'PagSeguro';
      default:
        return gateway;
    }
  }

  static String formatCurrency(double amount) {
    return 'R\$ ${amount.toStringAsFixed(2).replaceAll('.', ',')}';
  }
}

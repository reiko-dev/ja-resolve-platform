import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/subscription.dart';
import '../models/system_settings.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class SubscriptionService {
  static String get baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Criar nova assinatura
  static Future<Subscription> createSubscription({
    required String partnerId,
    required SubscriptionType type,
    required String paymentMethod,
    bool autoRenew = true,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final body = {
        'partner_id': partnerId,
        'type': type.toString().split('.').last,
        'payment_method': paymentMethod,
        'auto_renew': autoRenew,
      };

      final response = await http.post(
        Uri.parse('$baseUrl/api/subscriptions'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else {
        throw Exception('Falha ao criar assinatura: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao criar assinatura: $e');
    }
  }

  // Listar assinaturas
  static Future<List<Subscription>> getSubscriptions({SubscriptionStatus? status}) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/subscriptions';
      if (status != null) {
        url += '?status=${status.toString().split('.').last}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final subscriptionsList = data['data'] as List;
        return subscriptionsList.map((sub) => Subscription.fromJson(sub)).toList();
      } else {
        throw Exception('Falha ao buscar assinaturas: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar assinaturas: $e');
    }
  }

  // Buscar assinatura por ID
  static Future<Subscription?> getSubscriptionById(String subscriptionId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else if (response.statusCode == 404) {
        return null;
      } else {
        throw Exception('Falha ao buscar assinatura: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar assinatura: $e');
    }
  }

  // Atualizar assinatura
  static Future<Subscription> updateSubscription(String subscriptionId, {
    bool? autoRenew,
    String? paymentMethod,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final body = {};
      if (autoRenew != null) body['auto_renew'] = autoRenew;
      if (paymentMethod != null) body['payment_method'] = paymentMethod;

      final response = await http.put(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else {
        throw Exception('Falha ao atualizar assinatura: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao atualizar assinatura: $e');
    }
  }

  // Cancelar assinatura
  static Future<Subscription> cancelSubscription(String subscriptionId, {String? reason}) async {
    try {
      final headers = await _authHeaders;
      
      final body = {};
      if (reason != null) body['reason'] = reason;

      final response = await http.delete(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else {
        throw Exception('Falha ao cancelar assinatura: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao cancelar assinatura: $e');
    }
  }

  // Processar pagamento de assinatura
  static Future<Subscription> processSubscriptionPayment(String subscriptionId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId/payment'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else {
        throw Exception('Falha ao processar pagamento: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao processar pagamento: $e');
    }
  }

  // Registrar falha de pagamento
  static Future<Subscription> recordPaymentFailure(String subscriptionId, String reason) async {
    try {
      final headers = await _authHeaders;
      
      final body = {'reason': reason};

      final response = await http.post(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId/payment-failure'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else {
        throw Exception('Falha ao registrar falha de pagamento: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao registrar falha de pagamento: $e');
    }
  }

  // Renovar assinatura manualmente
  static Future<Subscription> renewSubscription(String subscriptionId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId/renew'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return Subscription.fromJson(data['data']);
      } else {
        throw Exception('Falha ao renovar assinatura: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao renovar assinatura: $e');
    }
  }

  // Buscar assinaturas vencendo em breve
  static Future<List<Subscription>> getExpiringSoonSubscriptions() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/expiring-soon'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final subscriptionsList = data['data'] as List;
        return subscriptionsList.map((sub) => Subscription.fromJson(sub)).toList();
      } else {
        throw Exception('Falha ao buscar assinaturas vencendo: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar assinaturas vencendo: $e');
    }
  }

  // Buscar assinaturas vencidas
  static Future<List<Subscription>> getExpiredSubscriptions() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/expired'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final subscriptionsList = data['data'] as List;
        return subscriptionsList.map((sub) => Subscription.fromJson(sub)).toList();
      } else {
        throw Exception('Falha ao buscar assinaturas vencidas: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar assinaturas vencidas: $e');
    }
  }

  // Buscar assinaturas ativas
  static Future<List<Subscription>> getActiveSubscriptions() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/active'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final subscriptionsList = data['data'] as List;
        return subscriptionsList.map((sub) => Subscription.fromJson(sub)).toList();
      } else {
        throw Exception('Falha ao buscar assinaturas ativas: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar assinaturas ativas: $e');
    }
  }

  // Buscar assinaturas para cobrança automática
  static Future<List<Subscription>> getSubscriptionsForAutoBilling() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/auto-billing'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final subscriptionsList = data['data'] as List;
        return subscriptionsList.map((sub) => Subscription.fromJson(sub)).toList();
      } else {
        throw Exception('Falha ao buscar assinaturas para cobrança: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar assinaturas para cobrança: $e');
    }
  }

  // Verificar status de assinatura do parceiro
  static Future<Map<String, dynamic>> checkPartnerSubscriptionStatus(String partnerId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/partner/$partnerId/status'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao verificar status: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao verificar status: $e');
    }
  }

  // Obter estatísticas
  static Future<Map<String, dynamic>> getSubscriptionStats() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/stats'),
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

  // Buscar histórico de assinatura
  static Future<List<Map<String, dynamic>>> getSubscriptionHistory(String subscriptionId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/subscriptions/$subscriptionId/history'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final historyList = data['data'] as List;
        return historyList.cast<Map<String, dynamic>>();
      } else {
        throw Exception('Falha ao buscar histórico: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar histórico: $e');
    }
  }

  // Métodos utilitários
  static double getMonthlyFee(SubscriptionType type) {
    switch (type) {
      case SubscriptionType.mechanic:
        return 199.90; // R$ 199,90/mês
      case SubscriptionType.gasStation:
        return 299.90; // R$ 299,90/mês
      case SubscriptionType.autoParts:
        return 249.90; // R$ 249,90/mês
    }
  }

  static List<String> getPaymentMethods() {
    return ['credit_card', 'debit_card', 'pix', 'bank_slip'];
  }

  static String? validateSubscriptionData({
    required String partnerId,
    required SubscriptionType type,
    required String paymentMethod,
  }) {
    // Validar partner ID
    if (partnerId.trim().isEmpty) {
      return 'ID do parceiro é obrigatório';
    }

    // Validar método de pagamento
    if (!getPaymentMethods().contains(paymentMethod)) {
      return 'Método de pagamento inválido';
    }

    return null; // Válido
  }

  // Calcular data de vencimento
  static DateTime calculateDueDate(DateTime startDate) {
    return DateTime(startDate.year, startDate.month + 1, startDate.day);
  }

  // Verificar se assinatura está expirando em breve
  static bool isExpiringSoon(DateTime dueDate, {int daysThreshold = 7}) {
    final now = DateTime.now();
    final daysUntilExpiry = dueDate.difference(now).inDays;
    return daysUntilExpiry >= 0 && daysUntilExpiry <= daysThreshold;
  }

  // Formatar período da assinatura
  static String formatSubscriptionPeriod(DateTime startDate, DateTime endDate) {
    final startFormat = '${startDate.day.toString().padLeft(2, '0')}/${startDate.month.toString().padLeft(2, '0')}/${startDate.year}';
    final endFormat = '${endDate.day.toString().padLeft(2, '0')}/${endDate.month.toString().padLeft(2, '0')}/${endDate.year}';
    return '$startFormat - $endFormat';
  }
}

class SystemSettingsService {
  static String get baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Buscar configurações públicas (para apps)
  static Future<List<SystemSettings>> getPublicSettings() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/system-settings/public'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final settingsList = data['data'] as List;
        return settingsList.map((setting) => SystemSettings.fromJson(setting)).toList();
      } else {
        throw Exception('Falha ao buscar configurações públicas: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar configurações públicas: $e');
    }
  }

  // Buscar configurações do app
  static Future<AppSettings> getAppSettings() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/system-settings/app-settings'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final settingsList = (data['data'] as List)
            .map((setting) => SystemSettings.fromJson(setting))
            .toList();
        return AppSettings.fromSystemSettings(settingsList);
      } else {
        throw Exception('Falha ao buscar configurações do app: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar configurações do app: $e');
    }
  }

  // Buscar configurações específicas para guinchos
  static Future<Map<String, dynamic>> getGuinchoSettings() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/system-settings/guincho'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao buscar configurações de guincho: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar configurações de guincho: $e');
    }
  }

  // Buscar configurações específicas para assinaturas
  static Future<Map<String, dynamic>> getSubscriptionSettings() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/system-settings/subscription'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao buscar configurações de assinatura: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar configurações de assinatura: $e');
    }
  }

  // Buscar configurações específicas para delivery
  static Future<Map<String, dynamic>> getDeliverySettings() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/system-settings/delivery'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data'];
      } else {
        throw Exception('Falha ao buscar configurações de delivery: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar configurações de delivery: $e');
    }
  }
}

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class DisputeService {
  static String get _baseUrl => '${AppConfig.baseUrl}/disputes';

  static Future<Map<String, String>> _authHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> list({int page = 1, int limit = 20}) async {
    try {
      final headers = await _authHeaders();
      final url = Uri.parse('$_baseUrl?page=$page&limit=$limit');
      final resp = await http.get(url, headers: headers);
      
      if (resp.statusCode == 200) {
        return jsonDecode(resp.body) as Map<String, dynamic>;
      } else {
        final error = jsonDecode(resp.body);
        throw Exception(error['message'] ?? 'Erro ao buscar disputas');
      }
    } catch (e) {
      print('Erro ao buscar disputas: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> create({
    required int paymentId,
    required String type,
    required String reason,
    String? description,
    double? disputedAmount,
    Map<String, dynamic>? evidence,
  }) async {
    try {
      final headers = await _authHeaders();
      final resp = await http.post(
        Uri.parse(_baseUrl),
        headers: headers,
        body: jsonEncode({
          'paymentId': paymentId,
          'type': type,
          'reason': reason,
          if (description != null) 'description': description,
          if (disputedAmount != null) 'disputedAmount': disputedAmount,
          if (evidence != null) 'evidence': evidence,
        }),
      );
      
      if (resp.statusCode == 200 || resp.statusCode == 201) {
        return jsonDecode(resp.body) as Map<String, dynamic>;
      } else {
        final error = jsonDecode(resp.body);
        throw Exception(error['message'] ?? 'Erro ao criar disputa');
      }
    } catch (e) {
      print('Erro ao criar disputa: $e');
      rethrow;
    }
  }
}

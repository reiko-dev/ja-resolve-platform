import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class WalletService {
  static String get _baseUrl => '${AppConfig.baseUrl}/wallets';

  static Future<Map<String, String>> _authHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> getWallet() async {
    try {
      final headers = await _authHeaders();
      final resp = await http.get(Uri.parse(_baseUrl), headers: headers);
      
      if (resp.statusCode == 200) {
        return jsonDecode(resp.body) as Map<String, dynamic>;
      } else {
        final error = jsonDecode(resp.body);
        throw Exception(error['message'] ?? 'Erro ao buscar carteira');
      }
    } catch (e) {
      print('Erro ao buscar carteira: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> getTransactions({int page = 1, int limit = 20}) async {
    try {
      final headers = await _authHeaders();
      final url = Uri.parse('$_baseUrl/transactions?page=$page&limit=$limit');
      final resp = await http.get(url, headers: headers);
      
      if (resp.statusCode == 200) {
        return jsonDecode(resp.body) as Map<String, dynamic>;
      } else {
        final error = jsonDecode(resp.body);
        throw Exception(error['message'] ?? 'Erro ao buscar transações');
      }
    } catch (e) {
      print('Erro ao buscar transações: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> requestWithdrawal(double amount, {String? notes}) async {
    try {
      final headers = await _authHeaders();
      final resp = await http.post(
        Uri.parse('$_baseUrl/withdraw'),
        headers: headers,
        body: jsonEncode({
          'amount': amount,
          if (notes != null) 'notes': notes,
        }),
      );
      
      if (resp.statusCode == 200 || resp.statusCode == 201) {
        return jsonDecode(resp.body) as Map<String, dynamic>;
      } else {
        final error = jsonDecode(resp.body);
        throw Exception(error['message'] ?? 'Erro ao solicitar saque');
      }
    } catch (e) {
      print('Erro ao solicitar saque: $e');
      rethrow;
    }
  }

  static Future<Map<String, dynamic>> updateBankDetails(Map<String, dynamic> data) async {
    try {
      final headers = await _authHeaders();
      final resp = await http.put(
        Uri.parse('$_baseUrl/bank-details'),
        headers: headers,
        body: jsonEncode(data),
      );
      
      if (resp.statusCode == 200) {
        return jsonDecode(resp.body) as Map<String, dynamic>;
      } else {
        final error = jsonDecode(resp.body);
        throw Exception(error['message'] ?? 'Erro ao atualizar dados bancários');
      }
    } catch (e) {
      print('Erro ao atualizar dados bancários: $e');
      rethrow;
    }
  }
}

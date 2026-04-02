import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class WalletService {
  static String get _baseUrl => '${AppConfig.baseUrl}/api/wallets';

  static Future<Map<String, String>> _authHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> getWallet() async {
    final headers = await _authHeaders();
    final resp = await http.get(Uri.parse(_baseUrl), headers: headers);
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> getTransactions({int page = 1, int limit = 20}) async {
    final headers = await _authHeaders();
    final url = Uri.parse('$_baseUrl/transactions?page=$page&limit=$limit');
    final resp = await http.get(url, headers: headers);
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> requestWithdrawal(double amount, {String? notes}) async {
    final headers = await _authHeaders();
    final resp = await http.post(
      Uri.parse('$_baseUrl/withdraw'),
      headers: headers,
      body: jsonEncode({
        'amount': amount,
        if (notes != null) 'notes': notes,
      }),
    );
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> updateBankDetails(Map<String, dynamic> data) async {
    final headers = await _authHeaders();
    final resp = await http.put(
      Uri.parse('$_baseUrl/bank-details'),
      headers: headers,
      body: jsonEncode(data),
    );
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }
}

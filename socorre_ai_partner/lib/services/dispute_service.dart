import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class DisputeService {
  static String get _baseUrl => '${AppConfig.baseUrl}/api/disputes';

  static Future<Map<String, String>> _authHeaders() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  static Future<Map<String, dynamic>> list({int page = 1, int limit = 20}) async {
    final headers = await _authHeaders();
    final url = Uri.parse('$_baseUrl?page=$page&limit=$limit');
    final resp = await http.get(url, headers: headers);
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> respond(int disputeId, String response) async {
    final headers = await _authHeaders();
    final resp = await http.put(
      Uri.parse('$_baseUrl/$disputeId/respond'),
      headers: headers,
      body: jsonEncode({'response': response}),
    );
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }
}

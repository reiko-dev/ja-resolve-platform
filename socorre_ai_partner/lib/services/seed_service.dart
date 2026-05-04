import 'dart:convert';
import 'package:http/http.dart' as http;
import '../core/utils/partner_type_utils.dart';
import '../config/app_config.dart';

class SeedService {
  static String get _baseUrl => AppConfig.baseUrl;

  // Dados de seed para cada tipo de profissional
  static const Map<String, Map<String, dynamic>> seedData = {
    'mechanic': {
      'name': 'João Mecânico',
      'email': 'joao@mecanico.com',
      'phone': '11999998888',
      'password': 'senha123456',
      'partnerType': 'mechanic',
      'companyName': 'Oficina do João',
      'cnpj': '12345678000190',
      'specialties': ['motor', 'transmissao', 'freios'],
    },
    'gas_station': {
      'name': 'Maria Posto',
      'email': 'maria@posto.com',
      'phone': '11999997777',
      'password': 'senha123456',
      'partnerType': 'gas_station',
      'companyName': 'Posto Maria',
      'cnpj': '98765432000111',
      'fuels': ['gasolina', 'diesel', 'etanol'],
    },
    'auto_parts': {
      'name': 'Carlos Peças',
      'email': 'carlos@pecas.com',
      'phone': '11999996666',
      'password': 'senha123456',
      'partnerType': 'auto_parts',
      'companyName': 'Auto Peças Carlos',
      'cnpj': '55555555000122',
      'categories': ['motor', 'suspensao', 'eletrica'],
    },
    'tow': {
      'name': 'Paulo Guincho',
      'email': 'paulo@guincho.com',
      'phone': '11999995555',
      'password': 'senha123456',
      'partnerType': 'tow',
      'companyName': 'Guincho Rápido',
      'cnpj': '33333333000133',
      'capacity': 5000,
    },
    'motoboy': {
      'name': 'Diego Motoboy',
      'email': 'diego@motoboy.com',
      'phone': '11999994444',
      'password': 'senha123456',
      'partnerType': 'motoboy',
      'cpf': '12345678901',
      'motorcycle': 'Honda CB 500',
    },
  };

  /// Cria todas as contas de teste
  static Future<Map<String, dynamic>> createAllTestAccounts() async {
    final results = <String, Map<String, dynamic>>{};

    for (final entry in seedData.entries) {
      final type = entry.key;
      final data = entry.value;

      try {
        final result = await createTestAccount(type, data);
        results[type] = result;
      } catch (e) {
        results[type] = {
          'success': false,
          'error': e.toString(),
        };
      }
    }

    return results;
  }

  /// Cria uma conta de teste para um tipo específico
  static Future<Map<String, dynamic>> createTestAccount(
    String type,
    Map<String, dynamic> data,
  ) async {
    try {
      final normalizedType = PartnerTypeUtils.normalize(type);

      // Primeiro: registrar o usuário
      final registerResponse = await http.post(
        Uri.parse('$_baseUrl/api/auth/register'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'name': data['name'],
          'email': data['email'],
          'phone': data['phone'],
          'password': data['password'],
          'partnerType': PartnerTypeUtils.normalize('${data['partnerType']}'),
        }),
      );

      if (registerResponse.statusCode != 201 && registerResponse.statusCode != 200) {
        return {
          'success': false,
          'message': 'Erro ao registrar: ${registerResponse.body}',
        };
      }

      final registerData = jsonDecode(registerResponse.body);
      final userId = registerData['data']['id'] ?? registerData['data']['userId'];
      final token = registerData['token'] ?? registerData['data']['token'];

      // Segundo: completar o cadastro de parceiro
      final completeResponse = await http.post(
        Uri.parse('$_baseUrl/api/partners/complete-registration'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'partnerType': normalizedType,
          'companyName': data['companyName'] ?? data['name'],
          'cnpj': data['cnpj'],
          'cpf': data['cpf'],
          'specialties': data['specialties'],
          'fuels': data['fuels'],
          'categories': data['categories'],
          'capacity': data['capacity'],
          'motorcycle': data['motorcycle'],
        }),
      );

      if (completeResponse.statusCode != 200 && completeResponse.statusCode != 201) {
        return {
          'success': false,
          'message': 'Erro ao completar cadastro: ${completeResponse.body}',
        };
      }

      return {
        'success': true,
        'type': type,
        'name': data['name'],
        'email': data['email'],
        'password': data['password'],
        'userId': userId,
        'message': 'Conta criada com sucesso!',
      };
    } catch (e) {
      return {
        'success': false,
        'type': type,
        'error': e.toString(),
      };
    }
  }

  /// Faz login com uma conta de teste
  static Future<Map<String, dynamic>> loginTestAccount(String type) async {
    try {
      final data = seedData[type];
      if (data == null) {
        return {
          'success': false,
          'error': 'Tipo de profissional não encontrado: $type',
        };
      }

      final response = await http.post(
        Uri.parse('$_baseUrl/api/auth/login'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'email': data['email'],
          'password': data['password'],
        }),
      );

      if (response.statusCode != 200) {
        return {
          'success': false,
          'message': 'Erro ao fazer login: ${response.body}',
        };
      }

      final loginData = jsonDecode(response.body);
      final token = loginData['token'] ?? loginData['data']['token'];

      return {
        'success': true,
        'type': type,
        'name': data['name'],
        'email': data['email'],
        'token': token,
        'message': 'Login realizado com sucesso!',
      };
    } catch (e) {
      return {
        'success': false,
        'error': e.toString(),
      };
    }
  }

  /// Obtém as credenciais de teste para um tipo
  static Map<String, String> getTestCredentials(String type) {
    final data = seedData[type];
    if (data == null) {
      return {};
    }

    return {
      'email': data['email'] as String,
      'password': data['password'] as String,
      'name': data['name'] as String,
      'type': type,
    };
  }

  /// Lista todas as credenciais de teste
  static List<Map<String, String>> getAllTestCredentials() {
    return seedData.entries.map((entry) {
      return {
        'type': entry.key,
        'name': entry.value['name'] as String,
        'email': entry.value['email'] as String,
        'password': entry.value['password'] as String,
      };
    }).toList();
  }
}

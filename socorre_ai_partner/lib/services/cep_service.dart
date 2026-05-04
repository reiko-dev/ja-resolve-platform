import 'package:dio/dio.dart';

class CepService {
  static final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );
  
  static Future<Map<String, dynamic>> buscarCep(String cep) async {
    try {
      final cepLimpo = cep.replaceAll(RegExp(r'[^0-9]'), '');
      
      if (cepLimpo.length != 8) {
        throw Exception('CEP inválido');
      }

      final response = await _dio.get('https://viacep.com.br/ws/$cepLimpo/json/');
      
      if (response.statusCode == 200) {
        final data = response.data;
        
        if (data['erro'] == true) {
          throw Exception('CEP não encontrado');
        }
        
        return {
          'logradouro': data['logradouro'] ?? '',
          'bairro': data['bairro'] ?? '',
          'cidade': data['localidade'] ?? '',
          'uf': data['uf'] ?? '',
          'cep': data['cep'] ?? '',
          'complemento': data['complemento'] ?? '',
        };
      } else {
        throw Exception('Erro ao buscar CEP');
      }
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        throw Exception('Tempo esgotado ao consultar o ViaCEP');
      }
      throw Exception('Falha na comunicação com o ViaCEP');
    } catch (e) {
      if (e is Exception) rethrow;
      throw Exception('Falha inesperada ao consultar o CEP');
    }
  }
}

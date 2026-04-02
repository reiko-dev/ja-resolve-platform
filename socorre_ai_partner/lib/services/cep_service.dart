import 'dart:convert';
import 'package:dio/dio.dart';

class CepService {
  static final Dio _dio = Dio();
  
  static Future<Map<String, dynamic>> buscarCep(String cep) async {
    try {
      // Remove caracteres não numéricos
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
    } catch (e) {
      throw Exception('Falha na comunicação com o serviço de CEP');
    }
  }
}

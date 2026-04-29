import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/tow_proposal.dart';
import '../config/app_config.dart';
import 'auth_service.dart';

class TowProposalService {
  static String get baseUrl => AppConfig.baseUrl;

  // Headers com autenticação
  static Future<Map<String, String>> get _authHeaders async {
    final token = await AuthService.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Criar nova proposta (para parceiros)
  static Future<TowProposal> createProposal({
    required String emergencyRequestId,
    required double proposedPrice,
    required int estimatedTimeMinutes,
    String? notes,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final body = {
        'emergency_request_id': emergencyRequestId,
        'proposed_price': proposedPrice,
        'estimated_time_minutes': estimatedTimeMinutes,
        'notes': notes,
      };

      final response = await http.post(
        Uri.parse('$baseUrl/api/tow-proposals'),
        headers: headers,
        body: jsonEncode(body),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return TowProposal.fromJson(data['data']);
      } else {
        throw Exception('Falha ao criar proposta: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao criar proposta: $e');
    }
  }

  // Buscar propostas do parceiro
  static Future<List<TowProposal>> getPartnerProposals({TowProposalStatus? status}) async {
    try {
      final headers = await _authHeaders;
      
      String url = '$baseUrl/api/tow-proposals/partner';
      if (status != null) {
        url += '?status=${status.toString().split('.').last}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final proposalsList = data['data'] as List;
        return proposalsList.map((proposal) => TowProposal.fromJson(proposal)).toList();
      } else {
        throw Exception('Falha ao buscar propostas do parceiro: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar propostas do parceiro: $e');
    }
  }

  // Retirar proposta (para parceiro)
  static Future<TowProposal> withdrawProposal(String proposalId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.post(
        Uri.parse('$baseUrl/api/tow-proposals/$proposalId/withdraw'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return TowProposal.fromJson(data['data']);
      } else {
        throw Exception('Falha ao retirar proposta: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao retirar proposta: $e');
    }
  }

  // Buscar proposta por ID
  static Future<TowProposal?> getProposalById(String proposalId) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/tow-proposals/$proposalId'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return TowProposal.fromJson(data['data']);
      } else if (response.statusCode == 404) {
        return null;
      } else {
        throw Exception('Falha ao buscar proposta: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar proposta: $e');
    }
  }

  // Buscar emergências disponíveis para guinchos
  static Future<List<Map<String, dynamic>>> getAvailableEmergencies({
    required double latitude,
    required double longitude,
    double radius = 15,
  }) async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/emergency-requests/available-for-tow?latitude=$latitude&longitude=$longitude&radius=$radius'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final emergenciesList = data['data'] as List;
        return emergenciesList.cast<Map<String, dynamic>>();
      } else {
        throw Exception('Falha ao buscar emergências disponíveis: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar emergências disponíveis: $e');
    }
  }

  // Obter estatísticas das propostas do parceiro
  static Future<Map<String, dynamic>> getPartnerStats() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/tow-proposals/partner/stats'),
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

  // Verificar se parceiro pode fazer proposta para uma emergência
  static Future<bool> canMakeProposal(String emergencyRequestId) async {
    try {
      final proposal = await getProposalById(emergencyRequestId);
      return proposal == null;
    } catch (e) {
      return false;
    }
  }

  // Calcular preço sugerido baseado na distância
  static double calculateSuggestedPrice(double distanceKm) {
    // Preço base: R\$ 50,00 + R\$ 3,00 por km
    const basePrice = 50.0;
    const pricePerKm = 3.0;
    
    return basePrice + (distanceKm * pricePerKm);
  }

  // Calcular tempo estimado baseado na distância
  static int calculateEstimatedTime(double distanceKm) {
    // Tempo base: 15 minutos + 3 minutos por km
    const baseTime = 15;
    const timePerKm = 3;
    
    return baseTime + (distanceKm * timePerKm).round();
  }

  // Validar dados da proposta
  static String? validateProposal({
    required double proposedPrice,
    required int estimatedTimeMinutes,
  }) {
    // Validar preço
    if (proposedPrice < 10.0) {
      return 'O preço mínimo é R\$ 10,00';
    }
    
    if (proposedPrice > 1000.0) {
      return 'O preço máximo é R\$ 1.000,00';
    }

    // Validar tempo
    if (estimatedTimeMinutes < 5) {
      return 'O tempo mínimo é 5 minutos';
    }
    
    if (estimatedTimeMinutes > 180) {
      return 'O tempo máximo é 180 minutos';
    }

    return null; // Válido
  }

  // Buscar propostas expirando em breve
  static Future<List<TowProposal>> getExpiringSoonProposals() async {
    try {
      final headers = await _authHeaders;
      
      final response = await http.get(
        Uri.parse('$baseUrl/api/tow-proposals/expiring-soon'),
        headers: headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final proposalsList = data['data'] as List;
        return proposalsList.map((proposal) => TowProposal.fromJson(proposal)).toList();
      } else {
        throw Exception('Falha ao buscar propostas expirando: ${response.body}');
      }
    } catch (e) {
      throw Exception('Erro ao buscar propostas expirando: $e');
    }
  }
}

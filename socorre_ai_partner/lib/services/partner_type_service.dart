import 'package:shared_preferences/shared_preferences.dart';

class PartnerTypeService {
  static const String _partnerTypeKey = 'partner_type';
  
  // Salvar tipo de parceiro selecionado
  static Future<void> savePartnerType(String partnerType) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_partnerTypeKey, partnerType);
  }
  
  // Obter tipo de parceiro salvo
  static Future<String?> getPartnerType() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_partnerTypeKey);
  }
  
  // Limpar tipo de parceiro
  static Future<void> clearPartnerType() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_partnerTypeKey);
  }
  
  // Verificar se já tem tipo selecionado
  static Future<bool> hasPartnerType() async {
    final partnerType = await getPartnerType();
    return partnerType != null && partnerType.isNotEmpty;
  }
  
  // Obter informações do tipo de parceiro
  static Map<String, dynamic> getPartnerTypeInfo(String partnerType) {
    switch (partnerType) {
      case 'mechanic':
        return {
          'name': 'Mecânico',
          'icon': 'build',
          'color': 0xFF2B6CB0,
          'description': 'Prestador de serviços automotivos',
          'features': [
            'Atender emergências',
            'Reparos especializados',
            'Serviços preventivos',
            'Diagnóstico técnico'
          ]
        };
      case 'store':
        return {
          'name': 'Lojista',
          'icon': 'store',
          'color': 0xFF38A169,
          'description': 'Venda de peças e acessórios',
          'features': [
            'Catálogo de produtos',
            'Gestão de estoque',
            'Vendas online',
            'Entrega de produtos'
          ]
        };
      case 'motoboy':
        return {
          'name': 'Motoboy',
          'icon': 'motorcycle',
          'color': 0xFFED8936,
          'description': 'Serviços de entrega',
          'features': [
            'Entrega de combustível',
            'Entrega de peças',
            'Serviços expressos',
            'Cobertura ampla'
          ]
        };
      default:
        return {
          'name': 'Desconhecido',
          'icon': 'help',
          'color': 0xFF718096,
          'description': 'Tipo não identificado',
          'features': []
        };
    }
  }
  
  // Obter todos os tipos disponíveis
  static List<Map<String, dynamic>> getAllPartnerTypes() {
    return [
      getPartnerTypeInfo('mechanic'),
      getPartnerTypeInfo('store'),
      getPartnerTypeInfo('motoboy'),
    ];
  }
}

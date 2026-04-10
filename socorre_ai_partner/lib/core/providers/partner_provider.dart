import 'package:flutter/foundation.dart';
import '../../models/subscription.dart';
import '../../services/partner_service.dart';

class PartnerProvider extends ChangeNotifier {
  final PartnerService _partnerService;
  
  PartnerProvider(this._partnerService);
  
  // Estado
  SubscriptionType? _selectedPartnerType;
  Map<String, dynamic>? _partnerData;
  bool _isLoading = false;
  String? _error;
  
  // Getters
  SubscriptionType? get selectedPartnerType => _selectedPartnerType;
  Map<String, dynamic>? get partnerData => _partnerData;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get hasPartnerType => _selectedPartnerType != null;
  
  // Selecionar tipo de parceiro
  void selectPartnerType(SubscriptionType type) {
    _selectedPartnerType = type;
    _partnerData = _getDefaultDataForType(type);
    notifyListeners();
  }
  
  // Atualizar dados do parceiro
  void updatePartnerData(Map<String, dynamic> data) {
    if (_partnerData != null) {
      _partnerData!.addAll(data);
      notifyListeners();
    }
  }
  
  // Atualizar campo específico
  void updatePartnerField(String key, dynamic value) {
    if (_partnerData != null) {
      _partnerData![key] = value;
      notifyListeners();
    }
  }
  
  // Completar cadastro
  Future<bool> completeRegistration() async {
    if (_selectedPartnerType == null || _partnerData == null) {
      _setError('Tipo de parceiro ou dados não informados');
      return false;
    }
    
    _setLoading(true);
    _clearError();
    
    try {
      final result = await _partnerService.completeRegistration(
        type: _selectedPartnerType!,
        data: _partnerData!,
      );
      
      if (result.success) {
        notifyListeners();
        return true;
      } else {
        _setError(result.error ?? 'Erro ao completar cadastro');
        return false;
      }
    } catch (e) {
      _setError('Erro inesperado: $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }
  
  // Verificar status da assinatura
  Future<Subscription?> getSubscriptionStatus() async {
    _setLoading(true);
    _clearError();
    
    try {
      final result = await _partnerService.getSubscriptionStatus();
      
      if (result.success) {
        return result.data;
      } else {
        _setError(result.error ?? 'Erro ao buscar status da assinatura');
        return null;
      }
    } catch (e) {
      _setError('Erro inesperado: $e');
      return null;
    } finally {
      _setLoading(false);
    }
  }
  
  // Obter dados padrão por tipo
  Map<String, dynamic> _getDefaultDataForType(SubscriptionType type) {
    switch (type) {
      case SubscriptionType.mechanic:
        return {
          'specialties': [],
          'tools': [],
          'serviceArea': '',
          'workingHours': {
            'monday': '08:00-18:00',
            'tuesday': '08:00-18:00',
            'wednesday': '08:00-18:00',
            'thursday': '08:00-18:00',
            'friday': '08:00-18:00',
            'saturday': '08:00-12:00',
            'sunday': 'Fechado',
          },
          'emergencyService': false,
        };
        
      case SubscriptionType.gasStation:
        return {
          'fuelTypes': [],
          'services': [],
          'hasConvenienceStore': false,
          'hasCarWash': false,
          'hasTireService': false,
          'operatingHours': '24h',
        };
        
      case SubscriptionType.autoParts:
        return {
          'categories': [],
          'brands': [],
          'hasPhysicalStore': false,
          'hasDelivery': false,
          'deliveryRadius': 0,
          'inventorySystem': false,
        };
        
      case SubscriptionType.towTruck:
        return {
          'truckType': '',
          'capacity': 0,
          'serviceArea': '',
          'hasInsurance': false,
          'equipment': [],
          'operatingHours': {
            'monday': '00:00-23:59',
            'tuesday': '00:00-23:59',
            'wednesday': '00:00-23:59',
            'thursday': '00:00-23:59',
            'friday': '00:00-23:59',
            'saturday': '00:00-23:59',
            'sunday': '00:00-23:59',
          },
        };
        
      case SubscriptionType.delivery:
        return {
          'vehicleType': '',
          'capacity': 0,
          'serviceArea': '',
          'hasInsurance': false,
          'equipment': [],
          'workingHours': {
            'monday': '06:00-22:00',
            'tuesday': '06:00-22:00',
            'wednesday': '06:00-22:00',
            'thursday': '06:00-22:00',
            'friday': '06:00-22:00',
            'saturday': '08:00-20:00',
            'sunday': '08:00-18:00',
          },
        };
    }
  }
  
  // Validar dados específicos do tipo
  String? validateDataForType() {
    if (_selectedPartnerType == null || _partnerData == null) {
      return 'Tipo de parceiro não selecionado';
    }
    
    switch (_selectedPartnerType!) {
      case SubscriptionType.mechanic:
        final specialties = _partnerData!['specialties'] as List?;
        if (specialties == null || specialties.isEmpty) {
          return 'Selecione pelo menos uma especialidade';
        }
        if (_partnerData!['serviceArea']?.toString().trim().isEmpty ?? true) {
          return 'Informe sua área de atendimento';
        }
        break;
        
      case SubscriptionType.gasStation:
        final fuelTypes = _partnerData!['fuelTypes'] as List?;
        if (fuelTypes == null || fuelTypes.isEmpty) {
          return 'Selecione pelo menos um tipo de combustível';
        }
        break;
        
      case SubscriptionType.autoParts:
        final categories = _partnerData!['categories'] as List?;
        if (categories == null || categories.isEmpty) {
          return 'Selecione pelo menos uma categoria de peças';
        }
        break;
        
      case SubscriptionType.towTruck:
        if (_partnerData!['truckType']?.toString().trim().isEmpty ?? true) {
          return 'Informe o tipo de guincho';
        }
        if (_partnerData!['serviceArea']?.toString().trim().isEmpty ?? true) {
          return 'Informe sua área de atendimento';
        }
        break;
        
      case SubscriptionType.delivery:
        if (_partnerData!['vehicleType']?.toString().trim().isEmpty ?? true) {
          return 'Informe o tipo de veículo';
        }
        if (_partnerData!['serviceArea']?.toString().trim().isEmpty ?? true) {
          return 'Informe sua área de entrega';
        }
        break;
    }
    
    return null;
  }
  
  // Limpar estado
  void clearState() {
    _selectedPartnerType = null;
    _partnerData = null;
    _error = null;
    notifyListeners();
  }
  
  // Métodos privados
  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }
  
  void _setError(String error) {
    _error = error;
    notifyListeners();
  }
  
  void _clearError() {
    _error = null;
    notifyListeners();
  }
}

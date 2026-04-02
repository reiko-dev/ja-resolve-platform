import 'dart:convert';

class SystemSettings {
  final String key;
  final String category;
  final String value;
  final String description;
  final String type;
  final bool isPublic;
  final dynamic defaultValue;
  final Map<String, dynamic>? validation;
  final DateTime createdAt;
  final DateTime updatedAt;

  SystemSettings({
    required this.key,
    required this.category,
    required this.value,
    required this.description,
    required this.type,
    required this.isPublic,
    this.defaultValue,
    this.validation,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SystemSettings.fromJson(Map<String, dynamic> json) {
    // Parse validation
    Map<String, dynamic>? validation;
    if (json['validation'] != null) {
      if (json['validation'] is String) {
        validation = jsonDecode(json['validation']);
      } else {
        validation = json['validation'] as Map<String, dynamic>;
      }
    }

    return SystemSettings(
      key: json['setting_key'] ?? json['key'] ?? '',
      category: json['category'] ?? '',
      value: json['setting_value'] ?? json['value'] ?? '',
      description: json['description'] ?? '',
      type: json['type'] ?? 'string',
      isPublic: json['is_public'] ?? false,
      defaultValue: json['default_value'],
      validation: validation,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'setting_key': key,
      'category': category,
      'setting_value': value,
      'description': description,
      'type': type,
      'is_public': isPublic,
      'default_value': defaultValue,
      'validation': validation,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  // Getters tipados para facilitar o uso
  String? get stringValue => type == 'string' ? value : null;
  int? get intValue => type == 'integer' ? int.tryParse(value) : null;
  double? get doubleValue => type == 'decimal' || type == 'float' ? double.tryParse(value) : null;
  bool? get boolValue => type == 'boolean' ? value.toLowerCase() == 'true' : null;
  List<String>? get listValue => type == 'list' || type == 'array' 
    ? (value is String ? jsonDecode(value) : value)?.cast<String>() 
    : null;
  Map<String, dynamic>? get jsonValue => type == 'json' || type == 'object'
    ? (value is String ? jsonDecode(value) : value)
    : null;

  @override
  String toString() {
    return 'SystemSettings(key: $key, value: $value, category: $category)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is SystemSettings && other.key == key;
  }

  @override
  int get hashCode => key.hashCode;
}

class AppSettings {
  final String appName;
  final String appVersion;
  final bool emergencyRequestsEnabled;
  final bool deliveryEnabled;
  final bool subscriptionsEnabled;
  final int maxEmergencyRadius;
  final double emergencyServiceFee;
  final double deliveryPlatformFee;
  final double deliveryMotoboyFee;
  final Map<String, dynamic> emergencyTypes;
  final Map<String, dynamic> deliveryTypes;
  final List<String> supportedPaymentMethods;
  final String supportEmail;
  final String supportPhone;
  final String privacyPolicyUrl;
  final String termsOfServiceUrl;

  AppSettings({
    required this.appName,
    required this.appVersion,
    required this.emergencyRequestsEnabled,
    required this.deliveryEnabled,
    required this.subscriptionsEnabled,
    required this.maxEmergencyRadius,
    required this.emergencyServiceFee,
    required this.deliveryPlatformFee,
    required this.deliveryMotoboyFee,
    required this.emergencyTypes,
    required this.deliveryTypes,
    required this.supportedPaymentMethods,
    required this.supportEmail,
    required this.supportPhone,
    required this.privacyPolicyUrl,
    required this.termsOfServiceUrl,
  });

  factory AppSettings.fromSystemSettings(List<SystemSettings> settings) {
    final settingsMap = {for (var setting in settings) setting.key: setting};

    return AppSettings(
      appName: settingsMap['app_name']?.stringValue ?? 'Socorre AI',
      appVersion: settingsMap['app_version']?.stringValue ?? '1.0.0',
      emergencyRequestsEnabled: settingsMap['emergency_requests_enabled']?.boolValue ?? true,
      deliveryEnabled: settingsMap['delivery_enabled']?.boolValue ?? true,
      subscriptionsEnabled: settingsMap['subscriptions_enabled']?.boolValue ?? true,
      maxEmergencyRadius: settingsMap['max_emergency_radius_km']?.intValue ?? 15,
      emergencyServiceFee: settingsMap['emergency_service_fee_percent']?.doubleValue ?? 25.0,
      deliveryPlatformFee: settingsMap['delivery_platform_fee_percent']?.doubleValue ?? 20.0,
      deliveryMotoboyFee: settingsMap['delivery_motoboy_fee_percent']?.doubleValue ?? 80.0,
      emergencyTypes: settingsMap['emergency_types']?.jsonValue ?? {},
      deliveryTypes: settingsMap['delivery_types']?.jsonValue ?? {},
      supportedPaymentMethods: settingsMap['supported_payment_methods']?.listValue ?? ['credit_card', 'pix'],
      supportEmail: settingsMap['support_email']?.stringValue ?? 'suporte@socorreai.com.br',
      supportPhone: settingsMap['support_phone']?.stringValue ?? '0800-000-0000',
      privacyPolicyUrl: settingsMap['privacy_policy_url']?.stringValue ?? '',
      termsOfServiceUrl: settingsMap['terms_of_service_url']?.stringValue ?? '',
    );
  }

  // Configurações específicas para emergências
  EmergencyConfig get emergencyConfig => EmergencyConfig(
    enabled: emergencyRequestsEnabled,
    maxRadiusKm: maxEmergencyRadius,
    serviceFeePercent: emergencyServiceFee,
    types: emergencyTypes,
  );

  // Configurações específicas para delivery
  DeliveryConfig get deliveryConfig => DeliveryConfig(
    enabled: deliveryEnabled,
    platformFeePercent: deliveryPlatformFee,
    motoboyFeePercent: deliveryMotoboyFee,
    types: deliveryTypes,
  );

  // Configurações específicas para assinaturas
  SubscriptionConfig get subscriptionConfig => SubscriptionConfig(
    enabled: subscriptionsEnabled,
  );
}

class EmergencyConfig {
  final bool enabled;
  final int maxRadiusKm;
  final double serviceFeePercent;
  final Map<String, dynamic> types;

  EmergencyConfig({
    required this.enabled,
    required this.maxRadiusKm,
    required this.serviceFeePercent,
    required this.types,
  });

  List<String> get availableTypes {
    if (types.isEmpty) return ['mechanical', 'tow', 'fuel', 'battery'];
    return types.keys.where((key) => types[key]['enabled'] == true).toList();
  }

  Map<String, dynamic>? getTypeConfig(String type) {
    return types[type];
  }

  String getTypeDisplayName(String type) {
    final config = getTypeConfig(type);
    return config?['display_name'] ?? _getDefaultDisplayName(type);
  }

  String _getDefaultDisplayName(String type) {
    switch (type) {
      case 'mechanical':
        return 'Mecânico';
      case 'tow':
        return 'Guincho';
      case 'fuel':
        return 'Combustível';
      case 'battery':
        return 'Bateria';
      default:
        return type;
    }
  }
}

class DeliveryConfig {
  final bool enabled;
  final double platformFeePercent;
  final double motoboyFeePercent;
  final Map<String, dynamic> types;

  DeliveryConfig({
    required this.enabled,
    required this.platformFeePercent,
    required this.motoboyFeePercent,
    required this.types,
  });

  List<String> get availableTypes {
    if (types.isEmpty) return ['fuel', 'auto_parts'];
    return types.keys.where((key) => types[key]['enabled'] == true).toList();
  }

  Map<String, dynamic>? getTypeConfig(String type) {
    return types[type];
  }

  String getTypeDisplayName(String type) {
    final config = getTypeConfig(type);
    return config?['display_name'] ?? _getDefaultDisplayName(type);
  }

  double? getBaseDeliveryFee(String type) {
    final config = getTypeConfig(type);
    return config?['base_fee']?.toDouble();
  }

  String _getDefaultDisplayName(String type) {
    switch (type) {
      case 'fuel':
        return 'Combustível';
      case 'auto_parts':
        return 'Auto Peças';
      default:
        return type;
    }
  }
}

class SubscriptionConfig {
  final bool enabled;

  SubscriptionConfig({
    required this.enabled,
  });

  List<String> get availableTypes {
    if (!enabled) return [];
    return ['mechanic', 'gas_station', 'auto_parts'];
  }

  String getTypeDisplayName(String type) {
    switch (type) {
      case 'mechanic':
        return 'Mecânico';
      case 'gas_station':
        return 'Posto de Combustível';
      case 'auto_parts':
        return 'Auto Peças';
      default:
        return type;
    }
  }

  String getTypeIcon(String type) {
    switch (type) {
      case 'mechanic':
        return '🔧';
      case 'gas_station':
        return '⛽';
      case 'auto_parts':
        return '🔩';
      default:
        return '📦';
    }
  }
}

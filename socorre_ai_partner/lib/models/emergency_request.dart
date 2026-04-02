enum EmergencyType {
  mechanical,
  fuel,
  tire,
  battery,
  towing,
  other,
}

enum EmergencyUrgency {
  low,
  medium,
  high,
  critical,
}

enum EmergencyStatus {
  pending,
  accepted,
  inProgress,
  completed,
  cancelled,
}

class EmergencyRequest {
  final String id;
  final String userId;
  final EmergencyType type;
  final EmergencyUrgency urgency;
  final String? description;
  final Map<String, dynamic>? location;
  final Map<String, dynamic>? vehicleInfo;
  final EmergencyStatus status;
  EmergencyStatus currentStatus;
  
  // Setter para status
  set status(String newStatus) {
    currentStatus = EmergencyStatus.values.firstWhere(
      (e) => e.toString().split('.').last == newStatus,
      orElse: () => EmergencyStatus.pending,
    );
  }
  final DateTime createdAt;
  final DateTime? updatedAt;
  final double? distance;
  final String? partnerId;
  final double? estimatedPrice;

  EmergencyRequest({
    required this.id,
    required this.userId,
    required this.type,
    required this.urgency,
    this.description,
    this.location,
    this.vehicleInfo,
    required this.status,
    this.currentStatus = EmergencyStatus.pending,
    required this.createdAt,
    this.updatedAt,
    this.distance,
    this.partnerId,
    this.estimatedPrice,
  });

  factory EmergencyRequest.fromJson(Map<String, dynamic> json) {
    return EmergencyRequest(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      type: EmergencyType.values.firstWhere(
        (e) => e.toString().split('.').last == json['type'],
        orElse: () => EmergencyType.other,
      ),
      urgency: EmergencyUrgency.values.firstWhere(
        (e) => e.toString().split('.').last == json['urgency'],
        orElse: () => EmergencyUrgency.medium,
      ),
      description: json['description'],
      location: json['location'],
      vehicleInfo: json['vehicle_info'],
      status: EmergencyStatus.values.firstWhere(
        (e) => e.toString().split('.').last == json['status'],
        orElse: () => EmergencyStatus.pending,
      ),
      currentStatus: EmergencyStatus.values.firstWhere(
        (e) => e.toString().split('.').last == json['status'],
        orElse: () => EmergencyStatus.pending,
      ),
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: json['updated_at'] != null ? DateTime.parse(json['updated_at']) : null,
      distance: json['distance']?.toDouble(),
      partnerId: json['partner_id'],
      estimatedPrice: json['estimated_price']?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'type': type.toString().split('.').last,
      'urgency': urgency.toString().split('.').last,
      'description': description,
      'location': location,
      'vehicle_info': vehicleInfo,
      'status': status.toString().split('.').last,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
      'distance': distance,
      'partner_id': partnerId,
      'estimated_price': estimatedPrice,
    };
  }

  // Setter para status
  set status(String newStatus) {
    currentStatus = EmergencyStatus.values.firstWhere(
      (e) => e.toString().split('.').last == newStatus,
      orElse: () => EmergencyStatus.pending,
    );
  }

  // Getter para status
  String get statusValue => currentStatus.toString().split('.').last;

  // Getters para facilitar acesso
  String get emergencyType {
    switch (type) {
      case EmergencyType.mechanical:
        return 'Mecânica';
      case EmergencyType.fuel:
        return 'Combustível';
      case EmergencyType.tire:
        return 'Pneu';
      case EmergencyType.battery:
        return 'Bateria';
      case EmergencyType.towing:
        return 'Guincho';
      case EmergencyType.other:
        return 'Outros';
    }
  }

  String get address {
    if (location != null) {
      return location!['address'] ?? 'Endereço não disponível';
    }
    return 'Endereço não disponível';
  }
}

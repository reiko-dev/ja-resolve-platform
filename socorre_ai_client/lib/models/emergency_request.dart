import 'dart:convert';

class EmergencyRequest {
  final String id;
  final String userId;
  final EmergencyType type;
  final EmergencyRequestType requestType; // NOVO: tipo específico de solicitação
  final EmergencyUrgency urgency;
  final String description;
  final Map<String, dynamic> vehicleInfo;
  final double latitude;
  final double longitude;
  final String address;
  final List<String> photos;
  final EmergencyStatus status;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String? partnerId;
  final String? partnerName;
  final double? estimatedTime;
  final String? notes;
  final List<TowProposal>? towProposals; // NOVO: propostas de guincho
  final String? acceptedProposalId; // NOVO: proposta aceita

  EmergencyRequest({
    required this.id,
    required this.userId,
    required this.type,
    required this.requestType, // NOVO
    required this.urgency,
    required this.description,
    required this.vehicleInfo,
    required this.latitude,
    required this.longitude,
    required this.address,
    required this.photos,
    required this.status,
    required this.createdAt,
    this.updatedAt,
    this.partnerId,
    this.partnerName,
    this.estimatedTime,
    this.notes,
    this.towProposals, // NOVO
    this.acceptedProposalId, // NOVO
  });

  factory EmergencyRequest.fromJson(Map<String, dynamic> json) {
    // Converter tipos que podem vir como int ou string
    final id = json['id'] is int ? json['id'].toString() : json['id'].toString();
    final userId = json['user_id'] is int ? json['user_id'].toString() : json['user_id'].toString();
    
    // Parse vehicle_info - pode vir como string JSON ou objeto
    Map<String, dynamic> vehicleInfo = {};
    if (json['vehicle_info'] != null) {
      if (json['vehicle_info'] is String) {
        try {
          vehicleInfo = Map<String, dynamic>.from(jsonDecode(json['vehicle_info']));
        } catch (e) {
          vehicleInfo = {};
        }
      } else {
        vehicleInfo = Map<String, dynamic>.from(json['vehicle_info']);
      }
    }
    
    // Parse photos - pode vir como string JSON ou array
    List<String> photos = [];
    if (json['photos'] != null) {
      if (json['photos'] is String) {
        try {
          photos = List<String>.from(jsonDecode(json['photos']));
        } catch (e) {
          photos = [];
        }
      } else {
        photos = List<String>.from(json['photos'] ?? []);
      }
    }
    
    // Converter latitude/longitude que podem vir como string ou double
    double parseCoordinate(dynamic value) {
      if (value == null) return 0.0;
      if (value is double) return value;
      if (value is int) return value.toDouble();
      if (value is String) return double.tryParse(value) ?? 0.0;
      return 0.0;
    }
    
    return EmergencyRequest(
      id: id,
      userId: userId,
      type: EmergencyType.values.firstWhere(
        (e) => e.toString().split('.').last == json['type'],
        orElse: () => EmergencyType.mechanical,
      ),
      requestType: EmergencyRequestType.values.firstWhere(
        (e) => e.toString().split('.').last == json['request_type'],
        orElse: () => EmergencyRequestType.mechanic,
      ),
      urgency: EmergencyUrgency.values.firstWhere(
        (e) => e.toString().split('.').last == json['urgency'],
        orElse: () => EmergencyUrgency.medium,
      ),
      description: json['description'] ?? '',
      vehicleInfo: vehicleInfo,
      latitude: parseCoordinate(json['latitude']),
      longitude: parseCoordinate(json['longitude']),
      address: json['address'] ?? '',
      photos: photos,
      status: EmergencyStatus.values.firstWhere(
        (e) => e.toString().split('.').last == json['status'],
        orElse: () => EmergencyStatus.pending,
      ),
      createdAt: json['created_at'] != null 
          ? (json['created_at'] is String 
              ? DateTime.parse(json['created_at']) 
              : DateTime.parse(json['created_at'].toString()))
          : DateTime.now(),
      updatedAt: json['updated_at'] != null 
          ? (json['updated_at'] is String 
              ? DateTime.parse(json['updated_at']) 
              : DateTime.parse(json['updated_at'].toString()))
          : null,
      partnerId: json['partner_id']?.toString(),
      partnerName: json['partner_name'],
      estimatedTime: json['estimated_time'] != null
          ? (json['estimated_time'] is double 
              ? json['estimated_time'] 
              : (json['estimated_time'] is int 
                  ? json['estimated_time'].toDouble() 
                  : double.tryParse(json['estimated_time'].toString())))
          : null,
      notes: json['notes'],
      towProposals: null, // Temporarily disabled
      acceptedProposalId: json['accepted_proposal_id']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'type': type.toString().split('.').last,
      'request_type': requestType.toString().split('.').last,
      'urgency': urgency.toString().split('.').last,
      'description': description,
      'vehicle_info': vehicleInfo,
      'latitude': latitude,
      'longitude': longitude,
      'address': address,
      'photos': photos,
      'status': status.toString().split('.').last,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
      'partner_id': partnerId,
      'partner_name': partnerName,
      'estimated_time': estimatedTime,
      'notes': notes,
      'tow_proposals': towProposals?.map((p) => p.toString()).toList(),
      'accepted_proposal_id': acceptedProposalId,
    };
  }
}

enum EmergencyType {
  mechanical,
  flatTire,
  noFuel,
  deadBattery,
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

enum LocationType {
  current,
  manual,
}

// NOVOS ENUMS PARA A NOVA LÓGICA
enum EmergencyRequestType {
  mechanic,    // Mecânico (aceitação direta)
  tow,         // Guincho (com propostas)
  fuel,        // Combustível
  battery,     // Bateria
}

enum TowProposal {
  pending,
  accepted,
  rejected,
  withdrawn,
  expired,
}

extension EmergencyRequestTypeExtension on EmergencyRequestType {
  String get displayName {
    switch (this) {
      case EmergencyRequestType.mechanic:
        return 'Mecânico';
      case EmergencyRequestType.tow:
        return 'Guincho';
      case EmergencyRequestType.fuel:
        return 'Combustível';
      case EmergencyRequestType.battery:
        return 'Bateria';
    }
  }

  String get description {
    switch (this) {
      case EmergencyRequestType.mechanic:
        return 'Assistência mecânica no local';
      case EmergencyRequestType.tow:
        return 'Reboque para oficina';
      case EmergencyRequestType.fuel:
        return 'Entrega de combustível';
      case EmergencyRequestType.battery:
        return 'Troca de bateria';
    }
  }

  String get icon {
    switch (this) {
      case EmergencyRequestType.mechanic:
        return '🔧';
      case EmergencyRequestType.tow:
        return '🚗';
      case EmergencyRequestType.fuel:
        return '⛽';
      case EmergencyRequestType.battery:
        return '🔋';
    }
  }

  bool get usesProposals => this == EmergencyRequestType.tow;
  bool get usesDirectAcceptance => this == EmergencyRequestType.mechanic;
  bool get isServiceType => this == EmergencyRequestType.fuel || this == EmergencyRequestType.battery;
}

extension TowProposalExtension on TowProposal {
  String get displayName {
    switch (this) {
      case TowProposal.pending:
        return 'Pendente';
      case TowProposal.accepted:
        return 'Aceita';
      case TowProposal.rejected:
        return 'Rejeitada';
      case TowProposal.withdrawn:
        return 'Retirada';
      case TowProposal.expired:
        return 'Expirada';
    }
  }

  String get description {
    switch (this) {
      case TowProposal.pending:
        return 'Aguardando sua resposta';
      case TowProposal.accepted:
        return 'Proposta aceita';
      case TowProposal.rejected:
        return 'Proposta rejeitada';
      case TowProposal.withdrawn:
        return 'Proposta retirada pelo parceiro';
      case TowProposal.expired:
        return 'Proposta expirou';
    }
  }

  bool get isActive => this == TowProposal.pending;
  bool get isCompleted => this == TowProposal.accepted || this == TowProposal.rejected;
  bool get isExpired => this == TowProposal.expired;
}

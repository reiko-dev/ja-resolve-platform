import 'dart:convert';

class TowProposal {
  final String id;
  final String emergencyRequestId;
  final String partnerId;
  final String partnerName;
  final String partnerPhoto;
  final double partnerRating;
  final double proposedPrice;
  final int estimatedTimeMinutes;
  final String? notes;
  final TowProposalStatus status;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final int? viewsCount;
  final double? distanceKm;
  final String? towTruckType;
  final bool? hasWinch;
  final String? towEquipment;

  TowProposal({
    required this.id,
    required this.emergencyRequestId,
    required this.partnerId,
    required this.partnerName,
    required this.partnerPhoto,
    required this.partnerRating,
    required this.proposedPrice,
    required this.estimatedTimeMinutes,
    this.notes,
    required this.status,
    required this.createdAt,
    this.expiresAt,
    this.viewsCount,
    this.distanceKm,
    this.towTruckType,
    this.hasWinch,
    this.towEquipment,
  });

  factory TowProposal.fromJson(Map<String, dynamic> json) {
    return TowProposal(
      id: json['id']?.toString() ?? '',
      emergencyRequestId: json['emergency_request_id']?.toString() ?? '',
      partnerId: json['partner_id']?.toString() ?? '',
      partnerName: json['partner_name'] ?? '',
      partnerPhoto: json['partner_photo'] ?? '',
      partnerRating: (json['partner_rating'] ?? 0.0).toDouble(),
      proposedPrice: (json['proposed_price'] ?? 0.0).toDouble(),
      estimatedTimeMinutes: json['estimated_time_minutes'] ?? 0,
      notes: json['notes'],
      status: _parseStatus(json['status']),
      createdAt: DateTime.parse(json['created_at']),
      expiresAt: json['expires_at'] != null ? DateTime.parse(json['expires_at']) : null,
      viewsCount: json['views_count'],
      distanceKm: json['distance_km']?.toDouble(),
      towTruckType: json['tow_truck_type'],
      hasWinch: json['has_winch'],
      towEquipment: json['tow_equipment'] != null 
        ? (json['tow_equipment'] is String 
            ? json['tow_equipment'] 
            : json['tow_equipment'].toString()) 
        : null,
    );
  }

  static TowProposalStatus _parseStatus(String? status) {
    switch (status) {
      case 'pending':
        return TowProposalStatus.pending;
      case 'accepted':
        return TowProposalStatus.accepted;
      case 'rejected':
        return TowProposalStatus.rejected;
      case 'withdrawn':
        return TowProposalStatus.withdrawn;
      case 'expired':
        return TowProposalStatus.expired;
      default:
        return TowProposalStatus.pending;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'emergency_request_id': emergencyRequestId,
      'partner_id': partnerId,
      'partner_name': partnerName,
      'partner_photo': partnerPhoto,
      'partner_rating': partnerRating,
      'proposed_price': proposedPrice,
      'estimated_time_minutes': estimatedTimeMinutes,
      'notes': notes,
      'status': status.toString().split('.').last,
      'created_at': createdAt.toIso8601String(),
      'expires_at': expiresAt?.toIso8601String(),
      'views_count': viewsCount,
      'distance_km': distanceKm,
      'tow_truck_type': towTruckType,
      'has_winch': hasWinch,
      'tow_equipment': towEquipment,
    };
  }

  TowProposal copyWith({
    String? id,
    String? emergencyRequestId,
    String? partnerId,
    String? partnerName,
    String? partnerPhoto,
    double? partnerRating,
    double? proposedPrice,
    int? estimatedTimeMinutes,
    String? notes,
    TowProposalStatus? status,
    DateTime? createdAt,
    DateTime? expiresAt,
    int? viewsCount,
    double? distanceKm,
    String? towTruckType,
    bool? hasWinch,
    String? towEquipment,
  }) {
    return TowProposal(
      id: id ?? this.id,
      emergencyRequestId: emergencyRequestId ?? this.emergencyRequestId,
      partnerId: partnerId ?? this.partnerId,
      partnerName: partnerName ?? this.partnerName,
      partnerPhoto: partnerPhoto ?? this.partnerPhoto,
      partnerRating: partnerRating ?? this.partnerRating,
      proposedPrice: proposedPrice ?? this.proposedPrice,
      estimatedTimeMinutes: estimatedTimeMinutes ?? this.estimatedTimeMinutes,
      notes: notes ?? this.notes,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      expiresAt: expiresAt ?? this.expiresAt,
      viewsCount: viewsCount ?? this.viewsCount,
      distanceKm: distanceKm ?? this.distanceKm,
      towTruckType: towTruckType ?? this.towTruckType,
      hasWinch: hasWinch ?? this.hasWinch,
      towEquipment: towEquipment ?? this.towEquipment,
    );
  }

  @override
  String toString() {
    return 'TowProposal(id: $id, partnerName: $partnerName, proposedPrice: $proposedPrice, status: $status)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is TowProposal && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

enum TowProposalStatus {
  pending,
  accepted,
  rejected,
  withdrawn,
  expired,
}

extension TowProposalStatusExtension on TowProposalStatus {
  String get displayName {
    switch (this) {
      case TowProposalStatus.pending:
        return 'Pendente';
      case TowProposalStatus.accepted:
        return 'Aceita';
      case TowProposalStatus.rejected:
        return 'Rejeitada';
      case TowProposalStatus.withdrawn:
        return 'Retirada';
      case TowProposalStatus.expired:
        return 'Expirada';
    }
  }

  String get description {
    switch (this) {
      case TowProposalStatus.pending:
        return 'Aguardando sua resposta';
      case TowProposalStatus.accepted:
        return 'Proposta aceita';
      case TowProposalStatus.rejected:
        return 'Proposta rejeitada';
      case TowProposalStatus.withdrawn:
        return 'Proposta retirada pelo parceiro';
      case TowProposalStatus.expired:
        return 'Proposta expirou';
    }
  }

  bool get isActive => this == TowProposalStatus.pending;
  bool get isCompleted => this == TowProposalStatus.accepted || this == TowProposalStatus.rejected;
  bool get isExpired => this == TowProposalStatus.expired;
}

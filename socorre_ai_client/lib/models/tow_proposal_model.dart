class TowProposalData {
  final String id;
  final String partnerId;
  final String partnerName;
  final String partnerAvatar;
  final double proposedPrice;
  final int estimatedTimeMinutes;
  final String towTruckType;
  final bool hasWinch;
  final String status;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final String? notes;

  TowProposalData({
    required this.id,
    required this.partnerId,
    required this.partnerName,
    required this.partnerAvatar,
    required this.proposedPrice,
    required this.estimatedTimeMinutes,
    required this.towTruckType,
    required this.hasWinch,
    required this.status,
    required this.createdAt,
    this.expiresAt,
    this.notes,
  });

  factory TowProposalData.fromJson(Map<String, dynamic> json) {
    return TowProposalData(
      id: json['id'].toString(),
      partnerId: json['partner_id'].toString(),
      partnerName: json['partner_name'] ?? '',
      partnerAvatar: json['partner_avatar'] ?? '',
      proposedPrice: double.parse(json['proposed_price'].toString()),
      estimatedTimeMinutes: int.parse(json['estimated_time_minutes'].toString()),
      towTruckType: json['tow_truck_type'] ?? '',
      hasWinch: json['has_winch'] ?? false,
      status: json['status'] ?? 'pending',
      createdAt: DateTime.parse(json['created_at']),
      expiresAt: json['expires_at'] != null 
          ? DateTime.parse(json['expires_at']) 
          : null,
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'partner_id': partnerId,
      'partner_name': partnerName,
      'partner_avatar': partnerAvatar,
      'proposed_price': proposedPrice,
      'estimated_time_minutes': estimatedTimeMinutes,
      'tow_truck_type': towTruckType,
      'has_winch': hasWinch,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'expires_at': expiresAt?.toIso8601String(),
      'notes': notes,
    };
  }

  String get formattedPrice {
    return 'R\$ ${proposedPrice.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  String get statusText {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'accepted':
        return 'Aceito';
      case 'rejected':
        return 'Rejeitado';
      case 'withdrawn':
        return 'Retirado';
      case 'expired':
        return 'Expirado';
      default:
        return status;
    }
  }

  bool get isPending => status == 'pending';
  bool get isAccepted => status == 'accepted';
  bool get isRejected => status == 'rejected';
  bool get isWithdrawn => status == 'withdrawn';
  bool get isExpired => status == 'expired';

  String get truckDescription {
    return '$towTruckType${hasWinch ? ' com guincho' : ''}';
  }
}

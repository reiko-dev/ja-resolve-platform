class Appointment {
  final int id;
  final String serviceType;
  final String partnerName;
  final String partnerAvatar;
  final DateTime scheduledDate;
  final String scheduledTime;
  final String address;
  final String description;
  final String status; // pending, confirmed, completed, cancelled
  final DateTime createdAt;
  final DateTime? updatedAt;
  final double? price;
  final String? notes;

  Appointment({
    required this.id,
    required this.serviceType,
    required this.partnerName,
    required this.partnerAvatar,
    required this.scheduledDate,
    required this.scheduledTime,
    required this.address,
    required this.description,
    required this.status,
    required this.createdAt,
    this.updatedAt,
    this.price,
    this.notes,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    return Appointment(
      id: int.parse(json['id'].toString()),
      serviceType: json['service_type'] ?? '',
      partnerName: json['partner_name'] ?? '',
      partnerAvatar: json['partner_avatar'] ?? '',
      scheduledDate: DateTime.parse(json['scheduled_date']),
      scheduledTime: json['scheduled_time'] ?? '',
      address: json['address'] ?? '',
      description: json['description'] ?? '',
      status: json['status'] ?? 'pending',
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: json['updated_at'] != null 
          ? DateTime.parse(json['updated_at']) 
          : null,
      price: json['price'] != null ? double.parse(json['price'].toString()) : null,
      notes: json['notes'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'service_type': serviceType,
      'partner_name': partnerName,
      'partner_avatar': partnerAvatar,
      'scheduled_date': scheduledDate.toIso8601String(),
      'scheduled_time': scheduledTime,
      'address': address,
      'description': description,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt?.toIso8601String(),
      'price': price,
      'notes': notes,
    };
  }

  String get statusText {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'confirmed':
        return 'Confirmado';
      case 'completed':
        return 'Concluído';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  }

  bool get isPending => status == 'pending';
  bool get isConfirmed => status == 'confirmed';
  bool get isCompleted => status == 'completed';
  bool get isCancelled => status == 'cancelled';

  String get formattedPrice {
    if (price == null) return 'A definir';
    return 'R\$ ${price!.toStringAsFixed(2)}';
  }

  String get formattedDate {
    return '${scheduledDate.day.toString().padLeft(2, '0')}/${scheduledDate.month.toString().padLeft(2, '0')}/${scheduledDate.year}';
  }

  String get fullDateTime {
    return '$formattedDate às $scheduledTime';
  }
}

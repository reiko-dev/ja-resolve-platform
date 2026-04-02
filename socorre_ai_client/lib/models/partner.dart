class Partner {
  final String id;
  final String name;
  final String email;
  final String phone;
  final String businessName;
  final String? userName;
  final PartnerType type;
  final Map<String, dynamic> location;
  final String? description;
  final List<String> services;
  final double rating;
  final int totalRatings;
  final bool isAvailable;
  final double? distance;
  final String? avatarUrl;
  final DateTime? lastActiveAt;
  final DateTime createdAt;

  Partner({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.businessName,
    this.userName,
    required this.type,
    required this.location,
    this.description,
    required this.services,
    required this.rating,
    required this.totalRatings,
    required this.isAvailable,
    this.distance,
    this.avatarUrl,
    this.lastActiveAt,
    required this.createdAt,
  });

  factory Partner.fromJson(Map<String, dynamic> json) {
    return Partner(
      id: json['id'],
      name: json['name'],
      email: json['email'],
      phone: json['phone'],
      businessName: json['business_name'],
      userName: json['user_name'],
      type: PartnerType.values.firstWhere(
        (e) => e.toString().split('.').last == json['type'],
        orElse: () => PartnerType.mechanic,
      ),
      location: json['location'] ?? {
        'latitude': json['latitude']?.toDouble() ?? 0.0,
        'longitude': json['longitude']?.toDouble() ?? 0.0,
        'address': json['address'] ?? '',
      },
      description: json['description'],
      services: List<String>.from(json['services'] ?? []),
      rating: json['rating']?.toDouble() ?? 0.0,
      totalRatings: json['total_ratings'] ?? 0,
      isAvailable: json['is_available'] ?? false,
      distance: json['distance']?.toDouble(),
      avatarUrl: json['avatar_url'],
      lastActiveAt: json['last_active_at'] != null
          ? DateTime.parse(json['last_active_at'])
          : null,
      createdAt: DateTime.parse(json['created_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'business_name': businessName,
      'user_name': userName,
      'type': type.toString().split('.').last,
      'location': location,
      'description': description,
      'services': services,
      'rating': rating,
      'total_ratings': totalRatings,
      'is_available': isAvailable,
      'distance': distance,
      'avatar_url': avatarUrl,
      'last_active_at': lastActiveAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
    };
  }
}

enum PartnerType {
  mechanic,
  towTruck,
  battery,
  fuel,
  tire,
  general,
}

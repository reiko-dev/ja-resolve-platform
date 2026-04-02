class User {
  final int id;
  final String name;
  final String email;
  final String phone;
  final String role;
  final String? cpf;
  final String? cnpj;
  final Map<String, dynamic>? address;
  final bool isActive;
  final bool emailVerified;
  final DateTime createdAt;
  final DateTime updatedAt;

  User({
    required this.id,
    required this.name,
    required this.email,
    required this.phone,
    required this.role,
    this.cpf,
    this.cnpj,
    this.address,
    required this.isActive,
    required this.emailVerified,
    required this.createdAt,
    required this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    try {
      return User(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String,
        phone: json['phone'] as String,
        role: json['role'] as String,
        cpf: json['cpf'],
        cnpj: json['cnpj'],
        address: json['address'] is String 
            ? Map<String, dynamic>.from(jsonDecode(json['address']))
            : json['address'] as Map<String, dynamic>?,
        isActive: json['is_active'] as bool? ?? true,
        emailVerified: json['email_verified'] as bool? ?? false,
        createdAt: DateTime.parse(json['created_at'] as String),
        updatedAt: DateTime.parse(json['updated_at'] as String),
      );
    } catch (e) {
      print('Error parsing User from JSON: $e');
      print('JSON data: $json');
      rethrow;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'role': role,
      'cpf': cpf,
      'cnpj': cnpj,
      'address': address,
      'is_active': isActive,
      'email_verified': emailVerified,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  User copyWith({
    int? id,
    String? name,
    String? email,
    String? phone,
    String? role,
    String? cpf,
    String? cnpj,
    Map<String, dynamic>? address,
    bool? isActive,
    bool? emailVerified,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      role: role ?? this.role,
      cpf: cpf ?? this.cpf,
      cnpj: cnpj ?? this.cnpj,
      address: address ?? this.address,
      isActive: isActive ?? this.isActive,
      emailVerified: emailVerified ?? this.emailVerified,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() {
    return 'User(id: $id, name: $name, email: $email, role: $role)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is User && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

// Função auxiliar para decodificar JSON
Map<String, dynamic> jsonDecode(String json) {
  return Map<String, dynamic>.from(json as Map);
}

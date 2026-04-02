import 'dart:convert';

class Product {
  final String id;
  final String storeId;
  final String storeName;
  final String sku;
  final String name;
  final String description;
  final ProductCategory category;
  final ProductType type;
  final double price;
  final int stock;
  final String? unit;
  final String? brand;
  final List<String>? tags;
  final List<String>? photos;
  final bool isActive;
  final bool isFeatured;
  final double? rating;
  final int? reviewCount;
  final Map<String, dynamic>? specifications;
  final DateTime createdAt;
  final DateTime updatedAt;

  Product({
    required this.id,
    required this.storeId,
    required this.storeName,
    required this.sku,
    required this.name,
    required this.description,
    required this.category,
    required this.type,
    required this.price,
    required this.stock,
    this.unit,
    this.brand,
    this.tags,
    this.photos,
    required this.isActive,
    required this.isFeatured,
    this.rating,
    this.reviewCount,
    this.specifications,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    // Parse photos
    List<String>? photos;
    if (json['photos'] != null) {
      if (json['photos'] is String) {
        photos = jsonDecode(json['photos']).cast<String>();
      } else if (json['photos'] is List) {
        photos = (json['photos'] as List).cast<String>();
      }
    }

    // Parse tags
    List<String>? tags;
    if (json['tags'] != null) {
      if (json['tags'] is String) {
        tags = jsonDecode(json['tags']).cast<String>();
      } else if (json['tags'] is List) {
        tags = (json['tags'] as List).cast<String>();
      }
    }

    // Parse specifications
    Map<String, dynamic>? specifications;
    if (json['specifications'] != null) {
      if (json['specifications'] is String) {
        specifications = jsonDecode(json['specifications']);
      } else {
        specifications = json['specifications'] as Map<String, dynamic>;
      }
    }

    return Product(
      id: json['id']?.toString() ?? '',
      storeId: json['store_id']?.toString() ?? '',
      storeName: json['store_name'] ?? '',
      sku: json['sku'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      category: _parseCategory(json['category']),
      type: _parseType(json['type']),
      price: (json['price'] ?? 0.0).toDouble(),
      stock: json['stock'] ?? 0,
      unit: json['unit'],
      brand: json['brand'],
      tags: tags,
      photos: photos,
      isActive: json['is_active'] ?? true,
      isFeatured: json['is_featured'] ?? false,
      rating: json['rating']?.toDouble(),
      reviewCount: json['review_count'],
      specifications: specifications,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  static ProductCategory _parseCategory(String? category) {
    switch (category) {
      case 'fuel':
        return ProductCategory.fuel;
      case 'oil':
        return ProductCategory.oil;
      case 'tire':
        return ProductCategory.tire;
      case 'battery':
        return ProductCategory.battery;
      case 'brake':
        return ProductCategory.brake;
      case 'filter':
        return ProductCategory.filter;
      case 'light':
        return ProductCategory.light;
      case 'accessory':
        return ProductCategory.accessory;
      case 'tool':
        return ProductCategory.tool;
      case 'fluid':
        return ProductCategory.fluid;
      case 'part':
        return ProductCategory.part;
      case 'other':
        return ProductCategory.other;
      default:
        return ProductCategory.other;
    }
  }

  static ProductType _parseType(String? type) {
    switch (type) {
      case 'fuel':
        return ProductType.fuel;
      case 'auto_part':
        return ProductType.autoPart;
      case 'accessory':
        return ProductType.accessory;
      case 'tool':
        return ProductType.tool;
      case 'fluid':
        return ProductType.fluid;
      case 'other':
        return ProductType.other;
      default:
        return ProductType.other;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'store_id': storeId,
      'store_name': storeName,
      'sku': sku,
      'name': name,
      'description': description,
      'category': category.toString().split('.').last,
      'type': type.toString().split('.').last,
      'price': price,
      'stock': stock,
      'unit': unit,
      'brand': brand,
      'tags': tags,
      'photos': photos,
      'is_active': isActive,
      'is_featured': isFeatured,
      'rating': rating,
      'review_count': reviewCount,
      'specifications': specifications,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  Product copyWith({
    String? id,
    String? storeId,
    String? storeName,
    String? sku,
    String? name,
    String? description,
    ProductCategory? category,
    ProductType? type,
    double? price,
    int? stock,
    String? unit,
    String? brand,
    List<String>? tags,
    List<String>? photos,
    bool? isActive,
    bool? isFeatured,
    double? rating,
    int? reviewCount,
    Map<String, dynamic>? specifications,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Product(
      id: id ?? this.id,
      storeId: storeId ?? this.storeId,
      storeName: storeName ?? this.storeName,
      sku: sku ?? this.sku,
      name: name ?? this.name,
      description: description ?? this.description,
      category: category ?? this.category,
      type: type ?? this.type,
      price: price ?? this.price,
      stock: stock ?? this.stock,
      unit: unit ?? this.unit,
      brand: brand ?? this.brand,
      tags: tags ?? this.tags,
      photos: photos ?? this.photos,
      isActive: isActive ?? this.isActive,
      isFeatured: isFeatured ?? this.isFeatured,
      rating: rating ?? this.rating,
      reviewCount: reviewCount ?? this.reviewCount,
      specifications: specifications ?? this.specifications,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() {
    return 'Product(id: $id, name: $name, price: $price, stock: $stock)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Product && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;

  // Getters úteis
  bool get isAvailable => isActive && stock > 0;
  bool get isOutOfStock => stock == 0;
  bool get isLowStock => stock > 0 && stock <= 5;
  
  String get formattedPrice => 'R\$ ${price.toStringAsFixed(2).replaceAll('.', ',')}';
  String get stockStatus {
    if (isOutOfStock) return 'Fora de estoque';
    if (isLowStock) return 'Apenas $stock unidades disponíveis';
    return '$stock unidades disponíveis';
  }

  String get mainPhoto => photos?.isNotEmpty == true ? photos!.first : '';
}

enum ProductCategory {
  fuel,
  oil,
  tire,
  battery,
  brake,
  filter,
  light,
  accessory,
  tool,
  fluid,
  part,
  other,
}

enum ProductType {
  fuel,
  autoPart,
  accessory,
  tool,
  fluid,
  other,
}

extension ProductCategoryExtension on ProductCategory {
  String get displayName {
    switch (this) {
      case ProductCategory.fuel:
        return 'Combustíveis';
      case ProductCategory.oil:
        return 'Óleos e Lubrificantes';
      case ProductCategory.tire:
        return 'Pneus';
      case ProductCategory.battery:
        return 'Baterias';
      case ProductCategory.brake:
        return 'Freios';
      case ProductCategory.filter:
        return 'Filtros';
      case ProductCategory.light:
        return 'Iluminação';
      case ProductCategory.accessory:
        return 'Acessórios';
      case ProductCategory.tool:
        return 'Ferramentas';
      case ProductCategory.fluid:
        return 'Fluidos';
      case ProductCategory.part:
        return 'Peças';
      case ProductCategory.other:
        return 'Outros';
    }
  }

  String get icon {
    switch (this) {
      case ProductCategory.fuel:
        return '⛽';
      case ProductCategory.oil:
        return '🛢️';
      case ProductCategory.tire:
        return '🛞';
      case ProductCategory.battery:
        return '🔋';
      case ProductCategory.brake:
        return '🛑';
      case ProductCategory.filter:
        return '🔽';
      case ProductCategory.light:
        return '💡';
      case ProductCategory.accessory:
        return '🎁';
      case ProductCategory.tool:
        return '🔧';
      case ProductCategory.fluid:
        return '💧';
      case ProductCategory.part:
        return '⚙️';
      case ProductCategory.other:
        return '📦';
    }
  }
}

extension ProductTypeExtension on ProductType {
  String get displayName {
    switch (this) {
      case ProductType.fuel:
        return 'Combustível';
      case ProductType.autoPart:
        return 'Auto Peça';
      case ProductType.accessory:
        return 'Acessório';
      case ProductType.tool:
        return 'Ferramenta';
      case ProductType.fluid:
        return 'Fluido';
      case ProductType.other:
        return 'Outro';
    }
  }

  String get icon {
    switch (this) {
      case ProductType.fuel:
        return '⛽';
      case ProductType.autoPart:
        return '🔧';
      case ProductType.accessory:
        return '🎁';
      case ProductType.tool:
        return '🔨';
      case ProductType.fluid:
        return '💧';
      case ProductType.other:
        return '📦';
    }
  }
}

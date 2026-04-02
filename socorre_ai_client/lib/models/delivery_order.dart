import 'dart:convert';

class DeliveryOrder {
  final String id;
  final DeliveryOrderType orderType;
  final String storeId;
  final String storeName;
  final String customerId;
  final String? motoboyId;
  final String? motoboyName;
  final String pickupAddress;
  final double pickupLatitude;
  final double pickupLongitude;
  final String deliveryAddress;
  final double deliveryLatitude;
  final double deliveryLongitude;
  final List<OrderItem> items;
  final double itemsTotal;
  final int itemsCount;
  final double deliveryFee;
  final double platformFee;
  final double motoboyFee;
  final double totalAmount;
  final DeliveryOrderStatus status;
  final DateTime? acceptedAt;
  final DateTime? pickedUpAt;
  final DateTime? inTransitAt;
  final DateTime? deliveredAt;
  final int? estimatedTimeMinutes;
  final int? actualTimeMinutes;
  final String? customerNotes;
  final String? motoboyNotes;
  final String? cancellationReason;
  final PaymentStatus paymentStatus;
  final List<TrackingPoint>? trackingHistory;
  final double? distanceKm;
  final int? rating;
  final String? reviewComment;
  final DateTime? reviewedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  DeliveryOrder({
    required this.id,
    required this.orderType,
    required this.storeId,
    required this.storeName,
    required this.customerId,
    this.motoboyId,
    this.motoboyName,
    required this.pickupAddress,
    required this.pickupLatitude,
    required this.pickupLongitude,
    required this.deliveryAddress,
    required this.deliveryLatitude,
    required this.deliveryLongitude,
    required this.items,
    required this.itemsTotal,
    required this.itemsCount,
    required this.deliveryFee,
    required this.platformFee,
    required this.motoboyFee,
    required this.totalAmount,
    required this.status,
    this.acceptedAt,
    this.pickedUpAt,
    this.inTransitAt,
    this.deliveredAt,
    this.estimatedTimeMinutes,
    this.actualTimeMinutes,
    this.customerNotes,
    this.motoboyNotes,
    this.cancellationReason,
    required this.paymentStatus,
    this.trackingHistory,
    this.distanceKm,
    this.rating,
    this.reviewComment,
    this.reviewedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DeliveryOrder.fromJson(Map<String, dynamic> json) {
    // Parse items
    List<OrderItem> items = [];
    if (json['items'] != null) {
      if (json['items'] is String) {
        final itemsList = jsonDecode(json['items']);
        items = (itemsList as List).map((item) => OrderItem.fromJson(item)).toList();
      } else if (json['items'] is List) {
        items = (json['items'] as List).map((item) => OrderItem.fromJson(item)).toList();
      }
    }

    // Parse tracking history
    List<TrackingPoint>? trackingHistory;
    if (json['tracking_history'] != null) {
      if (json['tracking_history'] is String) {
        final historyList = jsonDecode(json['tracking_history']);
        trackingHistory = (historyList as List).map((point) => TrackingPoint.fromJson(point)).toList();
      } else if (json['tracking_history'] is List) {
        trackingHistory = (json['tracking_history'] as List).map((point) => TrackingPoint.fromJson(point)).toList();
      }
    }

    return DeliveryOrder(
      id: json['id']?.toString() ?? '',
      orderType: _parseOrderType(json['order_type']),
      storeId: json['store_id']?.toString() ?? '',
      storeName: json['store_name'] ?? '',
      customerId: json['customer_id']?.toString() ?? '',
      motoboyId: json['motoboy_id']?.toString(),
      motoboyName: json['motoboy_name'],
      pickupAddress: json['pickup_address'] ?? '',
      pickupLatitude: (json['pickup_latitude'] ?? 0.0).toDouble(),
      pickupLongitude: (json['pickup_longitude'] ?? 0.0).toDouble(),
      deliveryAddress: json['delivery_address'] ?? '',
      deliveryLatitude: (json['delivery_latitude'] ?? 0.0).toDouble(),
      deliveryLongitude: (json['delivery_longitude'] ?? 0.0).toDouble(),
      items: items,
      itemsTotal: (json['items_total'] ?? 0.0).toDouble(),
      itemsCount: json['items_count'] ?? 0,
      deliveryFee: (json['delivery_fee'] ?? 0.0).toDouble(),
      platformFee: (json['platform_fee'] ?? 0.0).toDouble(),
      motoboyFee: (json['motoboy_fee'] ?? 0.0).toDouble(),
      totalAmount: (json['total_amount'] ?? 0.0).toDouble(),
      status: _parseStatus(json['status']),
      acceptedAt: json['accepted_at'] != null ? DateTime.parse(json['accepted_at']) : null,
      pickedUpAt: json['picked_up_at'] != null ? DateTime.parse(json['picked_up_at']) : null,
      inTransitAt: json['in_transit_at'] != null ? DateTime.parse(json['in_transit_at']) : null,
      deliveredAt: json['delivered_at'] != null ? DateTime.parse(json['delivered_at']) : null,
      estimatedTimeMinutes: json['estimated_time_minutes'],
      actualTimeMinutes: json['actual_time_minutes'],
      customerNotes: json['customer_notes'],
      motoboyNotes: json['motoboy_notes'],
      cancellationReason: json['cancellation_reason'],
      paymentStatus: _parsePaymentStatus(json['payment_status']),
      trackingHistory: trackingHistory,
      distanceKm: json['distance_km']?.toDouble(),
      rating: json['rating'],
      reviewComment: json['review_comment'],
      reviewedAt: json['reviewed_at'] != null ? DateTime.parse(json['reviewed_at']) : null,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  static DeliveryOrderType _parseOrderType(String? type) {
    switch (type) {
      case 'fuel':
        return DeliveryOrderType.fuel;
      case 'auto_parts':
        return DeliveryOrderType.autoParts;
      default:
        return DeliveryOrderType.fuel;
    }
  }

  static DeliveryOrderStatus _parseStatus(String? status) {
    switch (status) {
      case 'pending':
        return DeliveryOrderStatus.pending;
      case 'accepted':
        return DeliveryOrderStatus.accepted;
      case 'picked_up':
        return DeliveryOrderStatus.pickedUp;
      case 'in_transit':
        return DeliveryOrderStatus.inTransit;
      case 'delivered':
        return DeliveryOrderStatus.delivered;
      case 'cancelled':
        return DeliveryOrderStatus.cancelled;
      case 'failed':
        return DeliveryOrderStatus.failed;
      default:
        return DeliveryOrderStatus.pending;
    }
  }

  static PaymentStatus _parsePaymentStatus(String? status) {
    switch (status) {
      case 'pending':
        return PaymentStatus.pending;
      case 'paid':
        return PaymentStatus.paid;
      case 'refunded':
        return PaymentStatus.refunded;
      case 'failed':
        return PaymentStatus.failed;
      default:
        return PaymentStatus.pending;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'order_type': orderType.toString().split('.').last,
      'store_id': storeId,
      'store_name': storeName,
      'customer_id': customerId,
      'motoboy_id': motoboyId,
      'motoboy_name': motoboyName,
      'pickup_address': pickupAddress,
      'pickup_latitude': pickupLatitude,
      'pickup_longitude': pickupLongitude,
      'delivery_address': deliveryAddress,
      'delivery_latitude': deliveryLatitude,
      'delivery_longitude': deliveryLongitude,
      'items': items.map((item) => item.toJson()).toList(),
      'items_total': itemsTotal,
      'items_count': itemsCount,
      'delivery_fee': deliveryFee,
      'platform_fee': platformFee,
      'motoboy_fee': motoboyFee,
      'total_amount': totalAmount,
      'status': status.toString().split('.').last,
      'accepted_at': acceptedAt?.toIso8601String(),
      'picked_up_at': pickedUpAt?.toIso8601String(),
      'in_transit_at': inTransitAt?.toIso8601String(),
      'delivered_at': deliveredAt?.toIso8601String(),
      'estimated_time_minutes': estimatedTimeMinutes,
      'actual_time_minutes': actualTimeMinutes,
      'customer_notes': customerNotes,
      'motoboy_notes': motoboyNotes,
      'cancellation_reason': cancellationReason,
      'payment_status': paymentStatus.toString().split('.').last,
      'tracking_history': trackingHistory?.map((point) => point.toJson()).toList(),
      'distance_km': distanceKm,
      'rating': rating,
      'review_comment': reviewComment,
      'reviewed_at': reviewedAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  @override
  String toString() {
    return 'DeliveryOrder(id: $id, storeName: $storeName, status: $status, totalAmount: $totalAmount)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is DeliveryOrder && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

class OrderItem {
  final String productId;
  final String name;
  final double price;
  final int quantity;
  final double total;

  OrderItem({
    required this.productId,
    required this.name,
    required this.price,
    required this.quantity,
    required this.total,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    return OrderItem(
      productId: json['product_id']?.toString() ?? '',
      name: json['name'] ?? '',
      price: (json['price'] ?? 0.0).toDouble(),
      quantity: json['quantity'] ?? 0,
      total: (json['total'] ?? 0.0).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'product_id': productId,
      'name': name,
      'price': price,
      'quantity': quantity,
      'total': total,
    };
  }
}

class TrackingPoint {
  final DateTime timestamp;
  final double latitude;
  final double longitude;
  final String? status;

  TrackingPoint({
    required this.timestamp,
    required this.latitude,
    required this.longitude,
    this.status,
  });

  factory TrackingPoint.fromJson(Map<String, dynamic> json) {
    return TrackingPoint(
      timestamp: DateTime.parse(json['timestamp']),
      latitude: (json['latitude'] ?? 0.0).toDouble(),
      longitude: (json['longitude'] ?? 0.0).toDouble(),
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'timestamp': timestamp.toIso8601String(),
      'latitude': latitude,
      'longitude': longitude,
      'status': status,
    };
  }
}

enum DeliveryOrderType {
  fuel,
  autoParts,
}

enum DeliveryOrderStatus {
  pending,
  accepted,
  pickedUp,
  inTransit,
  delivered,
  cancelled,
  failed,
}

enum PaymentStatus {
  pending,
  paid,
  refunded,
  failed,
}

extension DeliveryOrderStatusExtension on DeliveryOrderStatus {
  String get displayName {
    switch (this) {
      case DeliveryOrderStatus.pending:
        return 'Pendente';
      case DeliveryOrderStatus.accepted:
        return 'Aceito';
      case DeliveryOrderStatus.pickedUp:
        return 'Coletado';
      case DeliveryOrderStatus.inTransit:
        return 'Em Trânsito';
      case DeliveryOrderStatus.delivered:
        return 'Entregue';
      case DeliveryOrderStatus.cancelled:
        return 'Cancelado';
      case DeliveryOrderStatus.failed:
        return 'Falhou';
    }
  }

  String get description {
    switch (this) {
      case DeliveryOrderStatus.pending:
        return 'Aguardando motoboy';
      case DeliveryOrderStatus.accepted:
        return 'Motoboy a caminho da loja';
      case DeliveryOrderStatus.pickedUp:
        return 'Produto coletado';
      case DeliveryOrderStatus.inTransit:
        return 'A caminho do destino';
      case DeliveryOrderStatus.delivered:
        return 'Entregue com sucesso';
      case DeliveryOrderStatus.cancelled:
        return 'Pedido cancelado';
      case DeliveryOrderStatus.failed:
        return 'Falha na entrega';
    }
  }

  bool get isActive => this == DeliveryOrderStatus.pending || this == DeliveryOrderStatus.accepted || this == DeliveryOrderStatus.pickedUp || this == DeliveryOrderStatus.inTransit;
  bool get isCompleted => this == DeliveryOrderStatus.delivered;
  bool get isCancelled => this == DeliveryOrderStatus.cancelled || this == DeliveryOrderStatus.failed;
}

extension DeliveryOrderTypeExtension on DeliveryOrderType {
  String get displayName {
    switch (this) {
      case DeliveryOrderType.fuel:
        return 'Combustível';
      case DeliveryOrderType.autoParts:
        return 'Auto Peças';
    }
  }

  String get icon {
    switch (this) {
      case DeliveryOrderType.fuel:
        return '⛽';
      case DeliveryOrderType.autoParts:
        return '🔧';
    }
  }
}

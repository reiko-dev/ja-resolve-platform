import 'dart:convert';

class Subscription {
  final String id;
  final String partnerId;
  final String partnerName;
  final SubscriptionType type;
  final SubscriptionStatus status;
  final double monthlyFee;
  final DateTime startDate;
  final DateTime endDate;
  final DateTime? dueDate;
  final DateTime? cancelledAt;
  final String? cancellationReason;
  final bool autoRenew;
  final String? paymentMethod;
  final DateTime? lastPaymentAt;
  final double? lastPaymentAmount;
  final int? failedPaymentAttempts;
  final DateTime? nextBillingDate;
  final Map<String, dynamic>? features;
  final DateTime createdAt;
  final DateTime updatedAt;

  Subscription({
    required this.id,
    required this.partnerId,
    required this.partnerName,
    required this.type,
    required this.status,
    required this.monthlyFee,
    required this.startDate,
    required this.endDate,
    this.dueDate,
    this.cancelledAt,
    this.cancellationReason,
    required this.autoRenew,
    this.paymentMethod,
    this.lastPaymentAt,
    this.lastPaymentAmount,
    this.failedPaymentAttempts,
    this.nextBillingDate,
    this.features,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) {
    // Parse features
    Map<String, dynamic>? features;
    if (json['features'] != null) {
      if (json['features'] is String) {
        features = jsonDecode(json['features']);
      } else {
        features = json['features'] as Map<String, dynamic>;
      }
    }

    return Subscription(
      id: json['id']?.toString() ?? '',
      partnerId: json['partner_id']?.toString() ?? '',
      partnerName: json['partner_name'] ?? '',
      type: _parseType(json['type']),
      status: _parseStatus(json['status']),
      monthlyFee: (json['monthly_fee'] ?? 0.0).toDouble(),
      startDate: DateTime.parse(json['start_date']),
      endDate: DateTime.parse(json['end_date']),
      dueDate: json['due_date'] != null ? DateTime.parse(json['due_date']) : null,
      cancelledAt: json['cancelled_at'] != null ? DateTime.parse(json['cancelled_at']) : null,
      cancellationReason: json['cancellation_reason'],
      autoRenew: json['auto_renew'] ?? false,
      paymentMethod: json['payment_method'],
      lastPaymentAt: json['last_payment_at'] != null ? DateTime.parse(json['last_payment_at']) : null,
      lastPaymentAmount: json['last_payment_amount']?.toDouble(),
      failedPaymentAttempts: json['failed_payment_attempts'],
      nextBillingDate: json['next_billing_date'] != null ? DateTime.parse(json['next_billing_date']) : null,
      features: features,
      createdAt: DateTime.parse(json['created_at']),
      updatedAt: DateTime.parse(json['updated_at']),
    );
  }

  static SubscriptionType _parseType(String? type) {
    switch (type) {
      case 'mechanic':
        return SubscriptionType.mechanic;
      case 'gas_station':
        return SubscriptionType.gasStation;
      case 'auto_parts':
        return SubscriptionType.autoParts;
      default:
        return SubscriptionType.mechanic;
    }
  }

  static SubscriptionStatus _parseStatus(String? status) {
    switch (status) {
      case 'active':
        return SubscriptionStatus.active;
      case 'expired':
        return SubscriptionStatus.expired;
      case 'cancelled':
        return SubscriptionStatus.cancelled;
      case 'pending_payment':
        return SubscriptionStatus.pendingPayment;
      case 'suspended':
        return SubscriptionStatus.suspended;
      default:
        return SubscriptionStatus.expired;
    }
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'partner_id': partnerId,
      'partner_name': partnerName,
      'type': type.toString().split('.').last,
      'status': status.toString().split('.').last,
      'monthly_fee': monthlyFee,
      'start_date': startDate.toIso8601String(),
      'end_date': endDate.toIso8601String(),
      'due_date': dueDate?.toIso8601String(),
      'cancelled_at': cancelledAt?.toIso8601String(),
      'cancellation_reason': cancellationReason,
      'auto_renew': autoRenew,
      'payment_method': paymentMethod,
      'last_payment_at': lastPaymentAt?.toIso8601String(),
      'last_payment_amount': lastPaymentAmount?.toString(),
      'failed_payment_attempts': failedPaymentAttempts,
      'next_billing_date': nextBillingDate?.toIso8601String(),
      'features': features,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  Subscription copyWith({
    String? id,
    String? partnerId,
    String? partnerName,
    SubscriptionType? type,
    SubscriptionStatus? status,
    double? monthlyFee,
    DateTime? startDate,
    DateTime? endDate,
    DateTime? dueDate,
    DateTime? cancelledAt,
    String? cancellationReason,
    bool? autoRenew,
    String? paymentMethod,
    DateTime? lastPaymentAt,
    double? lastPaymentAmount,
    int? failedPaymentAttempts,
    DateTime? nextBillingDate,
    Map<String, dynamic>? features,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return Subscription(
      id: id ?? this.id,
      partnerId: partnerId ?? this.partnerId,
      partnerName: partnerName ?? this.partnerName,
      type: type ?? this.type,
      status: status ?? this.status,
      monthlyFee: monthlyFee ?? this.monthlyFee,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      dueDate: dueDate ?? this.dueDate,
      cancelledAt: cancelledAt ?? this.cancelledAt,
      cancellationReason: cancellationReason ?? this.cancellationReason,
      autoRenew: autoRenew ?? this.autoRenew,
      paymentMethod: paymentMethod ?? this.paymentMethod,
      lastPaymentAt: lastPaymentAt ?? this.lastPaymentAt,
      lastPaymentAmount: lastPaymentAmount ?? this.lastPaymentAmount,
      failedPaymentAttempts: failedPaymentAttempts ?? this.failedPaymentAttempts,
      nextBillingDate: nextBillingDate ?? this.nextBillingDate,
      features: features ?? this.features,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  @override
  String toString() {
    return 'Subscription(id: $id, partnerName: $partnerName, type: $type, status: $status)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is Subscription && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;

  // Getters úteis
  bool get isActive => status == SubscriptionStatus.active;
  bool get isExpired => status == SubscriptionStatus.expired;
  bool get isCancelled => status == SubscriptionStatus.cancelled;
  bool get isPendingPayment => status == SubscriptionStatus.pendingPayment;
  bool get isSuspended => status == SubscriptionStatus.suspended;
  
  bool get isExpiringSoon {
    if (!isActive || dueDate == null) return false;
    final daysUntilExpiry = dueDate!.difference(DateTime.now()).inDays;
    return daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
  }

  String get formattedMonthlyFee => 'R\$ ${monthlyFee.toStringAsFixed(2).replaceAll('.', ',')}';
  
  String get daysUntilExpiry {
    if (dueDate == null) return '';
    final days = dueDate!.difference(DateTime.now()).inDays;
    if (days < 0) return 'Expirou há ${-days} dias';
    if (days == 0) return 'Expira hoje';
    if (days == 1) return 'Expira amanhã';
    return 'Expira em $days dias';
  }

  String get nextBillingText {
    if (nextBillingDate == null) return '';
    final days = nextBillingDate!.difference(DateTime.now()).inDays;
    if (days <= 0) return 'Cobrança pendente';
    if (days == 1) return 'Cobrança amanhã';
    return 'Próxima cobrança em $days dias';
  }
}

enum SubscriptionType {
  mechanic,
  gasStation,
  autoParts,
  towTruck,
  delivery,
}

enum SubscriptionStatus {
  active,
  expired,
  cancelled,
  pendingPayment,
  suspended,
}

extension SubscriptionTypeExtension on SubscriptionType {
  String get displayName {
    switch (this) {
      case SubscriptionType.mechanic:
        return 'Mecânico';
      case SubscriptionType.gasStation:
        return 'Posto de Combustível';
      case SubscriptionType.autoParts:
        return 'Auto Peças';
      case SubscriptionType.towTruck:
        return 'Guincho';
      case SubscriptionType.delivery:
        return 'Motoboy';
    }
  }

  String get description {
    switch (this) {
      case SubscriptionType.mechanic:
        return 'Receba solicitações de serviços mecânicos';
      case SubscriptionType.gasStation:
        return 'Venda combustível e produtos';
      case SubscriptionType.autoParts:
        return 'Monte sua loja de peças online';
      case SubscriptionType.towTruck:
        return 'Ofereça serviços de reboque';
      case SubscriptionType.delivery:
        return 'Faça entregas rápidas';
    }
  }

  String get icon {
    switch (this) {
      case SubscriptionType.mechanic:
        return '🔧';
      case SubscriptionType.gasStation:
        return '⛽';
      case SubscriptionType.autoParts:
        return '🔩';
      case SubscriptionType.towTruck:
        return '🚗';
      case SubscriptionType.delivery:
        return '🏍️';
    }
  }

  List<String> get features {
    switch (this) {
      case SubscriptionType.mechanic:
        return [
          'Recebimento de solicitações de emergência',
          'Perfil destacado no app',
          'Sem comissão por serviço',
          'Suporte prioritário',
        ];
      case SubscriptionType.gasStation:
        return [
          'Catálogo de produtos no app',
          'Sistema de delivery integrado',
          'Gestão de estoque',
          'Relatórios de vendas',
        ];
      case SubscriptionType.autoParts:
        return [
          'Catálogo de peças no app',
          'Sistema de delivery integrado',
          'Gestão de estoque',
          'Busca por peças compatíveis',
        ];
      case SubscriptionType.towTruck:
        return [
          'Receba solicitações de emergência',
          'Envie propostas aos clientes',
          'Pagamentos seguros',
          'Roteirização inteligente',
        ];
      case SubscriptionType.delivery:
        return [
          'Receba pedidos de entrega',
          'Otimize suas rotas',
          'Pagamentos instantâneos',
          'Flexibilidade de horários',
        ];
    }
  }
}

extension SubscriptionStatusExtension on SubscriptionStatus {
  String get displayName {
    switch (this) {
      case SubscriptionStatus.active:
        return 'Ativa';
      case SubscriptionStatus.expired:
        return 'Expirada';
      case SubscriptionStatus.cancelled:
        return 'Cancelada';
      case SubscriptionStatus.pendingPayment:
        return 'Pagamento Pendente';
      case SubscriptionStatus.suspended:
        return 'Suspensa';
    }
  }

  String get description {
    switch (this) {
      case SubscriptionStatus.active:
        return 'Assinatura em vigor';
      case SubscriptionStatus.expired:
        return 'Assinatura expirou';
      case SubscriptionStatus.cancelled:
        return 'Assinatura cancelada';
      case SubscriptionStatus.pendingPayment:
        return 'Aguardando pagamento';
      case SubscriptionStatus.suspended:
        return 'Assinatura suspensa';
    }
  }

  String get color {
    switch (this) {
      case SubscriptionStatus.active:
        return '#4CAF50'; // Verde
      case SubscriptionStatus.expired:
        return '#F44336'; // Vermelho
      case SubscriptionStatus.cancelled:
        return '#9E9E9E'; // Cinza
      case SubscriptionStatus.pendingPayment:
        return '#FF9800'; // Laranja
      case SubscriptionStatus.suspended:
        return '#FF5722'; // Vermelho escuro
    }
  }

  bool get isActiveStatus => this == SubscriptionStatus.active;
  bool get isProblemStatus => this == SubscriptionStatus.expired || this == SubscriptionStatus.cancelled || this == SubscriptionStatus.suspended;
  bool get needsAttention => this == SubscriptionStatus.pendingPayment || this == SubscriptionStatus.suspended;
}

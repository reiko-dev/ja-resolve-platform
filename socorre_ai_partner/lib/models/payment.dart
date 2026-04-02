class Payment {
  final String id;
  final String orderId;
  final String partnerId;
  final String clientId;
  final double amount;
  final String currency;
  final PaymentStatus status;
  final PaymentMethod method;
  final String? transactionId;
  final String? gatewayResponse;
  final DateTime createdAt;
  final DateTime? processedAt;
  final Map<String, dynamic>? metadata;
  final String? description;
  final double? fee;
  final double? netAmount;

  Payment({
    required this.id,
    required this.orderId,
    required this.partnerId,
    required this.clientId,
    required this.amount,
    required this.currency,
    required this.status,
    required this.method,
    this.transactionId,
    this.gatewayResponse,
    required this.createdAt,
    this.processedAt,
    this.metadata,
    this.description,
    this.fee,
    this.netAmount,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      id: json['id'] ?? '',
      orderId: json['order_id'] ?? '',
      partnerId: json['partner_id'] ?? '',
      clientId: json['client_id'] ?? '',
      amount: (json['amount'] ?? 0.0).toDouble(),
      currency: json['currency'] ?? 'BRL',
      status: PaymentStatus.fromString(json['status'] ?? 'pending'),
      method: PaymentMethod.fromString(json['method'] ?? 'credit_card'),
      transactionId: json['transaction_id'],
      gatewayResponse: json['gateway_response'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      processedAt: json['processed_at'] != null 
          ? DateTime.parse(json['processed_at'])
          : null,
      metadata: json['metadata'],
      description: json['description'],
      fee: json['fee'] != null ? (json['fee'] as num).toDouble() : null,
      netAmount: json['net_amount'] != null ? (json['net_amount'] as num).toDouble() : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'order_id': orderId,
      'partner_id': partnerId,
      'client_id': clientId,
      'amount': amount,
      'currency': currency,
      'status': status.toString(),
      'method': method.toString(),
      'transaction_id': transactionId,
      'gateway_response': gatewayResponse,
      'created_at': createdAt.toIso8601String(),
      'processed_at': processedAt?.toIso8601String(),
      'metadata': metadata,
      'description': description,
      'fee': fee,
      'net_amount': netAmount,
    };
  }

  // Verificar se o pagamento foi processado
  bool get isProcessed {
    return status == PaymentStatus.completed || status == PaymentStatus.failed;
  }

  // Verificar se o pagamento está pendente
  bool get isPending {
    return status == PaymentStatus.pending || status == PaymentStatus.processing;
  }

  // Obter valor formatado
  String get formattedAmount {
    return 'R\$ ${amount.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter valor líquido formatado
  String get formattedNetAmount {
    if (netAmount == null) return formattedAmount;
    return 'R\$ ${netAmount!.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter taxa formatada
  String get formattedFee {
    if (fee == null) return 'R\$ 0,00';
    return 'R\$ ${fee!.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter tempo decorrido
  String get timeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);

    if (difference.inDays > 0) {
      return '${difference.inDays} dia${difference.inDays > 1 ? 's' : ''} atrás';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hora${difference.inHours > 1 ? 's' : ''} atrás';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minuto${difference.inMinutes > 1 ? 's' : ''} atrás';
    } else {
      return 'Agora mesmo';
    }
  }

  // Obter cor do status
  String get statusColor {
    switch (status) {
      case PaymentStatus.pending:
        return '#FFD93D';
      case PaymentStatus.processing:
        return '#2B6CB0';
      case PaymentStatus.completed:
        return '#38A169';
      case PaymentStatus.failed:
        return '#E53E3E';
      case PaymentStatus.cancelled:
        return '#718096';
      case PaymentStatus.refunded:
        return '#805AD5';
    }
  }

  // Obter ícone do status
  String get statusIcon {
    switch (status) {
      case PaymentStatus.pending:
        return '⏳';
      case PaymentStatus.processing:
        return '🔄';
      case PaymentStatus.completed:
        return '✅';
      case PaymentStatus.failed:
        return '❌';
      case PaymentStatus.cancelled:
        return '🚫';
      case PaymentStatus.refunded:
        return '↩️';
    }
  }
}

enum PaymentStatus {
  pending,
  processing,
  completed,
  failed,
  cancelled,
  refunded;

  static PaymentStatus fromString(String status) {
    switch (status.toLowerCase()) {
      case 'pending':
        return PaymentStatus.pending;
      case 'processing':
        return PaymentStatus.processing;
      case 'completed':
        return PaymentStatus.completed;
      case 'failed':
        return PaymentStatus.failed;
      case 'cancelled':
        return PaymentStatus.cancelled;
      case 'refunded':
        return PaymentStatus.refunded;
      default:
        return PaymentStatus.pending;
    }
  }

  @override
  String toString() {
    switch (this) {
      case PaymentStatus.pending:
        return 'pending';
      case PaymentStatus.processing:
        return 'processing';
      case PaymentStatus.completed:
        return 'completed';
      case PaymentStatus.failed:
        return 'failed';
      case PaymentStatus.cancelled:
        return 'cancelled';
      case PaymentStatus.refunded:
        return 'refunded';
    }
  }

  // Obter texto do status
  String get displayText {
    switch (this) {
      case PaymentStatus.pending:
        return 'Pendente';
      case PaymentStatus.processing:
        return 'Processando';
      case PaymentStatus.completed:
        return 'Concluído';
      case PaymentStatus.failed:
        return 'Falhou';
      case PaymentStatus.cancelled:
        return 'Cancelado';
      case PaymentStatus.refunded:
        return 'Reembolsado';
    }
  }
}

enum PaymentMethod {
  creditCard,
  debitCard,
  pix,
  boleto,
  cash,
  bankTransfer;

  static PaymentMethod fromString(String method) {
    switch (method.toLowerCase()) {
      case 'credit_card':
        return PaymentMethod.creditCard;
      case 'debit_card':
        return PaymentMethod.debitCard;
      case 'pix':
        return PaymentMethod.pix;
      case 'boleto':
        return PaymentMethod.boleto;
      case 'cash':
        return PaymentMethod.cash;
      case 'bank_transfer':
        return PaymentMethod.bankTransfer;
      default:
        return PaymentMethod.creditCard;
    }
  }

  @override
  String toString() {
    switch (this) {
      case PaymentMethod.creditCard:
        return 'credit_card';
      case PaymentMethod.debitCard:
        return 'debit_card';
      case PaymentMethod.pix:
        return 'pix';
      case PaymentMethod.boleto:
        return 'boleto';
      case PaymentMethod.cash:
        return 'cash';
      case PaymentMethod.bankTransfer:
        return 'bank_transfer';
    }
  }

  // Obter texto do método
  String get displayText {
    switch (this) {
      case PaymentMethod.creditCard:
        return 'Cartão de Crédito';
      case PaymentMethod.debitCard:
        return 'Cartão de Débito';
      case PaymentMethod.pix:
        return 'PIX';
      case PaymentMethod.boleto:
        return 'Boleto';
      case PaymentMethod.cash:
        return 'Dinheiro';
      case PaymentMethod.bankTransfer:
        return 'Transferência Bancária';
    }
  }

  // Obter ícone do método
  String get icon {
    switch (this) {
      case PaymentMethod.creditCard:
        return '💳';
      case PaymentMethod.debitCard:
        return '💳';
      case PaymentMethod.pix:
        return '📱';
      case PaymentMethod.boleto:
        return '📄';
      case PaymentMethod.cash:
        return '💵';
      case PaymentMethod.bankTransfer:
        return '🏦';
    }
  }
}

class PaymentSummary {
  final double totalAmount;
  final double totalFees;
  final double netAmount;
  final int totalPayments;
  final int completedPayments;
  final int pendingPayments;
  final int failedPayments;
  final Map<PaymentMethod, double> methodBreakdown;
  final Map<PaymentStatus, int> statusBreakdown;

  PaymentSummary({
    required this.totalAmount,
    required this.totalFees,
    required this.netAmount,
    required this.totalPayments,
    required this.completedPayments,
    required this.pendingPayments,
    required this.failedPayments,
    required this.methodBreakdown,
    required this.statusBreakdown,
  });

  factory PaymentSummary.fromJson(Map<String, dynamic> json) {
    return PaymentSummary(
      totalAmount: (json['total_amount'] ?? 0.0).toDouble(),
      totalFees: (json['total_fees'] ?? 0.0).toDouble(),
      netAmount: (json['net_amount'] ?? 0.0).toDouble(),
      totalPayments: json['total_payments'] ?? 0,
      completedPayments: json['completed_payments'] ?? 0,
      pendingPayments: json['pending_payments'] ?? 0,
      failedPayments: json['failed_payments'] ?? 0,
      methodBreakdown: Map<PaymentMethod, double>.from(
        (json['method_breakdown'] ?? {}).map(
          (key, value) => MapEntry(
            PaymentMethod.fromString(key),
            (value as num).toDouble(),
          ),
        ),
      ),
      statusBreakdown: Map<PaymentStatus, int>.from(
        (json['status_breakdown'] ?? {}).map(
          (key, value) => MapEntry(
            PaymentStatus.fromString(key),
            value as int,
          ),
        ),
      ),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'total_amount': totalAmount,
      'total_fees': totalFees,
      'net_amount': netAmount,
      'total_payments': totalPayments,
      'completed_payments': completedPayments,
      'pending_payments': pendingPayments,
      'failed_payments': failedPayments,
      'method_breakdown': methodBreakdown.map(
        (key, value) => MapEntry(key.toString(), value),
      ),
      'status_breakdown': statusBreakdown.map(
        (key, value) => MapEntry(key.toString(), value),
      ),
    };
  }

  // Obter taxa de sucesso
  double get successRate {
    if (totalPayments == 0) return 0.0;
    return (completedPayments / totalPayments) * 100;
  }

  // Obter valor formatado
  String get formattedTotalAmount {
    return 'R\$ ${totalAmount.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter valor líquido formatado
  String get formattedNetAmount {
    return 'R\$ ${netAmount.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter taxa total formatada
  String get formattedTotalFees {
    return 'R\$ ${totalFees.toStringAsFixed(2).replaceAll('.', ',')}';
  }
}

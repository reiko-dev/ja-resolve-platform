class AnalyticsData {
  final String id;
  final String partnerId;
  final DateTime date;
  final String metric;
  final double value;
  final Map<String, dynamic>? metadata;
  final String? category;
  final String? subcategory;

  AnalyticsData({
    required this.id,
    required this.partnerId,
    required this.date,
    required this.metric,
    required this.value,
    this.metadata,
    this.category,
    this.subcategory,
  });

  factory AnalyticsData.fromJson(Map<String, dynamic> json) {
    return AnalyticsData(
      id: json['id'] ?? '',
      partnerId: json['partner_id'] ?? '',
      date: DateTime.parse(json['date'] ?? DateTime.now().toIso8601String()),
      metric: json['metric'] ?? '',
      value: (json['value'] ?? 0.0).toDouble(),
      metadata: json['metadata'],
      category: json['category'],
      subcategory: json['subcategory'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'partner_id': partnerId,
      'date': date.toIso8601String(),
      'metric': metric,
      'value': value,
      'metadata': metadata,
      'category': category,
      'subcategory': subcategory,
    };
  }
}

class AnalyticsSummary {
  final double totalRevenue;
  final double totalOrders;
  final double averageOrderValue;
  final double totalCustomers;
  final double newCustomers;
  final double returningCustomers;
  final double customerRetentionRate;
  final double averageRating;
  final double totalReviews;
  final double responseTime;
  final double completionRate;
  final double cancellationRate;
  final Map<String, double> revenueByService;
  final Map<String, double> ordersByService;
  final Map<String, double> revenueByPeriod;
  final Map<String, double> ordersByPeriod;
  final List<AnalyticsData> topServices;
  final List<AnalyticsData> topCustomers;
  final List<AnalyticsData> recentActivity;

  AnalyticsSummary({
    required this.totalRevenue,
    required this.totalOrders,
    required this.averageOrderValue,
    required this.totalCustomers,
    required this.newCustomers,
    required this.returningCustomers,
    required this.customerRetentionRate,
    required this.averageRating,
    required this.totalReviews,
    required this.responseTime,
    required this.completionRate,
    required this.cancellationRate,
    required this.revenueByService,
    required this.ordersByService,
    required this.revenueByPeriod,
    required this.ordersByPeriod,
    required this.topServices,
    required this.topCustomers,
    required this.recentActivity,
  });

  factory AnalyticsSummary.fromJson(Map<String, dynamic> json) {
    return AnalyticsSummary(
      totalRevenue: (json['total_revenue'] ?? 0.0).toDouble(),
      totalOrders: (json['total_orders'] ?? 0.0).toDouble(),
      averageOrderValue: (json['average_order_value'] ?? 0.0).toDouble(),
      totalCustomers: (json['total_customers'] ?? 0.0).toDouble(),
      newCustomers: (json['new_customers'] ?? 0.0).toDouble(),
      returningCustomers: (json['returning_customers'] ?? 0.0).toDouble(),
      customerRetentionRate: (json['customer_retention_rate'] ?? 0.0).toDouble(),
      averageRating: (json['average_rating'] ?? 0.0).toDouble(),
      totalReviews: (json['total_reviews'] ?? 0.0).toDouble(),
      responseTime: (json['response_time'] ?? 0.0).toDouble(),
      completionRate: (json['completion_rate'] ?? 0.0).toDouble(),
      cancellationRate: (json['cancellation_rate'] ?? 0.0).toDouble(),
      revenueByService: Map<String, double>.from(json['revenue_by_service'] ?? {}),
      ordersByService: Map<String, double>.from(json['orders_by_service'] ?? {}),
      revenueByPeriod: Map<String, double>.from(json['revenue_by_period'] ?? {}),
      ordersByPeriod: Map<String, double>.from(json['orders_by_period'] ?? {}),
      topServices: (json['top_services'] as List?)
          ?.map((item) => AnalyticsData.fromJson(item))
          .toList() ?? [],
      topCustomers: (json['top_customers'] as List?)
          ?.map((item) => AnalyticsData.fromJson(item))
          .toList() ?? [],
      recentActivity: (json['recent_activity'] as List?)
          ?.map((item) => AnalyticsData.fromJson(item))
          .toList() ?? [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'total_revenue': totalRevenue,
      'total_orders': totalOrders,
      'average_order_value': averageOrderValue,
      'total_customers': totalCustomers,
      'new_customers': newCustomers,
      'returning_customers': returningCustomers,
      'customer_retention_rate': customerRetentionRate,
      'average_rating': averageRating,
      'total_reviews': totalReviews,
      'response_time': responseTime,
      'completion_rate': completionRate,
      'cancellation_rate': cancellationRate,
      'revenue_by_service': revenueByService,
      'orders_by_service': ordersByService,
      'revenue_by_period': revenueByPeriod,
      'orders_by_period': ordersByPeriod,
      'top_services': topServices.map((item) => item.toJson()).toList(),
      'top_customers': topCustomers.map((item) => item.toJson()).toList(),
      'recent_activity': recentActivity.map((item) => item.toJson()).toList(),
    };
  }

  // Obter valor formatado
  String get formattedTotalRevenue {
    return 'R\$ ${totalRevenue.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter valor médio formatado
  String get formattedAverageOrderValue {
    return 'R\$ ${averageOrderValue.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  // Obter taxa de retenção formatada
  String get formattedRetentionRate {
    return '${customerRetentionRate.toStringAsFixed(1)}%';
  }

  // Obter tempo de resposta formatado
  String get formattedResponseTime {
    if (responseTime < 60) {
      return '${responseTime.toStringAsFixed(0)}s';
    } else if (responseTime < 3600) {
      return '${(responseTime / 60).toStringAsFixed(0)}min';
    } else {
      return '${(responseTime / 3600).toStringAsFixed(1)}h';
    }
  }

  // Obter taxa de conclusão formatada
  String get formattedCompletionRate {
    return '${completionRate.toStringAsFixed(1)}%';
  }

  // Obter taxa de cancelamento formatada
  String get formattedCancellationRate {
    return '${cancellationRate.toStringAsFixed(1)}%';
  }
}

class AnalyticsChart {
  final String title;
  final String type;
  final List<AnalyticsDataPoint> data;
  final String? xAxisLabel;
  final String? yAxisLabel;
  final Map<String, dynamic>? options;

  AnalyticsChart({
    required this.title,
    required this.type,
    required this.data,
    this.xAxisLabel,
    this.yAxisLabel,
    this.options,
  });

  factory AnalyticsChart.fromJson(Map<String, dynamic> json) {
    return AnalyticsChart(
      title: json['title'] ?? '',
      type: json['type'] ?? 'line',
      data: (json['data'] as List?)
          ?.map((item) => AnalyticsDataPoint.fromJson(item))
          .toList() ?? [],
      xAxisLabel: json['x_axis_label'],
      yAxisLabel: json['y_axis_label'],
      options: json['options'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'title': title,
      'type': type,
      'data': data.map((item) => item.toJson()).toList(),
      'x_axis_label': xAxisLabel,
      'y_axis_label': yAxisLabel,
      'options': options,
    };
  }
}

class AnalyticsDataPoint {
  final String label;
  final double value;
  final String? color;
  final Map<String, dynamic>? metadata;

  AnalyticsDataPoint({
    required this.label,
    required this.value,
    this.color,
    this.metadata,
  });

  factory AnalyticsDataPoint.fromJson(Map<String, dynamic> json) {
    return AnalyticsDataPoint(
      label: json['label'] ?? '',
      value: (json['value'] ?? 0.0).toDouble(),
      color: json['color'],
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'label': label,
      'value': value,
      'color': color,
      'metadata': metadata,
    };
  }
}

class AnalyticsReport {
  final String id;
  final String title;
  final String description;
  final DateTime generatedAt;
  final DateTime periodStart;
  final DateTime periodEnd;
  final AnalyticsSummary summary;
  final List<AnalyticsChart> charts;
  final Map<String, dynamic>? metadata;

  AnalyticsReport({
    required this.id,
    required this.title,
    required this.description,
    required this.generatedAt,
    required this.periodStart,
    required this.periodEnd,
    required this.summary,
    required this.charts,
    this.metadata,
  });

  factory AnalyticsReport.fromJson(Map<String, dynamic> json) {
    return AnalyticsReport(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      generatedAt: DateTime.parse(json['generated_at'] ?? DateTime.now().toIso8601String()),
      periodStart: DateTime.parse(json['period_start'] ?? DateTime.now().toIso8601String()),
      periodEnd: DateTime.parse(json['period_end'] ?? DateTime.now().toIso8601String()),
      summary: AnalyticsSummary.fromJson(json['summary'] ?? {}),
      charts: (json['charts'] as List?)
          ?.map((item) => AnalyticsChart.fromJson(item))
          .toList() ?? [],
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'generated_at': generatedAt.toIso8601String(),
      'period_start': periodStart.toIso8601String(),
      'period_end': periodEnd.toIso8601String(),
      'summary': summary.toJson(),
      'charts': charts.map((item) => item.toJson()).toList(),
      'metadata': metadata,
    };
  }

  // Obter período formatado
  String get formattedPeriod {
    final start = '${periodStart.day}/${periodStart.month}/${periodStart.year}';
    final end = '${periodEnd.day}/${periodEnd.month}/${periodEnd.year}';
    return '$start - $end';
  }

  // Obter data de geração formatada
  String get formattedGeneratedAt {
    return '${generatedAt.day}/${generatedAt.month}/${generatedAt.year} às ${generatedAt.hour}:${generatedAt.minute.toString().padLeft(2, '0')}';
  }
}

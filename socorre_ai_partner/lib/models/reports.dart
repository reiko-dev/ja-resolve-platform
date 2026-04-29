import 'package:flutter/material.dart';

class Report {
  final String id;
  final String userId;
  final String title;
  final String description;
  final String type;
  final String category;
  final DateTime periodStart;
  final DateTime periodEnd;
  final String status;
  final String? filePath;
  final String? fileSize;
  final String format;
  final Map<String, dynamic>? parameters;
  final Map<String, dynamic>? data;
  final List<String>? charts;
  final List<String>? filters;
  final DateTime createdAt;
  final DateTime? generatedAt;
  final DateTime? expiresAt;
  final Map<String, dynamic>? metadata;

  Report({
    required this.id,
    required this.userId,
    required this.title,
    required this.description,
    required this.type,
    required this.category,
    required this.periodStart,
    required this.periodEnd,
    required this.status,
    this.filePath,
    this.fileSize,
    this.format = 'pdf',
    this.parameters,
    this.data,
    this.charts,
    this.filters,
    required this.createdAt,
    this.generatedAt,
    this.expiresAt,
    this.metadata,
  });

  factory Report.fromJson(Map<String, dynamic> json) {
    return Report(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      type: json['type'] ?? '',
      category: json['category'] ?? '',
      periodStart: DateTime.parse(json['period_start'] ?? DateTime.now().toIso8601String()),
      periodEnd: DateTime.parse(json['period_end'] ?? DateTime.now().toIso8601String()),
      status: json['status'] ?? 'pending',
      filePath: json['file_path'],
      fileSize: json['file_size'],
      format: json['format'] ?? 'pdf',
      parameters: json['parameters'],
      data: json['data'],
      charts: json['charts'] != null 
          ? List<String>.from(json['charts'])
          : null,
      filters: json['filters'] != null 
          ? List<String>.from(json['filters'])
          : null,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      generatedAt: json['generated_at'] != null 
          ? DateTime.parse(json['generated_at'])
          : null,
      expiresAt: json['expires_at'] != null 
          ? DateTime.parse(json['expires_at'])
          : null,
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'title': title,
      'description': description,
      'type': type,
      'category': category,
      'period_start': periodStart.toIso8601String(),
      'period_end': periodEnd.toIso8601String(),
      'status': status,
      'file_path': filePath,
      'file_size': fileSize,
      'format': format,
      'parameters': parameters,
      'data': data,
      'charts': charts,
      'filters': filters,
      'created_at': createdAt.toIso8601String(),
      'generated_at': generatedAt?.toIso8601String(),
      'expires_at': expiresAt?.toIso8601String(),
      'metadata': metadata,
    };
  }

  // Obter cor do status
  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'generating':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'failed':
        return Colors.red;
      case 'expired':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  // Obter texto do status
  String get statusText {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'Pendente';
      case 'generating':
        return 'Gerando';
      case 'completed':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
      case 'expired':
        return 'Expirado';
      default:
        return status;
    }
  }

  // Verificar se está ativo
  bool get isActive => status == 'pending' || status == 'generating';

  // Verificar se foi concluído
  bool get isCompleted => status == 'completed';

  // Verificar se falhou
  bool get isFailed => status == 'failed';

  // Verificar se expirou
  bool get isExpired => status == 'expired';

  // Obter período formatado
  String get formattedPeriod {
    final start = '${periodStart.day}/${periodStart.month}/${periodStart.year}';
    final end = '${periodEnd.day}/${periodEnd.month}/${periodEnd.year}';
    return '$start - $end';
  }

  // Obter tamanho formatado
  String get formattedFileSize {
    if (fileSize == null) return 'N/A';
    
    final size = double.tryParse(fileSize!) ?? 0;
    if (size < 1024) {
      return '${size.toStringAsFixed(0)} B';
    } else if (size < 1024 * 1024) {
      return '${(size / 1024).toStringAsFixed(1)} KB';
    } else if (size < 1024 * 1024 * 1024) {
      return '${(size / (1024 * 1024)).toStringAsFixed(1)} MB';
    } else {
      return '${(size / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
    }
  }

  // Obter tempo desde criação
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
}

class DashboardWidget {
  final String id;
  final String title;
  final String type;
  final String category;
  final Map<String, dynamic>? data;
  final Map<String, dynamic>? options;
  final int position;
  final int size;
  final bool isVisible;
  final DateTime createdAt;
  final DateTime updatedAt;

  DashboardWidget({
    required this.id,
    required this.title,
    required this.type,
    required this.category,
    this.data,
    this.options,
    this.position = 0,
    this.size = 1,
    this.isVisible = true,
    required this.createdAt,
    required this.updatedAt,
  });

  factory DashboardWidget.fromJson(Map<String, dynamic> json) {
    return DashboardWidget(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      type: json['type'] ?? '',
      category: json['category'] ?? '',
      data: json['data'],
      options: json['options'],
      position: json['position'] ?? 0,
      size: json['size'] ?? 1,
      isVisible: json['is_visible'] ?? true,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'type': type,
      'category': category,
      'data': data,
      'options': options,
      'position': position,
      'size': size,
      'is_visible': isVisible,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

class ReportTemplate {
  final String id;
  final String name;
  final String description;
  final String category;
  final String type;
  final Map<String, dynamic>? parameters;
  final Map<String, dynamic>? filters;
  final List<String>? charts;
  final String? icon;
  final bool isPublic;
  final bool isDefault;
  final DateTime createdAt;
  final DateTime updatedAt;

  ReportTemplate({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.type,
    this.parameters,
    this.filters,
    this.charts,
    this.icon,
    this.isPublic = false,
    this.isDefault = false,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ReportTemplate.fromJson(Map<String, dynamic> json) {
    return ReportTemplate(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      category: json['category'] ?? '',
      type: json['type'] ?? '',
      parameters: json['parameters'],
      filters: json['filters'],
      charts: json['charts'] != null 
          ? List<String>.from(json['charts'])
          : null,
      icon: json['icon'],
      isPublic: json['is_public'] ?? false,
      isDefault: json['is_default'] ?? false,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'category': category,
      'type': type,
      'parameters': parameters,
      'filters': filters,
      'charts': charts,
      'icon': icon,
      'is_public': isPublic,
      'is_default': isDefault,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

class ReportCategory {
  final String id;
  final String name;
  final String description;
  final String? icon;
  final String? color;
  final int reportCount;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;

  ReportCategory({
    required this.id,
    required this.name,
    required this.description,
    this.icon,
    this.color,
    this.reportCount = 0,
    this.isActive = true,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ReportCategory.fromJson(Map<String, dynamic> json) {
    return ReportCategory(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      icon: json['icon'],
      color: json['color'],
      reportCount: json['report_count'] ?? 0,
      isActive: json['is_active'] ?? true,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'icon': icon,
      'color': color,
      'report_count': reportCount,
      'is_active': isActive,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }
}

class ExecutiveSummary {
  final String id;
  final String userId;
  final DateTime periodStart;
  final DateTime periodEnd;
  final Map<String, dynamic>? financialMetrics;
  final Map<String, dynamic>? operationalMetrics;
  final Map<String, dynamic>? customerMetrics;
  final Map<String, dynamic>? performanceMetrics;
  final List<String>? keyInsights;
  final List<String>? recommendations;
  final String? executiveNotes;
  final DateTime createdAt;
  final DateTime updatedAt;

  ExecutiveSummary({
    required this.id,
    required this.userId,
    required this.periodStart,
    required this.periodEnd,
    this.financialMetrics,
    this.operationalMetrics,
    this.customerMetrics,
    this.performanceMetrics,
    this.keyInsights,
    this.recommendations,
    this.executiveNotes,
    required this.createdAt,
    required this.updatedAt,
  });

  factory ExecutiveSummary.fromJson(Map<String, dynamic> json) {
    return ExecutiveSummary(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      periodStart: DateTime.parse(json['period_start'] ?? DateTime.now().toIso8601String()),
      periodEnd: DateTime.parse(json['period_end'] ?? DateTime.now().toIso8601String()),
      financialMetrics: json['financial_metrics'],
      operationalMetrics: json['operational_metrics'],
      customerMetrics: json['customer_metrics'],
      performanceMetrics: json['performance_metrics'],
      keyInsights: json['key_insights'] != null 
          ? List<String>.from(json['key_insights'])
          : null,
      recommendations: json['recommendations'] != null 
          ? List<String>.from(json['recommendations'])
          : null,
      executiveNotes: json['executive_notes'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'period_start': periodStart.toIso8601String(),
      'period_end': periodEnd.toIso8601String(),
      'financial_metrics': financialMetrics,
      'operational_metrics': operationalMetrics,
      'customer_metrics': customerMetrics,
      'performance_metrics': performanceMetrics,
      'key_insights': keyInsights,
      'recommendations': recommendations,
      'executive_notes': executiveNotes,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  // Obter período formatado
  String get formattedPeriod {
    final start = '${periodStart.day}/${periodStart.month}/${periodStart.year}';
    final end = '${periodEnd.day}/${periodEnd.month}/${periodEnd.year}';
    return '$start - $end';
  }

  // Getters para facilitar acesso
  String get title => 'Resumo Executivo';
  String get description => 'Visão geral do período';
  double? get totalRevenue => financialMetrics?['totalRevenue']?.toDouble();
}

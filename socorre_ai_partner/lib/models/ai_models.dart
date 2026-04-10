import 'package:flutter/material.dart';

class AIModel {
  final String id;
  final String name;
  final String description;
  final String type;
  final String category;
  final String status;
  final double accuracy;
  final double confidence;
  final Map<String, dynamic>? parameters;
  final Map<String, dynamic>? metrics;
  final List<String>? features;
  final String? modelPath;
  final String? version;
  final DateTime createdAt;
  final DateTime? lastTrained;
  final DateTime? lastUsed;
  final Map<String, dynamic>? metadata;

  AIModel({
    required this.id,
    required this.name,
    required this.description,
    required this.type,
    required this.category,
    required this.status,
    this.accuracy = 0.0,
    this.confidence = 0.0,
    this.parameters,
    this.metrics,
    this.features,
    this.modelPath,
    this.version,
    required this.createdAt,
    this.lastTrained,
    this.lastUsed,
    this.metadata,
  });

  factory AIModel.fromJson(Map<String, dynamic> json) {
    return AIModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'] ?? '',
      type: json['type'] ?? '',
      category: json['category'] ?? '',
      status: json['status'] ?? 'inactive',
      accuracy: (json['accuracy'] ?? 0.0).toDouble(),
      confidence: (json['confidence'] ?? 0.0).toDouble(),
      parameters: json['parameters'],
      metrics: json['metrics'],
      features: json['features'] != null 
          ? List<String>.from(json['features'])
          : null,
      modelPath: json['model_path'],
      version: json['version'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      lastTrained: json['last_trained'] != null 
          ? DateTime.parse(json['last_trained'])
          : null,
      lastUsed: json['last_used'] != null 
          ? DateTime.parse(json['last_used'])
          : null,
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'type': type,
      'category': category,
      'status': status,
      'accuracy': accuracy,
      'confidence': confidence,
      'parameters': parameters,
      'metrics': metrics,
      'features': features,
      'model_path': modelPath,
      'version': version,
      'created_at': createdAt.toIso8601String(),
      'last_trained': lastTrained?.toIso8601String(),
      'last_used': lastUsed?.toIso8601String(),
      'metadata': metadata,
    };
  }

  // Obter cor do status
  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'active':
        return Colors.green;
      case 'training':
        return Colors.blue;
      case 'inactive':
        return Colors.grey;
      case 'error':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // Obter texto do status
  String get statusText {
    switch (status.toLowerCase()) {
      case 'active':
        return 'Ativo';
      case 'training':
        return 'Treinando';
      case 'inactive':
        return 'Inativo';
      case 'error':
        return 'Erro';
      default:
        return status;
    }
  }

  // Verificar se está ativo
  bool get isActive => status == 'active';

  // Verificar se está treinando
  bool get isTraining => status == 'training';

  // Verificar se tem erro
  bool get hasError => status == 'error';

  // Obter precisão formatada
  String get formattedAccuracy {
    return '${(accuracy * 100).toStringAsFixed(1)}%';
  }

  // Obter confiança formatada
  String get formattedConfidence {
    return '${(confidence * 100).toStringAsFixed(1)}%';
  }

  // Obter tempo desde último treinamento
  String get lastTrainedAgo {
    if (lastTrained == null) return 'Nunca';
    
    final now = DateTime.now();
    final difference = now.difference(lastTrained!);
    
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

class Prediction {
  final String id;
  final String modelId;
  final String type;
  final Map<String, dynamic> inputData;
  final Map<String, dynamic> outputData;
  final double confidence;
  final String status;
  final DateTime createdAt;
  final DateTime? processedAt;
  final String? error;
  final Map<String, dynamic>? metadata;

  Prediction({
    required this.id,
    required this.modelId,
    required this.type,
    required this.inputData,
    required this.outputData,
    required this.confidence,
    required this.status,
    required this.createdAt,
    this.processedAt,
    this.error,
    this.metadata,
  });

  factory Prediction.fromJson(Map<String, dynamic> json) {
    return Prediction(
      id: json['id'] ?? '',
      modelId: json['model_id'] ?? '',
      type: json['type'] ?? '',
      inputData: json['input_data'] ?? {},
      outputData: json['output_data'] ?? {},
      confidence: (json['confidence'] ?? 0.0).toDouble(),
      status: json['status'] ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      processedAt: json['processed_at'] != null 
          ? DateTime.parse(json['processed_at'])
          : null,
      error: json['error'],
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'model_id': modelId,
      'type': type,
      'input_data': inputData,
      'output_data': outputData,
      'confidence': confidence,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'processed_at': processedAt?.toIso8601String(),
      'error': error,
      'metadata': metadata,
    };
  }

  // Obter cor do status
  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'processing':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  // Obter texto do status
  String get statusText {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'Pendente';
      case 'processing':
        return 'Processando';
      case 'completed':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
      default:
        return status;
    }
  }

  // Verificar se está pendente
  bool get isPending => status == 'pending';

  // Verificar se está processando
  bool get isProcessing => status == 'processing';

  // Verificar se foi concluído
  bool get isCompleted => status == 'completed';

  // Verificar se falhou
  bool get isFailed => status == 'failed';

  // Obter confiança formatada
  String get formattedConfidence {
    return '${(confidence * 100).toStringAsFixed(1)}%';
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

class TrainingData {
  final String id;
  final String modelId;
  final String type;
  final Map<String, dynamic> features;
  final Map<String, dynamic> labels;
  final String source;
  final DateTime createdAt;
  final DateTime? processedAt;
  final String? status;
  final Map<String, dynamic>? metadata;

  TrainingData({
    required this.id,
    required this.modelId,
    required this.type,
    required this.features,
    required this.labels,
    required this.source,
    required this.createdAt,
    this.processedAt,
    this.status,
    this.metadata,
  });

  factory TrainingData.fromJson(Map<String, dynamic> json) {
    return TrainingData(
      id: json['id'] ?? '',
      modelId: json['model_id'] ?? '',
      type: json['type'] ?? '',
      features: json['features'] ?? {},
      labels: json['labels'] ?? {},
      source: json['source'] ?? '',
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      processedAt: json['processed_at'] != null 
          ? DateTime.parse(json['processed_at'])
          : null,
      status: json['status'],
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'model_id': modelId,
      'type': type,
      'features': features,
      'labels': labels,
      'source': source,
      'created_at': createdAt.toIso8601String(),
      'processed_at': processedAt?.toIso8601String(),
      'status': status,
      'metadata': metadata,
    };
  }
}

class AIInsight {
  final String id;
  final String type;
  final String title;
  final String description;
  final double confidence;
  final Map<String, dynamic>? data;
  final List<String>? recommendations;
  final DateTime createdAt;
  final DateTime? expiresAt;
  final bool isActive;
  final Map<String, dynamic>? metadata;

  AIInsight({
    required this.id,
    required this.type,
    required this.title,
    required this.description,
    required this.confidence,
    this.data,
    this.recommendations,
    required this.createdAt,
    this.expiresAt,
    this.isActive = true,
    this.metadata,
  });

  factory AIInsight.fromJson(Map<String, dynamic> json) {
    return AIInsight(
      id: json['id'] ?? '',
      type: json['type'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      confidence: (json['confidence'] ?? 0.0).toDouble(),
      data: json['data'],
      recommendations: json['recommendations'] != null 
          ? List<String>.from(json['recommendations'])
          : null,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      expiresAt: json['expires_at'] != null 
          ? DateTime.parse(json['expires_at'])
          : null,
      isActive: json['is_active'] ?? true,
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'title': title,
      'description': description,
      'confidence': confidence,
      'data': data,
      'recommendations': recommendations,
      'created_at': createdAt.toIso8601String(),
      'expires_at': expiresAt?.toIso8601String(),
      'is_active': isActive,
      'metadata': metadata,
    };
  }

  // Obter cor do tipo
  Color get typeColor {
    switch (type.toLowerCase()) {
      case 'opportunity':
        return Colors.green;
      case 'risk':
        return Colors.red;
      case 'trend':
        return Colors.blue;
      case 'anomaly':
        return Colors.orange;
      case 'recommendation':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }

  // Obter ícone do tipo
  IconData get typeIcon {
    switch (type.toLowerCase()) {
      case 'opportunity':
        return Icons.trending_up;
      case 'risk':
        return Icons.warning;
      case 'trend':
        return Icons.trending_flat;
      case 'anomaly':
        return Icons.error_outline;
      case 'recommendation':
        return Icons.lightbulb;
      default:
        return Icons.info;
    }
  }

  // Obter confiança formatada
  String get formattedConfidence {
    return '${(confidence * 100).toStringAsFixed(1)}%';
  }

  // Verificar se expirou
  bool get isExpired {
    if (expiresAt == null) return false;
    return DateTime.now().isAfter(expiresAt!);
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

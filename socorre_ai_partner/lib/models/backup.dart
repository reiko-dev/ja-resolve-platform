import 'package:flutter/material.dart';

class BackupData {
  final String id;
  final String userId;
  final String type;
  final String status;
  final DateTime createdAt;
  final DateTime? completedAt;
  final int totalRecords;
  final int processedRecords;
  final double progress;
  final String? filePath;
  final String? fileSize;
  final String? checksum;
  final Map<String, dynamic>? metadata;
  final List<String>? errors;

  BackupData({
    required this.id,
    required this.userId,
    required this.type,
    required this.status,
    required this.createdAt,
    this.completedAt,
    this.totalRecords = 0,
    this.processedRecords = 0,
    this.progress = 0.0,
    this.filePath,
    this.fileSize,
    this.checksum,
    this.metadata,
    this.errors,
  });

  factory BackupData.fromJson(Map<String, dynamic> json) {
    return BackupData(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      type: json['type'] ?? '',
      status: json['status'] ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      completedAt: json['completed_at'] != null 
          ? DateTime.parse(json['completed_at'])
          : null,
      totalRecords: json['total_records'] ?? 0,
      processedRecords: json['processed_records'] ?? 0,
      progress: (json['progress'] ?? 0.0).toDouble(),
      filePath: json['file_path'],
      fileSize: json['file_size'],
      checksum: json['checksum'],
      metadata: json['metadata'],
      errors: json['errors'] != null 
          ? List<String>.from(json['errors'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'type': type,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'completed_at': completedAt?.toIso8601String(),
      'total_records': totalRecords,
      'processed_records': processedRecords,
      'progress': progress,
      'file_path': filePath,
      'file_size': fileSize,
      'checksum': checksum,
      'metadata': metadata,
      'errors': errors,
    };
  }

  // Obter cor do status
  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'pending':
        return Colors.orange;
      case 'in_progress':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'failed':
        return Colors.red;
      case 'cancelled':
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
      case 'in_progress':
        return 'Em Andamento';
      case 'completed':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
      case 'cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  }

  // Verificar se está ativo
  bool get isActive => status == 'pending' || status == 'in_progress';

  // Verificar se foi concluído
  bool get isCompleted => status == 'completed';

  // Verificar se falhou
  bool get isFailed => status == 'failed';

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

  // Obter progresso formatado
  String get progressText {
    return '${(progress * 100).toStringAsFixed(1)}%';
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
}

class SyncData {
  final String id;
  final String userId;
  final String type;
  final String status;
  final DateTime lastSync;
  final DateTime? nextSync;
  final int totalRecords;
  final int syncedRecords;
  final int failedRecords;
  final double progress;
  final String? lastError;
  final Map<String, dynamic>? metadata;
  final List<String>? conflicts;

  SyncData({
    required this.id,
    required this.userId,
    required this.type,
    required this.status,
    required this.lastSync,
    this.nextSync,
    this.totalRecords = 0,
    this.syncedRecords = 0,
    this.failedRecords = 0,
    this.progress = 0.0,
    this.lastError,
    this.metadata,
    this.conflicts,
  });

  factory SyncData.fromJson(Map<String, dynamic> json) {
    return SyncData(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      type: json['type'] ?? '',
      status: json['status'] ?? 'idle',
      lastSync: DateTime.parse(json['last_sync'] ?? DateTime.now().toIso8601String()),
      nextSync: json['next_sync'] != null 
          ? DateTime.parse(json['next_sync'])
          : null,
      totalRecords: json['total_records'] ?? 0,
      syncedRecords: json['synced_records'] ?? 0,
      failedRecords: json['failed_records'] ?? 0,
      progress: (json['progress'] ?? 0.0).toDouble(),
      lastError: json['last_error'],
      metadata: json['metadata'],
      conflicts: json['conflicts'] != null 
          ? List<String>.from(json['conflicts'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'type': type,
      'status': status,
      'last_sync': lastSync.toIso8601String(),
      'next_sync': nextSync?.toIso8601String(),
      'total_records': totalRecords,
      'synced_records': syncedRecords,
      'failed_records': failedRecords,
      'progress': progress,
      'last_error': lastError,
      'metadata': metadata,
      'conflicts': conflicts,
    };
  }

  // Obter cor do status
  Color get statusColor {
    switch (status.toLowerCase()) {
      case 'idle':
        return Colors.grey;
      case 'syncing':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'failed':
        return Colors.red;
      case 'paused':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }

  // Obter texto do status
  String get statusText {
    switch (status.toLowerCase()) {
      case 'idle':
        return 'Inativo';
      case 'syncing':
        return 'Sincronizando';
      case 'completed':
        return 'Concluído';
      case 'failed':
        return 'Falhou';
      case 'paused':
        return 'Pausado';
      default:
        return status;
    }
  }

  // Verificar se está ativo
  bool get isActive => status == 'syncing';

  // Verificar se foi concluído
  bool get isCompleted => status == 'completed';

  // Verificar se falhou
  bool get isFailed => status == 'failed';

  // Obter tempo desde última sincronização
  String get lastSyncAgo {
    final now = DateTime.now();
    final difference = now.difference(lastSync);
    
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

  // Obter progresso formatado
  String get progressText {
    return '${(progress * 100).toStringAsFixed(1)}%';
  }

  // Obter taxa de sucesso
  double get successRate {
    if (totalRecords == 0) return 0.0;
    return syncedRecords / totalRecords;
  }

  // Obter taxa de falha
  double get failureRate {
    if (totalRecords == 0) return 0.0;
    return failedRecords / totalRecords;
  }
}

class BackupSettings {
  final String id;
  final String userId;
  final bool autoBackup;
  final int backupInterval; // em horas
  final int maxBackups;
  final bool compressBackups;
  final bool encryptBackups;
  final String? encryptionKey;
  final List<String> includedData;
  final List<String> excludedData;
  final String backupLocation;
  final bool cloudBackup;
  final String? cloudProvider;
  final Map<String, dynamic>? cloudSettings;
  final DateTime createdAt;
  final DateTime updatedAt;

  BackupSettings({
    required this.id,
    required this.userId,
    this.autoBackup = true,
    this.backupInterval = 24,
    this.maxBackups = 10,
    this.compressBackups = true,
    this.encryptBackups = false,
    this.encryptionKey,
    this.includedData = const [],
    this.excludedData = const [],
    this.backupLocation = 'local',
    this.cloudBackup = false,
    this.cloudProvider,
    this.cloudSettings,
    required this.createdAt,
    required this.updatedAt,
  });

  factory BackupSettings.fromJson(Map<String, dynamic> json) {
    return BackupSettings(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      autoBackup: json['auto_backup'] ?? true,
      backupInterval: json['backup_interval'] ?? 24,
      maxBackups: json['max_backups'] ?? 10,
      compressBackups: json['compress_backups'] ?? true,
      encryptBackups: json['encrypt_backups'] ?? false,
      encryptionKey: json['encryption_key'],
      includedData: json['included_data'] != null 
          ? List<String>.from(json['included_data'])
          : [],
      excludedData: json['excluded_data'] != null 
          ? List<String>.from(json['excluded_data'])
          : [],
      backupLocation: json['backup_location'] ?? 'local',
      cloudBackup: json['cloud_backup'] ?? false,
      cloudProvider: json['cloud_provider'],
      cloudSettings: json['cloud_settings'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'auto_backup': autoBackup,
      'backup_interval': backupInterval,
      'max_backups': maxBackups,
      'compress_backups': compressBackups,
      'encrypt_backups': encryptBackups,
      'encryption_key': encryptionKey,
      'included_data': includedData,
      'excluded_data': excludedData,
      'backup_location': backupLocation,
      'cloud_backup': cloudBackup,
      'cloud_provider': cloudProvider,
      'cloud_settings': cloudSettings,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  // Obter intervalo formatado
  String get formattedInterval {
    if (backupInterval < 24) {
      return 'A cada $backupInterval hora${backupInterval > 1 ? 's' : ''}';
    } else {
      final days = backupInterval ~/ 24;
      return 'A cada $days dia${days > 1 ? 's' : ''}';
    }
  }

  // Verificar se tem configurações de nuvem
  bool get hasCloudSettings => cloudBackup && cloudProvider != null;

  // Obter provedor de nuvem formatado
  String get formattedCloudProvider {
    if (cloudProvider == null) return 'Nenhum';
    switch (cloudProvider!.toLowerCase()) {
      case 'google_drive':
        return 'Google Drive';
      case 'dropbox':
        return 'Dropbox';
      case 'onedrive':
        return 'OneDrive';
      case 'aws_s3':
        return 'AWS S3';
      default:
        return cloudProvider!;
    }
  }
}

import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import '../models/backup.dart';

class BackupService {
  static String get _baseUrl => AppConfig.baseUrl;

  // Headers padrão
  static Map<String, String> get _headers {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  // Headers com autenticação
  static Map<String, String> _headersWithAuth(String token) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Criar backup
  static Future<Map<String, dynamic>> createBackup({
    required String token,
    required String type,
    List<String>? includedData,
    bool compress = true,
    bool encrypt = false,
    String? encryptionKey,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/backup/create'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'type': type,
          'included_data': includedData,
          'compress': compress,
          'encrypt': encrypt,
          'encryption_key': encryptionKey,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': BackupData.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao criar backup',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar backups do usuário
  static Future<Map<String, dynamic>> getUserBackups({
    required String token,
    String? type,
    String? status,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
        if (type != null) 'type': type,
        if (status != null) 'status': status,
      };

      final uri = Uri.parse('$_baseUrl/backup/list').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => BackupData.fromJson(item))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar backups',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar backup específico
  static Future<Map<String, dynamic>> getBackup({
    required String token,
    required String backupId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/backup/$backupId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': BackupData.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar backup',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Baixar backup
  static Future<Map<String, dynamic>> downloadBackup({
    required String token,
    required String backupId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/backup/$backupId/download'),
        headers: _headersWithAuth(token),
      );
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': response.bodyBytes,
          'contentType': response.headers['content-type'],
        };
      } else {
        final data = jsonDecode(response.body);
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao baixar backup',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Restaurar backup
  static Future<Map<String, dynamic>> restoreBackup({
    required String token,
    required String backupId,
    String? password,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/backup/$backupId/restore'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'password': password,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao restaurar backup',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Deletar backup
  static Future<Map<String, dynamic>> deleteBackup({
    required String token,
    required String backupId,
  }) async {
    try {
      final response = await http.delete(
        Uri.parse('$_baseUrl/backup/$backupId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao deletar backup',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar configurações de backup
  static Future<Map<String, dynamic>> getBackupSettings({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/backup/settings'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': BackupSettings.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar configurações',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Atualizar configurações de backup
  static Future<Map<String, dynamic>> updateBackupSettings({
    required String token,
    required Map<String, dynamic> settingsData,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/backup/settings'),
        headers: _headersWithAuth(token),
        body: jsonEncode(settingsData),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': BackupSettings.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao atualizar configurações',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar dados de sincronização
  static Future<Map<String, dynamic>> getSyncData({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/sync/data'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((item) => SyncData.fromJson(item))
              .toList(),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar dados de sincronização',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Iniciar sincronização
  static Future<Map<String, dynamic>> startSync({
    required String token,
    required String type,
    bool force = false,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/sync/start'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'type': type,
          'force': force,
        }),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': SyncData.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao iniciar sincronização',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Pausar sincronização
  static Future<Map<String, dynamic>> pauseSync({
    required String token,
    required String syncId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/sync/$syncId/pause'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao pausar sincronização',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Resumir sincronização
  static Future<Map<String, dynamic>> resumeSync({
    required String token,
    required String syncId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/sync/$syncId/resume'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao resumir sincronização',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Cancelar sincronização
  static Future<Map<String, dynamic>> cancelSync({
    required String token,
    required String syncId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/sync/$syncId/cancel'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao cancelar sincronização',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar estatísticas de backup
  static Future<Map<String, dynamic>> getBackupStats({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/backup/stats'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar estatísticas',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Verificar integridade do backup
  static Future<Map<String, dynamic>> verifyBackup({
    required String token,
    required String backupId,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/backup/$backupId/verify'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': data['data'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao verificar backup',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Backup local
  static Future<Map<String, dynamic>> createLocalBackup({
    required String userId,
    required String type,
    List<String>? includedData,
  }) async {
    try {
      final directory = await getApplicationDocumentsDirectory();
      final backupDir = Directory('${directory.path}/backups');
      if (!await backupDir.exists()) {
        await backupDir.create(recursive: true);
      }

      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final fileName = 'backup_${type}_$timestamp.json';
      final filePath = '${backupDir.path}/$fileName';

      // Simular criação de backup
      final backupData = {
        'user_id': userId,
        'type': type,
        'created_at': DateTime.now().toIso8601String(),
        'included_data': includedData ?? [],
        'data': {
          'profile': {},
          'settings': {},
          'orders': [],
          'payments': [],
        },
      };

      final file = File(filePath);
      await file.writeAsString(jsonEncode(backupData));

      return {
        'success': true,
        'data': {
          'file_path': filePath,
          'file_size': await file.length(),
          'created_at': DateTime.now().toIso8601String(),
        },
      };
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro ao criar backup local: $e',
      };
    }
  }

  // Restaurar backup local
  static Future<Map<String, dynamic>> restoreLocalBackup({
    required String filePath,
  }) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) {
        return {
          'success': false,
          'message': 'Arquivo de backup não encontrado',
        };
      }

      final content = await file.readAsString();
      final backupData = jsonDecode(content);

      // Simular restauração
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('backup_data', content);

      return {
        'success': true,
        'data': backupData,
        'message': 'Backup restaurado com sucesso',
      };
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro ao restaurar backup local: $e',
      };
    }
  }
}

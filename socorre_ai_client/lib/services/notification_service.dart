import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';

class NotificationService {
  static final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  static String? _fcmToken;
  static bool _initialized = false;
  static String get _notificationsBaseUrl => '${AppConfig.baseUrl}/notifications';

  static Future<void> initialize() async {
    if (_initialized) return;

    try {
      // Solicitar permissões
      NotificationSettings settings = await _firebaseMessaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );

      if (settings.authorizationStatus == AuthorizationStatus.authorized) {
        print('✅ Permissão de notificação concedida');
        
        // Obter token FCM
        _fcmToken = await _firebaseMessaging.getToken();
        print('🔑 FCM Token: $_fcmToken');

        // Salvar token no backend
        if (_fcmToken != null) {
          await _saveFCMTokenToBackend(_fcmToken!);
        }

        // Configurar handlers
        _setupMessageHandlers();

        _initialized = true;
      } else {
        print('❌ Permissão de notificação negada');
      }
    } catch (e) {
      print('❌ Erro ao inicializar notificações: $e');
    }
  }

  static void _setupMessageHandlers() {
    // Handler para mensagens em foreground
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('📱 Mensagem recebida em foreground: ${message.notification?.title}');
      _handleNotification(message);
    });

    // Handler para quando o app é aberto via notificação
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('📱 App aberto via notificação: ${message.notification?.title}');
      _handleNotificationTap(message);
    });

    // Handler para mensagens em background
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  }

  static Future<void> _saveFCMTokenToBackend(String token) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userToken = prefs.getString('auth_token');
      
      if (userToken == null) return;

      final response = await http.put(
        Uri.parse('$_notificationsBaseUrl/fcm-token'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $userToken',
        },
        body: jsonEncode({
          'fcmToken': token,
        }),
      );

      if (response.statusCode == 200) {
        print('✅ Token FCM salvo no backend');
      } else {
        print('❌ Erro ao salvar token FCM: ${response.statusCode}');
      }
    } catch (e) {
      print('❌ Erro ao salvar token FCM: $e');
    }
  }

  static void _handleNotification(RemoteMessage message) {
    // Aqui você pode mostrar uma notificação local ou atualizar a UI
    print('📱 Notificação: ${message.notification?.title}');
    print('📱 Dados: ${message.data}');
    
    // TODO: Implementar lógica específica baseada no tipo de notificação
    final type = message.data['type'] ?? 'general';
    
    switch (type) {
      case 'emergency':
        _handleEmergencyNotification(message);
        break;
      case 'chat':
        _handleChatNotification(message);
        break;
      case 'emergency_update':
        _handleEmergencyUpdateNotification(message);
        break;
      case 'location_update':
        _handleLocationUpdateNotification(message);
        break;
      default:
        _handleGeneralNotification(message);
    }
  }

  static void _handleNotificationTap(RemoteMessage message) {
    // Navegar para a tela apropriada baseada no tipo de notificação
    final type = message.data['type'] ?? 'general';
    
    switch (type) {
      case 'emergency':
        // Navegar para tela de emergência
        break;
      case 'chat':
        // Navegar para chat
        break;
      case 'emergency_update':
        // Navegar para rastreamento
        break;
      default:
        // Navegar para dashboard
        break;
    }
  }

  static void _handleEmergencyNotification(RemoteMessage message) {
    // Lógica específica para notificações de emergência
    print('🚨 Notificação de emergência recebida');
  }

  static void _handleChatNotification(RemoteMessage message) {
    // Lógica específica para notificações de chat
    print('💬 Notificação de chat recebida');
  }

  static void _handleEmergencyUpdateNotification(RemoteMessage message) {
    // Lógica específica para atualizações de emergência
    print('📱 Atualização de emergência recebida');
  }

  static void _handleLocationUpdateNotification(RemoteMessage message) {
    // Lógica específica para atualizações de localização
    print('📍 Atualização de localização recebida');
  }

  static void _handleGeneralNotification(RemoteMessage message) {
    // Lógica para notificações gerais
    print('📢 Notificação geral recebida');
  }

  static Future<List<Map<String, dynamic>>> getNotifications({
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userToken = prefs.getString('auth_token');
      
      if (userToken == null) return [];

      final response = await http.get(
        Uri.parse('$_notificationsBaseUrl?page=$page&limit=$limit'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $userToken',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return List<Map<String, dynamic>>.from(data['data']['notifications']);
      } else {
        print('❌ Erro ao buscar notificações: ${response.statusCode}');
        return [];
      }
    } catch (e) {
      print('❌ Erro ao buscar notificações: $e');
      return [];
    }
  }

  static Future<int> getUnreadCount() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userToken = prefs.getString('auth_token');
      
      if (userToken == null) return 0;

      final response = await http.get(
        Uri.parse('$_notificationsBaseUrl/unread-count'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $userToken',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['data']['count'] ?? 0;
      } else {
        print('❌ Erro ao buscar contagem de notificações: ${response.statusCode}');
        return 0;
      }
    } catch (e) {
      print('❌ Erro ao buscar contagem de notificações: $e');
      return 0;
    }
  }

  static Future<bool> markAsRead(String notificationId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userToken = prefs.getString('auth_token');
      
      if (userToken == null) return false;

      final response = await http.put(
        Uri.parse('$_notificationsBaseUrl/$notificationId/read'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $userToken',
        },
      );

      return response.statusCode == 200;
    } catch (e) {
      print('❌ Erro ao marcar notificação como lida: $e');
      return false;
    }
  }

  static Future<bool> markAllAsRead() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final userToken = prefs.getString('auth_token');
      
      if (userToken == null) return false;

      final response = await http.put(
        Uri.parse('$_notificationsBaseUrl/read-all'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $userToken',
        },
      );

      return response.statusCode == 200;
    } catch (e) {
      print('❌ Erro ao marcar todas as notificações como lidas: $e');
      return false;
    }
  }

  static String? getFCMToken() {
    return _fcmToken;
  }

  static bool isInitialized() {
    return _initialized;
  }
}

// Handler para mensagens em background
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('📱 Mensagem em background: ${message.notification?.title}');
  // Aqui você pode processar a mensagem em background
}

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/rendering.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;

class NotificationService {
  static final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  static String? _fcmToken;
  static bool _isInitialized = false;

  // Inicializar o serviço de notificações
  static Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      // Solicitar permissões
      await _requestPermissions();

      // Obter token FCM
      await _getFCMToken();

      // Configurar handlers
      _setupMessageHandlers();

      _isInitialized = true;
      debugPrint('✅ NotificationService inicializado com sucesso');
    } catch (e) {
      debugPrint('❌ Erro ao inicializar NotificationService: $e');
    }
  }

  // Solicitar permissões de notificação
  static Future<void> _requestPermissions() async {
    try {
      NotificationSettings settings = await _firebaseMessaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );

      debugPrint('Permissões de notificação: ${settings.authorizationStatus}');
    } catch (e) {
      debugPrint('Erro ao solicitar permissões: $e');
    }
  }

  // Obter token FCM
  static Future<void> _getFCMToken() async {
    try {
      _fcmToken = await _firebaseMessaging.getToken();
      debugPrint('FCM Token: $_fcmToken');
      
      // Salvar token localmente
      if (_fcmToken != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('fcm_token', _fcmToken!);
      }
    } catch (e) {
      debugPrint('Erro ao obter FCM token: $e');
    }
  }

  // Configurar handlers de mensagens
  static void _setupMessageHandlers() {
    // Mensagem em primeiro plano
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      debugPrint(
        '📱 Mensagem recebida em primeiro plano: ${message.notification?.title}',
      );
      _handleForegroundMessage(message);
    });

    // Mensagem quando app está em background
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      debugPrint(
        '📱 Mensagem aberta do background: ${message.notification?.title}',
      );
      _handleBackgroundMessage(message);
    });

    // Mensagem quando app está fechado
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  }

  // Handler para mensagens em primeiro plano
  static void _handleForegroundMessage(RemoteMessage message) {
    // Aqui você pode mostrar um dialog, snackbar, etc.
    debugPrint('Título: ${message.notification?.title}');
    debugPrint('Corpo: ${message.notification?.body}');
    debugPrint('Dados: ${message.data}');
  }

  // Handler para mensagens em background
  static void _handleBackgroundMessage(RemoteMessage message) {
    // Navegar para tela específica baseada nos dados
    final data = message.data;
    if (data.containsKey('type')) {
      _navigateToScreen(data['type'], data);
    }
  }

  // Navegar para tela específica
  static void _navigateToScreen(String type, Map<String, dynamic> data) {
    // Implementar navegação baseada no tipo de notificação
    switch (type) {
      case 'emergency_request':
        // Navegar para tela de emergência
        break;
      case 'delivery_request':
        // Navegar para tela de entrega
        break;
      case 'appointment':
        // Navegar para tela de agendamento
        break;
      default:
        // Navegar para dashboard
        break;
    }
  }

  // Obter token FCM atual
  static String? getFCMToken() {
    return _fcmToken;
  }

  // Enviar token para o servidor
  static Future<bool> sendTokenToServer(String userId) async {
    if (_fcmToken == null) return false;

    try {
      final response = await http.post(
        Uri.parse('${AppConfig.baseUrl}/partners/fcm-token'),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'user_id': userId,
          'fcm_token': _fcmToken,
          'platform': 'android', // ou 'ios'
        }),
      );

      if (response.statusCode == 200) {
        debugPrint('✅ Token FCM enviado para o servidor');
        return true;
      } else {
        debugPrint('❌ Erro ao enviar token FCM: ${response.statusCode}');
        return false;
      }
    } catch (e) {
      debugPrint('❌ Erro ao enviar token FCM: $e');
      return false;
    }
  }

  // Inscrever em tópicos
  static Future<void> subscribeToTopic(String topic) async {
    try {
      await _firebaseMessaging.subscribeToTopic(topic);
      debugPrint('✅ Inscrito no tópico: $topic');
    } catch (e) {
      debugPrint('❌ Erro ao se inscrever no tópico $topic: $e');
    }
  }

  // Desinscrever de tópicos
  static Future<void> unsubscribeFromTopic(String topic) async {
    try {
      await _firebaseMessaging.unsubscribeFromTopic(topic);
      debugPrint('✅ Desinscrito do tópico: $topic');
    } catch (e) {
      debugPrint('❌ Erro ao se desinscrever do tópico $topic: $e');
    }
  }

  // Inscrever em tópicos específicos por tipo de parceiro
  static Future<void> subscribeToPartnerTopics(String partnerType) async {
    try {
      // Tópico geral
      await subscribeToTopic('all_partners');
      
      // Tópico específico do tipo
      await subscribeToTopic('partners_$partnerType');
      
      // Tópico de emergências
      await subscribeToTopic('emergencies');
      
      debugPrint('✅ Inscrito nos tópicos para $partnerType');
    } catch (e) {
      debugPrint('❌ Erro ao se inscrever nos tópicos: $e');
    }
  }

  // Desinscrever de todos os tópicos
  static Future<void> unsubscribeFromAllTopics() async {
    try {
      await unsubscribeFromTopic('all_partners');
      await unsubscribeFromTopic('partners_mechanic');
      await unsubscribeFromTopic('partners_store');
      await unsubscribeFromTopic('partners_motoboy');
      await unsubscribeFromTopic('emergencies');
      
      debugPrint('✅ Desinscrito de todos os tópicos');
    } catch (e) {
      debugPrint('❌ Erro ao se desinscrever dos tópicos: $e');
    }
  }

  // Verificar se notificações estão habilitadas
  static Future<bool> areNotificationsEnabled() async {
    try {
      NotificationSettings settings = await _firebaseMessaging.getNotificationSettings();
      return settings.authorizationStatus == AuthorizationStatus.authorized;
    } catch (e) {
      debugPrint('Erro ao verificar permissões: $e');
      return false;
    }
  }

  // Abrir configurações de notificação
  static Future<void> openNotificationSettings() async {
    try {
      await _firebaseMessaging.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );
    } catch (e) {
      debugPrint('Erro ao abrir configurações: $e');
    }
  }

  // Limpar token FCM
  static Future<void> clearToken() async {
    try {
      await _firebaseMessaging.deleteToken();
      _fcmToken = null;
      
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('fcm_token');
      
      debugPrint('✅ Token FCM limpo');
    } catch (e) {
      debugPrint('❌ Erro ao limpar token FCM: $e');
    }
  }
}

// Handler para mensagens em background (deve ser top-level)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  debugPrint('📱 Mensagem em background: ${message.notification?.title}');
  // Aqui você pode processar a mensagem mesmo com o app fechado
}

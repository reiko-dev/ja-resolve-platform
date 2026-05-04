import 'dart:async';
import 'package:flutter/rendering.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/app_config.dart';

class WebSocketService {
  static io.Socket? _socket;
  static bool _isConnected = false;
  static final StreamController<Map<String, dynamic>> _messageController = 
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _emergencyController = 
      StreamController<Map<String, dynamic>>.broadcast();
  static final StreamController<Map<String, dynamic>> _locationController = 
      StreamController<Map<String, dynamic>>.broadcast();

  // Streams públicos
  static Stream<Map<String, dynamic>> get messageStream => _messageController.stream;
  static Stream<Map<String, dynamic>> get emergencyStream => _emergencyController.stream;
  static Stream<Map<String, dynamic>> get locationStream => _locationController.stream;

  static bool get isConnected => _isConnected;

  static Future<void> initialize() async {
    if (_socket != null && _isConnected) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token');
      
      if (token == null) {
        debugPrint('❌ Token de autenticação não encontrado');
        return;
      }

      _socket = io.io(
        AppConfig.serverUrl,
        io.OptionBuilder()
          .setTransports(['websocket'])
          .setExtraHeaders({'Authorization': 'Bearer $token'})
          .enableAutoConnect()
          .build(),
      );

      _setupEventListeners();
      
    } catch (e) {
      debugPrint('❌ Erro ao inicializar WebSocket: $e');
    }
  }

  static void _setupEventListeners() {
    if (_socket == null) return;

    _socket!.onConnect((_) {
      debugPrint('✅ WebSocket conectado (Partner)');
      _isConnected = true;
    });

    _socket!.onDisconnect((_) {
      debugPrint('❌ WebSocket desconectado (Partner)');
      _isConnected = false;
    });

    _socket!.onConnectError((error) {
      debugPrint('❌ Erro de conexão WebSocket: $error');
      _isConnected = false;
    });

    // Eventos de chat
    _socket!.on('newMessage', (data) {
      debugPrint('📱 Nova mensagem recebida: $data');
      _messageController.add(Map<String, dynamic>.from(data));
    });

    _socket!.on('messageSent', (data) {
      debugPrint('📤 Mensagem enviada: $data');
      _messageController.add(Map<String, dynamic>.from(data));
    });

    _socket!.on('chatError', (data) {
      debugPrint('❌ Erro no chat: $data');
      _messageController.add(Map<String, dynamic>.from(data));
    });

    // Eventos de emergência
    _socket!.on('newEmergencyAlert', (data) {
      debugPrint('🚨 Nova emergência: $data');
      _emergencyController.add(Map<String, dynamic>.from(data));
    });

    _socket!.on('emergencyStatusUpdate', (data) {
      debugPrint('🚨 Atualização de emergência: $data');
      _emergencyController.add(Map<String, dynamic>.from(data));
    });

    _socket!.on('emergencyChatUpdate', (data) {
      debugPrint('💬 Atualização de chat de emergência: $data');
      _emergencyController.add(Map<String, dynamic>.from(data));
    });

    // Eventos de localização
    _socket!.on('partnerLocationUpdate', (data) {
      debugPrint('📍 Atualização de localização: $data');
      _locationController.add(Map<String, dynamic>.from(data));
    });

    _socket!.on('locationError', (data) {
      debugPrint('❌ Erro de localização: $data');
      _locationController.add(Map<String, dynamic>.from(data));
    });
  }

  // Enviar mensagem de chat
  static void sendMessage({
    required String receiverId,
    required String content,
    String? emergencyRequestId,
  }) {
    if (_socket == null || !_isConnected) {
      debugPrint('❌ WebSocket não conectado');
      return;
    }

    _socket!.emit('sendMessage', {
      'receiverId': receiverId,
      'content': content,
      'emergencyRequestId': emergencyRequestId,
    });
  }

  // Entrar em sala de emergência
  static void joinEmergencyRoom(String emergencyRequestId) {
    if (_socket == null || !_isConnected) {
      debugPrint('❌ WebSocket não conectado');
      return;
    }

    _socket!.emit('joinEmergencyRoom', emergencyRequestId);
    debugPrint('🚪 Entrou na sala de emergência: $emergencyRequestId');
  }

  // Sair de sala de emergência
  static void leaveEmergencyRoom(String emergencyRequestId) {
    if (_socket == null || !_isConnected) {
      debugPrint('❌ WebSocket não conectado');
      return;
    }

    _socket!.emit('leaveEmergencyRoom', emergencyRequestId);
    debugPrint('🚪 Saiu da sala de emergência: $emergencyRequestId');
  }

  // Atualizar localização
  static void updateLocation({
    required double latitude,
    required double longitude,
    String? emergencyRequestId,
  }) {
    if (_socket == null || !_isConnected) {
      debugPrint('❌ WebSocket não conectado');
      return;
    }

    _socket!.emit('updateLocation', {
      'latitude': latitude,
      'longitude': longitude,
      'emergencyRequestId': emergencyRequestId,
    });
  }

  // Responder a emergência
  static void respondToEmergency({
    required String emergencyRequestId,
    required String clientId,
    required String status,
    required String partnerId,
  }) {
    if (_socket == null || !_isConnected) {
      debugPrint('❌ WebSocket não conectado');
      return;
    }

    _socket!.emit('emergencyResponse', {
      'emergencyRequestId': emergencyRequestId,
      'clientId': clientId,
      'status': status,
      'partnerId': partnerId,
    });
  }

  // Marcar mensagem como lida
  static void markMessageAsRead(String messageId) {
    if (_socket == null || !_isConnected) {
      debugPrint('❌ WebSocket não conectado');
      return;
    }

    _socket!.emit('markMessageAsRead', messageId);
  }

  // Reconectar
  static void reconnect() {
    if (_socket != null) {
      _socket!.disconnect();
      _socket!.connect();
    }
  }

  // Desconectar
  static void disconnect() {
    if (_socket != null) {
      _socket!.disconnect();
      _socket = null;
      _isConnected = false;
    }
  }

  // Limpar recursos
  static void dispose() {
    disconnect();
    _messageController.close();
    _emergencyController.close();
    _locationController.close();
  }
}

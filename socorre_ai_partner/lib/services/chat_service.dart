import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../config/app_config.dart';
import '../models/chat.dart';

class ChatService {
  static String get _baseUrl => AppConfig.baseUrl;
  static IO.Socket? _socket;
  static bool _isConnected = false;
  static Function(ChatMessage)? _onMessageReceived;
  static Function(Chat)? _onChatUpdated;

  // Headers com autenticação
  static Map<String, String> _headersWithAuth(String token) {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  // Conectar ao WebSocket
  static Future<void> connect(String userId, String token) async {
    try {
      _socket = IO.io(_baseUrl, IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .build());

      _socket!.onConnect((_) {
        print('✅ Conectado ao chat');
        _isConnected = true;
        _socket!.emit('join', {'user_id': userId});
      });

      _socket!.onDisconnect((_) {
        print('❌ Desconectado do chat');
        _isConnected = false;
      });

      _socket!.on('message', (data) {
        print('📱 Mensagem recebida: $data');
        if (_onMessageReceived != null) {
          final message = ChatMessage.fromJson(data);
          _onMessageReceived!(message);
        }
      });

      _socket!.on('chat_updated', (data) {
        print('💬 Chat atualizado: $data');
        if (_onChatUpdated != null) {
          final chat = Chat.fromJson(data);
          _onChatUpdated!(chat);
        }
      });

      _socket!.on('error', (error) {
        print('❌ Erro no chat: $error');
      });

    } catch (e) {
      print('❌ Erro ao conectar ao chat: $e');
    }
  }

  // Desconectar do WebSocket
  static void disconnect() {
    if (_socket != null) {
      _socket!.disconnect();
      _socket = null;
      _isConnected = false;
    }
  }

  // Verificar se está conectado
  static bool get isConnected => _isConnected;

  // Definir callback para mensagens
  static void setMessageCallback(Function(ChatMessage) callback) {
    _onMessageReceived = callback;
  }

  // Definir callback para atualizações de chat
  static void setChatCallback(Function(Chat) callback) {
    _onChatUpdated = callback;
  }

  // Enviar mensagem
  static void sendMessage({
    required String chatId,
    required String message,
    required MessageType type,
    String? replyTo,
    List<String>? attachments,
    Map<String, dynamic>? metadata,
  }) {
    if (_socket != null && _isConnected) {
      _socket!.emit('send_message', {
        'chat_id': chatId,
        'message': message,
        'type': type.toString(),
        'reply_to': replyTo,
        'attachments': attachments,
        'metadata': metadata,
      });
    }
  }

  // Marcar mensagem como lida
  static void markAsRead(String messageId) {
    if (_socket != null && _isConnected) {
      _socket!.emit('mark_read', {'message_id': messageId});
    }
  }

  // Marcar chat como lido
  static void markChatAsRead(String chatId) {
    if (_socket != null && _isConnected) {
      _socket!.emit('mark_chat_read', {'chat_id': chatId});
    }
  }

  // Buscar chats
  static Future<Map<String, dynamic>> getChats({
    required String token,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
      };

      final uri = Uri.parse('$_baseUrl/chat/chats').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((chat) => Chat.fromJson(chat))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar chats',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar mensagens de um chat
  static Future<Map<String, dynamic>> getChatMessages({
    required String token,
    required String chatId,
    int page = 1,
    int limit = 50,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
      };

      final uri = Uri.parse('$_baseUrl/chat/$chatId/messages').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((message) => ChatMessage.fromJson(message))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar mensagens',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Criar novo chat
  static Future<Map<String, dynamic>> createChat({
    required String token,
    required String clientId,
    required ChatType type,
    String? initialMessage,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final response = await http.post(
        Uri.parse('$_baseUrl/chat/create'),
        headers: _headersWithAuth(token),
        body: jsonEncode({
          'client_id': clientId,
          'type': type.toString(),
          'initial_message': initialMessage,
          'metadata': metadata,
        }),
      );

      final data = jsonDecode(response.body);
      
      if (response.statusCode == 201) {
        return {
          'success': true,
          'data': Chat.fromJson(data['data']),
          'message': data['message'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao criar chat',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar chat por ID
  static Future<Map<String, dynamic>> getChat({
    required String token,
    required String chatId,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/chat/$chatId'),
        headers: _headersWithAuth(token),
      );
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': Chat.fromJson(data['data']),
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar chat',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Arquivar chat
  static Future<Map<String, dynamic>> archiveChat({
    required String token,
    required String chatId,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/chat/$chatId/archive'),
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
          'message': data['message'] ?? 'Erro ao arquivar chat',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Desarquivar chat
  static Future<Map<String, dynamic>> unarchiveChat({
    required String token,
    required String chatId,
  }) async {
    try {
      final response = await http.put(
        Uri.parse('$_baseUrl/chat/$chatId/unarchive'),
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
          'message': data['message'] ?? 'Erro ao desarquivar chat',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar chats arquivados
  static Future<Map<String, dynamic>> getArchivedChats({
    required String token,
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final queryParams = {
        'page': page.toString(),
        'limit': limit.toString(),
      };

      final uri = Uri.parse('$_baseUrl/chat/archived').replace(
        queryParameters: queryParams,
      );

      final response = await http.get(uri, headers: _headersWithAuth(token));
      final data = jsonDecode(response.body);
      
      if (response.statusCode == 200) {
        return {
          'success': true,
          'data': (data['data'] as List)
              .map((chat) => Chat.fromJson(chat))
              .toList(),
          'pagination': data['pagination'],
        };
      } else {
        return {
          'success': false,
          'message': data['message'] ?? 'Erro ao buscar chats arquivados',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Buscar mensagens não lidas
  static Future<Map<String, dynamic>> getUnreadMessages({
    required String token,
  }) async {
    try {
      final response = await http.get(
        Uri.parse('$_baseUrl/chat/unread'),
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
          'message': data['message'] ?? 'Erro ao buscar mensagens não lidas',
        };
      }
    } catch (e) {
      return {
        'success': false,
        'message': 'Erro de conexão: $e',
      };
    }
  }

  // Enviar mensagem de sistema
  static void sendSystemMessage({
    required String chatId,
    required String message,
    Map<String, dynamic>? metadata,
  }) {
    if (_socket != null && _isConnected) {
      _socket!.emit('send_system_message', {
        'chat_id': chatId,
        'message': message,
        'metadata': metadata,
      });
    }
  }

  // Enviar mensagem de emergência
  static void sendEmergencyMessage({
    required String chatId,
    required String message,
    Map<String, dynamic>? metadata,
  }) {
    if (_socket != null && _isConnected) {
      _socket!.emit('send_emergency_message', {
        'chat_id': chatId,
        'message': message,
        'metadata': metadata,
      });
    }
  }
}

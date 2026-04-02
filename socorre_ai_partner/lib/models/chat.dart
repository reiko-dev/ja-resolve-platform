class ChatMessage {
  final String id;
  final String chatId;
  final String senderId;
  final String senderName;
  final String senderAvatar;
  final String message;
  final MessageType type;
  final DateTime timestamp;
  final bool isRead;
  final bool isDelivered;
  final Map<String, dynamic>? metadata;
  final String? replyTo;
  final List<String>? attachments;

  ChatMessage({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.senderName,
    required this.senderAvatar,
    required this.message,
    required this.type,
    required this.timestamp,
    this.isRead = false,
    this.isDelivered = false,
    this.metadata,
    this.replyTo,
    this.attachments,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] ?? '',
      chatId: json['chat_id'] ?? '',
      senderId: json['sender_id'] ?? '',
      senderName: json['sender_name'] ?? '',
      senderAvatar: json['sender_avatar'] ?? '',
      message: json['message'] ?? '',
      type: MessageType.fromString(json['type'] ?? 'text'),
      timestamp: DateTime.parse(json['timestamp'] ?? DateTime.now().toIso8601String()),
      isRead: json['is_read'] ?? false,
      isDelivered: json['is_delivered'] ?? false,
      metadata: json['metadata'],
      replyTo: json['reply_to'],
      attachments: json['attachments'] != null ? List<String>.from(json['attachments']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'chat_id': chatId,
      'sender_id': senderId,
      'sender_name': senderName,
      'sender_avatar': senderAvatar,
      'message': message,
      'type': type.toString(),
      'timestamp': timestamp.toIso8601String(),
      'is_read': isRead,
      'is_delivered': isDelivered,
      'metadata': metadata,
      'reply_to': replyTo,
      'attachments': attachments,
    };
  }

  // Verificar se é uma mensagem do usuário atual
  bool isFromCurrentUser(String currentUserId) {
    return senderId == currentUserId;
  }

  // Obter tempo formatado
  String get formattedTime {
    final now = DateTime.now();
    final difference = now.difference(timestamp);

    if (difference.inDays > 0) {
      return '${timestamp.day}/${timestamp.month}';
    } else if (difference.inHours > 0) {
      return '${timestamp.hour.toString().padLeft(2, '0')}:${timestamp.minute.toString().padLeft(2, '0')}';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m';
    } else {
      return 'Agora';
    }
  }

  // Verificar se é uma mensagem recente
  bool get isRecent {
    final now = DateTime.now();
    final difference = now.difference(timestamp);
    return difference.inMinutes <= 5;
  }

  // Obter status da mensagem
  String get statusText {
    if (isRead) return 'Lida';
    if (isDelivered) return 'Entregue';
    return 'Enviada';
  }
}

enum MessageType {
  text,
  image,
  file,
  location,
  system,
  emergency,
  appointment,
  delivery;

  static MessageType fromString(String type) {
    switch (type.toLowerCase()) {
      case 'text':
        return MessageType.text;
      case 'image':
        return MessageType.image;
      case 'file':
        return MessageType.file;
      case 'location':
        return MessageType.location;
      case 'system':
        return MessageType.system;
      case 'emergency':
        return MessageType.emergency;
      case 'appointment':
        return MessageType.appointment;
      case 'delivery':
        return MessageType.delivery;
      default:
        return MessageType.text;
    }
  }

  @override
  String toString() {
    switch (this) {
      case MessageType.text:
        return 'text';
      case MessageType.image:
        return 'image';
      case MessageType.file:
        return 'file';
      case MessageType.location:
        return 'location';
      case MessageType.system:
        return 'system';
      case MessageType.emergency:
        return 'emergency';
      case MessageType.appointment:
        return 'appointment';
      case MessageType.delivery:
        return 'delivery';
    }
  }

  // Obter ícone do tipo de mensagem
  String get icon {
    switch (this) {
      case MessageType.text:
        return '💬';
      case MessageType.image:
        return '🖼️';
      case MessageType.file:
        return '📎';
      case MessageType.location:
        return '📍';
      case MessageType.system:
        return 'ℹ️';
      case MessageType.emergency:
        return '🚨';
      case MessageType.appointment:
        return '📅';
      case MessageType.delivery:
        return '🚚';
    }
  }
}

class Chat {
  final String id;
  final String partnerId;
  final String clientId;
  final String clientName;
  final String clientAvatar;
  final String lastMessage;
  final DateTime lastMessageTime;
  final int unreadCount;
  final bool isActive;
  final ChatType type;
  final Map<String, dynamic>? metadata;

  Chat({
    required this.id,
    required this.partnerId,
    required this.clientId,
    required this.clientName,
    required this.clientAvatar,
    required this.lastMessage,
    required this.lastMessageTime,
    this.unreadCount = 0,
    this.isActive = true,
    required this.type,
    this.metadata,
  });

  factory Chat.fromJson(Map<String, dynamic> json) {
    return Chat(
      id: json['id'] ?? '',
      partnerId: json['partner_id'] ?? '',
      clientId: json['client_id'] ?? '',
      clientName: json['client_name'] ?? '',
      clientAvatar: json['client_avatar'] ?? '',
      lastMessage: json['last_message'] ?? '',
      lastMessageTime: DateTime.parse(json['last_message_time'] ?? DateTime.now().toIso8601String()),
      unreadCount: json['unread_count'] ?? 0,
      isActive: json['is_active'] ?? true,
      type: ChatType.fromString(json['type'] ?? 'general'),
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'partner_id': partnerId,
      'client_id': clientId,
      'client_name': clientName,
      'client_avatar': clientAvatar,
      'last_message': lastMessage,
      'last_message_time': lastMessageTime.toIso8601String(),
      'unread_count': unreadCount,
      'is_active': isActive,
      'type': type.toString(),
      'metadata': metadata,
    };
  }

  // Obter tempo da última mensagem formatado
  String get lastMessageTimeFormatted {
    final now = DateTime.now();
    final difference = now.difference(lastMessageTime);

    if (difference.inDays > 0) {
      return '${lastMessageTime.day}/${lastMessageTime.month}';
    } else if (difference.inHours > 0) {
      return '${lastMessageTime.hour.toString().padLeft(2, '0')}:${lastMessageTime.minute.toString().padLeft(2, '0')}';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m';
    } else {
      return 'Agora';
    }
  }

  // Verificar se é um chat recente
  bool get isRecent {
    final now = DateTime.now();
    final difference = now.difference(lastMessageTime);
    return difference.inHours <= 24;
  }
}

enum ChatType {
  general,
  emergency,
  appointment,
  delivery,
  support;

  static ChatType fromString(String type) {
    switch (type.toLowerCase()) {
      case 'general':
        return ChatType.general;
      case 'emergency':
        return ChatType.emergency;
      case 'appointment':
        return ChatType.appointment;
      case 'delivery':
        return ChatType.delivery;
      case 'support':
        return ChatType.support;
      default:
        return ChatType.general;
    }
  }

  @override
  String toString() {
    switch (this) {
      case ChatType.general:
        return 'general';
      case ChatType.emergency:
        return 'emergency';
      case ChatType.appointment:
        return 'appointment';
      case ChatType.delivery:
        return 'delivery';
      case ChatType.support:
        return 'support';
    }
  }

  // Obter cor do tipo de chat
  String get color {
    switch (this) {
      case ChatType.general:
        return '#4ECDC4';
      case ChatType.emergency:
        return '#E53E3E';
      case ChatType.appointment:
        return '#2B6CB0';
      case ChatType.delivery:
        return '#38A169';
      case ChatType.support:
        return '#805AD5';
    }
  }

  // Obter ícone do tipo de chat
  String get icon {
    switch (this) {
      case ChatType.general:
        return '💬';
      case ChatType.emergency:
        return '🚨';
      case ChatType.appointment:
        return '📅';
      case ChatType.delivery:
        return '🚚';
      case ChatType.support:
        return '🛠️';
    }
  }
}

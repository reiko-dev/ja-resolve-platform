import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/websocket_service.dart';
import '../models/emergency_request.dart';

class ChatScreen extends StatefulWidget {
  final EmergencyRequest emergencyRequest;
  final String? partnerId;

  const ChatScreen({
    super.key,
    required this.emergencyRequest,
    this.partnerId,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<Map<String, dynamic>> _messages = [];
  bool _isConnected = false;

  @override
  void initState() {
    super.initState();
    _initializeChat();
    _setupWebSocketListeners();
  }

  void _initializeChat() {
    // Entrar na sala de emergência
    WebSocketService.joinEmergencyRoom(widget.emergencyRequest.id);
    
    // Adicionar mensagem de boas-vindas
    _messages.add({
      'id': 'welcome',
      'content': 'Chat iniciado. Aguardando resposta do parceiro...',
      'timestamp': DateTime.now(),
      'isSystem': true,
    });
  }

  void _setupWebSocketListeners() {
    // Escutar mensagens
    WebSocketService.messageStream.listen((data) {
      if (mounted) {
        setState(() {
          _messages.add({
            'id': data['id'] ?? DateTime.now().millisecondsSinceEpoch.toString(),
            'content': data['content'] ?? '',
            'timestamp': DateTime.tryParse(data['timestamp'] ?? '') ?? DateTime.now(),
            'isSystem': false,
            'isFromPartner': data['sender_id'] != null,
          });
        });
        _scrollToBottom();
      }
    });

    // Escutar atualizações de emergência
    WebSocketService.emergencyStream.listen((data) {
      if (mounted) {
        setState(() {
          _messages.add({
            'id': 'update_${DateTime.now().millisecondsSinceEpoch}',
            'content': 'Status atualizado: ${data['status'] ?? 'Atualização'}',
            'timestamp': DateTime.now(),
            'isSystem': true,
          });
        });
        _scrollToBottom();
      }
    });

    // Verificar conexão
    setState(() {
      _isConnected = WebSocketService.isConnected;
    });
  }

  void _sendMessage() {
    final content = _messageController.text.trim();
    if (content.isEmpty) return;

    // Adicionar mensagem localmente
    setState(() {
      _messages.add({
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'content': content,
        'timestamp': DateTime.now(),
        'isSystem': false,
        'isFromPartner': false,
      });
    });

    // Enviar via WebSocket
    WebSocketService.sendMessage(
      receiverId: widget.partnerId ?? 'partner',
      content: content,
      emergencyRequestId: widget.emergencyRequest.id,
    );

    _messageController.clear();
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    WebSocketService.leaveEmergencyRoom(widget.emergencyRequest.id);
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFC),
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Chat de Emergência',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            Text(
              'ID: ${widget.emergencyRequest.id}',
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.white70,
              ),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF2B6CB0),
        foregroundColor: Colors.white,
        actions: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: _isConnected ? Colors.green : Colors.red,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              _isConnected ? 'Online' : 'Offline',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.white,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: Column(
        children: [
          // Status da emergência
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: const Color(0xFF2B6CB0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Status: ${_getStatusText(widget.emergencyRequest.status)}',
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Tipo: ${_getTypeText(widget.emergencyRequest.type)}',
                  style: GoogleFonts.poppins(
                    color: Colors.white70,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          
          // Lista de mensagens
          Expanded(
            child: _messages.isEmpty
                ? _buildEmptyState()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      return _buildMessageBubble(message);
                    },
                  ),
          ),
          
          // Campo de entrada
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(
                top: BorderSide(color: Color(0xFFE2E8F0)),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    decoration: InputDecoration(
                      hintText: 'Digite sua mensagem...',
                      hintStyle: GoogleFonts.poppins(
                        color: Colors.grey[500],
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                    ),
                    maxLines: null,
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _sendMessage,
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: const BoxDecoration(
                      color: Color(0xFF2B6CB0),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.send,
                      color: Colors.white,
                      size: 24,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.chat_bubble_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhuma mensagem ainda',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Inicie uma conversa com o parceiro',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(Map<String, dynamic> message) {
    final isSystem = message['isSystem'] ?? false;
    final isFromPartner = message['isFromPartner'] ?? false;
    final content = message['content'] ?? '';
    final timestamp = message['timestamp'] as DateTime? ?? DateTime.now();

    if (isSystem) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.grey[200],
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              content,
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.grey[600],
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: isFromPartner 
            ? MainAxisAlignment.start 
            : MainAxisAlignment.end,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isFromPartner 
                  ? Colors.grey[200] 
                  : const Color(0xFF2B6CB0),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  content,
                  style: GoogleFonts.poppins(
                    color: isFromPartner ? Colors.black87 : Colors.white,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _formatTime(timestamp),
                  style: GoogleFonts.poppins(
                    color: isFromPartner ? Colors.grey[600] : Colors.white70,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _getStatusText(EmergencyStatus status) {
    switch (status) {
      case EmergencyStatus.pending:
        return 'Pendente';
      case EmergencyStatus.accepted:
        return 'Aceita';
      case EmergencyStatus.inProgress:
        return 'Em Andamento';
      case EmergencyStatus.completed:
        return 'Concluída';
      case EmergencyStatus.cancelled:
        return 'Cancelada';
    }
    return 'Indefinido';
  }

  String _getTypeText(EmergencyType type) {
    switch (type) {
      case EmergencyType.mechanical:
        return 'Mecânica';
      case EmergencyType.noFuel:
        return 'Combustível';
      case EmergencyType.flatTire:
        return 'Pneu';
      case EmergencyType.deadBattery:
        return 'Bateria';
      case EmergencyType.towing:
        return 'Reboque';
      case EmergencyType.other:
        return 'Outro';
    }
    return 'Tipo desconhecido';
  }

  String _formatTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inMinutes < 1) {
      return 'Agora';
    } else if (difference.inHours < 1) {
      return '${difference.inMinutes}m';
    } else if (difference.inDays < 1) {
      return '${difference.inHours}h';
    } else {
      return '${dateTime.day}/${dateTime.month}';
    }
  }
}

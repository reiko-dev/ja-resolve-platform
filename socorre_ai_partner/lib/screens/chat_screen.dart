import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:socorre_ai_partner/widgets/chat_card.dart';
import '../models/chat.dart';
import '../services/chat_service.dart';
import '../widgets/chat_input.dart';

class ChatScreen extends StatefulWidget {
  final Chat chat;
  
  const ChatScreen({
    super.key,
    required this.chat,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  int _currentPage = 1;
  int _totalPages = 1;
  String _error = '';
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final bool _isTyping = false;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _setupMessageCallbacks();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _setupMessageCallbacks() {
    // Callback para mensagens recebidas
    ChatService.setMessageCallback((message) {
      if (message.chatId == widget.chat.id) {
        setState(() {
          _messages.insert(0, message);
        });
        _scrollToBottom();
      }
    });
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      _loadMoreMessages();
    }
  }

  Future<void> _loadMessages() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      final result = await ChatService.getChatMessages(
        token: token,
        chatId: widget.chat.id,
        page: _currentPage,
        limit: 50,
      );

      if (result['success']) {
        setState(() {
          _messages = result['data'];
          _totalPages = result['pagination']['totalPages'] ?? 1;
        });
        _scrollToBottom();
      } else {
        setState(() {
          _error = result['message'];
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar mensagens: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMoreMessages() async {
    if (_currentPage >= _totalPages || _isLoadingMore) return;

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final token = 'fake_token';
      final result = await ChatService.getChatMessages(
        token: token,
        chatId: widget.chat.id,
        page: _currentPage + 1,
        limit: 50,
      );

      if (result['success']) {
        setState(() {
          _messages.addAll(result['data']);
          _currentPage++;
        });
      }
    } catch (e) {
      debugPrint('Erro ao carregar mais mensagens: $e');
    } finally {
      setState(() {
        _isLoadingMore = false;
      });
    }
  }

  void _sendMessage() {
    final message = _messageController.text.trim();
    if (message.isEmpty) return;

    // Enviar mensagem via WebSocket
    ChatService.sendMessage(
      chatId: widget.chat.id,
      message: message,
      type: MessageType.text,
    );

    // Limpar campo de texto
    _messageController.clear();

    // Scroll para baixo
    _scrollToBottom();
  }

  void _sendLocation() {
    // Implementar envio de localização
    ChatService.sendMessage(
      chatId: widget.chat.id,
      message: 'Localização enviada',
      type: MessageType.location,
      metadata: {
        'latitude': -23.5505,
        'longitude': -46.6333,
        'address': 'São Paulo, SP',
      },
    );
  }

  void _sendImage() {
    // Implementar envio de imagem
    ChatService.sendMessage(
      chatId: widget.chat.id,
      message: 'Imagem enviada',
      type: MessageType.image,
      attachments: ['image_url'],
    );
  }

  void _sendFile() {
    // Implementar envio de arquivo
    ChatService.sendMessage(
      chatId: widget.chat.id,
      message: 'Arquivo enviado',
      type: MessageType.file,
      attachments: ['file_url'],
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void markAsRead() {
    ChatService.markChatAsRead(widget.chat.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Row(
          children: [
            CircleAvatar(
              radius: 16,
              backgroundColor: const Color(0xFFE53E3E),
              backgroundImage: widget.chat.clientAvatar.isNotEmpty
                  ? NetworkImage(widget.chat.clientAvatar)
                  : null,
              child: widget.chat.clientAvatar.isEmpty
                  ? Text(
                      widget.chat.clientName.isNotEmpty
                          ? widget.chat.clientName[0].toUpperCase()
                          : 'C',
                      style: GoogleFonts.poppins(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.chat.clientName,
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    widget.chat.type.icon,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.videocam),
            onPressed: _startVideoCall,
          ),
          IconButton(
            icon: const Icon(Icons.phone),
            onPressed: _startVoiceCall,
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              switch (value) {
                case 'info':
                  _showChatInfo();
                  break;
                case 'archive':
                  _archiveChat();
                  break;
                case 'block':
                  _blockUser();
                  break;
              }
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'info',
                child: Row(
                  children: [
                    Icon(Icons.info, color: Colors.blue),
                    SizedBox(width: 8),
                    Text('Informações'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'archive',
                child: Row(
                  children: [
                    Icon(Icons.archive, color: Colors.orange),
                    SizedBox(width: 8),
                    Text('Arquivar'),
                  ],
                ),
              ),
              const PopupMenuItem(
                value: 'block',
                child: Row(
                  children: [
                    Icon(Icons.block, color: Colors.red),
                    SizedBox(width: 8),
                    Text('Bloquear'),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          // Lista de mensagens
          Expanded(
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
                    ),
                  )
                : _error.isNotEmpty
                    ? _buildErrorWidget()
                    : _messages.isEmpty
                        ? _buildEmptyWidget()
                        : ListView.builder(
                            controller: _scrollController,
                            reverse: true,
                            itemCount: _messages.length + (_isLoadingMore ? 1 : 0),
                            itemBuilder: (context, index) {
                              if (index < _messages.length) {
                                return ChatMessageBubble(
                                  message: _messages[index],
                                  isFromCurrentUser: _messages[index].senderId == 'current_user',
                                );
                              } else if (_isLoadingMore) {
                                return const Center(
                                  child: Padding(
                                    padding: EdgeInsets.all(16),
                                    child: CircularProgressIndicator(),
                                  ),
                                );
                              }
                              return null;
                            },
                          ),
          ),
          
          // Indicador de digitação
          if (_isTyping)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Text(
                    '${widget.chat.clientName} está digitando...',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                  const SizedBox(width: 8),
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
                    ),
                  ),
                ],
              ),
            ),
          
          // Campo de entrada
          ChatInput(
            controller: _messageController,
            onSend: _sendMessage,
            onLocation: _sendLocation,
            onImage: _sendImage,
            onFile: _sendFile,
          ),
        ],
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Erro ao carregar mensagens',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _error,
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _loadMessages,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyWidget() {
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
            'Nenhuma mensagem',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Inicie uma conversa com ${widget.chat.clientName}',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  void _startVideoCall() {
    // Implementar chamada de vídeo
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Chamada de vídeo em desenvolvimento')),
    );
  }

  void _startVoiceCall() {
    // Implementar chamada de voz
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Chamada de voz em desenvolvimento')),
    );
  }

  void _showChatInfo() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Informações do Chat',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Cliente: ${widget.chat.clientName}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            Text(
              'Tipo: ${widget.chat.type.toString()}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            Text(
              'Última mensagem: ${widget.chat.lastMessageTimeFormatted}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Fechar',
              style: GoogleFonts.poppins(
                color: const Color(0xFFE53E3E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _archiveChat() {
    // Implementar arquivamento
    Navigator.pop(context);
  }

  void _blockUser() {
    // Implementar bloqueio
    Navigator.pop(context);
  }
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/chat.dart';
import '../services/chat_service.dart';
import '../widgets/chat_card.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  List<Chat> _chats = [];
  bool _isLoading = true;
  bool _isLoadingMore = false;
  int _currentPage = 1;
  int _totalPages = 1;
  String _error = '';
  String _searchQuery = '';
  String _filterType = 'all';

  @override
  void initState() {
    super.initState();
    _loadChats();
    _setupChatCallbacks();
  }

  void _setupChatCallbacks() {
    // Callback para mensagens recebidas
    ChatService.setMessageCallback((message) {
      setState(() {
        // Atualizar chat com nova mensagem
        final chatIndex = _chats.indexWhere((chat) => chat.id == message.chatId);
        if (chatIndex != -1) {
          _chats[chatIndex] = Chat(
            id: _chats[chatIndex].id,
            partnerId: _chats[chatIndex].partnerId,
            clientId: _chats[chatIndex].clientId,
            clientName: _chats[chatIndex].clientName,
            clientAvatar: _chats[chatIndex].clientAvatar,
            lastMessage: message.message,
            lastMessageTime: message.timestamp,
            unreadCount: _chats[chatIndex].unreadCount + (message.senderId != 'current_user' ? 1 : 0),
            isActive: _chats[chatIndex].isActive,
            type: _chats[chatIndex].type,
            metadata: _chats[chatIndex].metadata,
          );
        }
      });
    });

    // Callback para atualizações de chat
    ChatService.setChatCallback((chat) {
      setState(() {
        final chatIndex = _chats.indexWhere((c) => c.id == chat.id);
        if (chatIndex != -1) {
          _chats[chatIndex] = chat;
        } else {
          _chats.insert(0, chat);
        }
      });
    });
  }

  Future<void> _loadChats() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      // Simular token de autenticação
      final token = 'fake_token';
      
      final result = await ChatService.getChats(
        token: token,
        page: _currentPage,
        limit: 20,
      );

      if (result['success']) {
        setState(() {
          _chats = result['data'];
          _totalPages = result['pagination']['totalPages'] ?? 1;
        });
      } else {
        setState(() {
          _error = result['message'];
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar chats: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadMoreChats() async {
    if (_currentPage >= _totalPages || _isLoadingMore) return;

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final token = 'fake_token';
      final result = await ChatService.getChats(
        token: token,
        page: _currentPage + 1,
        limit: 20,
      );

      if (result['success']) {
        setState(() {
          _chats.addAll(result['data']);
          _currentPage++;
        });
      }
    } catch (e) {
      debugPrint('Erro ao carregar mais chats: $e');
    } finally {
      setState(() {
        _isLoadingMore = false;
      });
    }
  }

  void _onSearchChanged(String query) {
    setState(() {
      _searchQuery = query;
    });
  }

  void _onFilterChanged(String filter) {
    setState(() {
      _filterType = filter;
    });
  }

  Future<void> _onRefresh() async {
    _currentPage = 1;
    _loadChats();
  }

  List<Chat> get _filteredChats {
    var filtered = _chats;

    // Filtrar por tipo
    if (_filterType != 'all') {
      filtered = filtered.where((chat) => chat.type.toString() == _filterType).toList();
    }

    // Filtrar por busca
    if (_searchQuery.isNotEmpty) {
      filtered = filtered.where((chat) =>
          chat.clientName.toLowerCase().contains(_searchQuery.toLowerCase()) ||
          chat.lastMessage.toLowerCase().contains(_searchQuery.toLowerCase())
      ).toList();
    }

    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Conversas',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: _showSearchDialog,
          ),
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
          ),
          IconButton(
            icon: const Icon(Icons.archive),
            onPressed: _showArchivedChats,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _error.isNotEmpty
              ? _buildErrorWidget()
              : RefreshIndicator(
                  onRefresh: _onRefresh,
                  color: const Color(0xFFE53E3E),
                  child: _filteredChats.isEmpty
                      ? _buildEmptyWidget()
                      : ListView.builder(
                          itemCount: _filteredChats.length + (_isLoadingMore ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index < _filteredChats.length) {
                              return ChatCard(
                                chat: _filteredChats[index],
                                onTap: () => _openChat(_filteredChats[index]),
                                onArchive: () => _archiveChat(_filteredChats[index]),
                              );
                            } else if (_isLoadingMore) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16),
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            } else if (_currentPage < _totalPages) {
                              return Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: ElevatedButton(
                                    onPressed: _loadMoreChats,
                                    child: const Text('Carregar mais'),
                                  ),
                                ),
                              );
                            }
                            return null;
                          },
                        ),
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
            'Erro ao carregar conversas',
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
            onPressed: _onRefresh,
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
            'Nenhuma conversa',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Você receberá notificações quando\nclientes iniciarem conversas',
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

  void _showSearchDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Buscar Conversas',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: TextField(
          onChanged: _onSearchChanged,
          style: GoogleFonts.poppins(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Digite o nome do cliente ou mensagem',
            hintStyle: GoogleFonts.poppins(color: Colors.white70),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Colors.white30),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xFFE53E3E)),
            ),
          ),
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

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Filtrar Conversas',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: Text(
                'Todas',
                style: GoogleFonts.poppins(color: Colors.white),
              ),
              value: 'all',
              groupValue: _filterType,
              onChanged: (value) {
                if (value != null) {
                  _onFilterChanged(value);
                  Navigator.pop(context);
                }
              },
            ),
            RadioListTile<String>(
              title: Text(
                'Emergência',
                style: GoogleFonts.poppins(color: Colors.white),
              ),
              value: 'emergency',
              groupValue: _filterType,
              onChanged: (value) {
                if (value != null) {
                  _onFilterChanged(value);
                  Navigator.pop(context);
                }
              },
            ),
            RadioListTile<String>(
              title: Text(
                'Agendamento',
                style: GoogleFonts.poppins(color: Colors.white),
              ),
              value: 'appointment',
              groupValue: _filterType,
              onChanged: (value) {
                if (value != null) {
                  _onFilterChanged(value);
                  Navigator.pop(context);
                }
              },
            ),
            RadioListTile<String>(
              title: Text(
                'Entrega',
                style: GoogleFonts.poppins(color: Colors.white),
              ),
              value: 'delivery',
              groupValue: _filterType,
              onChanged: (value) {
                if (value != null) {
                  _onFilterChanged(value);
                  Navigator.pop(context);
                }
              },
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

  void _showArchivedChats() {
    // Implementar tela de chats arquivados
    Navigator.pushNamed(context, '/archived-chats');
  }

  void _openChat(Chat chat) {
    Navigator.pushNamed(context, '/chat', arguments: chat);
  }

  void _archiveChat(Chat chat) {
    // Implementar arquivamento
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Arquivar Conversa',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Tem certeza que deseja arquivar esta conversa?',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
          TextButton(
            onPressed: () {
              // Implementar arquivamento
              Navigator.pop(context);
            },
            child: Text(
              'Arquivar',
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
}

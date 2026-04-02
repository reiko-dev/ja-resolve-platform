import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../widgets/notification_badge.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>> _notifications = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  Future<void> _loadNotifications() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // Simular carregamento de notificações
      await Future.delayed(const Duration(seconds: 1));
      
      // Dados de exemplo
      setState(() {
        _notifications = [
          {
            'id': '1',
            'title': 'Nova Solicitação de Emergência',
            'body': 'Cliente João Silva solicitou serviço de mecânico na Rua das Flores, 123',
            'time': 'Há 5 minutos',
            'isRead': false,
            'type': 'emergency_request',
            'data': {'request_id': '123', 'client_name': 'João Silva'},
          },
          {
            'id': '2',
            'title': 'Solicitação Aceita',
            'body': 'Sua solicitação de emergência foi aceita pelo mecânico Carlos',
            'time': 'Há 1 hora',
            'isRead': true,
            'type': 'request_accepted',
            'data': {'mechanic_name': 'Carlos'},
          },
          {
            'id': '3',
            'title': 'Nova Entrega Disponível',
            'body': 'Entrega de peças automotivas disponível na sua região',
            'time': 'Há 2 horas',
            'isRead': false,
            'type': 'delivery_request',
            'data': {'delivery_id': '456'},
          },
          {
            'id': '4',
            'title': 'Agendamento Confirmado',
            'body': 'Seu agendamento para amanhã às 14:00 foi confirmado',
            'time': 'Ontem',
            'isRead': true,
            'type': 'appointment_confirmed',
            'data': {'appointment_id': '789'},
          },
          {
            'id': '5',
            'title': 'Avaliação Recebida',
            'body': 'Você recebeu uma avaliação de 5 estrelas do cliente Maria',
            'time': 'Ontem',
            'isRead': true,
            'type': 'review_received',
            'data': {'rating': 5, 'client_name': 'Maria'},
          },
        ];
      });
    } catch (e) {
      _showErrorDialog('Erro ao carregar notificações: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Erro',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          message,
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'OK',
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

  void _markAsRead(String notificationId) {
    setState(() {
      final index = _notifications.indexWhere((n) => n['id'] == notificationId);
      if (index != -1) {
        _notifications[index]['isRead'] = true;
      }
    });
  }

  void _markAllAsRead() {
    setState(() {
      for (var notification in _notifications) {
        notification['isRead'] = true;
      }
    });
  }

  void _deleteNotification(String notificationId) {
    setState(() {
      _notifications.removeWhere((n) => n['id'] == notificationId);
    });
  }

  void _clearAllNotifications() {
    setState(() {
      _notifications.clear();
    });
  }

  void _handleNotificationTap(Map<String, dynamic> notification) {
    _markAsRead(notification['id']);
    
    // Navegar para tela específica baseada no tipo
    switch (notification['type']) {
      case 'emergency_request':
        Navigator.pushNamed(context, '/emergency-requests');
        break;
      case 'delivery_request':
        Navigator.pushNamed(context, '/delivery-requests');
        break;
      case 'appointment_confirmed':
        Navigator.pushNamed(context, '/appointments');
        break;
      default:
        Navigator.pushNamed(context, '/dashboard');
        break;
    }
  }

  int get _unreadCount {
    return _notifications.where((n) => !n['isRead']).length;
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
            Text(
              'Notificações',
              style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
            ),
            if (_unreadCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFE53E3E),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _unreadCount.toString(),
                  style: GoogleFonts.poppins(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ],
        ),
        centerTitle: true,
        actions: [
          if (_notifications.isNotEmpty)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (value) {
                switch (value) {
                  case 'mark_all_read':
                    _markAllAsRead();
                    break;
                  case 'clear_all':
                    _clearAllNotifications();
                    break;
                }
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: 'mark_all_read',
                  child: Row(
                    children: [
                      const Icon(Icons.done_all, color: Colors.blue),
                      const SizedBox(width: 8),
                      Text(
                        'Marcar todas como lidas',
                        style: GoogleFonts.poppins(),
                      ),
                    ],
                  ),
                ),
                PopupMenuItem(
                  value: 'clear_all',
                  child: Row(
                    children: [
                      const Icon(Icons.clear_all, color: Colors.red),
                      const SizedBox(width: 8),
                      Text(
                        'Limpar todas',
                        style: GoogleFonts.poppins(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : NotificationList(
              notifications: _notifications,
              onNotificationTap: _handleNotificationTap,
            ),
    );
  }
}

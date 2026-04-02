const jwt = require('jsonwebtoken');
const db = require('../config/database');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userId
  }

  initialize(server) {
    const { Server } = require('socket.io');
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.io.use(this.authenticateSocket.bind(this));
    this.io.on('connection', this.handleConnection.bind(this));
    
    console.log('Socket.IO server initialized');
  }

  async authenticateSocket(socket, next) {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Token de autenticação não fornecido'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await db('users').where('id', decoded.id).first();
      
      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      socket.userId = user.id;
      socket.userRole = user.role;
      next();
    } catch (error) {
      console.error('Erro na autenticação do socket:', error);
      next(new Error('Token inválido'));
    }
  }

  handleConnection(socket) {
    console.log(`Usuário conectado: ${socket.userId} (${socket.userRole})`);
    
    // Armazenar conexão do usuário
    this.connectedUsers.set(socket.userId, socket.id);
    this.userSockets.set(socket.id, socket.userId);

    // Eventos do chat
    socket.on('join_chat', (data) => this.handleJoinChat(socket, data));
    socket.on('send_message', (data) => this.handleSendMessage(socket, data));
    socket.on('typing_start', (data) => this.handleTypingStart(socket, data));
    socket.on('typing_stop', (data) => this.handleTypingStop(socket, data));
    
    // Eventos de emergência
    socket.on('join_emergency', (data) => this.handleJoinEmergency(socket, data));
    socket.on('emergency_update', (data) => this.handleEmergencyUpdate(socket, data));
    socket.on('partner_location_update', (data) => this.handlePartnerLocationUpdate(socket, data));
    
    // Eventos de notificação
    socket.on('subscribe_notifications', () => this.handleSubscribeNotifications(socket));
    socket.on('unsubscribe_notifications', () => this.handleUnsubscribeNotifications(socket));
    
    // Desconexão
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  async handleJoinChat(socket, data) {
    try {
      const { chatId, partnerId } = data;
      
      // Verificar se o usuário tem acesso ao chat
      const chat = await db('emergency_requests')
        .where('id', chatId)
        .where(function() {
          this.where('user_id', socket.userId)
            .orWhere('partner_id', socket.userId);
        })
        .first();

      if (!chat) {
        socket.emit('error', { message: 'Chat não encontrado ou acesso negado' });
        return;
      }

      // Entrar na sala do chat
      socket.join(`chat_${chatId}`);
      
      // Notificar outros participantes
      socket.to(`chat_${chatId}`).emit('user_joined', {
        userId: socket.userId,
        timestamp: new Date()
      });

      console.log(`Usuário ${socket.userId} entrou no chat ${chatId}`);
    } catch (error) {
      console.error('Erro ao entrar no chat:', error);
      socket.emit('error', { message: 'Erro ao entrar no chat' });
    }
  }

  async handleSendMessage(socket, data) {
    try {
      const { chatId, message, type = 'text' } = data;
      
      // Verificar se o usuário tem acesso ao chat
      const chat = await db('emergency_requests')
        .where('id', chatId)
        .where(function() {
          this.where('user_id', socket.userId)
            .orWhere('partner_id', socket.userId);
        })
        .first();

      if (!chat) {
        socket.emit('error', { message: 'Chat não encontrado ou acesso negado' });
        return;
      }

      // Salvar mensagem no banco
      const [messageId] = await db('chat_messages').insert({
        chat_id: chatId,
        sender_id: socket.userId,
        message: message,
        type: type,
        created_at: new Date()
      });

      // Enviar mensagem para todos os participantes do chat
      this.io.to(`chat_${chatId}`).emit('new_message', {
        id: messageId,
        chatId: chatId,
        senderId: socket.userId,
        message: message,
        type: type,
        timestamp: new Date()
      });

      console.log(`Mensagem enviada no chat ${chatId} por ${socket.userId}`);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      socket.emit('error', { message: 'Erro ao enviar mensagem' });
    }
  }

  handleTypingStart(socket, data) {
    const { chatId } = data;
    socket.to(`chat_${chatId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping: true
    });
  }

  handleTypingStop(socket, data) {
    const { chatId } = data;
    socket.to(`chat_${chatId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping: false
    });
  }

  async handleJoinEmergency(socket, data) {
    try {
      const { emergencyId } = data;
      
      // Verificar se o usuário tem acesso à emergência
      const emergency = await db('emergency_requests')
        .where('id', emergencyId)
        .where(function() {
          this.where('user_id', socket.userId)
            .orWhere('partner_id', socket.userId);
        })
        .first();

      if (!emergency) {
        socket.emit('error', { message: 'Emergência não encontrada ou acesso negado' });
        return;
      }

      // Entrar na sala da emergência
      socket.join(`emergency_${emergencyId}`);
      
      console.log(`Usuário ${socket.userId} entrou na emergência ${emergencyId}`);
    } catch (error) {
      console.error('Erro ao entrar na emergência:', error);
      socket.emit('error', { message: 'Erro ao entrar na emergência' });
    }
  }

  async handleEmergencyUpdate(socket, data) {
    try {
      const { emergencyId, status, location } = data;
      
      // Atualizar status da emergência no banco
      await db('emergency_requests')
        .where('id', emergencyId)
        .update({
          status: status,
          updated_at: new Date()
        });

      // Notificar todos os participantes da emergência
      this.io.to(`emergency_${emergencyId}`).emit('emergency_updated', {
        emergencyId: emergencyId,
        status: status,
        location: location,
        timestamp: new Date()
      });

      console.log(`Emergência ${emergencyId} atualizada: ${status}`);
    } catch (error) {
      console.error('Erro ao atualizar emergência:', error);
      socket.emit('error', { message: 'Erro ao atualizar emergência' });
    }
  }

  async handlePartnerLocationUpdate(socket, data) {
    try {
      const { emergencyId, latitude, longitude } = data;
      
      // Atualizar localização do parceiro
      await db('emergency_requests')
        .where('id', emergencyId)
        .update({
          partner_latitude: latitude,
          partner_longitude: longitude,
          updated_at: new Date()
        });

      // Notificar cliente sobre a localização do parceiro
      this.io.to(`emergency_${emergencyId}`).emit('partner_location_updated', {
        emergencyId: emergencyId,
        latitude: latitude,
        longitude: longitude,
        timestamp: new Date()
      });

      console.log(`Localização do parceiro atualizada para emergência ${emergencyId}`);
    } catch (error) {
      console.error('Erro ao atualizar localização do parceiro:', error);
      socket.emit('error', { message: 'Erro ao atualizar localização' });
    }
  }

  handleSubscribeNotifications(socket) {
    socket.join(`notifications_${socket.userId}`);
    console.log(`Usuário ${socket.userId} se inscreveu em notificações`);
  }

  handleUnsubscribeNotifications(socket) {
    socket.leave(`notifications_${socket.userId}`);
    console.log(`Usuário ${socket.userId} se desinscreveu das notificações`);
  }

  handleDisconnect(socket) {
    console.log(`Usuário desconectado: ${socket.userId}`);
    
    // Remover das listas de usuários conectados
    this.connectedUsers.delete(socket.userId);
    this.userSockets.delete(socket.id);
  }

  // Métodos para enviar notificações
  sendNotificationToUser(userId, notification) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
    }
  }

  sendNotificationToRole(role, notification) {
    this.io.emit('notification', {
      ...notification,
      targetRole: role
    });
  }

  sendEmergencyAlert(emergencyData) {
    // Enviar alerta para todos os parceiros online
    this.io.emit('emergency_alert', emergencyData);
  }

  sendChatMessage(chatId, message) {
    this.io.to(`chat_${chatId}`).emit('new_message', message);
  }

  sendEmergencyUpdate(emergencyId, update) {
    this.io.to(`emergency_${emergencyId}`).emit('emergency_updated', update);
  }

  // Verificar se usuário está online
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  // Obter socket de um usuário
  getSocketByUserId(userId) {
    const socketId = this.connectedUsers.get(userId);
    return socketId ? this.io.sockets.sockets.get(socketId) : null;
  }

  // Obter todos os usuários online
  getOnlineUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  // Obter estatísticas
  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      totalSockets: this.io.sockets.sockets.size,
      onlineUsers: this.getOnlineUsers()
    };
  }
}

module.exports = new SocketService();

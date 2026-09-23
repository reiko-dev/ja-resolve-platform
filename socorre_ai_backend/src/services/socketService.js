const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { getJwtSecret } = require('../config/jwt');
const { getAllowedOrigins } = require('../config/cors');
const { isTokenRevoked } = require('./tokenRevocationService');

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
        // Same explicit allowlist as HTTP (CORS_ORIGIN). No open "*".
        origin: getAllowedOrigins(),
        methods: ["GET", "POST"],
        credentials: true,
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

      const decoded = jwt.verify(token, getJwtSecret());

      if (await isTokenRevoked(token)) {
        return next(new Error('Token revogado'));
      }

      const user = await db('users').where('id', decoded.userId).first();
      
      if (!user) {
        return next(new Error('Usuário não encontrado'));
      }

      if (!user.is_active) {
        return next(new Error('Token inválido'));
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

    // Eventos do Tow (canonical tow_requests / tow_assignments)
    socket.on('join_tow_request', (data) => this.handleJoinTowRequest(socket, data));
    
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
        .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id')
        .where('emergency_requests.id', chatId)
        .where(function() {
          this.where('emergency_requests.user_id', socket.userId)
            .orWhere('partners.user_id', socket.userId);
        })
        .select('emergency_requests.*')
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
        .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id')
        .where('emergency_requests.id', chatId)
        .where(function() {
          this.where('emergency_requests.user_id', socket.userId)
            .orWhere('partners.user_id', socket.userId);
        })
        .select('emergency_requests.*')
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
    if (!socket.rooms?.has?.(`chat_${chatId}`)) return;
    socket.to(`chat_${chatId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping: true
    });
  }

  handleTypingStop(socket, data) {
    const { chatId } = data;
    if (!socket.rooms?.has?.(`chat_${chatId}`)) return;
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
        .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id')
        .where('emergency_requests.id', emergencyId)
        .where(function() {
          this.where('emergency_requests.user_id', socket.userId)
            .orWhere('partners.user_id', socket.userId);
        })
        .select('emergency_requests.*')
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
      const { emergencyId, location } = data;
      const emergency = await this.findSocketEmergency(socket, emergencyId);
      if (!emergency || (socket.userRole !== 'admin' && emergency.partner_user_id !== socket.userId)) {
        socket.emit('error', { message: 'Emergência não encontrada ou acesso negado' });
        return;
      }

      // Status transitions must use HTTP endpoints, which enforce state, price,
      // ownership and idempotency rules. Socket.IO only broadcasts the update.
      this.io.to(`emergency_${emergencyId}`).emit('emergency_updated', {
        emergencyId,
        status: emergency.status,
        location,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Erro ao atualizar emergência:', error);
      socket.emit('error', { message: 'Erro ao atualizar emergência' });
    }
  }

  async handlePartnerLocationUpdate(socket, data) {
    try {
      const { emergencyId, latitude, longitude } = data;
      const emergency = await this.findSocketEmergency(socket, emergencyId);
      if (!emergency || (socket.userRole !== 'admin' && emergency.partner_user_id !== socket.userId)) {
        socket.emit('error', { message: 'Emergência não encontrada ou acesso negado' });
        return;
      }
      if (!['accepted', 'in_progress'].includes(emergency.status)) {
        socket.emit('error', { message: 'Localização indisponível para este estado' });
        return;
      }
      if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) ||
          Number(latitude) < -90 || Number(latitude) > 90 ||
          Number(longitude) < -180 || Number(longitude) > 180) {
        socket.emit('error', { message: 'Coordenadas inválidas' });
        return;
      }

      await db('emergency_requests')
        .where('id', emergencyId)
        .whereIn('status', ['accepted', 'in_progress'])
        .where(function() {
          this.where('partner_id', emergency.partner_id);
        })
        .update({
          partner_latitude: Number(latitude),
          partner_longitude: Number(longitude),
          updated_at: new Date()
        });

      // Notificar cliente sobre a localização do parceiro
      this.io.to(`emergency_${emergencyId}`).emit('partner_location_updated', {
        emergencyId: emergencyId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        timestamp: new Date()
      });

      console.log(`Localização do parceiro atualizada para emergência ${emergencyId}`);
    } catch (error) {
      console.error('Erro ao atualizar localização do parceiro:', error);
      socket.emit('error', { message: 'Erro ao atualizar localização' });
    }
  }

  async findSocketEmergency(socket, emergencyId) {
    return db('emergency_requests')
      .leftJoin('partners', 'emergency_requests.partner_id', 'partners.id')
      .where('emergency_requests.id', emergencyId)
      .select('emergency_requests.*', 'partners.user_id as partner_user_id')
      .first();
  }

  /**
   * Tow — join the room of one canonical request.
   *
   * Authorization mirrors the REST tracking read exactly: the OWNING customer
   * or the ASSIGNED partner (the `tow_assignments.partner_id` authority, which
   * survives release like every other execution read). Everyone else gets the
   * same refusal, so the room can never leak a foreign request's positions.
   * The room name (`tow_request_<id>`) is what `sendTowTrackingUpdated` targets.
   */
  async handleJoinTowRequest(socket, data) {
    try {
      const raw = data && (data.requestId !== undefined ? data.requestId : data.request_id);
      const requestId = Number(raw);
      if (!Number.isSafeInteger(requestId) || requestId <= 0) {
        socket.emit('error', { message: 'Solicitação Tow inválida' });
        return;
      }

      const request = await db('tow_requests').where('id', requestId).first();
      if (!request) {
        socket.emit('error', { message: 'Solicitação Tow não encontrada ou acesso negado' });
        return;
      }

      let authorized = String(request.customer_id) === String(socket.userId);
      if (!authorized && socket.userRole === 'partner') {
        const assignment = await db('tow_assignments')
          .join('partners', 'tow_assignments.partner_id', 'partners.id')
          .where('tow_assignments.tow_request_id', requestId)
          .where('partners.user_id', socket.userId)
          .select('tow_assignments.id')
          .first();
        authorized = Boolean(assignment);
      }

      if (!authorized) {
        socket.emit('error', { message: 'Solicitação Tow não encontrada ou acesso negado' });
        return;
      }

      socket.join(`tow_request_${requestId}`);
      console.log(`Usuário ${socket.userId} entrou no tracking da solicitação Tow ${requestId}`);
    } catch (error) {
      console.error('Erro ao entrar no tracking da solicitação Tow:', error);
      socket.emit('error', { message: 'Erro ao entrar no tracking da solicitação Tow' });
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
    this.userSockets.delete(socket.id);
    if (this.connectedUsers.get(socket.userId) === socket.id) {
      const remainingSocketId = Array.from(this.userSockets.entries())
        .find(([, userId]) => userId === socket.userId)?.[0];
      if (remainingSocketId) {
        this.connectedUsers.set(socket.userId, remainingSocketId);
      } else {
        this.connectedUsers.delete(socket.userId);
      }
    }
  }

  disconnectUserSockets(userId, reason = 'server namespace disconnect') {
    if (!this.io) {
      return;
    }

    for (const [socketId, connectedUserId] of this.userSockets.entries()) {
      if (connectedUserId !== userId) {
        continue;
      }

      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      } else {
        this.userSockets.delete(socketId);
      }
    }
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

  /**
   * Tow — the `tow_tracking_updated` invalidation signal.
   *
   * Emitted ONLY after the canonical point was persisted (the Tow tracking
   * service publishes it through its port) and ONLY to the request room. The
   * payload is deliberately minimal: the canonical request id and the backend
   * instant of the stored point. The client reconciles through
   * `GET /tow/requests/{requestId}/tracking` — this event is never the
   * position authority. A no-op when the realtime server is not initialized.
   */
  sendTowTrackingUpdated(requestId, payload = {}) {
    if (!this.io) return;
    this.io.to(`tow_request_${requestId}`).emit('tow_tracking_updated', {
      request_id: String(requestId),
      received_at: payload.received_at ?? null,
    });
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

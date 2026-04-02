const admin = require('firebase-admin');
const db = require('../config/database');

class NotificationService {
  constructor() {
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Inicializar Firebase Admin SDK
      if (!admin.apps.length) {
        const serviceAccount = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      }

      this.initialized = true;
      console.log('✅ Firebase Admin SDK inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Firebase Admin SDK:', error);
    }
  }

  async sendNotificationToUser(userId, notification) {
    try {
      await this.initialize();

      // Buscar token FCM do usuário
      const user = await db('users')
        .select('fcm_token', 'name')
        .where('id', userId)
        .first();

      if (!user || !user.fcm_token) {
        console.log(`Usuário ${userId} não possui token FCM`);
        return false;
      }

      const message = {
        token: user.fcm_token,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl
        },
        data: {
          type: notification.type || 'general',
          emergencyId: notification.emergencyId || '',
          partnerId: notification.partnerId || '',
          chatId: notification.chatId || '',
          ...notification.data
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#E53E3E',
            sound: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log(`✅ Notificação enviada para ${user.name}: ${response}`);

      // Salvar notificação no banco
      await this.saveNotification(userId, notification);

      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar notificação:', error);
      return false;
    }
  }

  async sendNotificationToRole(role, notification) {
    try {
      await this.initialize();

      // Buscar todos os usuários com a role especificada e token FCM
      const users = await db('users')
        .select('id', 'fcm_token', 'name')
        .where('role', role)
        .whereNotNull('fcm_token');

      if (users.length === 0) {
        console.log(`Nenhum usuário com role ${role} possui token FCM`);
        return false;
      }

      const tokens = users.map(user => user.fcm_token).filter(Boolean);

      const message = {
        tokens: tokens,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl
        },
        data: {
          type: notification.type || 'general',
          ...notification.data
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#E53E3E',
            sound: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await admin.messaging().sendMulticast(message);
      console.log(`✅ Notificação enviada para ${response.successCount} usuários com role ${role}`);

      // Salvar notificação para cada usuário
      for (const user of users) {
        await this.saveNotification(user.id, notification);
      }

      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar notificação para role:', error);
      return false;
    }
  }

  async sendEmergencyAlert(emergencyData) {
    try {
      const notification = {
        title: '🚨 Nova Emergência!',
        body: `Emergência em ${emergencyData.address}`,
        type: 'emergency',
        data: {
          emergencyId: emergencyData.id,
          latitude: emergencyData.latitude,
          longitude: emergencyData.longitude,
          address: emergencyData.address
        }
      };

      // Enviar para todos os parceiros online
      await this.sendNotificationToRole('partner', notification);

      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar alerta de emergência:', error);
      return false;
    }
  }

  async sendChatMessage(chatId, messageData) {
    try {
      const notification = {
        title: '💬 Nova Mensagem',
        body: messageData.message,
        type: 'chat',
        data: {
          chatId: chatId,
          senderId: messageData.senderId
        }
      };

      // Enviar para o destinatário da mensagem
      await this.sendNotificationToUser(messageData.receiverId, notification);

      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar notificação de chat:', error);
      return false;
    }
  }

  async sendEmergencyUpdate(emergencyId, updateData) {
    try {
      // Buscar dados da emergência
      const emergency = await db('emergency_requests')
        .select('user_id', 'partner_id', 'address')
        .where('id', emergencyId)
        .first();

      if (!emergency) return false;

      const notification = {
        title: '📱 Atualização da Emergência',
        body: `Status: ${updateData.status}`,
        type: 'emergency_update',
        data: {
          emergencyId: emergencyId,
          status: updateData.status
        }
      };

      // Enviar para cliente e parceiro
      if (emergency.user_id) {
        await this.sendNotificationToUser(emergency.user_id, notification);
      }
      if (emergency.partner_id) {
        await this.sendNotificationToUser(emergency.partner_id, notification);
      }

      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar atualização de emergência:', error);
      return false;
    }
  }

  async sendPartnerLocationUpdate(emergencyId, locationData) {
    try {
      // Buscar dados da emergência
      const emergency = await db('emergency_requests')
        .select('user_id', 'address')
        .where('id', emergencyId)
        .first();

      if (!emergency) return false;

      const notification = {
        title: '📍 Parceiro em Movimento',
        body: 'Seu parceiro está a caminho!',
        type: 'location_update',
        data: {
          emergencyId: emergencyId,
          latitude: locationData.latitude,
          longitude: locationData.longitude
        }
      };

      // Enviar apenas para o cliente
      if (emergency.user_id) {
        await this.sendNotificationToUser(emergency.user_id, notification);
      }

      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar atualização de localização:', error);
      return false;
    }
  }

  async saveNotification(userId, notification) {
    try {
      await db('notifications').insert({
        user_id: userId,
        title: notification.title,
        body: notification.body,
        type: notification.type || 'general',
        data: JSON.stringify(notification.data || {}),
        is_read: false,
        created_at: new Date()
      });
    } catch (error) {
      console.error('❌ Erro ao salvar notificação no banco:', error);
    }
  }

  async getUserNotifications(userId, limit = 20, offset = 0) {
    try {
      const notifications = await db('notifications')
        .select('*')
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return notifications.map(notification => ({
        ...notification,
        data: JSON.parse(notification.data || '{}')
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar notificações:', error);
      return [];
    }
  }

  async markNotificationAsRead(notificationId, userId) {
    try {
      await db('notifications')
        .where('id', notificationId)
        .where('user_id', userId)
        .update({
          is_read: true,
          read_at: new Date()
        });

      return true;
    } catch (error) {
      console.error('❌ Erro ao marcar notificação como lida:', error);
      return false;
    }
  }

  async markAllNotificationsAsRead(userId) {
    try {
      await db('notifications')
        .where('user_id', userId)
        .where('is_read', false)
        .update({
          is_read: true,
          read_at: new Date()
        });

      return true;
    } catch (error) {
      console.error('❌ Erro ao marcar todas as notificações como lidas:', error);
      return false;
    }
  }

  async getUnreadCount(userId) {
    try {
      const [result] = await db('notifications')
        .where('user_id', userId)
        .where('is_read', false)
        .count('* as count');

      return result.count;
    } catch (error) {
      console.error('❌ Erro ao contar notificações não lidas:', error);
      return 0;
    }
  }

  async updateUserFCMToken(userId, fcmToken) {
    try {
      await db('users')
        .where('id', userId)
        .update({
          fcm_token: fcmToken,
          updated_at: new Date()
        });

      console.log(`✅ Token FCM atualizado para usuário ${userId}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao atualizar token FCM:', error);
      return false;
    }
  }
}

module.exports = new NotificationService();

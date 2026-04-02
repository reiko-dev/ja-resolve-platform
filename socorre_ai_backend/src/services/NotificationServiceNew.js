const knex = require('../config/database');

class NotificationService {
  // Enviar notificação para usuário
  static async sendNotification(userId, title, message, data = {}) {
    try {
      // Salvar notificação no banco
      const [notification] = await knex('notifications').insert({
        user_id: userId,
        title,
        message,
        data: JSON.stringify(data),
        type: data.type || 'general',
        read: false,
        created_at: new Date()
      }).returning('*');

      // Enviar notificação push (se implementado)
      await this.sendPushNotification(userId, title, message, data);

      return notification;
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
      throw error;
    }
  }

  // Enviar notificação para parceiro
  static async sendPartnerNotification(partnerId, title, message, data = {}) {
    try {
      // Buscar user_id do parceiro
      const partner = await knex('partners')
        .where('id', partnerId)
        .first();

      if (!partner) {
        throw new Error('Parceiro não encontrado');
      }

      return await this.sendNotification(partner.user_id, title, message, data);
    } catch (error) {
      console.error('Erro ao enviar notificação para parceiro:', error);
      throw error;
    }
  }

  // Enviar notificação push (implementação placeholder)
  static async sendPushNotification(userId, title, message, data = {}) {
    try {
      // TODO: Implementar integração com serviço de push notifications
      console.log(`Push notification para usuário ${userId}:`, {
        title,
        message,
        data
      });

      return true;
    } catch (error) {
      console.error('Erro ao enviar notificação push:', error);
      return false;
    }
  }

  // Buscar notificações não lidas
  static async getUnreadNotifications(userId) {
    try {
      return await knex('notifications')
        .where('user_id', userId)
        .where('read', false)
        .orderBy('created_at', 'desc')
        .limit(50);
    } catch (error) {
      console.error('Erro ao buscar notificações não lidas:', error);
      throw error;
    }
  }

  // Contar notificações não lidas
  static async getUnreadCount(userId) {
    try {
      const result = await knex('notifications')
        .where('user_id', userId)
        .where('read', false)
        .count('* as count')
        .first();

      return result.count;
    } catch (error) {
      console.error('Erro ao contar notificações não lidas:', error);
      return 0;
    }
  }

  // Marcar notificação como lida
  static async markAsRead(notificationId, userId) {
    try {
      const [notification] = await knex('notifications')
        .where('id', notificationId)
        .where('user_id', userId)
        .update({
          read: true,
          read_at: new Date()
        })
        .returning('*');

      return notification;
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;

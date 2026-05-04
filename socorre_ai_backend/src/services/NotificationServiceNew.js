const knex = require('../config/database');
const socketService = require('./socketService');

class NotificationService {
  static get ALLOWED_NOTIFICATION_TYPES() {
    return new Set([
      'emergency_request_created',
      'emergency_request_accepted',
      'emergency_request_completed',
      'delivery_order_created',
      'delivery_order_accepted',
      'delivery_order_delivered',
      'purchase_order_created',
      'purchase_order_confirmed',
      'purchase_order_delivered',
      'partner_location_update',
      'payment_confirmed',
      'rating_received',
      'system_announcement',
      'promotion',
      'reminder'
    ]);
  }

  static parseJsonField(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  static normalizeNotification(row) {
    if (!row) return null;

    const actionData = this.parseJsonField(row.action_data, {});
    const metadata = this.parseJsonField(row.metadata, {});
    const mergedData = { ...metadata, ...actionData };
    const publicType = metadata.original_type || row.type || 'system_announcement';

    return {
      id: row.id,
      user_id: row.user_id,
      type: publicType,
      title: row.title,
      body: row.message || row.detailed_message || '',
      message: row.message || row.detailed_message || '',
      detailed_message: row.detailed_message,
      data: mergedData,
      is_read: !!row.is_read,
      read: !!row.is_read,
      priority: row.priority || 'medium',
      is_urgent: !!row.is_urgent,
      image_url: row.image_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      read_at: row.read_at,
      related_emergency_request_id: row.related_emergency_request_id,
      related_delivery_order_id: row.related_delivery_order_id,
      related_purchase_order_id: row.related_purchase_order_id,
      related_partner_id: row.related_partner_id
    };
  }

  static mapEntityLinks(data = {}) {
    return {
      related_emergency_request_id: data.emergency_request_id || data.emergencyId || null,
      related_delivery_order_id: data.delivery_order_id || data.order_id || null,
      related_purchase_order_id: data.purchase_order_id || null,
      related_partner_id: data.partner_id || data.actor_id || data.motoboy_id || null
    };
  }

  static resolveStorageType(inputType) {
    const requestedType = inputType || 'system_announcement';

    if (this.ALLOWED_NOTIFICATION_TYPES.has(requestedType)) {
      return {
        storageType: requestedType,
        publicType: requestedType
      };
    }

    const mappedType = {
      general: 'system_announcement',
      'partner.onboarding.documents_submitted': 'reminder',
      'partner.onboarding.approved': 'system_announcement',
      'partner.onboarding.rejected': 'system_announcement',
      'emergency.request.created': 'emergency_request_created',
      'emergency.request.updated': 'emergency_request_accepted',
      tow_proposal: 'system_announcement',
      'tow.proposal.received': 'system_announcement',
      proposal_accepted: 'system_announcement',
      'tow.proposal.accepted': 'system_announcement',
      proposal_rejected: 'system_announcement',
      'tow.proposal.rejected': 'system_announcement',
      'tow.proposal.expired': 'reminder',
      'delivery.order.available': 'delivery_order_created',
      'delivery.order.accepted': 'delivery_order_accepted',
      'delivery.order.picked_up': 'delivery_order_accepted',
      'delivery.order.in_transit': 'delivery_order_accepted',
      'delivery.order.delivered': 'delivery_order_delivered',
      'delivery.order.cancelled': 'system_announcement',
      'purchase_order.created': 'purchase_order_created',
      'purchase_order.confirmed': 'purchase_order_confirmed',
      'purchase_order.preparing': 'purchase_order_confirmed',
      'purchase_order.ready': 'purchase_order_confirmed',
      'purchase_order.out_for_delivery': 'purchase_order_confirmed',
      'purchase_order.delivered': 'purchase_order_delivered',
      'purchase_order.cancelled': 'system_announcement',
      'payment.created': 'reminder',
      'payment.approved': 'payment_confirmed',
      'payment.failed': 'reminder',
      'wallet.withdrawal_requested': 'reminder',
      'wallet.withdrawal_completed': 'payment_confirmed',
      'wallet.withdrawal_failed': 'reminder',
      subscription_payment_processed: 'payment_confirmed',
      'subscription.pending_payment': 'reminder',
      'subscription.activated': 'payment_confirmed',
      'subscription.suspended': 'reminder',
      'subscription.expiring_soon': 'reminder',
      'subscription.expired': 'reminder',
      'subscription.cancelled': 'system_announcement',
      'chat.message.received': 'system_announcement',
      'chat.typing.started': 'system_announcement',
      'chat.typing.stopped': 'system_announcement'
    }[requestedType] || 'system_announcement';

    return {
      storageType: mappedType,
      publicType: requestedType
    };
  }

  static async persistNotification(userId, title, body, data = {}, options = {}) {
    const resolvedType = this.resolveStorageType(data.type || options.type);
    const metadata = {
      ...(options.metadata || {}),
      original_type: resolvedType.publicType
    };

    const payload = {
      user_id: userId,
      type: resolvedType.storageType,
      title,
      message: body,
      detailed_message: options.detailedMessage || null,
      is_read: false,
      is_sent: false,
      is_delivered: false,
      push_enabled: options.pushEnabled !== false,
      sms_enabled: options.smsEnabled === true,
      email_enabled: options.emailEnabled === true,
      in_app_enabled: options.inAppEnabled !== false,
      priority: options.priority || 'medium',
      is_urgent: options.isUrgent === true,
      scheduled_at: options.scheduledAt || null,
      sent_at: null,
      delivered_at: null,
      action_data: JSON.stringify(data || {}),
      metadata: JSON.stringify(metadata),
      image_url: options.imageUrl || null,
      sound: options.sound || 'default',
      retry_count: 0,
      error_message: null,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
      ...this.mapEntityLinks(data)
    };

    const [notification] = await knex('notifications').insert(payload).returning('*');
    return notification;
  }

  static async sendPushNotification(userId, title, body, data = {}) {
    try {
      console.log(`Push notification para usuário ${userId}:`, {
        title,
        body,
        data
      });

      return true;
    } catch (error) {
      console.error('Erro ao enviar notificação push:', error);
      return false;
    }
  }

  static emitRealtime(userId, notification) {
    try {
      socketService.sendNotificationToUser(userId, notification);
    } catch (error) {
      console.error('Erro ao emitir notificação em tempo real:', error);
    }
  }

  static async sendNotification(userId, title, body, data = {}, options = {}) {
    try {
      const persisted = await this.persistNotification(userId, title, body, data, options);
      const normalized = this.normalizeNotification(persisted);

      this.emitRealtime(userId, normalized);

      const pushDelivered = await this.sendPushNotification(userId, title, body, data);

      await knex('notifications')
        .where('id', persisted.id)
        .update({
          is_sent: true,
          is_delivered: pushDelivered,
          sent_at: knex.fn.now(),
          delivered_at: pushDelivered ? knex.fn.now() : null,
          updated_at: knex.fn.now()
        });

      return {
        ...normalized,
        is_sent: true,
        is_delivered: pushDelivered
      };
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
      throw error;
    }
  }

  static async sendPartnerNotification(partnerId, title, body, data = {}, options = {}) {
    try {
      const partner = await knex('partners')
        .where('id', partnerId)
        .first();

      if (!partner) {
        throw new Error('Parceiro não encontrado');
      }

      return await this.sendNotification(partner.user_id, title, body, {
        ...data,
        partner_id: partnerId
      }, options);
    } catch (error) {
      console.error('Erro ao enviar notificação para parceiro:', error);
      throw error;
    }
  }

  static async getUserNotifications(userId, limit = 20, offset = 0) {
    try {
      const notifications = await knex('notifications')
        .select('*')
        .where('user_id', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return notifications.map(notification => this.normalizeNotification(notification));
    } catch (error) {
      console.error('Erro ao buscar notificações do usuário:', error);
      throw error;
    }
  }

  static async getUnreadNotifications(userId) {
    try {
      const notifications = await knex('notifications')
        .select('*')
        .where('user_id', userId)
        .where('is_read', false)
        .orderBy('created_at', 'desc')
        .limit(50);

      return notifications.map(notification => this.normalizeNotification(notification));
    } catch (error) {
      console.error('Erro ao buscar notificações não lidas:', error);
      throw error;
    }
  }

  static async getUnreadCount(userId) {
    try {
      const result = await knex('notifications')
        .where('user_id', userId)
        .where('is_read', false)
        .count('* as count')
        .first();

      return parseInt(result.count, 10) || 0;
    } catch (error) {
      console.error('Erro ao contar notificações não lidas:', error);
      return 0;
    }
  }

  static async markAsRead(notificationId, userId) {
    try {
      const [notification] = await knex('notifications')
        .where('id', notificationId)
        .where('user_id', userId)
        .update({
          is_read: true,
          read_at: knex.fn.now(),
          updated_at: knex.fn.now()
        })
        .returning('*');

      return notification ? this.normalizeNotification(notification) : null;
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      throw error;
    }
  }

  static async markNotificationAsRead(notificationId, userId) {
    return await this.markAsRead(notificationId, userId);
  }

  static async markAllNotificationsAsRead(userId) {
    try {
      await knex('notifications')
        .where('user_id', userId)
        .where('is_read', false)
        .update({
          is_read: true,
          read_at: knex.fn.now(),
          updated_at: knex.fn.now()
        });

      return true;
    } catch (error) {
      console.error('Erro ao marcar todas as notificações como lidas:', error);
      return false;
    }
  }

  static async updateUserFCMToken(userId, fcmToken) {
    try {
      await knex('users')
        .where('id', userId)
        .update({
          fcm_token: fcmToken,
          updated_at: knex.fn.now()
        });

      return true;
    } catch (error) {
      console.error('Erro ao atualizar token FCM:', error);
      return false;
    }
  }

  static async sendNotificationToUser(userId, notification) {
    try {
      const title = notification.title;
      const body = notification.body || notification.message;
      const data = notification.data || {};

      await this.sendNotification(userId, title, body, {
        ...data,
        type: notification.type || data.type || 'system_announcement'
      }, {
        imageUrl: notification.imageUrl || null,
        priority: notification.priority || 'medium',
        isUrgent: notification.isUrgent === true
      });

      return true;
    } catch (error) {
      console.error('Erro ao enviar notificação para usuário:', error);
      return false;
    }
  }
}

module.exports = NotificationService;

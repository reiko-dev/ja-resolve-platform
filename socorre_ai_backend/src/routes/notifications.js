const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const notificationService = require('../services/NotificationServiceNew');

// Buscar notificações do usuário
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const notifications = await notificationService.getUserNotifications(
      req.user.id,
      parseInt(limit),
      parseInt(offset)
    );

    const unreadCount = await notificationService.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: notifications.length
        }
      }
    });
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Marcar notificação como lida
router.put('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await notificationService.markNotificationAsRead(id, req.user.id);

    if (success) {
      res.json({
        success: true,
        message: 'Notificação marcada como lida'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Notificação não encontrada'
      });
    }
  } catch (error) {
    console.error('Erro ao marcar notificação como lida:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Marcar todas as notificações como lidas
router.put('/read-all', auth, async (req, res) => {
  try {
    const success = await notificationService.markAllNotificationsAsRead(req.user.id);

    if (success) {
      res.json({
        success: true,
        message: 'Todas as notificações foram marcadas como lidas'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao marcar notificações como lidas'
      });
    }
  } catch (error) {
    console.error('Erro ao marcar todas as notificações como lidas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar token FCM
router.put('/fcm-token', auth, async (req, res) => {
  try {
    const fcmToken = req.body.fcmToken || req.body.fcm_token;

    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'Token FCM é obrigatório'
      });
    }

    const success = await notificationService.updateUserFCMToken(req.user.id, fcmToken);

    if (success) {
      res.json({
        success: true,
        message: 'Token FCM atualizado com sucesso'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar token FCM'
      });
    }
  } catch (error) {
    console.error('Erro ao atualizar token FCM:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Contar notificações não lidas
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Erro ao contar notificações não lidas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Enviar notificação de teste (apenas para admin)
router.post('/test', auth, async (req, res) => {
  try {
    // Verificar se é admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    const { userId, title, body, type = 'general' } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        message: 'userId, title e body são obrigatórios'
      });
    }

    const success = await notificationService.sendNotificationToUser(userId, {
      title,
      body,
      type,
      data: { test: true }
    });

    if (success) {
      res.json({
        success: true,
        message: 'Notificação de teste enviada com sucesso'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar notificação de teste'
      });
    }
  } catch (error) {
    console.error('Erro ao enviar notificação de teste:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;

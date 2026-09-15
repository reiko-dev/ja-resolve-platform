const SystemSettings = require('../models/SystemSettings');

class SystemSettingsController {
  // Buscar todas as configurações
  static async findAll(req, res) {
    try {
      const { page = 1, limit = 50, category, is_public, search } = req.query;

      const filters = {};
      if (category) filters.category = category;
      if (is_public !== undefined) filters.is_public = is_public === 'true';
      if (search) filters.search = search;

      const result = await SystemSettings.findAll(
        parseInt(page), 
        parseInt(limit), 
        filters
      );

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Erro ao listar configurações:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar configuração por chave
  static async findByKey(req, res) {
    try {
      const { key } = req.params;

      const setting = await SystemSettings.findByKey(key);
      if (!setting) {
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }

      res.json({
        success: true,
        data: setting
      });

    } catch (error) {
      console.error('Erro ao buscar configuração:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar múltiplas configurações por chaves
  static async findByKeys(req, res) {
    try {
      const { keys } = req.body;

      if (!Array.isArray(keys) || keys.length === 0) {
        return res.status(400).json({ 
          error: 'Keys deve ser um array não vazio' 
        });
      }

      const settings = await SystemSettings.findByKeys(keys);

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar configurações por categoria
  static async findByCategory(req, res) {
    try {
      const { category } = req.params;

      const settings = await SystemSettings.findByCategory(category);

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações por categoria:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar configurações públicas (para apps)
  static async findPublic(req, res) {
    try {
      const settings = await SystemSettings.findPublic();

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações públicas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar configurações do app
  static async getAppSettings(req, res) {
    try {
      const settings = await SystemSettings.getAppSettings();

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações do app:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Criar ou atualizar configuração
  static async upsert(req, res) {
    try {
      const { setting_key, setting_value, data_type, description, category, is_public, is_editable } = req.body;

      if (!setting_key || setting_value === undefined) {
        return res.status(400).json({ 
          error: 'Dados obrigatórios: setting_key, setting_value' 
        });
      }

      // Validar valor
      const settingData = {
        setting_key,
        setting_value,
        data_type: data_type || 'string',
        description,
        category: category || 'general',
        is_public: is_public || false,
        is_editable: is_editable !== false
      };

      // Validar valor se necessário
      const existingSetting = await SystemSettings.findByKey(setting_key);
      if (existingSetting) {
        const validation = SystemSettings.validateValue(existingSetting, setting_value);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: validation.error 
          });
        }
      }

      const setting = await SystemSettings.upsert(settingData);

      res.json({
        success: true,
        data: setting,
        message: 'Configuração salva com sucesso'
      });

    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Atualizar configuração
  static async update(req, res) {
    try {
      const { key } = req.params;
      const updateData = req.body;

      const existingSetting = await SystemSettings.findByKey(key);
      if (!existingSetting) {
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }

      // Verificar se é editável
      if (!existingSetting.is_editable && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Esta configuração não pode ser editada' 
        });
      }

      // Validar valor
      if (updateData.setting_value !== undefined) {
        const validation = SystemSettings.validateValue(existingSetting, updateData.setting_value);
        if (!validation.valid) {
          return res.status(400).json({ 
            error: validation.error 
          });
        }
      }

      const setting = await SystemSettings.update(key, updateData);

      res.json({
        success: true,
        data: setting,
        message: 'Configuração atualizada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao atualizar configuração:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Deletar configuração
  static async delete(req, res) {
    try {
      const { key } = req.params;

      const existingSetting = await SystemSettings.findByKey(key);
      if (!existingSetting) {
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }

      // Verificar se é editável
      if (!existingSetting.is_editable && req.user.role !== 'admin') {
        return res.status(403).json({ 
          error: 'Esta configuração não pode ser deletada' 
        });
      }

      await SystemSettings.delete(key);

      res.json({
        success: true,
        message: 'Configuração deletada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao deletar configuração:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Resetar configuração para valor padrão
  static async resetToDefault(req, res) {
    try {
      const { key } = req.params;

      const setting = await SystemSettings.resetToDefault(key);
      if (!setting) {
        return res.status(404).json({ 
          error: 'Configuração não encontrada ou não possui valor padrão' 
        });
      }

      res.json({
        success: true,
        data: setting,
        message: 'Configuração resetada para o valor padrão'
      });

    } catch (error) {
      console.error('Erro ao resetar configuração:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Resetar categoria para valores padrão
  static async resetCategoryToDefault(req, res) {
    try {
      const { category } = req.params;

      const count = await SystemSettings.resetCategoryToDefault(category);

      res.json({
        success: true,
        data: { reset_count: count },
        message: `${count} configurações resetadas para o valor padrão`
      });

    } catch (error) {
      console.error('Erro ao resetar categoria:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Exportar configurações
  static async export(req, res) {
    try {
      const { category } = req.query;

      const settings = await SystemSettings.export(category);

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao exportar configurações:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Importar configurações
  static async import(req, res) {
    try {
      const { settings, overwrite = false } = req.body;

      if (!Array.isArray(settings) || settings.length === 0) {
        return res.status(400).json({ 
          error: 'Settings deve ser um array não vazio' 
        });
      }

      const results = await SystemSettings.import(settings, overwrite);

      res.json({
        success: true,
        data: results,
        message: 'Importação concluída'
      });

    } catch (error) {
      console.error('Erro ao importar configurações:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Buscar configurações organizadas por categoria (para admin)
  static async getSettingsByCategory(req, res) {
    try {
      const settings = await SystemSettings.getSettingsByCategoryForAdmin();

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações por categoria:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Validar valor de configuração
  static async validateValue(req, res) {
    try {
      const { setting_key, setting_value } = req.body;

      if (!setting_key || setting_value === undefined) {
        return res.status(400).json({ 
          error: 'Dados obrigatórios: setting_key, setting_value' 
        });
      }

      const setting = await SystemSettings.findByKey(setting_key);
      if (!setting) {
        return res.status(404).json({ error: 'Configuração não encontrada' });
      }

      const validation = SystemSettings.validateValue(setting, setting_value);

      res.json({
        success: true,
        data: validation
      });

    } catch (error) {
      console.error('Erro ao validar valor:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Configurações específicas para guinchos
  static async getGuinchoSettings(req, res) {
    try {
      const keys = [
        'guincho_search_radius_km',
        'guincho_proposal_expiry_minutes',
        'guincho_max_proposals_per_request',
        'tow_price_per_km',
        'tow_platform_fixed_fee',
        'tow_minimum_charge',
        'tow_cancellation_fee'
      ];

      const settings = await SystemSettings.findByKeys(keys);

      // G2 — pricing não fabrica default em lugar nenhum do backend: chave
      // ausente vira null (antes este endpoint devolvia 6/25/90/40 e mascarava
      // a ausência de configuração que bloqueia a criação de guincho).
      const guinchoSettings = {
        ...settings,
        tow_price_per_km: settings.tow_price_per_km ?? null,
        tow_platform_fixed_fee: settings.tow_platform_fixed_fee ?? null,
        tow_minimum_charge: settings.tow_minimum_charge ?? null,
        tow_cancellation_fee: settings.tow_cancellation_fee ?? null,
      };

      res.json({
        success: true,
        data: guinchoSettings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações de guincho:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Configurações específicas para assinaturas
  static async getSubscriptionSettings(req, res) {
    try {
      const keys = [
        'mecanico_monthly_fee',
        'posto_combustivel_monthly_fee',
        'auto_pecas_monthly_fee',
        'subscription_grace_period_days'
      ];

      const settings = await SystemSettings.findByKeys(keys);
      const subscriptionSettings = {
        ...settings,
        mechanic_monthly_fee: settings.mecanico_monthly_fee ?? null,
        gas_station_monthly_fee: settings.posto_combustivel_monthly_fee ?? null,
        auto_parts_monthly_fee: settings.auto_pecas_monthly_fee ?? null
      };

      res.json({
        success: true,
        data: subscriptionSettings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações de assinaturas:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Configurações específicas para delivery
  static async getDeliverySettings(req, res) {
    try {
      const keys = [
        'delivery_base_fee',
        'delivery_platform_fee_percent',
        'delivery_motoboy_fee_percent',
        'delivery_search_radius_km',
        'delivery_max_distance_km'
      ];

      const settings = await SystemSettings.findByKeys(keys);

      res.json({
        success: true,
        data: settings
      });

    } catch (error) {
      console.error('Erro ao buscar configurações de delivery:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }

  // Atualizar configurações em lote
  static async updateBatch(req, res) {
    try {
      const { settings } = req.body;

      if (!Array.isArray(settings) || settings.length === 0) {
        return res.status(400).json({ 
          error: 'Settings deve ser um array não vazio' 
        });
      }

      const results = [];
      const errors = [];

      for (const setting of settings) {
        try {
          const { setting_key, setting_value } = setting;
          
          const existingSetting = await SystemSettings.findByKey(setting_key);
          if (!existingSetting) {
            errors.push({ key: setting_key, error: 'Configuração não encontrada' });
            continue;
          }

          // Validar valor
          const validation = SystemSettings.validateValue(existingSetting, setting_value);
          if (!validation.valid) {
            errors.push({ key: setting_key, error: validation.error });
            continue;
          }

          const updatedSetting = await SystemSettings.update(setting_key, { setting_value });
          results.push(updatedSetting);
        } catch (error) {
          errors.push({ key: setting.setting_key, error: error.message });
        }
      }

      res.json({
        success: true,
        data: {
          updated: results,
          errors: errors
        },
        message: `${results.length} configurações atualizadas, ${errors.length} erros`
      });

    } catch (error) {
      console.error('Erro ao atualizar configurações em lote:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
}

module.exports = SystemSettingsController;

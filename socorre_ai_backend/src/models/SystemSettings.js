const knex = require('../config/database');

class SystemSettings {
  // Buscar configuração por chave
  static async findByKey(key) {
    const setting = await knex('system_settings')
      .where('setting_key', key)
      .first();

    if (!setting) return null;

    // Converter valor para o tipo correto
    return this.convertValue(setting);
  }

  // Buscar múltiplas configurações por chaves
  static async findByKeys(keys) {
    const settings = await knex('system_settings')
      .whereIn('setting_key', keys);

    const result = {};
    settings.forEach(setting => {
      result[setting.setting_key] = this.convertValue(setting);
    });

    return result;
  }

  // Buscar configurações por categoria
  static async findByCategory(category) {
    const settings = await knex('system_settings')
      .where('category', category)
      .orderBy('setting_key');

    return settings.map(setting => this.convertValue(setting));
  }

  // Buscar configurações públicas (acessíveis pelos apps)
  static async findPublic() {
    const settings = await knex('system_settings')
      .where('is_public', true)
      .orderBy('category', 'setting_key');

    const result = {};
    settings.forEach(setting => {
      result[setting.setting_key] = this.convertValue(setting);
    });

    return result;
  }

  // Criar ou atualizar configuração
  static async upsert(settingData) {
    const { setting_key, ...data } = settingData;

    const existing = await knex('system_settings')
      .where('setting_key', setting_key)
      .first();

    if (existing) {
      // Atualizar
      const [setting] = await knex('system_settings')
        .where('setting_key', setting_key)
        .update({
          ...data,
          updated_at: knex.fn.now()
        })
        .returning('*');
      return this.convertValue(setting);
    } else {
      // Criar
      const [setting] = await knex('system_settings')
        .insert({
          setting_key,
          ...data,
          updated_at: knex.fn.now()
        })
        .returning('*');
      return this.convertValue(setting);
    }
  }

  // Atualizar configuração
  static async update(key, data) {
    const [setting] = await knex('system_settings')
      .where('setting_key', key)
      .update({
        ...data,
        updated_at: knex.fn.now()
      })
      .returning('*');

    return setting ? this.convertValue(setting) : null;
  }

  // Deletar configuração
  static async delete(key) {
    return await knex('system_settings')
      .where('setting_key', key)
      .del();
  }

  // Listar todas com paginação e filtros
  static async findAll(page = 1, limit = 50, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex('system_settings');

    // Aplicar filtros
    if (filters.category) {
      query = query.where('category', filters.category);
    }
    if (filters.is_public !== undefined) {
      query = query.where('is_public', filters.is_public);
    }
    if (filters.is_editable !== undefined) {
      query = query.where('is_editable', filters.is_editable);
    }
    if (filters.search) {
      query = query.where(function() {
        this.where('setting_key', 'like', `%${filters.search}%`)
            .orWhere('description', 'like', `%${filters.search}%`);
      });
    }

    // Query para contar total
    const countQuery = knex('system_settings');
    
    // Aplicar filtros na query de contagem
    if (filters.category) {
      countQuery.where('category', filters.category);
    }
    if (filters.is_public !== undefined) {
      countQuery.where('is_public', filters.is_public);
    }
    if (filters.is_editable !== undefined) {
      countQuery.where('is_editable', filters.is_editable);
    }
    if (filters.search) {
      countQuery.where(function() {
        this.where('setting_key', 'like', `%${filters.search}%`)
            .orWhere('description', 'like', `%${filters.search}%`);
      });
    }

    const [settings, total] = await Promise.all([
      query.limit(limit).offset(offset).orderBy('category', 'setting_key'),
      countQuery.count('* as count').first()
    ]);

    const convertedSettings = settings.map(setting => this.convertValue(setting));

    return {
      settings: convertedSettings,
      total: total.count,
      page,
      limit,
      totalPages: Math.ceil(total.count / limit)
    };
  }

  // Validar valor de configuração
  static validateValue(setting, value) {
    const { data_type, min_value, max_value, validation_rules } = setting;

    // Converter string para o tipo correto para validação
    let convertedValue = value;
    if (data_type === 'number') {
      convertedValue = parseFloat(value);
      if (isNaN(convertedValue)) {
        return { valid: false, error: 'Valor deve ser um número' };
      }
    } else if (data_type === 'boolean') {
      convertedValue = value === 'true' || value === true;
    }

    // Validar range
    if (data_type === 'number') {
      if (min_value !== null && convertedValue < parseFloat(min_value)) {
        return { valid: false, error: `Valor deve ser maior ou igual a ${min_value}` };
      }
      if (max_value !== null && convertedValue > parseFloat(max_value)) {
        return { valid: false, error: `Valor deve ser menor ou igual a ${max_value}` };
      }
    }

    // Validar regras customizadas
    if (validation_rules) {
      try {
        const rules = JSON.parse(validation_rules);
        // Implementar validações customizadas aqui
        if (rules.required && !value) {
          return { valid: false, error: 'Campo obrigatório' };
        }
        if (rules.min_length && value.length < rules.min_length) {
          return { valid: false, error: `Mínimo de ${rules.min_length} caracteres` };
        }
        if (rules.max_length && value.length > rules.max_length) {
          return { valid: false, error: `Máximo de ${rules.max_length} caracteres` };
        }
        if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
          return { valid: false, error: 'Formato inválido' };
        }
      } catch (error) {
        console.error('Erro ao validar regras:', error);
      }
    }

    return { valid: true };
  }

  // Converter valor para o tipo correto
  static convertValue(setting) {
    const { setting_value, data_type } = setting;
    
    if (!setting_value) return setting_value;

    switch (data_type) {
      case 'number':
        return parseFloat(setting_value);
      case 'boolean':
        return setting_value === 'true' || setting_value === true;
      case 'json':
        try {
          return JSON.parse(setting_value);
        } catch {
          return setting_value;
        }
      default:
        return setting_value;
    }
  }

  // Preparar valor para salvar no banco
  static prepareValue(value, dataType) {
    if (value === null || value === undefined) return null;

    switch (dataType) {
      case 'json':
        return JSON.stringify(value);
      case 'boolean':
        return value ? 'true' : 'false';
      case 'number':
        return value.toString();
      default:
        return value.toString();
    }
  }

  // Buscar configurações por categoria para o admin
  static async getSettingsByCategoryForAdmin() {
    const categories = await knex('system_settings')
      .select('category')
      .distinct()
      .orderBy('category');

    const result = {};
    
    for (const category of categories) {
      const settings = await knex('system_settings')
        .where('category', category.category)
        .orderBy('setting_key');

      result[category.category] = settings.map(setting => this.convertValue(setting));
    }

    return result;
  }

  // Resetar configuração para valor padrão
  static async resetToDefault(key) {
    const setting = await knex('system_settings')
      .where('setting_key', key)
      .first();

    if (setting && setting.default_value) {
      return await this.update(key, {
        setting_value: setting.default_value
      });
    }

    return null;
  }

  // Resetar todas as configurações de uma categoria
  static async resetCategoryToDefault(category) {
    const settings = await knex('system_settings')
      .where('category', category)
      .whereNotNull('default_value');

    const updates = [];
    for (const setting of settings) {
      updates.push(
        knex('system_settings')
          .where('setting_key', setting.setting_key)
          .update({
            setting_value: setting.default_value,
            updated_at: knex.fn.now()
          })
      );
    }

    await Promise.all(updates);
    return settings.length;
  }

  // Exportar configurações
  static async export(category = null) {
    let query = knex('system_settings');
    
    if (category) {
      query = query.where('category', category);
    }

    const settings = await query.orderBy('category', 'setting_key');
    
    return settings.map(setting => ({
      key: setting.setting_key,
      value: this.convertValue(setting),
      type: setting.data_type,
      category: setting.category,
      description: setting.description,
      is_public: setting.is_public
    }));
  }

  // Importar configurações
  static async import(settingsData, overwrite = false) {
    const results = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const item of settingsData) {
      try {
        const existing = await knex('system_settings')
          .where('setting_key', item.key)
          .first();

        if (existing && !overwrite) {
          results.skipped++;
          continue;
        }

        await this.upsert({
          setting_key: item.key,
          setting_value: this.prepareValue(item.value, item.type),
          data_type: item.type || 'string',
          category: item.category || 'general',
          description: item.description,
          is_public: item.is_public || false
        });

        results.imported++;
      } catch (error) {
        results.errors.push({
          key: item.key,
          error: error.message
        });
      }
    }

    return results;
  }

  // Buscar configurações específicas para o app
  static async getAppSettings() {
    const publicSettings = await this.findPublic();
    
    // Adicionar configurações calculadas
    return {
      ...publicSettings,
      app_version: publicSettings.app_version || '2.0.0',
      supported_payment_methods: ['credit_card', 'pix', 'bank_slip'],
      supported_emergency_types: ['guincho', 'mecanico'],
      max_file_upload_size_mb: 10,
      chat_message_limit: 1000,
      min_android_version: '8.0',
      min_ios_version: '12.0'
    };
  }
}

module.exports = SystemSettings;

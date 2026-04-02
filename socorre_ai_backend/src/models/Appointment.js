const knex = require('../config/database');

class Appointment {
  static tableName = 'appointments';

  // Buscar agendamentos por usuário
  static async findByUserId(userId, status = null) {
    let query = knex(this.tableName)
      .select('appointments.*', 'mechanics.business_name', 'mechanics.phone as mechanic_phone')
      .join('mechanics', 'appointments.mechanic_id', 'mechanics.id')
      .where('appointments.user_id', userId);

    if (status) {
      query = query.where('appointments.status', status);
    }

    return query.orderBy('appointments.scheduled_date', 'desc');
  }

  // Buscar agendamentos por mecânico
  static async findByMechanicId(mechanicId, status = null) {
    let query = knex(this.tableName)
      .select('appointments.*', 'users.name as user_name', 'users.phone as user_phone')
      .join('users', 'appointments.user_id', 'users.id')
      .where('appointments.mechanic_id', mechanicId);

    if (status) {
      query = query.where('appointments.status', status);
    }

    return query.orderBy('appointments.scheduled_date', 'desc');
  }

  // Buscar agendamentos por data
  static async findByDate(date, mechanicId = null) {
    let query = knex(this.tableName)
      .select('appointments.*', 'mechanics.business_name', 'users.name as user_name')
      .join('mechanics', 'appointments.mechanic_id', 'mechanics.id')
      .join('users', 'appointments.user_id', 'users.id')
      .whereRaw('DATE(appointments.scheduled_date) = ?', [date]);

    if (mechanicId) {
      query = query.where('appointments.mechanic_id', mechanicId);
    }

    return query.orderBy('appointments.scheduled_date');
  }

  // Verificar disponibilidade do mecânico
  static async checkAvailability(mechanicId, date, duration = 60) {
    const startTime = new Date(date);
    const endTime = new Date(startTime.getTime() + duration * 60000);

    const conflictingAppointments = await knex(this.tableName)
      .where('mechanic_id', mechanicId)
      .where('status', '!=', 'cancelled')
      .where(function() {
        this.where(function() {
          this.where('scheduled_date', '>=', startTime)
            .andWhere('scheduled_date', '<', endTime);
        }).orWhere(function() {
          this.where('scheduled_date', '<=', startTime)
            .andWhereRaw('scheduled_date + INTERVAL \'1 hour\' > ?', [startTime]);
        });
      });

    return conflictingAppointments.length === 0;
  }

  // Criar novo agendamento
  static async create(appointmentData) {
    // Verificar disponibilidade
    const isAvailable = await this.checkAvailability(
      appointmentData.mechanic_id,
      appointmentData.scheduled_date,
      appointmentData.duration || 60
    );

    if (!isAvailable) {
      throw new Error('Horário não disponível para este mecânico');
    }

    const [id] = await knex(this.tableName).insert(appointmentData);
    return this.findById(id);
  }

  // Atualizar status do agendamento
  static async updateStatus(id, status, notes = null) {
    const updateData = { status };
    if (notes) updateData.notes = notes;
    if (status === 'completed') updateData.completed_at = new Date();

    await knex(this.tableName).where('id', id).update(updateData);
    return this.findById(id);
  }

  // Atualizar agendamento
  static async update(id, appointmentData) {
    // Se mudou a data/hora, verificar disponibilidade
    if (appointmentData.scheduled_date) {
      const current = await this.findById(id);
      const isAvailable = await this.checkAvailability(
        current.mechanic_id,
        appointmentData.scheduled_date,
        appointmentData.duration || 60
      );

      if (!isAvailable) {
        throw new Error('Horário não disponível para este mecânico');
      }
    }

    await knex(this.tableName).where('id', id).update(appointmentData);
    return this.findById(id);
  }

  // Deletar agendamento
  static async delete(id) {
    return knex(this.tableName).where('id', id).del();
  }

  // Buscar por ID
  static async findById(id) {
    return knex(this.tableName)
      .select('appointments.*', 'mechanics.business_name', 'mechanics.phone as mechanic_phone', 'users.name as user_name', 'users.phone as user_phone')
      .join('mechanics', 'appointments.mechanic_id', 'mechanics.id')
      .join('users', 'appointments.user_id', 'users.id')
      .where('appointments.id', id)
      .first();
  }

  // Listar todos com paginação
  static async findAll(page = 1, limit = 20, filters = {}) {
    const offset = (page - 1) * limit;
    
    let query = knex(this.tableName)
      .select('appointments.*', 'mechanics.business_name', 'users.name as user_name')
      .join('mechanics', 'appointments.mechanic_id', 'mechanics.id')
      .join('users', 'appointments.user_id', 'users.id');

    // Aplicar filtros
    if (filters.status) {
      query = query.where('appointments.status', filters.status);
    }

    if (filters.mechanicId) {
      query = query.where('appointments.mechanic_id', filters.mechanicId);
    }

    if (filters.userId) {
      query = query.where('appointments.user_id', filters.userId);
    }

    if (filters.startDate) {
      query = query.where('appointments.scheduled_date', '>=', filters.startDate);
    }

    if (filters.endDate) {
      query = query.where('appointments.scheduled_date', '<=', filters.endDate);
    }

    const [appointments, total] = await Promise.all([
      query.orderBy('appointments.scheduled_date', 'desc')
        .limit(limit)
        .offset(offset),
      knex(this.tableName).count('* as total').first()
    ]);

    return {
      appointments,
      pagination: {
        page,
        limit,
        total: parseInt(total.total),
        pages: Math.ceil(total.total / limit)
      }
    };
  }

  // Estatísticas de agendamentos
  static async getStats(mechanicId = null) {
    let query = knex(this.tableName);

    if (mechanicId) {
      query = query.where('mechanic_id', mechanicId);
    }

    const stats = await query
      .select('status')
      .count('* as count')
      .groupBy('status');

    const total = await query.count('* as total').first();

    return {
      byStatus: stats,
      total: parseInt(total.total)
    };
  }
}

module.exports = Appointment;

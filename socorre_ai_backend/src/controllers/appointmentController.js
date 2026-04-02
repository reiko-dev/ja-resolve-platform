const Appointment = require('../models/Appointment');

class AppointmentController {
  // Listar todos os agendamentos (admin)
  static async getAllAppointments(req, res) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;
      const result = await Appointment.findAll(parseInt(page), parseInt(limit), filters);
      
      res.json({
        success: true,
        data: result.appointments,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar agendamentos do usuário logado
  static async getMyAppointments(req, res) {
    try {
      const { status } = req.query;
      const appointments = await Appointment.findByUserId(req.user.id, status);
      
      res.json({
        success: true,
        data: appointments
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar agendamentos do mecânico logado
  static async getMechanicAppointments(req, res) {
    try {
      const { status } = req.query;
      const appointments = await Appointment.findByMechanicId(req.user.id, status);
      
      res.json({
        success: true,
        data: appointments
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar agendamentos por data
  static async getAppointmentsByDate(req, res) {
    try {
      const { date } = req.params;
      const { mechanicId } = req.query;
      
      const appointments = await Appointment.findByDate(date, mechanicId);
      
      res.json({
        success: true,
        data: appointments
      });
    } catch (error) {
      console.error('Erro ao buscar agendamentos por data:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar agendamento por ID
  static async getAppointmentById(req, res) {
    try {
      const { id } = req.params;
      const appointment = await Appointment.findById(parseInt(id));
      
      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
      
      // Verificar se o usuário tem acesso ao agendamento
      if (appointment.user_id !== req.user.id && 
          appointment.mechanic_id !== req.user.id && 
          req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      res.json({
        success: true,
        data: appointment
      });
    } catch (error) {
      console.error('Erro ao buscar agendamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar novo agendamento
  static async createAppointment(req, res) {
    try {
      const appointmentData = {
        ...req.body,
        user_id: req.user.id // ID do usuário logado
      };
      
      const appointment = await Appointment.create(appointmentData);
      
      res.status(201).json({
        success: true,
        message: 'Agendamento criado com sucesso',
        data: appointment
      });
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      
      if (error.message === 'Horário não disponível para este mecânico') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar agendamento
  static async updateAppointment(req, res) {
    try {
      const { id } = req.params;
      const appointment = await Appointment.findById(parseInt(id));
      
      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
      
      // Verificar se o usuário tem acesso ao agendamento
      if (appointment.user_id !== req.user.id && 
          appointment.mechanic_id !== req.user.id && 
          req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const updatedAppointment = await Appointment.update(parseInt(id), req.body);
      
      res.json({
        success: true,
        message: 'Agendamento atualizado com sucesso',
        data: updatedAppointment
      });
    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error);
      
      if (error.message === 'Horário não disponível para este mecânico') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar status do agendamento
  static async updateAppointmentStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      
      const appointment = await Appointment.findById(parseInt(id));
      
      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
      
      // Verificar se o usuário tem acesso ao agendamento
      if (appointment.user_id !== req.user.id && 
          appointment.mechanic_id !== req.user.id && 
          req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      const updatedAppointment = await Appointment.updateStatus(parseInt(id), status, notes);
      
      res.json({
        success: true,
        message: 'Status do agendamento atualizado com sucesso',
        data: updatedAppointment
      });
    } catch (error) {
      console.error('Erro ao atualizar status do agendamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar agendamento
  static async deleteAppointment(req, res) {
    try {
      const { id } = req.params;
      const appointment = await Appointment.findById(parseInt(id));
      
      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Agendamento não encontrado'
        });
      }
      
      // Verificar se o usuário tem acesso ao agendamento
      if (appointment.user_id !== req.user.id && 
          appointment.mechanic_id !== req.user.id && 
          req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado'
        });
      }
      
      await Appointment.delete(parseInt(id));
      
      res.json({
        success: true,
        message: 'Agendamento deletado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao deletar agendamento:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Estatísticas de agendamentos
  static async getAppointmentStats(req, res) {
    try {
      const { mechanicId } = req.query;
      const stats = await Appointment.getStats(mechanicId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = AppointmentController;

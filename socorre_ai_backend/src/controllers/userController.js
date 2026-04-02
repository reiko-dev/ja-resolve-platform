const db = require('../config/database');

class UserController {
  // Buscar perfil do usuário
  async getProfile(req, res) {
    try {
      const user = await db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'cpf', 'cnpj', 'address', 'created_at')
        .where({ id: req.user.id })
        .first();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      res.json({
        success: true,
        data: { user }
      });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar perfil do usuário
  async updateProfile(req, res) {
    try {
      const { name, phone, address } = req.body;
      const updateData = { updated_at: new Date() };

      if (name) updateData.name = name;
      if (phone) updateData.phone = phone;
      if (address) updateData.address = JSON.stringify(address);

      await db('users')
        .where({ id: req.user.id })
        .update(updateData);

      // Buscar usuário atualizado
      const updatedUser = await db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'cpf', 'cnpj', 'address', 'created_at')
        .where({ id: req.user.id })
        .first();

      res.json({
        success: true,
        message: 'Perfil atualizado com sucesso',
        data: { user: updatedUser }
      });

    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar usuários (apenas admin)
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 10, role, search } = req.query;
      const offset = (page - 1) * limit;

      let query = db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'created_at')
        .orderBy('created_at', 'desc');

      // Filtros
      if (role) {
        query = query.where({ role });
      }

      if (search) {
        query = query.where(function() {
          this.where('name', 'ilike', `%${search}%`)
            .orWhere('email', 'ilike', `%${search}%`);
        });
      }

      const users = await query.limit(limit).offset(offset);
      const total = await db('users').count('* as count').first();

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(total.count),
            pages: Math.ceil(total.count / limit)
          }
        }
      });

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Buscar usuário por ID (apenas admin)
  async getUserById(req, res) {
    try {
      const { id } = req.params;

      const user = await db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'cpf', 'cnpj', 'address', 'created_at')
        .where({ id })
        .first();

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      res.json({
        success: true,
        data: { user }
      });

    } catch (error) {
      console.error('Get user by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Deletar usuário (apenas admin)
  async deleteUser(req, res) {
    try {
      const { id } = req.params;

      // Verificar se usuário existe
      const user = await db('users').where({ id }).first();
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      // Não permitir deletar o próprio usuário
      if (id === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Não é possível deletar seu próprio usuário'
        });
      }

      await db('users').where({ id }).del();

      res.json({
        success: true,
        message: 'Usuário deletado com sucesso'
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Criar usuário (apenas admin)
  async createUser(req, res) {
    try {
      const { name, email, phone, role, password } = req.body;

      // Verificar se email já existe
      const existingUser = await db('users').where({ email }).first();
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email já cadastrado'
        });
      }

      // Hash da senha
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      // Inserir usuário
      const userId = await db('users').insert({
        name,
        email,
        phone: phone || '',
        role: role || 'user',
        password: hashedPassword,
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Buscar usuário criado
      const newUser = await db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'created_at')
        .where({ email })
        .first();

      res.status(201).json({
        success: true,
        message: 'Usuário criado com sucesso',
        data: { user: newUser }
      });

    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  // Atualizar usuário (apenas admin)
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const { name, email, phone, role, is_active } = req.body;

      // Verificar se usuário existe
      const existingUser = await db('users').where({ id }).first();
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'Usuário não encontrado'
        });
      }

      // Verificar se email já existe (se foi alterado)
      if (email && email !== existingUser.email) {
        const emailExists = await db('users').where({ email }).whereNot({ id }).first();
        if (emailExists) {
          return res.status(400).json({
            success: false,
            message: 'Email já cadastrado'
          });
        }
      }

      // Dados para atualização
      const updateData = {
        updated_at: new Date()
      };

      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (role !== undefined) updateData.role = role;
      if (is_active !== undefined) updateData.is_active = is_active;

      // Atualizar usuário
      await db('users').where({ id }).update(updateData);

      // Buscar usuário atualizado
      const updatedUser = await db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'is_active', 'created_at')
        .where({ id })
        .first();

      res.json({
        success: true,
        message: 'Usuário atualizado com sucesso',
        data: { user: updatedUser }
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = new UserController();

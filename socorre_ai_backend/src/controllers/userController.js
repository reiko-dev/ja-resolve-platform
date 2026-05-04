const db = require('../config/database');
const UserDocument = require('../models/UserDocument');

const CLIENT_DOCUMENT_TYPES = new Set([
  'rg_cpf',
  'residence_proof',
]);

function serializeUserDocument(document) {
  if (!document) {
    return null;
  }

  return {
    id: document.id,
    document_type: document.document_type,
    type: document.document_type,
    title: document.document_type,
    filename: document.filename,
    original_name: document.original_name,
    file_path: document.file_path,
    mime_type: document.mime_type,
    file_size: document.file_size,
    status: document.status,
    rejection_reason: document.rejection_reason,
    verified_by: document.verified_by,
    upload_date: document.uploaded_at || document.created_at,
    verified_date: document.verified_at,
    created_at: document.created_at,
    updated_at: document.updated_at,
  };
}

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

  async listCurrentUserDocuments(req, res) {
    try {
      const documents = await UserDocument.findByUserId(req.user.id);

      res.json({
        success: true,
        data: documents.map(serializeUserDocument),
      });
    } catch (error) {
      console.error('List user documents error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  async uploadCurrentUserDocument(req, res) {
    try {
      const file = req.file;
      const { document_type, user_type } = req.body;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum arquivo enviado'
        });
      }

      if (user_type && user_type !== 'client') {
        return res.status(400).json({
          success: false,
          message: 'Esta trilha oficial é exclusiva para usuário final'
        });
      }

      if (!CLIENT_DOCUMENT_TYPES.has(document_type)) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de documento não permitido para usuário final'
        });
      }

      const existingDocument = await UserDocument.findByType(req.user.id, document_type);
      if (existingDocument) {
        await UserDocument.delete(existingDocument.id);
      }

      const document = await UserDocument.create({
        user_id: req.user.id,
        document_type,
        filename: file.filename,
        original_name: file.originalname,
        file_path: file.path,
        mime_type: file.mimetype,
        file_size: file.size,
        status: 'pending',
      });

      res.status(201).json({
        success: true,
        message: 'Documento enviado com sucesso',
        data: serializeUserDocument(document),
      });
    } catch (error) {
      console.error('Upload user document error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao fazer upload do documento'
      });
    }
  }

  async deleteCurrentUserDocument(req, res) {
    try {
      const { documentId } = req.params;
      const document = await UserDocument.findById(documentId);

      if (!document || document.user_id !== req.user.id) {
        return res.status(404).json({
          success: false,
          message: 'Documento não encontrado'
        });
      }

      await UserDocument.delete(documentId);

      res.json({
        success: true,
        message: 'Documento excluído com sucesso'
      });
    } catch (error) {
      console.error('Delete user document error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao excluir documento'
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

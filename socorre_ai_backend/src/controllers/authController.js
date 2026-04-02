const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

class AuthController {
  // Registrar novo usuário
  async register(req, res) {
    try {
      const { name, email, password, phone, role, cpf, cnpj } = req.body;

      // Verificar se email já existe
      const existingUser = await db('users').where({ email }).first();
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email já cadastrado'
        });
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, 12);

      // Preparar dados do usuário
      const userData = {
        name,
        email,
        password: hashedPassword,
        phone,
        role: role || 'user',
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Adicionar CPF/CNPJ se for parceiro
      if (role === 'partner') {
        userData.cpf = cpf;
        userData.cnpj = cnpj;
      }

      // Inserir usuário
      const [result] = await db('users').insert(userData).returning('id');
      const userId = result.id;

      // Buscar usuário criado (sem senha)
      const newUser = await db('users')
        .select('id', 'name', 'email', 'phone', 'role', 'cpf', 'cnpj', 'is_active', 'email_verified', 'created_at', 'updated_at')
        .where({ id: userId })
        .first();

      // Gerar token JWT
      const token = jwt.sign(
        { userId: newUser.id, role: newUser.role },
        process.env.JWT_SECRET || 'dev_secret',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'Usuário registrado com sucesso',
        data: {
          user: newUser,
          token
        }
      });

    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor: ' + error.message
      });
    }
  }

  // Login de usuário
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Buscar usuário por email
      const user = await db('users').where({ email }).first();
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Email ou senha inválidos'
        });
      }

      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Email ou senha inválidos'
        });
      }

      // Gerar token JWT
      const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET || 'dev_secret',
        { expiresIn: '7d' }
      );

      // Remover senha do response
      const { password: _, ...userWithoutPassword } = user;

      res.json({
        success: true,
        message: 'Login realizado com sucesso',
        data: {
          user: userWithoutPassword,
          token
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor: ' + error.message
      });
    }
  }

        // Verificar token
      async verifyToken(req, res) {
        try {
          const user = await db('users')
            .select('id', 'name', 'email', 'phone', 'role', 'cpf', 'cnpj', 'is_active', 'email_verified', 'created_at', 'updated_at')
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
      console.error('Verify token error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor: ' + error.message
      });
    }
  }

  // Logout
  async logout(req, res) {
    try {
      res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });

    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor: ' + error.message
      });
    }
  }
}

module.exports = new AuthController();

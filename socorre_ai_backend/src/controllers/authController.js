const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { normalizePartnerType } = require('../config/partnerDocumentRules');
const { ONBOARDING_STAGES } = require('../config/onboardingStages');

const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
const jwtSecret = process.env.JWT_SECRET || 'socorre_ai_jwt_secret_dev_2024';

async function getAuthUserById(userId) {
  return db('users')
    .leftJoin('partners', 'partners.user_id', 'users.id')
    .select(
      'users.id',
      'users.name',
      'users.email',
      'users.phone',
      'users.role',
      'users.cpf',
      'users.cnpj',
      'users.onboarding_partner_type',
      'users.onboarding_stage',
      'users.is_active',
      'users.email_verified',
      'users.created_at',
      'users.updated_at',
      'partners.id as partner_id',
      'partners.type as partner_type'
    )
    .where('users.id', userId)
    .first();
}

class AuthController {
  // Registrar novo usuário
  async register(req, res) {
    try {
      const { name, email, password, phone, cpf, cnpj } = req.body;
      const onboardingPartnerType = normalizePartnerType(req.body.partner_type || req.body.partnerType || '');
      const resolvedRole = onboardingPartnerType ? 'partner' : 'user';

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
        role: resolvedRole,
        is_active: true,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      // Adicionar CPF/CNPJ se for parceiro
      if (resolvedRole === 'partner') {
        userData.cpf = cpf;
        userData.cnpj = cnpj;
        if (onboardingPartnerType) {
          userData.onboarding_partner_type = onboardingPartnerType;
        }
        userData.onboarding_stage = ONBOARDING_STAGES.ACCOUNT_CREATED;
      }

      // Inserir usuário
      const [result] = await db('users').insert(userData).returning('id');
      const userId = result.id;

      // Buscar usuário criado (sem senha)
      const newUser = await getAuthUserById(userId);

      // Gerar token JWT
      const token = jwt.sign(
        { userId: newUser.id, role: newUser.role },
        jwtSecret,
        { expiresIn: jwtExpiresIn }
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
        jwtSecret,
        { expiresIn: jwtExpiresIn }
      );

      const userWithoutPassword = await getAuthUserById(user.id);

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
      const user = await getAuthUserById(req.user.id);
      
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

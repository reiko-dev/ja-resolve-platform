const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { getJwtSecret } = require('../config/jwt');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token de acesso não fornecido' 
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    
    // Buscar usuário no banco com contexto de parceiro quando existir
    const user = await db('users')
      .leftJoin('partners', 'partners.user_id', 'users.id')
      .select(
        'users.*',
        'partners.id as partner_id',
        'partners.type as partner_type'
      )
      .where('users.id', decoded.userId)
      .first();

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não encontrado' 
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Token inválido' 
    });
  }
};

// Middleware para verificar roles específicos
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuário não autenticado' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Acesso negado. Permissão insuficiente.' 
      });
    }

    next();
  };
};

module.exports = { auth, requireRole };

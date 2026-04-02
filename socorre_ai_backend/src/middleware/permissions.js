// Middleware de verificação de permissões por role
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Permissão negada'
      });
    }

    next();
  };
};

// Verificar se o usuário é admin
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Acesso restrito a administradores'
    });
  }

  next();
};

// Verificar se o usuário é o dono do recurso ou admin
const requireOwnershipOrAdmin = (resourceField = 'user_id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    // Admin tem acesso a tudo
    if (req.user.role === 'admin') {
      return next();
    }

    // Verificar se o usuário é o dono do recurso
    const resourceUserId = req.params[resourceField] || req.body[resourceField];
    
    if (req.user.id !== resourceUserId && req.user.user_id !== resourceUserId) {
      return res.status(403).json({
        success: false,
        message: 'Acesso negado'
      });
    }

    next();
  };
};

// Verificar se o parceiro pode acessar seus próprios dados
const requirePartnerAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado'
    });
  }

  // Admin tem acesso a tudo
  if (req.user.role === 'admin') {
    return next();
  }

  // Verificar se é parceiro
  if (!['partner', 'mechanic', 'motoboy', 'gas_station', 'auto_parts', 'tow'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Acesso restrito a parceiros'
    });
  }

  next();
};

// Verificar se o cliente pode acessar
const requireClientAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Usuário não autenticado'
    });
  }

  // Admin tem acesso a tudo
  if (req.user.role === 'admin') {
    return next();
  }

  // Verificar se é cliente
  if (req.user.role !== 'client') {
    return res.status(403).json({
      success: false,
      message: 'Acesso restrito a clientes'
    });
  }

  next();
};

// Verificar permissões específicas por tipo de usuário
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não autenticado'
      });
    }

    // Admin tem todas as permissões
    if (req.user.role === 'admin') {
      return next();
    }

    const userPermissions = getUserPermissions(req.user.role);
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: 'Permissão insuficiente'
      });
    }

    next();
  };
};

// Obter permissões baseadas no role
const getUserPermissions = (role) => {
  const permissions = {
    admin: [
      'read_all', 'write_all', 'delete_all', 'manage_users',
      'manage_partners', 'manage_services', 'manage_payments',
      'verify_documents', 'manage_subscriptions', 'manage_system'
    ],
    partner: [
      'read_own', 'write_own', 'upload_documents', 'manage_services',
      'manage_schedule', 'view_payments', 'manage_profile'
    ],
    client: [
      'read_own', 'write_own', 'request_services', 'manage_profile',
      'view_payments', 'manage_addresses', 'write_reviews'
    ]
  };

  return permissions[role] || [];
};

module.exports = {
  requireRole,
  requireAdmin,
  requireOwnershipOrAdmin,
  requirePartnerAccess,
  requireClientAccess,
  checkPermission,
  getUserPermissions
};

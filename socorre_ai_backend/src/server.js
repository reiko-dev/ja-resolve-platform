const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
// Rate limiting temporariamente desabilitado devido a conflito com proxy
// const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

console.log('🚦 Express trust proxy:', app.get('trust proxy'));

// Middleware de segurança
app.use(helmet());

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutos
//   max: 100, // limite de 100 requests por IP
//   message: {
//     success: false,
//     message: 'Muitas requisições. Tente novamente em alguns minutos.'
//   },
//   standardHeaders: true,
//   legacyHeaders: false
// });
// app.use(limiter);
console.log('🛡️ Rate limiting desabilitado temporariamente');

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://admin.socorreja.com.br'] 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080'],
  credentials: true
}));

// Logging
app.use(morgan('combined'));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Socorre AI Backend está funcionando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rotas específicas para frontend (evitar confusão)
app.get('/login', (req, res) => {
  res.json({
    success: false,
    message: 'Esta é uma rota do frontend. Use /api/auth/login para autenticação.'
  });
});

app.get('/dashboard', (req, res) => {
  res.json({
    success: false,
    message: 'Esta é uma rota do frontend. Use /api/dashboard para dados do dashboard.'
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Rotas do sistema de mecânicos
app.use('/api/mechanics', require('./routes/mechanics'));
app.use('/api/services', require('./routes/services'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/reviews', require('./routes/reviews'));

// Rotas do sistema completo de socorro
app.use('/api/partners', require('./routes/partners'));
app.use('/api/emergency-requests', require('./routes/emergency-requests'));
app.use('/api/delivery-orders', require('./routes/delivery-orders'));
app.use('/api/purchase-orders', require('./routes/purchase-orders'));

// Novas rotas - Nova lógica de parceiros
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/tow-proposals', require('./routes/towProposals'));
app.use('/api/delivery-orders-new', require('./routes/deliveryOrders'));
app.use('/api/products', require('./routes/products'));
app.use('/api/system-settings', require('./routes/systemSettings'));
app.use('/api/documents', require('./routes/documentRoutes'));

// Rotas existentes
app.use('/api/upload', require('./routes/upload'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/wallets', require('./routes/wallets'));
app.use('/api/disputes', require('./routes/disputes'));
app.use('/api/uploads', require('./routes/uploads'));

// Catch-all para rotas não encontradas
app.use('*', (req, res) => {
  console.log(`Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada no backend da API'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Erro no servidor:', error);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor'
  });
});

// Inicializar WebSocket
const socketService = require('./services/socketService');
socketService.initialize(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  console.log(`🔌 WebSocket server ativo`);
});

module.exports = app;

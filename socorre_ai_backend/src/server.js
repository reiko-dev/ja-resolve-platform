const http = require('http');
require('dotenv').config();
const { createApp } = require('./app');
const socketService = require('./services/socketService');

const app = createApp();
const server = http.createServer(app);

// Inicializar WebSocket
socketService.initialize(server);

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
  console.log(`🔌 WebSocket server ativo`);
});

module.exports = app;

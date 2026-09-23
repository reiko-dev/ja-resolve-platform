const http = require('http');
require('dotenv').config();
const { assertProductionSecrets } = require('./config/requiredSecrets');
const {
  resolveTowPaymentMode,
  describeTowPaymentMode,
  assertTowPaymentModeSafe,
} = require('./config/towPaymentMode');
const { assertTowRouteProviderSafe } = require('./config/towRouteProvider');

// Production boots only with explicit secrets; dev/test are untouched.
assertProductionSecrets();
// The validation-only selections fail here too, so `node src/server.js` refuses
// before the app (and its listeners/routes) is even imported.
assertTowPaymentModeSafe();
assertTowRouteProviderSafe();

const { createApp } = require('./app');
const socketService = require('./services/socketService');

/**
 * Server entrypoint.
 *
 * Importing this module must NOT open a listener: HTTP/Socket.IO transport
 * tests import the app directly (`require('../src/server')`) and a listener
 * opened at import time causes EADDRINUSE, leaked handles and cross-suite
 * flakiness. The listener is only started when this file is executed as the
 * main module (`node src/server.js`, used by npm start / PM2 / Docker).
 */

const DEFAULT_PORT = process.env.PORT || 3001;
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';

/**
 * Build the HTTP server with Socket.IO attached, without listening.
 * Tests may use this to bind an ephemeral port (port 0) explicitly.
 */
function createServer(app = createApp()) {
  const server = http.createServer(app);
  socketService.initialize(server);
  return server;
}

/**
 * Start the production listener. Only called from the main-module guard below.
 */
function startServer({ port = DEFAULT_PORT, host = DEFAULT_HOST } = {}) {
  const server = createServer();

  server.listen(port, host, () => {
    console.log(`🚀 Servidor rodando na porta ${port}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📅 ${new Date().toLocaleString('pt-BR')}`);
    console.log(`🔌 WebSocket server ativo`);
    console.log(`💳 Tow payment mode: ${describeTowPaymentMode(resolveTowPaymentMode())}`);
    if (process.env.APP_ENV === 'validation') {
      console.log('🧪 AMBIENTE DE VALIDAÇÃO — PAGAMENTOS SIMULADOS');
    }
  });

  return server;
}

const app = createApp();

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.createServer = createServer;
module.exports.startServer = startServer;

/**
 * Cliente HTTP das suítes de endpoint/integração.
 *
 * `api()` devolve um supertest ligado ao app exportado por `src/server.js`.
 * O server NÃO abre listener ao ser importado (ver src/server.js), então cada
 * chamada usa um servidor efêmero do supertest — sem EADDRINUSE.
 */
const request = require('supertest');

function api() {
  // require tardio: garante que os jest.mock do arquivo de teste (ex.: banco
  // SQLite) já estejam registrados quando o app for construído.
  const app = require('../../src/server');
  return request(app);
}

module.exports = { api };

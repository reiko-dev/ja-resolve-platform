/**
 * G3 — erro de regra de negócio com status HTTP e código estável.
 *
 * Serviços lançam ServiceError; controllers apenas traduzem para JSON. Assim a
 * regra (coordenadas, vínculo, transição) mora no serviço e a camada HTTP não
 * precisa conhecer detalhe de domínio para responder 400/403/404/409.
 */
class ServiceError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
    if (details !== null && details !== undefined) {
      this.details = details;
    }
  }
}

function isServiceError(error) {
  return Boolean(error) && (error instanceof ServiceError || error.name === 'ServiceError');
}

/**
 * Resposta de erro padronizada e retrocompatível: mantém `error` (formato
 * legado consumido por clientes antigos) e adiciona `code` estável para
 * controle de fluxo no app.
 */
function sendServiceError(res, error, fallbackMessage = 'Erro interno do servidor') {
  if (isServiceError(error)) {
    const body = {
      success: false,
      code: error.code,
      message: error.message,
      error: error.message,
    };
    if (error.details !== undefined) {
      body.details = error.details;
    }
    return res.status(error.status).json(body);
  }

  console.error('Erro não tratado em serviço:', error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
    error: fallbackMessage,
  });
}

module.exports = { ServiceError, isServiceError, sendServiceError };

const db = require('../config/database');

class FraudDetectionService {
  /**
   * Analisar risco de fraude em pagamento
   */
  async analyzePayment(paymentData) {
    try {
      const riskFactors = [];
      let riskScore = 0;

      // 1. Verificar histórico do usuário
      const userHistory = await this.getUserPaymentHistory(paymentData.userId);
      if (userHistory.totalPayments === 0) {
        riskFactors.push('novo_usuario');
        riskScore += 5;
      }

      if (userHistory.failedPayments > userHistory.totalPayments * 0.5) {
        riskFactors.push('alta_taxa_falha_pagamento');
        riskScore += 10;
      }

      // 2. Verificar valor suspeito
      if (paymentData.amount > 1000) {
        riskFactors.push('valor_alto');
        riskScore += 5;
      }

      if (paymentData.amount < 1) {
        riskFactors.push('valor_muito_baixo');
        riskScore += 10;
      }

      // 3. Verificar frequência de pagamentos
      const recentPayments = await this.getRecentPayments(paymentData.userId, 5);
      if (recentPayments.length >= 5) {
        riskFactors.push('muitos_pagamentos_recentes');
        riskScore += 8;
      }

      // 4. Verificar múltiplas tentativas do mesmo cartão
      if (paymentData.cardData) {
        const cardAttempts = await this.getCardAttempts(paymentData.cardData.lastFour);
        if (cardAttempts >= 3) {
          riskFactors.push('multiplas_tentativas_cartao');
          riskScore += 12;
        }
      }

      // 5. Verificar padrão de comportamento suspeito
      const suspiciousPattern = await this.detectSuspiciousPattern(paymentData);
      if (suspiciousPattern.isSuspicious) {
        riskFactors.push(suspiciousPattern.factor);
        riskScore += suspiciousPattern.score;
      }

      // Determinar risco
      let riskLevel = 'low';
      if (riskScore >= 30) riskLevel = 'high';
      else if (riskScore >= 15) riskLevel = 'medium';

      const isFraud = riskScore >= 30;

      return {
        riskScore,
        riskLevel,
        riskFactors,
        isFraud,
        recommendation: isFraud ? 'reject' : riskLevel === 'high' ? 'review' : 'approve'
      };

    } catch (error) {
      console.error('Erro ao analisar fraude:', error);
      return {
        riskScore: 0,
        riskLevel: 'low',
        riskFactors: [],
        isFraud: false,
        recommendation: 'approve'
      };
    }
  }

  /**
   * Analisar disputa
   */
  async analyzeDispute({ payment, disputeData }) {
    try {
      const riskFactors = [];
      let riskScore = 0;

      // 1. Verificar histórico de disputas do usuário
      const userDisputes = await this.getUserDisputes(disputeData.userId);
      if (userDisputes.totalDisputes > 3) {
        riskFactors.push('historico_disputas_alto');
        riskScore += 15;
      }

      // 2. Verificar tempo desde o pagamento
      const hoursSincePayment = (new Date() - new Date(payment.created_at)) / (1000 * 60 * 60);
      if (hoursSincePayment > 168) { // Mais de 7 dias
        riskFactors.push('disputa_tardia');
        riskScore += 5;
      }

      // 3. Verificar valor da disputa
      const disputedAmount = disputeData.disputedAmount || payment.amount;
      if (disputedAmount > payment.amount * 0.8) {
        riskFactors.push('disputa_valor_alto');
        riskScore += 8;
      }

      // 4. Verificar evidências
      if (!disputeData.evidence || Object.keys(disputeData.evidence).length === 0) {
        riskFactors.push('sem_evidencias');
        riskScore += 5;
      }

      // 5. Verificar padrão de fraude
      const suspiciousPattern = await this.detectDisputePattern(disputeData);
      if (suspiciousPattern.isSuspicious) {
        riskFactors.push(suspiciousPattern.factor);
        riskScore += suspiciousPattern.score;
      }

      const isFraud = riskScore >= 25;

      return {
        riskScore,
        isFraud,
        reason: isFraud ? riskFactors.join(', ') : null
      };

    } catch (error) {
      console.error('Erro ao analisar disputa:', error);
      return {
        riskScore: 0,
        isFraud: false,
        reason: null
      };
    }
  }

  /**
   * Obter histórico de pagamentos do usuário
   */
  async getUserPaymentHistory(userId) {
    try {
      const [
        { count: totalPayments },
        { count: failedPayments },
        { count: completedPayments }
      ] = await Promise.all([
        db('payments').where('user_id', userId).count('* as count').first(),
        db('payments').where('user_id', userId).where('status', 'failed').count('* as count').first(),
        db('payments').where('user_id', userId).where('status', 'completed').count('* as count').first()
      ]);

      return {
        totalPayments: parseInt(totalPayments),
        failedPayments: parseInt(failedPayments),
        completedPayments: parseInt(completedPayments)
      };

    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return { totalPayments: 0, failedPayments: 0, completedPayments: 0 };
    }
  }

  /**
   * Obter pagamentos recentes
   */
  async getRecentPayments(userId, limit = 5) {
    try {
      return await db('payments')
        .where('user_id', userId)
        .where('created_at', '>=', new Date(Date.now() - 60 * 60 * 1000)) // Última hora
        .limit(limit);
    } catch (error) {
      console.error('Erro ao buscar pagamentos recentes:', error);
      return [];
    }
  }

  /**
   * Obter tentativas com mesmo cartão
   */
  async getCardAttempts(cardLastFour) {
    try {
      const [{ count }] = await db('payments')
        .where('card_last_four', cardLastFour)
        .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000)) // Últimas 24h
        .count('* as count')
        .first();

      return parseInt(count);

    } catch (error) {
      console.error('Erro ao buscar tentativas de cartão:', error);
      return 0;
    }
  }

  /**
   * Obter disputas do usuário
   */
  async getUserDisputes(userId) {
    try {
      const [
        { count: totalDisputes },
        { count: resolvedDisputes },
        { count: rejectedDisputes }
      ] = await Promise.all([
        db('disputes').where('user_id', userId).count('* as count').first(),
        db('disputes').where('user_id', userId).where('status', 'resolved').count('* as count').first(),
        db('disputes').where('user_id', userId).where('resolution', 'no_action').count('* as count').first()
      ]);

      return {
        totalDisputes: parseInt(totalDisputes),
        resolvedDisputes: parseInt(resolvedDisputes),
        rejectedDisputes: parseInt(rejectedDisputes)
      };

    } catch (error) {
      console.error('Erro ao buscar disputas:', error);
      return { totalDisputes: 0, resolvedDisputes: 0, rejectedDisputes: 0 };
    }
  }

  /**
   * Detectar padrão suspeito em pagamento
   */
  async detectSuspiciousPattern(paymentData) {
    try {
      // Padrão: Valor exato e redondo (pode ser teste de cartão)
      if (paymentData.amount % 100 === 0 && paymentData.amount < 200) {
        return {
          isSuspicious: true,
          factor: 'valor_teste_suspeito',
          score: 10
        };
      }

      // Padrão: Múltiplos pagamentos muito próximos no tempo
      const recentPayments = await this.getRecentPayments(paymentData.userId, 10);
      if (recentPayments.length >= 3) {
        const timeDiff = recentPayments[1].created_at - recentPayments[0].created_at;
        if (timeDiff < 10000) { // Menos de 10 segundos
          return {
            isSuspicious: true,
            factor: 'pagamentos_rapidos_demais',
            score: 15
          };
        }
      }

      return {
        isSuspicious: false,
        factor: null,
        score: 0
      };

    } catch (error) {
      console.error('Erro ao detectar padrão:', error);
      return { isSuspicious: false, factor: null, score: 0 };
    }
  }

  /**
   * Detectar padrão em disputa
   */
  async detectDisputePattern(disputeData) {
    try {
      // Padrão: Disputa aberta imediatamente após pagamento
      const payment = await db('payments')
        .where('id', disputeData.paymentId)
        .first();

      if (payment) {
        const minutesSincePayment = (new Date() - new Date(payment.created_at)) / (1000 * 60);
        if (minutesSincePayment < 60) {
          return {
            isSuspicious: true,
            factor: 'disputa_imediata',
            score: 10
          };
        }
      }

      // Padrão: Sempre disputa valor total
      const userDisputes = await this.getUserDisputes(disputeData.userId);
      if (userDisputes.totalDisputes > 1) {
        const previousDisputes = await db('disputes')
          .where('user_id', disputeData.userId)
          .where('status', 'resolved');

        const alwaysFull = previousDisputes.every(d => {
          return (d.disputed_amount / d.disputed_amount) > 0.95;
        });

        if (alwaysFull) {
          return {
            isSuspicious: true,
            factor: 'sempre_disputa_total',
            score: 12
          };
        }
      }

      return {
        isSuspicious: false,
        factor: null,
        score: 0
      };

    } catch (error) {
      console.error('Erro ao detectar padrão de disputa:', error);
      return { isSuspicious: false, factor: null, score: 0 };
    }
  }

  /**
   * Validar dados de cartão
   */
  validateCardData(cardData) {
    const errors = [];

    // Validar número (Luhn algorithm básico)
    if (cardData.number && cardData.number.length < 13 || cardData.number.length > 19) {
      errors.push('Número de cartão inválido');
    }

    // Validar data de expiração
    if (cardData.expMonth && (cardData.expMonth < 1 || cardData.expMonth > 12)) {
      errors.push('Mês de expiração inválido');
    }

    if (cardData.expYear && cardData.expYear < new Date().getFullYear()) {
      errors.push('Ano de expiração inválido');
    }

    // Validar CVV
    if (cardData.cvv && cardData.cvv.length !== 3 && cardData.cvv.length !== 4) {
      errors.push('CVV inválido');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validar dados de CPF/CNPJ
   */
  validateDocument(document) {
    const errors = [];

    const cleaned = document.replace(/\D/g, '');

    if (cleaned.length === 11) {
      // Validar CPF
      if (!this.isValidCPF(cleaned)) {
        errors.push('CPF inválido');
      }
    } else if (cleaned.length === 14) {
      // Validar CNPJ
      if (!this.isValidCNPJ(cleaned)) {
        errors.push('CNPJ inválido');
      }
    } else {
      errors.push('Documento inválido');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validar CPF
   */
  isValidCPF(cpf) {
    if (cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;

    let sum = 0;
    let remainder;

    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;

    return true;
  }

  /**
   * Validar CNPJ
   */
  isValidCNPJ(cnpj) {
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1+$/.test(cnpj)) return false;

    let size = cnpj.length - 2;
    let numbers = cnpj.substring(0, size);
    const digits = cnpj.substring(size);
    let sum = 0;
    let pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }

    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;

    size = size + 1;
    numbers = cnpj.substring(0, size);
    sum = 0;
    pos = size - 7;

    for (let i = size; i >= 1; i--) {
      sum += numbers.charAt(size - i) * pos--;
      if (pos < 2) pos = 9;
    }

    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) return false;

    return true;
  }
}

module.exports = new FraudDetectionService();


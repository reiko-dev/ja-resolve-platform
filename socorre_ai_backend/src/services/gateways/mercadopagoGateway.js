class MercadoPagoGateway {
  async processPayment(paymentData) {
    try {
      // Simular processamento do Mercado Pago
      console.log('Processando pagamento no Mercado Pago:', {
        method: paymentData && paymentData.method,
        referenceId: paymentData && paymentData.referenceId
      });

      // Simular delay de processamento
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Simular resposta do Mercado Pago
      const response = {
        transactionId: `mp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentId: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: this.simulatePaymentStatus(paymentData.method),
        gateway: 'mercadopago',
        response: {
          id: Date.now(),
          status: this.simulatePaymentStatus(paymentData.method),
          status_detail: this.getStatusDetail(paymentData.method),
          transaction_amount: paymentData.amount,
          currency_id: paymentData.currency,
          description: paymentData.description,
          payment_method_id: this.getPaymentMethodId(paymentData.method),
          date_created: new Date().toISOString(),
          date_approved: this.simulatePaymentStatus(paymentData.method) === 'completed' ? new Date().toISOString() : null
        }
      };

      return response;

    } catch (error) {
      console.error('Erro no gateway Mercado Pago:', error);
      throw new Error('Erro ao processar pagamento no Mercado Pago');
    }
  }

  async getPaymentStatus(transactionId) {
    try {
      // Simular verificação de status
      console.log('Verificando status do pagamento no Mercado Pago:', transactionId);

      // Simular delay
      await new Promise(resolve => setTimeout(resolve, 600));

      // Simular status (85% de chance de sucesso)
      const isSuccess = Math.random() > 0.15;
      return isSuccess ? 'completed' : 'failed';

    } catch (error) {
      console.error('Erro ao verificar status no Mercado Pago:', error);
      return 'failed';
    }
  }

  async cancelPayment(transactionId) {
    try {
      console.log('Cancelando pagamento no Mercado Pago:', transactionId);
      
      // Simular cancelamento
      await new Promise(resolve => setTimeout(resolve, 600));
      
      return { success: true, status: 'cancelled' };

    } catch (error) {
      console.error('Erro ao cancelar pagamento no Mercado Pago:', error);
      throw new Error('Erro ao cancelar pagamento');
    }
  }

  async refundPayment(transactionId, amount, reason = '') {
    try {
      console.log('Reembolsando pagamento no Mercado Pago:', { transactionId, amount, reason });
      
      // Simular reembolso
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      return {
        success: true,
        refundId: `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: amount,
        status: 'approved'
      };

    } catch (error) {
      console.error('Erro ao reembolsar no Mercado Pago:', error);
      throw new Error('Erro ao processar reembolso');
    }
  }

  simulatePaymentStatus(method) {
    // Simular diferentes taxas de sucesso por método
    const successRates = {
      credit_card: 0.92, // 92% de sucesso
      debit_card: 0.88,  // 88% de sucesso
      pix: 0.99,         // 99% de sucesso
      bank_slip: 0.82    // 82% de sucesso
    };

    const successRate = successRates[method] || 0.90;
    return Math.random() < successRate ? 'completed' : 'failed';
  }

  getStatusDetail(method) {
    const statusDetails = {
      credit_card: 'accredited',
      debit_card: 'accredited',
      pix: 'accredited',
      bank_slip: 'pending_waiting_payment'
    };

    return statusDetails[method] || 'pending';
  }

  getPaymentMethodId(method) {
    const methodIds = {
      credit_card: 'master',
      debit_card: 'debit_master',
      pix: 'pix',
      bank_slip: 'bolbradesco'
    };

    return methodIds[method] || 'master';
  }
}

module.exports = new MercadoPagoGateway();

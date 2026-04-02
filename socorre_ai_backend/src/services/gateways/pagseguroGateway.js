class PagSeguroGateway {
  async processPayment(paymentData) {
    try {
      // Simular processamento do PagSeguro
      console.log('Processando pagamento no PagSeguro:', paymentData);

      // Simular delay de processamento
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Simular resposta do PagSeguro
      const response = {
        transactionId: `ps_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        paymentId: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: this.simulatePaymentStatus(paymentData.method),
        gateway: 'pagseguro',
        response: {
          code: Date.now().toString(),
          reference: paymentData.referenceId,
          status: this.simulatePaymentStatus(paymentData.method),
          paymentMethod: this.getPaymentMethod(paymentData.method),
          grossAmount: paymentData.amount,
          discountAmount: 0,
          feeAmount: paymentData.amount * 0.0399,
          netAmount: paymentData.amount * 0.9601,
          extraAmount: 0,
          installmentCount: 1,
          itemCount: 1,
          date: new Date().toISOString(),
          lastEventDate: new Date().toISOString()
        }
      };

      return response;

    } catch (error) {
      console.error('Erro no gateway PagSeguro:', error);
      throw new Error('Erro ao processar pagamento no PagSeguro');
    }
  }

  async getPaymentStatus(transactionId) {
    try {
      // Simular verificação de status
      console.log('Verificando status do pagamento no PagSeguro:', transactionId);

      // Simular delay
      await new Promise(resolve => setTimeout(resolve, 700));

      // Simular status (88% de chance de sucesso)
      const isSuccess = Math.random() > 0.12;
      return isSuccess ? 'completed' : 'failed';

    } catch (error) {
      console.error('Erro ao verificar status no PagSeguro:', error);
      return 'failed';
    }
  }

  async cancelPayment(transactionId) {
    try {
      console.log('Cancelando pagamento no PagSeguro:', transactionId);
      
      // Simular cancelamento
      await new Promise(resolve => setTimeout(resolve, 700));
      
      return { success: true, status: 'cancelled' };

    } catch (error) {
      console.error('Erro ao cancelar pagamento no PagSeguro:', error);
      throw new Error('Erro ao cancelar pagamento');
    }
  }

  async refundPayment(transactionId, amount, reason = '') {
    try {
      console.log('Reembolsando pagamento no PagSeguro:', { transactionId, amount, reason });
      
      // Simular reembolso
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return {
        success: true,
        refundId: `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        amount: amount,
        status: 'approved'
      };

    } catch (error) {
      console.error('Erro ao reembolsar no PagSeguro:', error);
      throw new Error('Erro ao processar reembolso');
    }
  }

  simulatePaymentStatus(method) {
    // Simular diferentes taxas de sucesso por método
    const successRates = {
      credit_card: 0.90, // 90% de sucesso
      debit_card: 0.85,  // 85% de sucesso
      pix: 0.98,         // 98% de sucesso
      bank_slip: 0.80    // 80% de sucesso
    };

    const successRate = successRates[method] || 0.88;
    return Math.random() < successRate ? 'completed' : 'failed';
  }

  getPaymentMethod(method) {
    const methods = {
      credit_card: 'creditCard',
      debit_card: 'debitCard',
      pix: 'pix',
      bank_slip: 'boleto'
    };

    return methods[method] || 'creditCard';
  }
}

module.exports = new PagSeguroGateway();

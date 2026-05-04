const db = require('../config/database');
const notificationService = require('./notificationService');

class WalletService {
  /**
   * Criar carteira para usuário ou parceiro
   */
  async createWallet(userId, partnerId = null) {
    try {
      const [wallet] = await db('wallets').insert({
        user_id: userId,
        partner_id: partnerId,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');
      
      // Notificar criação
      await notificationService.sendNotificationToUser(userId, {
        title: '💳 Carteira Digital Criada',
        body: 'Sua carteira digital foi criada com sucesso!',
        type: 'wallet',
        data: { walletId: wallet.id }
      });

      return wallet;

    } catch (error) {
      console.error('Erro ao criar carteira:', error);
      throw error;
    }
  }

  /**
   * Obter carteira por ID
   */
  async getWallet(walletId) {
    try {
      return await db('wallets').where('id', walletId).first();
    } catch (error) {
      console.error('Erro ao buscar carteira:', error);
      throw error;
    }
  }

  /**
   * Obter carteira por user_id
   */
  async getWalletByUserId(userId) {
    try {
      return await db('wallets').where('user_id', userId).first();
    } catch (error) {
      console.error('Erro ao buscar carteira:', error);
      throw error;
    }
  }

  /**
   * Obter carteira por partner_id
   */
  async getWalletByPartnerId(partnerId) {
    try {
      return await db('wallets').where('partner_id', partnerId).first();
    } catch (error) {
      console.error('Erro ao buscar carteira do parceiro:', error);
      throw error;
    }
  }

  /**
   * Obter ou materializar a carteira oficial do parceiro no mesmo registro do usuário
   */
  async getOrCreatePartnerWallet(userId, partnerId) {
    try {
      let wallet = await this.getWalletByPartnerId(partnerId);
      if (wallet) {
        return wallet;
      }

      wallet = await this.getWalletByUserId(userId);
      if (wallet) {
        if (wallet.partner_id !== partnerId) {
          await db('wallets')
            .where('id', wallet.id)
            .update({
              partner_id: partnerId,
              updated_at: new Date()
            });

          wallet = await this.getWallet(wallet.id);
        }

        return wallet;
      }

      return await this.createWallet(userId, partnerId);
    } catch (error) {
      console.error('Erro ao obter/criar carteira do parceiro:', error);
      throw error;
    }
  }

  /**
   * Adicionar saldo à carteira
   */
  async addBalance(walletId, amount, type, referenceId = null, description = null) {
    const trx = await db.transaction();

    try {
      const normalizedAmount = parseFloat(amount);

      // Obter saldo atual
      const wallet = await trx('wallets').where('id', walletId).first();
      if (!wallet) {
        throw new Error('Carteira não encontrada');
      }

      const balanceBefore = parseFloat(wallet.available_balance);
      const balanceAfter = balanceBefore + normalizedAmount;

      // Atualizar carteira
      await trx('wallets')
        .where('id', walletId)
        .update({
          available_balance: balanceAfter,
          total_earned: parseFloat(wallet.total_earned) + normalizedAmount,
          updated_at: new Date()
        });

      // Criar transação
      const [transaction] = await trx('wallet_transactions').insert({
        wallet_id: walletId,
        type: type,
        direction: 'credit',
        amount: normalizedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description,
        status: 'completed',
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');

      // Adicionar referência se fornecida
      if (referenceId) {
        const referenceFields = this.getReferenceFields(type, referenceId);
        if (referenceFields) {
          await trx('wallet_transactions')
            .where('id', transaction.id)
            .update(referenceFields);
        }
      }

      await trx.commit();

      // Obter transação completa
      const completeTransaction = await this.getTransaction(transaction.id);

      // Notificar
      await this.sendNotification(wallet.user_id, {
        title: '💵 Saldo Adicionado',
        body: `R$ ${normalizedAmount.toFixed(2)} adicionados à sua carteira`,
        type: 'wallet',
        data: { transactionId: transaction.id, amount: normalizedAmount, balance: balanceAfter }
      });

      return completeTransaction;

    } catch (error) {
      await trx.rollback();
      console.error('Erro ao adicionar saldo:', error);
      throw error;
    }
  }

  /**
   * Debitar saldo da carteira
   */
  async deductBalance(walletId, amount, type, referenceId = null, description = null) {
    const trx = await db.transaction();

    try {
      const normalizedAmount = parseFloat(amount);

      // Obter saldo atual
      const wallet = await trx('wallets').where('id', walletId).first();
      if (!wallet) {
        throw new Error('Carteira não encontrada');
      }

      // Validar saldo suficiente
      if (parseFloat(wallet.available_balance) < normalizedAmount) {
        throw new Error('Saldo insuficiente');
      }

      const balanceBefore = parseFloat(wallet.available_balance);
      const balanceAfter = balanceBefore - normalizedAmount;
      const totalWithdrawnIncrement = type === 'withdrawal' ? normalizedAmount : 0;

      // Atualizar carteira
      await trx('wallets')
        .where('id', walletId)
        .update({
          available_balance: balanceAfter,
          total_withdrawn: parseFloat(wallet.total_withdrawn) + totalWithdrawnIncrement,
          updated_at: new Date()
        });

      // Criar transação
      const [transaction] = await trx('wallet_transactions').insert({
        wallet_id: walletId,
        type: type,
        direction: 'debit',
        amount: normalizedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description,
        status: 'completed',
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');

      // Adicionar referência se fornecida
      if (referenceId) {
        const referenceFields = this.getReferenceFields(type, referenceId);
        if (referenceFields) {
          await trx('wallet_transactions')
            .where('id', transaction.id)
            .update(referenceFields);
        }
      }

      await trx.commit();

      return await this.getTransaction(transaction.id);

    } catch (error) {
      await trx.rollback();
      console.error('Erro ao debitar saldo:', error);
      throw error;
    }
  }

  /**
   * Processar saque
   */
  async requestWithdrawal(walletId, amount, notes = '') {
    try {
      // Obter carteira
      const wallet = await this.getWallet(walletId);
      if (!wallet) {
        throw new Error('Carteira não encontrada');
      }

      // Validar saldo
      if (parseFloat(wallet.available_balance) < amount) {
        throw new Error('Saldo insuficiente');
      }

      // Validar mínimo de saque (R$ 20,00)
      if (amount < 20) {
        throw new Error('Valor mínimo para saque é R$ 20,00');
      }

      // Validar se saque está habilitado
      if (!wallet.withdrawal_enabled) {
        throw new Error('Saque não habilitado. Configure seus dados bancários primeiro.');
      }

      // Criar transação pendente
      const transaction = await this.createPendingTransaction({
        walletId,
        amount,
        type: 'withdrawal',
        direction: 'debit',
        description: `Saque solicitado${notes ? ': ' + notes : ''}`
      });

      // Notificar
      await this.sendNotification(wallet.user_id, {
        title: '💸 Saque Solicitado',
        body: `Seu saque de R$ ${amount.toFixed(2)} foi solicitado e será processado em até 3 dias úteis`,
        type: 'wallet',
        data: { transactionId: transaction.id, amount }
      });

      return transaction;

    } catch (error) {
      console.error('Erro ao solicitar saque:', error);
      throw error;
    }
  }

  /**
   * Criar transação pendente
   */
  async createPendingTransaction({ walletId, amount, type, direction, description, referenceId = null }) {
    try {
      const normalizedAmount = parseFloat(amount);
      const wallet = await this.getWallet(walletId);
      const balanceBefore = parseFloat(wallet.available_balance);
      const balanceAfter = direction === 'credit' 
        ? balanceBefore + normalizedAmount
        : balanceBefore - normalizedAmount;

      const [transaction] = await db('wallet_transactions').insert({
        wallet_id: walletId,
        type,
        direction,
        amount: normalizedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      }).returning('*');

      if (referenceId) {
        const referenceFields = this.getReferenceFields(type, referenceId);
        if (referenceFields) {
          await db('wallet_transactions')
            .where('id', transaction.id)
            .update(referenceFields);
        }
      }

      return await this.getTransaction(transaction.id);

    } catch (error) {
      console.error('Erro ao criar transação pendente:', error);
      throw error;
    }
  }

  /**
   * Processar transação pendente
   */
  async processTransaction(transactionId) {
    const trx = await db.transaction();

    try {
      const transaction = await trx('wallet_transactions')
        .where('id', transactionId)
        .first();

      if (!transaction || transaction.status !== 'pending') {
        throw new Error('Transação inválida ou já processada');
      }

      const wallet = await trx('wallets')
        .where('id', transaction.wallet_id)
        .first();

      let newBalance;

      if (transaction.direction === 'credit') {
        newBalance = parseFloat(wallet.available_balance) + parseFloat(transaction.amount);
        await trx('wallets')
          .where('id', wallet.id)
          .update({
            available_balance: newBalance,
            total_earned: parseFloat(wallet.total_earned) + parseFloat(transaction.amount),
            updated_at: new Date()
          });
      } else {
        newBalance = parseFloat(wallet.available_balance) - parseFloat(transaction.amount);
        if (newBalance < 0) {
          throw new Error('Saldo insuficiente');
        }
        const totalWithdrawnIncrement = transaction.type === 'withdrawal'
          ? parseFloat(transaction.amount)
          : 0;
        await trx('wallets')
          .where('id', wallet.id)
          .update({
            available_balance: newBalance,
            total_withdrawn: parseFloat(wallet.total_withdrawn) + totalWithdrawnIncrement,
            updated_at: new Date()
          });
      }

      // Atualizar transação
      await trx('wallet_transactions')
        .where('id', transactionId)
        .update({
          status: 'completed',
          balance_after: newBalance,
          processed_at: new Date(),
          updated_at: new Date()
        });

      await trx.commit();

      const updatedTransaction = await this.getTransaction(transactionId);
      const transactionAmount = parseFloat(transaction.amount);

      // Notificar
      await this.sendNotification(wallet.user_id, {
        title: transaction.direction === 'credit' ? '✅ Crédito Confirmado' : '✅ Saque Processado',
        body: transaction.direction === 'credit'
          ? `R$ ${transactionAmount.toFixed(2)} creditados`
          : `R$ ${transactionAmount.toFixed(2)} sacados`,
        type: 'wallet',
        data: { transactionId, amount: transactionAmount, balance: newBalance }
      });

      return updatedTransaction;

    } catch (error) {
      await trx.rollback();
      console.error('Erro ao processar transação:', error);
      throw error;
    }
  }

  /**
   * Obter transações da carteira
   */
  async getTransactions(walletId, filters = {}) {
    try {
      const {
        type,
        direction,
        status,
        page = 1,
        limit = 20,
        startDate,
        endDate
      } = filters;

      const offset = (page - 1) * limit;

      let query = db('wallet_transactions')
        .where('wallet_id', walletId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (type) query = query.where('type', type);
      if (direction) query = query.where('direction', direction);
      if (status) query = query.where('status', status);
      if (startDate) query = query.where('created_at', '>=', startDate);
      if (endDate) query = query.where('created_at', '<=', endDate);

      const transactions = await query;

      // Contar total
      const [{ count }] = await db('wallet_transactions')
        .where('wallet_id', walletId)
        .count('* as count');

      return {
        transactions,
        pagination: {
          page,
          limit,
          total: parseInt(count),
          pages: Math.ceil(count / limit)
        }
      };

    } catch (error) {
      console.error('Erro ao buscar transações:', error);
      throw error;
    }
  }

  /**
   * Obter transação por ID
   */
  async getTransaction(transactionId) {
    try {
      return await db('wallet_transactions')
        .where('id', transactionId)
        .first();
    } catch (error) {
      console.error('Erro ao buscar transação:', error);
      throw error;
    }
  }

  /**
   * Atualizar dados bancários da carteira
   */
  async updateBankDetails(walletId, bankDetails) {
    try {
      const {
        pix_key,
        bank_name,
        bank_agency,
        bank_account,
        account_type,
        account_holder_name,
        account_holder_document
      } = bankDetails;

      // Se todos os dados necessários foram fornecidos, habilitar saque
      const canEnableWithdrawal = pix_key || (bank_name && bank_agency && bank_account);

      const updateData = {
        updated_at: new Date()
      };

      if (pix_key) updateData.pix_key = pix_key;
      if (bank_name) updateData.bank_name = bank_name;
      if (bank_agency) updateData.bank_agency = bank_agency;
      if (bank_account) updateData.bank_account = bank_account;
      if (account_type) updateData.account_type = account_type;
      if (account_holder_name) updateData.account_holder_name = account_holder_name;
      if (account_holder_document) updateData.account_holder_document = account_holder_document;
      if (canEnableWithdrawal) updateData.withdrawal_enabled = true;

      await db('wallets')
        .where('id', walletId)
        .update(updateData);

      const wallet = await this.getWallet(walletId);

      // Notificar
      await this.sendNotification(wallet.user_id, {
        title: '🏦 Dados Bancários Atualizados',
        body: 'Seus dados bancários foram atualizados com sucesso!',
        type: 'wallet',
        data: { walletId }
      });

      return wallet;

    } catch (error) {
      console.error('Erro ao atualizar dados bancários:', error);
      throw error;
    }
  }

  /**
   * Obter campos de referência baseado no tipo
   */
  getReferenceFields(type, referenceId) {
    const numericReferenceId = Number(referenceId);
    if (!numericReferenceId) {
      return null;
    }

    const mapping = {
      deposit: null,
      commission: { payment_id: numericReferenceId },
      refund: { dispute_id: numericReferenceId },
      withdrawal: null,
      fee: null,
      adjustment: null,
    };

    return mapping[type] || null;
  }

  /**
   * Enviar notificação
   */
  async sendNotification(userId, notification) {
    try {
      await notificationService.sendNotificationToUser(userId, notification);
    } catch (error) {
      console.error('Erro ao enviar notificação de carteira:', error);
    }
  }
}

module.exports = new WalletService();

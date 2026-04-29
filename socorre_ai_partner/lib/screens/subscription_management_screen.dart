import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/subscription.dart';
import '../services/subscription_service.dart';

class SubscriptionManagementScreen extends StatefulWidget {
  const SubscriptionManagementScreen({super.key});

  @override
  State<SubscriptionManagementScreen> createState() => _SubscriptionManagementScreenState();
}

class _SubscriptionManagementScreenState extends State<SubscriptionManagementScreen> {
  List<Subscription> _subscriptions = [];
  bool _isLoading = true;
  String? _error;
  Map<String, dynamic>? _subscriptionStatus;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadData();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _startAutoRefresh() {
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _loadData();
    });
  }

  Future<void> _loadData() async {
    await Future.wait([
      _loadSubscriptions(),
      _loadSubscriptionStatus(),
    ]);
  }

  Future<void> _loadSubscriptions() async {
    try {
      final subscriptions = await SubscriptionService.getPartnerSubscriptions();
      setState(() {
        _subscriptions = subscriptions;
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = 'Erro ao carregar assinaturas: $e';
      });
    }
  }

  Future<void> _loadSubscriptionStatus() async {
    try {
      final status = await SubscriptionService.checkPartnerSubscriptionStatus();
      setState(() {
        _subscriptionStatus = status;
      });
    } catch (e) {
      debugPrint('Erro ao carregar status da assinatura: $e');
    }
  }

  Future<void> _createSubscription() async {
    // TODO: Mostrar diálogo para criar assinatura
    showDialog(
      context: context,
      builder: (context) => _CreateSubscriptionDialog(
        onSubmit: (subscriptionData) => _submitSubscription(subscriptionData),
      ),
    );
  }

  Future<void> _submitSubscription(Map<String, dynamic> subscriptionData) async {
    try {
      await SubscriptionService.createSubscription(
        type: subscriptionData['type'],
        paymentMethod: subscriptionData['paymentMethod'],
        autoRenew: subscriptionData['autoRenew'],
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Assinatura criada com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.of(context).pop();
      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao criar assinatura: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _cancelSubscription(Subscription subscription) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Cancelar Assinatura'),
        content: Text(
          'Tem certeza que deseja cancelar sua assinatura ${subscription.type.displayName}?\n\n'
          'Você perderá acesso a todos os benefícios imediatamente.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Não'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Sim, cancelar'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      setState(() => _isLoading = true);
      
      await SubscriptionService.cancelSubscription(subscription.id);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Assinatura cancelada com sucesso'),
          backgroundColor: Colors.orange,
        ),
      );

      _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao cancelar assinatura: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _renewSubscription(Subscription subscription) async {
    try {
      setState(() => _isLoading = true);
      
      await SubscriptionService.renewSubscription(subscription.id);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Assinatura renovada com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      _loadData();
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao renovar assinatura: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _processPayment(Subscription subscription) async {
    try {
      await SubscriptionService.processSubscriptionPayment(subscription.id);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Pagamento processado com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao processar pagamento: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Minhas Assinaturas',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: Colors.purple[800],
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
      floatingActionButton: _subscriptions.isEmpty
          ? FloatingActionButton.extended(
              onPressed: _createSubscription,
              backgroundColor: Colors.purple[800],
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: Text(
                'Nova Assinatura',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                ),
              ),
            )
          : null,
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.red[400],
            ),
            const SizedBox(height: 16),
            Text(
              _error!,
              style: GoogleFonts.poppins(
                fontSize: 16,
                color: Colors.red[600],
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _loadData,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.purple[800],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: Text(
                'Tentar novamente',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_subscriptions.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.card_membership,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              'Nenhuma assinatura ativa',
              style: GoogleFonts.poppins(
                fontSize: 18,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Assine um plano para ter acesso a benefícios exclusivos',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[500],
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _createSubscription,
              icon: const Icon(Icons.add),
              label: Text(
                'Ver Planos',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.purple[800],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: Column(
        children: [
          // Status da assinatura
          if (_subscriptionStatus != null) ...[
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                  'Status da Conta',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[800],
                  ),
                ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Icon(
                        _subscriptionStatus!['can_receive'] 
                            ? Icons.check_circle 
                            : Icons.error_outline,
                        color: _subscriptionStatus!['can_receive'] 
                            ? Colors.green 
                            : Colors.red,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _subscriptionStatus!['can_receive']
                              ? 'Pode receber solicitações'
                              : 'Não pode receber solicitações',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            color: Colors.grey[700],
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_subscriptionStatus!['subscription'] != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(
                          Icons.info_outline,
                          size: 16,
                          color: Colors.grey[600],
                        ),
                        const SizedBox(width: 4),
                        Text(
                          'Plano atual: ${_subscriptionStatus!['subscription']['type_display_name']}',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
          
          // Lista de assinaturas
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _subscriptions.length,
              itemBuilder: (context, index) {
                final subscription = _subscriptions[index];
                return _SubscriptionCard(subscription: subscription);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _SubscriptionCard({required Subscription subscription}) {
    final isActive = subscription.isActive;
    final isExpiringSoon = subscription.isExpiringSoon;
    final isExpired = subscription.isExpired;
    final isCancelled = subscription.isCancelled;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isExpired || isCancelled 
              ? Colors.red 
              : isExpiringSoon 
                  ? Colors.orange 
                  : isActive 
                      ? Colors.green 
                      : Colors.grey,
          width: 2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header com tipo e status
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: isExpired || isCancelled 
                        ? Colors.red 
                        : isExpiringSoon 
                            ? Colors.orange 
                            : isActive 
                                ? Colors.green 
                                : Colors.grey,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    subscription.status.displayName,
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  subscription.type.icon,
                  style: const TextStyle(fontSize: 24),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            // Nome do plano
            Text(
              subscription.type.displayName,
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.grey[800],
              ),
            ),
            
            const SizedBox(height: 8),
            
            // Descrição
            Text(
              subscription.type.description,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[600],
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Informações de período
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Período:',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                      Text(
                        SubscriptionService.formatSubscriptionPeriod(
                          subscription.startDate,
                          subscription.endDate,
                        ),
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Vencimento:',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                      Text(
                        subscription.daysUntilExpiry,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: isExpiringSoon 
                              ? Colors.orange 
                              : isExpired 
                                  ? Colors.red 
                                  : Colors.grey[700],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Preço e renovação
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Mensalidade:',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      subscription.formattedMonthlyFee,
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Colors.purple[700],
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Renovação:',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Switch(
                      value: subscription.autoRenew,
                      onChanged: (value) {
                        // TODO: Implementar atualização de auto-renew
                      },
                      activeThumbColor: Colors.purple[700],
                    ),
                  ],
                ),
              ],
            ),
            
            if (isExpiringSoon) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.orange[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.warning,
                      color: Colors.orange[700],
                      size: 20,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Sua assinatura está expirando em breve! Renove para continuar com os benefícios.',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.orange[700],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            
            const SizedBox(height: 16),
            
            // Benefícios
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Benefícios Incluídos:',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.blue[700],
                    ),
                  ),
                const SizedBox(height: 8),
                ...subscription.type.features.map((benefit) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        Icon(
                          Icons.check_circle,
                          size: 16,
                          color: Colors.blue[700],
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            benefit,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
            ),

            const SizedBox(height: 16),

            // Botões de ação
            if (isActive)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _cancelSubscription(subscription),
                      style: OutlinedButton.styleFrom(
                        side: BorderSide(color: Colors.red),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        'Cancelar',
                        style: GoogleFonts.poppins(
                          color: Colors.red,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _processPayment(subscription),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.purple[800],
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(
                        'Pagar',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ],
              )
            else if (isExpired)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _renewSubscription(subscription),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purple[800],
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: Text(
                    'Reativar Assinatura',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _CreateSubscriptionDialog extends StatefulWidget {
  final Function(Map<String, dynamic>) onSubmit;

  const _CreateSubscriptionDialog({required this.onSubmit});

  @override
  State<_CreateSubscriptionDialog> createState() => _CreateSubscriptionDialogState();
}

class _CreateSubscriptionDialogState extends State<_CreateSubscriptionDialog> {
  SubscriptionType _selectedType = SubscriptionType.mechanic;
  String _selectedPaymentMethod = 'credit_card';
  bool _autoRenew = true;
  final bool _isLoading = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        'Nova Assinatura',
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Tipos de plano
            Text(
              'Escolha o tipo de plano:',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 12),
            ...SubscriptionType.values.map((type) {
              final isSelected = _selectedType == type;
              return GestureDetector(
                onTap: () => setState(() => _selectedType = type),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: isSelected ? Colors.purple[800] : Colors.grey[100],
                    borderRadius: BorderRadius.circular(12),
                    border: isSelected 
                      ? Border.all(color: Colors.purple[800]!)
                      : Border.all(color: Colors.grey[300]!),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            type.icon,
                            style: const TextStyle(fontSize: 32),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  type.displayName,
                                  style: GoogleFonts.poppins(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: isSelected 
                                        ? Colors.white 
                                        : Colors.grey[800],
                                  ),
                                ),
                                Text(
                                  SubscriptionService.getMonthlyFee(type).toStringAsFixed(2).replaceAll('.', ','),
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    color: isSelected 
                                        ? Colors.white 
                                        : Colors.green[700],
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      
                      const SizedBox(height: 8),
                      
                      // Benefícios
                      ...type.features.map((benefit) {
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            children: [
                              Icon(
                                Icons.check_circle,
                                size: 16,
                                color: isSelected 
                                    ? Colors.white 
                                    : Colors.green[700],
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  benefit,
                                  style: GoogleFonts.poppins(
                                    fontSize: 12,
                                    color: isSelected 
                                        ? Colors.white 
                                        : Colors.grey[600],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    ],
                  ),
                ),
              );
            }),
            
            const SizedBox(height: 24),
            
            // Método de pagamento
            Text(
              'Método de Pagamento:',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[700],
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedPaymentMethod,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
              ),
              items: SubscriptionService.getPaymentMethods().map((method) {
              return DropdownMenuItem<String>(
                value: method,
                child: Text(method.toUpperCase()),
              );
            }).toList(),
              onChanged: (value) {
                setState(() => _selectedPaymentMethod = value!);
              },
            ),
            
            const SizedBox(height: 24),
            
            // Auto-renovação
            SwitchListTile(
              title: Text(
                'Renovação Automática',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                ),
              ),
              subtitle: Text(
                'Renovar automaticamente a cada mês',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
              value: _autoRenew,
              onChanged: (value) {
                setState(() => _autoRenew = value);
              },
              activeThumbColor: Colors.purple[700],
            ),
            
            const SizedBox(height: 24),
            
            // Erro
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _error!,
                  style: GoogleFonts.poppins(
                    color: Colors.red[700],
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
            
            // Botões
            Row(
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    'Cancelar',
                    style: GoogleFonts.poppins(),
                  ),
                ),
                const SizedBox(width: 16),
                ElevatedButton(
                  onPressed: _isLoading ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.purple[800],
                    foregroundColor: Colors.white,
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          'Assinar',
                          style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    final subscriptionData = {
      'type': _selectedType,
      'paymentMethod': _selectedPaymentMethod,
      'autoRenew': _autoRenew,
    };

    widget.onSubmit(subscriptionData);
  }
}

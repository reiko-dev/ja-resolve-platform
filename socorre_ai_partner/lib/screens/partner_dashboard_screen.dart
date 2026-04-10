import 'dart:async';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/subscription_service.dart';
import '../services/tow_proposal_service.dart';
import '../services/delivery_order_service.dart';

class PartnerDashboardScreen extends StatefulWidget {
  const PartnerDashboardScreen({super.key});

  @override
  State<PartnerDashboardScreen> createState() => _PartnerDashboardScreenState();
}

class _PartnerDashboardScreenState extends State<PartnerDashboardScreen> {
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  String? _error;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _loadStats();
    _startAutoRefresh();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _startAutoRefresh() {
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      _loadStats();
    });
  }

  Future<void> _loadStats() async {
    try {
      final subscriptionStats = await SubscriptionService.getSubscriptionStats();
      final proposalStats = await TowProposalService.getPartnerStats();
      final deliveryStats = await DeliveryOrderService.getMotoboyStats();
      
      // Obter estatísticas do parceiro
      final partnerStats = {
        'total_revenue': 0.0, // TODO: Implementar no backend
        'total_orders': 0,
        'total_services': 0,
        'avg_rating': 0.0,
        'active_hours': 0,
      };
      
      setState(() {
        _stats = {
          'subscription': subscriptionStats,
          'proposals': proposalStats,
          'delivery': deliveryStats,
          'partner': partnerStats,
        };
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = 'Erro ao carregar estatísticas: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Dashboard',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: Colors.blue[800],
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(
            onPressed: _loadStats,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
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
              onPressed: _loadStats,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue[800],
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

    return RefreshIndicator(
      onRefresh: _loadStats,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Cards principais
            Row(
              children: [
                Expanded(
                  child: _StatsCard(
                    title: 'Receita Mensal',
                    value: _formatCurrency(_stats['partner']?['total_revenue'] ?? 0.0),
                    icon: Icons.trending_up,
                    color: Colors.green,
                    subtitle: 'Últimos 30 dias',
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _StatsCard(
                    title: 'Serviços Realizados',
                    value: '${_stats['partner']?['total_services'] ?? 0}',
                    icon: Icons.check_circle,
                    color: Colors.blue,
                    subtitle: 'Este mês',
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            Row(
              children: [
                Expanded(
                  child: _StatsCard(
                    title: 'Avaliação Média',
                    value: '${(_stats['partner']?['avg_rating'] ?? 0.0).toStringAsFixed(1)}',
                    icon: Icons.star,
                    color: Colors.amber,
                    subtitle: 'Todas avaliações',
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _StatsCard(
                    title: 'Horas Ativos',
                    value: '${_stats['partner']?['active_hours'] ?? 0}h',
                    icon: Icons.access_time,
                    color: Colors.purple,
                    subtitle: 'Este mês',
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 24),
            
            // Seção de assinatura
            if (_stats['subscription'] != null)
              _SubscriptionSection(_stats['subscription']),
            
            // Seção de propostas (se for guincho)
            if (_stats['proposals'] != null)
              _ProposalsSection(_stats['proposals']),
            
            // Seção de delivery (se for motoboy)
            if (_stats['delivery'] != null)
              _DeliverySection(_stats['delivery']),
          ],
        ),
      ),
    );
  }

  Widget _StatsCard({
    required String title,
    required String value,
    required IconData icon,
    required Color color,
    String? subtitle,
  }) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    icon,
                    color: color,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: Colors.grey[600],
                        ),
                      ),
                      Text(
                        value,
                        style: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: color,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 8),
              Text(
                subtitle,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Color(0xFF9E9E9E),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _SubscriptionSection(Map<String, dynamic> subscriptionStats) {
    final activeSubscriptions = subscriptionStats['active_count'] ?? 0;
    final totalRevenue = subscriptionStats['total_revenue'] ?? 0.0;
    final expiringSoon = subscriptionStats['expiring_soon_count'] ?? 0;
    final pendingPayments = subscriptionStats['pending_payment_count'] ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 24),
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
          Row(
            children: [
              Icon(
                Icons.card_membership,
                size: 24,
                color: Colors.purple[800],
              ),
              const SizedBox(width: 12),
              Text(
                'Assinatura',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[800],
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.purple[100],
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$activeSubscriptions ativas',
                  style: GoogleFonts.poppins(
                    color: Colors.purple[800],
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Métricas
          Row(
            children: [
              Expanded(
                child: _MetricItem(
                  label: 'Receita Mensal',
                  value: _formatCurrency(totalRevenue),
                  icon: Icons.attach_money,
                  color: Colors.green,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Expirando em Breve',
                  value: '$expiringSoon',
                  icon: Icons.warning,
                  color: Colors.orange,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Pagamentos Pendentes',
                  value: '$pendingPayments',
                  icon: Icons.error_outline,
                  color: Colors.red,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _ProposalsSection(Map<String, dynamic> proposalStats) {
    final totalProposals = proposalStats['total'] ?? 0;
    final acceptedProposals = proposalStats['accepted'] ?? 0;
    final rejectedProposals = proposalStats['rejected'] ?? 0;
    final pendingProposals = proposalStats['pending'] ?? 0;
    final avgResponseTime = proposalStats['avg_response_time'] ?? 0.0;
    final successRate = totalProposals > 0 ? (acceptedProposals / totalProposals * 100) : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 24),
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
          Row(
            children: [
              Icon(
                Icons.local_shipping,
                size: 24,
                color: Colors.blue[800],
              ),
              const SizedBox(width: 12),
              Text(
                'Propostas de Guincho',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[800],
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue[100],
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$totalProposals enviadas',
                  style: GoogleFonts.poppins(
                    color: Colors.blue[800],
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Métricas
          Row(
            children: [
              Expanded(
                child: _MetricItem(
                  label: 'Taxa de Aceitação',
                  value: '$successRate%',
                  icon: Icons.trending_up,
                  color: successRate >= 50 ? Colors.green : Colors.orange,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Tempo Médio',
                  value: '${avgResponseTime.toStringAsFixed(1)} min',
                  icon: Icons.access_time,
                  color: Colors.blue,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Aceitas',
                  value: '$acceptedProposals',
                  icon: Icons.check_circle,
                  color: Colors.green,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Pendentes',
                  value: '$pendingProposals',
                  icon: Icons.hourglass_empty,
                  color: Colors.grey,
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Gráfico de status
          Container(
            height: 200,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Text(
                  'Status das Propostasas',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[700],
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _StatusIndicator(
                        label: 'Aceitas',
                        value: acceptedProposals.toDouble(),
                        total: totalProposals.toDouble(),
                        color: Colors.green,
                      ),
                      _StatusIndicator(
                        label: 'Rejeitadas',
                        value: rejectedProposals.toDouble(),
                        total: totalProposals.toDouble(),
                        color: Colors.red,
                      ),
                      _StatusIndicator(
                        label: 'Pendentes',
                        value: pendingProposals.toDouble(),
                        total: totalProposals.toDouble(),
                        color: Colors.grey,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _DeliverySection(Map<String, dynamic> deliveryStats) {
    final totalOrders = deliveryStats['total'] ?? 0;
    final completedOrders = deliveryStats['completed'] ?? 0;
    final cancelledOrders = deliveryStats['cancelled'] ?? 0;
    final avgDeliveryTime = deliveryStats['avg_delivery_time'] ?? 0.0;
    final totalEarnings = deliveryStats['total_earnings'] ?? 0.0;
    final successRate = totalOrders > 0 ? (completedOrders / totalOrders * 100) : 0.0;

    return Container(
      margin: const EdgeInsets.only(bottom: 24),
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
          Row(
            children: [
              Icon(
                Icons.delivery_dining,
                size: 24,
                color: Colors.green[800],
              ),
              const SizedBox(width: 12),
              Text(
                'Pedidos de Delivery',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey[800],
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.green[100],
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$totalOrders pedidos',
                  style: GoogleFonts.poppins(
                    color: Colors.green[800],
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Métricas
          Row(
            children: [
              Expanded(
                child: _MetricItem(
                  label: 'Taxa de Sucesso',
                  value: '$successRate%',
                  icon: Icons.check_circle,
                  color: successRate >= 80 ? Colors.green : Colors.orange,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Tempo Médio',
                  value: '${avgDeliveryTime.toStringAsFixed(1)} min',
                  icon: Icons.access_time,
                  color: Colors.blue,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Ganhos Totais',
                  value: _formatCurrency(totalEarnings),
                  icon: Icons.attach_money,
                  color: Colors.green,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Concluídos',
                  value: '$completedOrders',
                  icon: Icons.check_circle,
                  color: Colors.green,
                ),
              ),
              Expanded(
                child: _MetricItem(
                  label: 'Cancelados',
                  value: '$cancelledOrders',
                  icon: Icons.cancel,
                  color: Colors.red,
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 16),
          
          // Gráfico de status
          Container(
            height: 200,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Text(
                  'Status dos Pedidos',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[700],
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _StatusIndicator(
                        label: 'Concluídos',
                        value: completedOrders.toDouble(),
                        total: totalOrders.toDouble(),
                        color: Colors.green,
                      ),
                      _StatusIndicator(
                        label: 'Cancelados',
                        value: cancelledOrders.toDouble(),
                        total: totalOrders.toDouble(),
                        color: Colors.red,
                      ),
                      _StatusIndicator(
                        label: 'Em Andamento',
                        value: (totalOrders - completedOrders - cancelledOrders).toDouble(),
                        total: totalOrders.toDouble(),
                        color: Colors.blue,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _MetricItem({
    required String label,
    required String value,
    required IconData icon,
    required Color color,
  }) {
    return Column(
      children: [
        Icon(
          icon,
          color: color,
          size: 20,
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }

  Widget _StatusIndicator({
    required String label,
    required double value,
    required double total,
    required Color color,
  }) {
    final percentage = total > 0 ? (value / total * 100) : 0.0;
    
    return Column(
      children: [
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
        SizedBox(
          height: 4,
        ),
        Container(
          height: 8,
          width: double.infinity,
          decoration: BoxDecoration(
            color: color.withOpacity(0.2),
            borderRadius: BorderRadius.circular(4),
          ),
          child: LinearProgressIndicator(
            value: percentage,
            backgroundColor: color,
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          '${percentage.toStringAsFixed(1)}%',
          style: GoogleFonts.poppins(
            fontSize: 10,
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  String _formatCurrency(double amount) {
    return 'R\$ ${amount.toStringAsFixed(2).replaceAll('.', ',')}';
  }
}

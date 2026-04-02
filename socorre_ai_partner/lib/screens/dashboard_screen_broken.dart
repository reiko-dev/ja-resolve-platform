import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/emergency_request.dart';
import '../models/profile.dart';
import '../models/product.dart';
import '../services/emergency_service.dart';
import '../services/partner_service.dart';
import '../services/payment_service.dart';
import '../services/subscription_service.dart';
import '../services/tow_proposal_service.dart';
import '../services/delivery_order_service.dart';
import '../services/product_service.dart';
import 'package:intl/intl.dart';
import 'dart:async';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  String? _error;
  Timer? _refreshTimer;
  int _selectedTabIndex = 0;

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
      // Carregar estatísticas do parceiro
      final partnerStats = await PartnerService.getStats();
      
      // Carregar estatísticas das novas funcionalidades
      final subscriptionStats = await SubscriptionService.getSubscriptionStats();
      final proposalStats = await TowProposalService.getPartnerStats();
      final deliveryStats = await DeliveryOrderService.getMotoboyStats();
      final productStats = await ProductService.getStoreStats();
      
      // Combinar todas as estatísticas
      setState(() {
        _stats = {
          'partner': partnerStats,
          'subscription': subscriptionStats,
          'proposals': proposalStats,
          'delivery': deliveryStats,
          'products': productStats,
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

  Future<void> _refreshStats() async {
    await _loadStats();
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
            onPressed: _refreshStats,
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
              onPressed: _refreshStats,
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

    return Column(
      children: [
        // Tabs para diferentes tipos de parceiros
        Container(
          color: Colors.white,
          child: TabBar(
            controller: TabController(length: 3, vsync: this),
            onTap: (index) {
              setState(() => _selectedTabIndex = index);
            },
            tabs: const [
              Tab(
                icon: Icon(Icons.dashboard),
                text: 'Visão Geral',
              ),
              Tab(
                icon: Icons.local_shipping),
                text: 'Guincho',
              ),
              Tab(
                icon: Icons.delivery_dining),
                text: 'Delivery',
              ),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: TabController(length: 3, vsync: this),
            child: [
              _buildGeneralTab(),
              _buildTowTab(),
              _buildDeliveryTab(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGeneralTab() {
    return SingleChildScrollView(
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
          if (_selectedTabIndex == 1 && _stats['proposals'] != null)
            _ProposalsSection(_stats['proposals']),
          
          // Seção de delivery (se for motoboy)
          if (_selectedTabIndex == 2 && _stats['delivery'] != null)
            _DeliverySection(_stats['delivery']),
          
          // Seção de produtos (se for lojas)
          if (_stats['products'] != null)
            _ProductsSection(_stats['products']),
        ],
      ),
    );
  }

  Widget _buildTowTab() {
    final proposalStats = _stats['proposals'] ?? {};
    final totalProposals = proposalStats['total'] ?? 0;
    final acceptedProposals = proposalStats['accepted'] ?? 0;
    final rejectedProposals = proposalStats['rejected'] ?? 0;
    final pendingProposals = proposalStats['pending'] ?? 0;
    final avgResponseTime = proposalStats['avg_response_time'] ?? 0.0;
    final successRate = totalProposals > 0 ? (acceptedProposals / totalProposals * 100) : 0.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Card de métricas
          Card(
            elevation: 4,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Métricas de Propostasas',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Métricas principais
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
                          label: 'Propostas Enviadas',
                          value: '$totalProposals',
                          icon: Icons.send,
                          color: Colors.blue,
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
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeliveryTab() {
    final deliveryStats = _stats['delivery'] ?? {};
    final totalOrders = deliveryStats['total'] ?? 0;
    final completedOrders = deliveryStats['completed'] ?? 0;
    final cancelledOrders = deliveryStats['cancelled'] ?? 0;
    final avgDeliveryTime = deliveryStats['avg_delivery_time'] ?? 0.0;
    final totalEarnings = deliveryStats['total_earnings'] ?? 0.0;
    final successRate = totalOrders > 0 ? (completedOrders / totalOrders * 100) : 0.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Card de métricas
          Card(
            elevation: 4,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Métricas de Delivery',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Métricas principais
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
          ),
        ],
      ),
    );
  }

  Widget _ProductsSection(Map<String, dynamic> productStats) {
    final totalProducts = productStats['total'] ?? 0;
    final activeProducts = productStats['active'] ?? 0;
    const lowStockProducts = productStats['low_stock'] ?? 0;
    const outOfStockProducts = productStats['out_of_stock'] ?? 0;
    const featuredProducts = productStats['featured'] ?? 0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Card de métricas
          Card(
            elevation: 4,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Catálogo de Produtos',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Métricas principais
                  Row(
                    children: [
                      Expanded(
                        child: _MetricItem(
                          label: 'Total de Produtos',
                          value: '$totalProducts',
                          icon: Icons.inventory_2,
                          color: Colors.blue,
                        ),
                      ),
                      Expanded(
                        child: _MetricItem(
                          label: 'Ativos',
                          value: '$activeProducts',
                          icon: Icons.check_circle,
                          color: Colors.green,
                        ),
                      ),
                      Expanded(
                        child: _MetricItem(
                          label: 'Em Destaque',
                          value: '$featuredProducts',
                          icon: Icons.star,
                          color: Colors.amber,
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Alertas de estoque
                  if (lowStockProducts > 0) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.orange[50],
                        borderRadius: BorderRadius.circular(8),
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
                              'Atenção: $lowStockProducts produtos com baixo estoque',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                color: Colors.orange[700],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  
                  // Lista de produtos
                  if (_products.isNotEmpty)
                    Container(
                      height: 300,
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _products.length,
                        itemBuilder: (context, index) {
                          final product = _products[index];
                          return _ProductCard(product: product);
                        },
                      ),
                    ),
                ],
            ),
          ),
        ],
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

  Widget _ProductCard({required Product product}) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: !product.isActive 
              ? Colors.red 
              : product.isFeatured 
                  ? Colors.amber 
                  : Colors.transparent,
          width: 2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header com status e ações
            Row(
              children: [
                // Status
                Row(
                  children: [
                    if (!product.isActive)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'Inativo',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    if (product.isFeatured)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.amber,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'Destaque',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
                const Spacer(),
                // Ações rápidas
                Row(
                  children: [
                    IconButton(
                      onPressed: () => _toggleActive(product),
                      icon: Icon(
                        product.isActive ? Icons.visibility : Icons.visibility_off,
                        color: product.isActive ? Colors.green : Colors.grey,
                      ),
                    ),
                    IconButton(
                      onPressed: () => _toggleFeatured(product),
                      icon: Icon(
                        product.isFeatured ? Icons.star : Icons.star_border,
                        color: product.isFeatured ? Colors.amber : Colors.grey,
                      ),
                    ),
                    PopupMenuButton(
                      icon: const Icon(Icons.more_vert),
                      itemBuilder: (context) => [
                        PopupMenuItem(
                          value: 'edit',
                          child: Row(
                            children: [
                              const Icon(Icons.edit),
                              const SizedBox(width: 8),
                              Text('Editar'),
                            ],
                          ),
                        ),
                        PopupMenuItem(
                          value: 'delete',
                          child: Row(
                            children: [
                              const Icon(Icons.delete, color: Colors.red),
                              const SizedBox(width: 8),
                              Text('Excluir'),
                            ],
                        ),
                      ],
                      onSelected: (value) {
                        if (value == 'edit') {
                          // TODO: Implementar edição de produto
                        } else if (value == 'delete') {
                          // TODO: Implementar exclusão de produto
                        }
                      },
                    ),
                  ],
                ),
              ],
            
            const SizedBox(height: 12),
            
            // Nome e categoria
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text(
                            product.category.icon,
                            style: const TextStyle(fontSize: 16),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            product.category.displayName,
                            style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                // Foto
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: Colors.grey[200],
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: product.mainPhoto.isNotEmpty
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            product.mainPhoto,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) {
                              return Icon(
                                Icons.image,
                                color: Colors.grey[400],
                              );
                            },
                          ),
                        )
                      : Icon(
                        Icons.inventory_2,
                        color: Colors.grey[400],
                      ),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            // Preço e estoque
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Preço',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      product.formattedPrice,
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.green[700],
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      'Estoque',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      '${product.stock}',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: product.isOutOfStock 
                            ? Colors.red 
                            : product.isLowStock 
                                ? Colors.orange 
                                : Colors.green[700],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            
            if (product.brand?.isNotEmpty == true) ...[
              const SizedBox(height: 8),
              Text(
                'Marca: ${product.brand!}',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
              ),
            ],
            
            if (product.description.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                product.description,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.grey[600],
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            
            const SizedBox(height: 12),
            
            // Rating
            if (product.rating != null && product.rating! > 0) ...[
              Row(
                children: [
                  Icon(
                    Icons.star,
                    size: 16,
                    color: Colors.amber,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    product.rating!.toStringAsFixed(1),
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  if (product.reviewCount != null && product.reviewCount! > 0) ...[
                    const SizedBox(width: 4),
                    Text(
                      '(${product.reviewCount})',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[500),
                      ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _toggleActive(Product product) async {
    try {
      await ProductService.toggleActive(product.id);
      _loadDashboardData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao alterar status: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _toggleFeatured(Product product) async {
    try {
      await ProductService.toggleFeatured(product.id);
      _loadDashboardData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao alterar destaque: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _deleteProduct(Product product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Excluir Produto'),
        content: Text('Tem certeza que deseja excluir "${product.name}"?'),
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
            child: const Text('Sim'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ProductService.deleteProduct(product.id);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Produto excluído com sucesso'),
          backgroundColor: Colors.green,
        ),
      );
      
      _loadDashboardData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao excluir produto: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
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

  String _formatCurrency(double amount) {
    return 'R\$ ${amount.toStringAsFixed(2).replaceAll('.', ',')}';
  }
}
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/reports.dart';
import '../services/reports_service.dart';
import '../widgets/executive_summary_card.dart';
import '../widgets/metrics_card.dart';
import '../widgets/chart_widget.dart';

class ExecutiveDashboardScreen extends StatefulWidget {
  const ExecutiveDashboardScreen({super.key});

  @override
  State<ExecutiveDashboardScreen> createState() => _ExecutiveDashboardScreenState();
}

class _ExecutiveDashboardScreenState extends State<ExecutiveDashboardScreen> {
  ExecutiveSummary? _summary;
  Map<String, dynamic>? _dashboardData;
  List<DashboardWidget> _widgets = [];
  bool _isLoading = true;
  String _error = '';
  final DateTime _selectedPeriodStart = DateTime.now().subtract(const Duration(days: 30));
  final DateTime _selectedPeriodEnd = DateTime.now();

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      
      // Carregar resumo executivo
      final summaryResult = await ReportsService.getExecutiveSummary(
        token: token,
        periodStart: _selectedPeriodStart,
        periodEnd: _selectedPeriodEnd,
      );
      if (summaryResult['success']) {
        setState(() {
          _summary = summaryResult['data'];
        });
      }

      // Carregar dados do dashboard
      final dashboardResult = await ReportsService.getDashboardData(
        token: token,
        periodStart: _selectedPeriodStart,
        periodEnd: _selectedPeriodEnd,
      );
      if (dashboardResult['success']) {
        setState(() {
          _dashboardData = dashboardResult['data'];
        });
      }

      // Carregar widgets
      final widgetsResult = await ReportsService.getDashboardWidgets(token: token);
      if (widgetsResult['success']) {
        setState(() {
          _widgets = widgetsResult['data'];
        });
      }

    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar dados: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _onRefresh() async {
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Dashboard Executivo',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.date_range),
            onPressed: _selectPeriod,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _onRefresh,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _error.isNotEmpty
              ? _buildErrorWidget()
              : RefreshIndicator(
                  onRefresh: _onRefresh,
                  color: const Color(0xFFE53E3E),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Período selecionado
                        _buildPeriodSelector(),
                        const SizedBox(height: 16),
                        
                        // Resumo executivo
                        if (_summary != null) ...[
                          ExecutiveSummaryCard(
                          title: 'Resumo Executivo',
                          subtitle: 'Visão geral do período',
                          value: 'R\$ ${(_summary?.totalRevenue ?? 0).toStringAsFixed(2)}',
                          change: '+12.5%',
                          color: const Color(0xFFE53E3E),
                          icon: Icons.attach_money,
                        ),
                          const SizedBox(height: 16),
                        ],
                        
                        // Métricas principais
                        _buildMainMetrics(),
                        const SizedBox(height: 16),
                        
                        // Gráficos
                        _buildCharts(),
                        const SizedBox(height: 16),
                        
                        // Widgets personalizados
                        _buildCustomWidgets(),
                      ],
                    ),
                  ),
                ),
    );
  }

  Widget _buildPeriodSelector() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.calendar_today,
            color: Colors.grey[400],
            size: 20,
          ),
          const SizedBox(width: 8),
          Text(
            'Período: ',
            style: GoogleFonts.poppins(
              color: Colors.white70,
              fontSize: 14,
            ),
          ),
          Text(
            '${_selectedPeriodStart.day}/${_selectedPeriodStart.month}/${_selectedPeriodStart.year} - ${_selectedPeriodEnd.day}/${_selectedPeriodEnd.month}/${_selectedPeriodEnd.year}',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          ),
          const Spacer(),
          TextButton(
            onPressed: _selectPeriod,
            child: Text(
              'Alterar',
              style: GoogleFonts.poppins(
                color: const Color(0xFFE53E3E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMainMetrics() {
    if (_dashboardData == null) return const SizedBox.shrink();

    final metrics = _dashboardData!['metrics'] as Map<String, dynamic>? ?? {};
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Métricas Principais',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.5,
          children: [
            MetricsCard(
              title: 'Receita Total',
              value: 'R\$ ${(metrics['totalRevenue'] ?? 0).toStringAsFixed(2)}',
              change: metrics['revenueChange'] ?? 0.0,
              icon: Icons.attach_money,
              color: Colors.green,
            ),
            MetricsCard(
              title: 'Pedidos',
              value: '${metrics['totalOrders'] ?? 0}',
              change: metrics['ordersChange'] ?? 0.0,
              icon: Icons.shopping_cart,
              color: Colors.blue,
            ),
            MetricsCard(
              title: 'Clientes',
              value: '${metrics['totalCustomers'] ?? 0}',
              change: metrics['customersChange'] ?? 0.0,
              icon: Icons.people,
              color: Colors.orange,
            ),
            MetricsCard(
              title: 'Avaliação',
              value: '${(metrics['averageRating'] ?? 0.0).toStringAsFixed(1)} ⭐',
              change: metrics['ratingChange'] ?? 0.0,
              icon: Icons.star,
              color: Colors.amber,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCharts() {
    if (_dashboardData == null) return const SizedBox.shrink();

    final charts = _dashboardData!['charts'] as Map<String, dynamic>? ?? {};
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Análises',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        Column(
          children: [
            ChartWidget(
              title: 'Receita por Período',
              data: charts['revenueChart'] ?? {},
              type: 'line',
            ),
            const SizedBox(height: 16),
            ChartWidget(
              title: 'Pedidos por Categoria',
              data: charts['ordersChart'] ?? {},
              type: 'pie',
            ),
            const SizedBox(height: 16),
            ChartWidget(
              title: 'Performance Mensal',
              data: charts['performanceChart'] ?? {},
              type: 'bar',
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCustomWidgets() {
    if (_widgets.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Widgets Personalizados',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: _widgets.length,
          itemBuilder: (context, index) {
            final widget = _widgets[index];
            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2A2A),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.title,
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.category,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Tipo: ${widget.type}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Erro ao carregar dashboard',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _error,
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _onRefresh,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  void _selectPeriod() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Selecionar Período',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Funcionalidade em desenvolvimento',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Fechar',
              style: GoogleFonts.poppins(
                color: const Color(0xFFE53E3E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/analytics.dart';

class AnalyticsSummaryWidget extends StatelessWidget {
  final AnalyticsSummary summary;

  const AnalyticsSummaryWidget({
    super.key,
    required this.summary,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      color: const Color(0xFF2A2A2A),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Resumo Geral',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            
            // Métricas principais
            Row(
              children: [
                Expanded(
                  child: _buildMetricCard(
                    'Receita Total',
                    summary.formattedTotalRevenue,
                    Icons.attach_money,
                    Colors.green,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildMetricCard(
                    'Pedidos',
                    summary.totalOrders.toString(),
                    Icons.shopping_cart,
                    Colors.blue,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _buildMetricCard(
                    'Ticket Médio',
                    summary.formattedAverageOrderValue,
                    Icons.receipt,
                    Colors.orange,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildMetricCard(
                    'Clientes',
                    summary.totalCustomers.toString(),
                    Icons.people,
                    Colors.purple,
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Métricas de performance
            Text(
              'Performance',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            
            Row(
              children: [
                Expanded(
                  child: _buildPerformanceCard(
                    'Taxa de Retenção',
                    summary.formattedRetentionRate,
                    Icons.trending_up,
                    Colors.green,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildPerformanceCard(
                    'Tempo de Resposta',
                    summary.formattedResponseTime,
                    Icons.timer,
                    Colors.blue,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _buildPerformanceCard(
                    'Taxa de Conclusão',
                    summary.formattedCompletionRate,
                    Icons.check_circle,
                    Colors.green,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildPerformanceCard(
                    'Avaliação Média',
                    '${summary.averageRating.toStringAsFixed(1)} ⭐',
                    Icons.star,
                    Colors.orange,
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Breakdown por serviço
            if (summary.revenueByService.isNotEmpty) ...[
              Text(
                'Receita por Serviço',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 12),
              ...summary.revenueByService.entries.map((entry) {
                final percentage = (entry.value / summary.totalRevenue) * 100;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          entry.key,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                      ),
                      Text(
                        'R\$ ${entry.value.toStringAsFixed(2).replaceAll('.', ',')}',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.white,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${percentage.toStringAsFixed(1)}%',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          color: Colors.grey[400],
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMetricCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            color: color,
            size: 20,
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 10,
              color: Colors.grey[400],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildPerformanceCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            color: color,
            size: 16,
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 9,
              color: Colors.grey[400],
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class AnalyticsChartWidget extends StatelessWidget {
  final AnalyticsChart chart;

  const AnalyticsChartWidget({
    super.key,
    required this.chart,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      color: const Color(0xFF2A2A2A),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              chart.title,
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            
            // Gráfico simples (barra)
            if (chart.type == 'bar')
              _buildBarChart()
            else if (chart.type == 'line')
              _buildLineChart()
            else if (chart.type == 'pie')
              _buildPieChart()
            else
              _buildDefaultChart(),
          ],
        ),
      ),
    );
  }

  Widget _buildBarChart() {
    final maxValue = chart.data.isNotEmpty 
        ? chart.data.map((e) => e.value).reduce((a, b) => a > b ? a : b)
        : 0.0;

    return Column(
      children: chart.data.map((point) {
        final percentage = maxValue > 0 ? (point.value / maxValue) : 0.0;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(
            children: [
              SizedBox(
                width: 80,
                child: Text(
                  point.label,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.white70,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: LinearProgressIndicator(
                  value: percentage,
                  backgroundColor: Colors.grey[800],
                  valueColor: AlwaysStoppedAnimation<Color>(
                    _getColorForLabel(point.label),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                point.value.toStringAsFixed(0),
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Colors.white,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildLineChart() {
    return Container(
      height: 200,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Text(
          'Gráfico de Linha\n(Implementação em desenvolvimento)',
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: Colors.grey[400],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildPieChart() {
    return Container(
      height: 200,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Text(
          'Gráfico de Pizza\n(Implementação em desenvolvimento)',
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: Colors.grey[400],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildDefaultChart() {
    return Container(
      height: 200,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Text(
          'Gráfico ${chart.type}\n(Implementação em desenvolvimento)',
          style: GoogleFonts.poppins(
            fontSize: 12,
            color: Colors.grey[400],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Color _getColorForLabel(String label) {
    final colors = [
      const Color(0xFFE53E3E),
      const Color(0xFF2B6CB0),
      const Color(0xFF38A169),
      const Color(0xFF805AD5),
      const Color(0xFFD69E2E),
      const Color(0xFFE53E3E),
    ];
    
    final index = label.hashCode % colors.length;
    return colors[index];
  }
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/analytics.dart';

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
            if (chart.xAxisLabel != null || chart.yAxisLabel != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  if (chart.xAxisLabel != null)
                    Text(
                      'X: ${chart.xAxisLabel}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.grey[400],
                      ),
                    ),
                  if (chart.xAxisLabel != null && chart.yAxisLabel != null)
                    const SizedBox(width: 16),
                  if (chart.yAxisLabel != null)
                    Text(
                      'Y: ${chart.yAxisLabel}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.grey[400],
                      ),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            
            // Gráfico baseado no tipo
            if (chart.type == 'bar')
              _buildBarChart()
            else if (chart.type == 'line')
              _buildLineChart()
            else if (chart.type == 'pie')
              _buildPieChart()
            else if (chart.type == 'area')
              _buildAreaChart()
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
      children: [
        // Gráfico de barras
        Container(
          height: 200,
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: chart.data.map((point) {
              final percentage = maxValue > 0 ? (point.value / maxValue) : 0.0;
              return Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Container(
                    width: 30,
                    height: 150 * percentage,
                    decoration: BoxDecoration(
                      color: _getColorForLabel(point.label),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    point.value.toStringAsFixed(0),
                    style: GoogleFonts.poppins(
                      fontSize: 10,
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  SizedBox(
                    width: 60,
                    child: Text(
                      point.label,
                      style: GoogleFonts.poppins(
                        fontSize: 8,
                        color: Colors.grey[400],
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              );
            }).toList(),
          ),
        ),
        
        // Legenda
        if (chart.data.length > 5)
          _buildLegend(),
      ],
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.show_chart,
              size: 48,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 8),
            Text(
              'Gráfico de Linha',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[400],
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              'Implementação em desenvolvimento',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey[500],
              ),
            ),
          ],
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.pie_chart,
              size: 48,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 8),
            Text(
              'Gráfico de Pizza',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[400],
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              'Implementação em desenvolvimento',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey[500],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAreaChart() {
    return Container(
      height: 200,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.area_chart,
              size: 48,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 8),
            Text(
              'Gráfico de Área',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[400],
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              'Implementação em desenvolvimento',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey[500],
              ),
            ),
          ],
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
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.bar_chart,
              size: 48,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 8),
            Text(
              'Gráfico ${chart.type}',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[400],
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              'Implementação em desenvolvimento',
              style: GoogleFonts.poppins(
                fontSize: 10,
                color: Colors.grey[500],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLegend() {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      child: Wrap(
        spacing: 16,
        runSpacing: 8,
        children: chart.data.map((point) {
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: _getColorForLabel(point.label),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 4),
              Text(
                point.label,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: Colors.grey[400],
                ),
              ),
            ],
          );
        }).toList(),
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
      const Color(0xFF4ECDC4),
      const Color(0xFFFF6B6B),
    ];
    
    final index = label.hashCode % colors.length;
    return colors[index];
  }
}

class AnalyticsKPIWidget extends StatelessWidget {
  final String title;
  final String value;
  final String? subtitle;
  final IconData icon;
  final Color color;
  final double? change;
  final String? changeLabel;

  const AnalyticsKPIWidget({
    super.key,
    required this.title,
    required this.value,
    this.subtitle,
    required this.icon,
    required this.color,
    this.change,
    this.changeLabel,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(8),
      color: const Color(0xFF2A2A2A),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  icon,
                  color: color,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                ),
                if (change != null) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: change! >= 0 ? Colors.green[800] : Colors.red[800],
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${change! >= 0 ? '+' : ''}${change!.toStringAsFixed(1)}%',
                      style: GoogleFonts.poppins(
                        fontSize: 8,
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 4),
              Text(
                subtitle!,
                style: GoogleFonts.poppins(
                  fontSize: 10,
                  color: Colors.grey[500],
                ),
              ),
            ],
            if (changeLabel != null) ...[
              const SizedBox(height: 4),
              Text(
                changeLabel!,
                style: GoogleFonts.poppins(
                  fontSize: 9,
                  color: change! >= 0 ? Colors.green[400] : Colors.red[400],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

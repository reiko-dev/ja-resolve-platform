import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/payment.dart';

class PaymentSummaryWidget extends StatelessWidget {
  final PaymentSummary summary;

  const PaymentSummaryWidget({
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
              'Resumo de Pagamentos',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            
            // Valores principais
            Row(
              children: [
                Expanded(
                  child: _buildSummaryCard(
                    'Total',
                    summary.formattedTotalAmount,
                    Icons.attach_money,
                    Colors.blue,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildSummaryCard(
                    'Líquido',
                    summary.formattedNetAmount,
                    Icons.account_balance_wallet,
                    Colors.green,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _buildSummaryCard(
                    'Taxas',
                    summary.formattedTotalFees,
                    Icons.receipt,
                    Colors.orange,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildSummaryCard(
                    'Taxa de Sucesso',
                    '${summary.successRate.toStringAsFixed(1)}%',
                    Icons.trending_up,
                    Colors.purple,
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Estatísticas
            Row(
              children: [
                Expanded(
                  child: _buildStatItem(
                    'Total',
                    summary.totalPayments.toString(),
                    Colors.blue,
                  ),
                ),
                Expanded(
                  child: _buildStatItem(
                    'Concluídos',
                    summary.completedPayments.toString(),
                    Colors.green,
                  ),
                ),
                Expanded(
                  child: _buildStatItem(
                    'Pendentes',
                    summary.pendingPayments.toString(),
                    Colors.orange,
                  ),
                ),
                Expanded(
                  child: _buildStatItem(
                    'Falharam',
                    summary.failedPayments.toString(),
                    Colors.red,
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Breakdown por método
            if (summary.methodBreakdown.isNotEmpty) ...[
              Text(
                'Por Método de Pagamento',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              ...summary.methodBreakdown.entries.map((entry) {
                final percentage = (entry.value / summary.totalAmount) * 100;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Text(
                        entry.key.icon,
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          entry.key.displayText,
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
            
            const SizedBox(height: 16),
            
            // Breakdown por status
            if (summary.statusBreakdown.isNotEmpty) ...[
              Text(
                'Por Status',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              ...summary.statusBreakdown.entries.map((entry) {
                final percentage = (entry.value / summary.totalPayments) * 100;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Text(
                        _getStatusIcon(entry.key),
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          entry.key.displayText,
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white70,
                          ),
                        ),
                      ),
                      Text(
                        entry.value.toString(),
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

  Widget _buildSummaryCard(String title, String value, IconData icon, Color color) {
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
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 10,
            color: Colors.grey[400],
          ),
        ),
      ],
    );
  }

  String _getStatusIcon(PaymentStatus status) {
    switch (status) {
      case PaymentStatus.pending:
        return '⏳';
      case PaymentStatus.processing:
        return '🔄';
      case PaymentStatus.completed:
        return '✅';
      case PaymentStatus.failed:
        return '❌';
      case PaymentStatus.cancelled:
        return '🚫';
      case PaymentStatus.refunded:
        return '↩️';
    }
  }
}

class PaymentChartWidget extends StatelessWidget {
  final PaymentSummary summary;

  const PaymentChartWidget({
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
              'Distribuição de Pagamentos',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            
            // Gráfico de pizza simples
            if (summary.methodBreakdown.isNotEmpty)
              ...summary.methodBreakdown.entries.map((entry) {
                final percentage = (entry.value / summary.totalAmount) * 100;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Text(
                        entry.key.icon,
                        style: const TextStyle(fontSize: 12),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: LinearProgressIndicator(
                          value: percentage / 100,
                          backgroundColor: Colors.grey[800],
                          valueColor: AlwaysStoppedAnimation<Color>(
                            _getMethodColor(entry.key),
                          ),
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
        ),
      ),
    );
  }

  Color _getMethodColor(PaymentMethod method) {
    switch (method) {
      case PaymentMethod.creditCard:
        return Colors.blue;
      case PaymentMethod.debitCard:
        return Colors.green;
      case PaymentMethod.pix:
        return Colors.purple;
      case PaymentMethod.boleto:
        return Colors.orange;
      case PaymentMethod.cash:
        return Colors.green;
      case PaymentMethod.bankTransfer:
        return Colors.blue;
    }
  }
}

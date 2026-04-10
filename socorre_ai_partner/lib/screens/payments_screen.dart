import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/payment.dart';
import '../services/payment_service.dart';
import '../widgets/payment_card.dart';
import '../widgets/payment_summary.dart' as summary;

class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  List<Payment> _payments = [];
  PaymentSummary? _summary;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  int _currentPage = 1;
  int _totalPages = 1;
  String _error = '';
  String _filterStatus = 'all';
  String _filterMethod = 'all';
  DateTime? _startDate;
  DateTime? _endDate;

  @override
  void initState() {
    super.initState();
    _loadPayments();
    _loadSummary();
  }

  Future<void> _loadPayments() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      final result = await PaymentService.getPayments(
        token: token,
        page: _currentPage,
        limit: 20,
        status: _filterStatus != 'all' ? PaymentStatus.fromString(_filterStatus) : null,
        method: _filterMethod != 'all' ? PaymentMethod.fromString(_filterMethod) : null,
        startDate: _startDate,
        endDate: _endDate,
      );

      if (result['success']) {
        setState(() {
          _payments = result['data'];
          _totalPages = result['pagination']['totalPages'] ?? 1;
        });
      } else {
        setState(() {
          _error = result['message'];
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar pagamentos: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _loadSummary() async {
    try {
      final token = 'fake_token';
      final result = await PaymentService.getPaymentSummary(
        token: token,
        startDate: _startDate,
        endDate: _endDate,
      );

      if (result['success']) {
        setState(() {
          _summary = result['data'];
        });
      }
    } catch (e) {
      print('Erro ao carregar resumo: $e');
    }
  }

  Future<void> _loadMorePayments() async {
    if (_currentPage >= _totalPages || _isLoadingMore) return;

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final token = 'fake_token';
      final result = await PaymentService.getPayments(
        token: token,
        page: _currentPage + 1,
        limit: 20,
        status: _filterStatus != 'all' ? PaymentStatus.fromString(_filterStatus) : null,
        method: _filterMethod != 'all' ? PaymentMethod.fromString(_filterMethod) : null,
        startDate: _startDate,
        endDate: _endDate,
      );

      if (result['success']) {
        setState(() {
          _payments.addAll(result['data']);
          _currentPage++;
        });
      }
    } catch (e) {
      print('Erro ao carregar mais pagamentos: $e');
    } finally {
      setState(() {
        _isLoadingMore = false;
      });
    }
  }

  void _onFilterChanged() {
    _currentPage = 1;
    _loadPayments();
    _loadSummary();
  }

  Future<void> _onRefresh() async {
    _currentPage = 1;
    _loadPayments();
    _loadSummary();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Pagamentos',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: _showFilterDialog,
          ),
          IconButton(
            icon: const Icon(Icons.download),
            onPressed: _generateReport,
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
                  child: CustomScrollView(
                    slivers: [
                      // Resumo
                      if (_summary != null)
                        SliverToBoxAdapter(
                          child: summary.PaymentSummaryWidget(summary: _summary!),
                        ),
                      
                      // Lista de pagamentos
                      SliverList(
                        delegate: SliverChildBuilderDelegate(
                          (context, index) {
                            if (index < _payments.length) {
                              return PaymentCard(
                                payment: _payments[index],
                                onTap: () => _showPaymentDetails(_payments[index]),
                                onCancel: () => _cancelPayment(_payments[index]),
                                onRefund: () => _refundPayment(_payments[index]),
                              );
                            } else if (_isLoadingMore) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16),
                                  child: CircularProgressIndicator(),
                                ),
                              );
                            } else if (_currentPage < _totalPages) {
                              return Center(
                                child: Padding(
                                  padding: const EdgeInsets.all(16),
                                  child: ElevatedButton(
                                    onPressed: _loadMorePayments,
                                    child: const Text('Carregar mais'),
                                  ),
                                ),
                              );
                            }
                            return null;
                          },
                          childCount: _payments.length + (_isLoadingMore ? 1 : 0) + (_currentPage < _totalPages ? 1 : 0),
                        ),
                      ),
                    ],
                  ),
                ),
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
            'Erro ao carregar pagamentos',
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

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Filtrar Pagamentos',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Filtro por status
            DropdownButtonFormField<String>(
              initialValue: _filterStatus,
              decoration: InputDecoration(
                labelText: 'Status',
                labelStyle: GoogleFonts.poppins(color: Colors.white70),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.white30),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFE53E3E)),
                ),
              ),
              dropdownColor: const Color(0xFF2A2A2A),
              items: const [
                DropdownMenuItem(value: 'all', child: Text('Todos')),
                DropdownMenuItem(value: 'pending', child: Text('Pendente')),
                DropdownMenuItem(value: 'processing', child: Text('Processando')),
                DropdownMenuItem(value: 'completed', child: Text('Concluído')),
                DropdownMenuItem(value: 'failed', child: Text('Falhou')),
                DropdownMenuItem(value: 'cancelled', child: Text('Cancelado')),
                DropdownMenuItem(value: 'refunded', child: Text('Reembolsado')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    _filterStatus = value;
                  });
                }
              },
            ),
            const SizedBox(height: 16),
            
            // Filtro por método
            DropdownButtonFormField<String>(
              initialValue: _filterMethod,
              decoration: InputDecoration(
                labelText: 'Método',
                labelStyle: GoogleFonts.poppins(color: Colors.white70),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Colors.white30),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFFE53E3E)),
                ),
              ),
              dropdownColor: const Color(0xFF2A2A2A),
              items: const [
                DropdownMenuItem(value: 'all', child: Text('Todos')),
                DropdownMenuItem(value: 'credit_card', child: Text('Cartão de Crédito')),
                DropdownMenuItem(value: 'debit_card', child: Text('Cartão de Débito')),
                DropdownMenuItem(value: 'pix', child: Text('PIX')),
                DropdownMenuItem(value: 'boleto', child: Text('Boleto')),
                DropdownMenuItem(value: 'cash', child: Text('Dinheiro')),
                DropdownMenuItem(value: 'bank_transfer', child: Text('Transferência')),
              ],
              onChanged: (value) {
                if (value != null) {
                  setState(() {
                    _filterMethod = value;
                  });
                }
              },
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _onFilterChanged();
            },
            child: Text(
              'Aplicar',
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

  void _showPaymentDetails(Payment payment) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Detalhes do Pagamento',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'ID: ${payment.id}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            Text(
              'Valor: ${payment.formattedAmount}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            Text(
              'Método: ${payment.method.displayText}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            Text(
              'Status: ${payment.status.displayText}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            Text(
              'Data: ${payment.createdAt.day}/${payment.createdAt.month}/${payment.createdAt.year}',
              style: GoogleFonts.poppins(color: Colors.white70),
            ),
            if (payment.description != null)
              Text(
                'Descrição: ${payment.description}',
                style: GoogleFonts.poppins(color: Colors.white70),
              ),
          ],
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

  void _cancelPayment(Payment payment) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Cancelar Pagamento',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Tem certeza que deseja cancelar este pagamento?',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              // Implementar cancelamento
            },
            child: Text(
              'Confirmar',
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

  void _refundPayment(Payment payment) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Reembolsar Pagamento',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Tem certeza que deseja reembolsar este pagamento?',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              // Implementar reembolso
            },
            child: Text(
              'Confirmar',
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

  void _generateReport() {
    // Implementar geração de relatório
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Geração de relatório em desenvolvimento')),
    );
  }
}

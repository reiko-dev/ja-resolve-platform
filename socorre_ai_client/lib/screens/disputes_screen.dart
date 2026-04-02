import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/dispute_service.dart';
import '../services/payment_service.dart';

class DisputesScreen extends StatefulWidget {
  const DisputesScreen({super.key});

  @override
  State<DisputesScreen> createState() => _DisputesScreenState();
}

class _DisputesScreenState extends State<DisputesScreen> {
  List<Map<String, dynamic>> _disputes = [];
  List<Map<String, dynamic>> _payments = [];
  bool _isLoading = true;
  String _error = '';

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
      final disputesResult = await DisputeService.list();
      final payments = await PaymentService.getUserPayments();
      
      setState(() {
        _disputes = disputesResult['data']?['disputes'] ?? disputesResult['data'] ?? [];
        _payments = payments;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar disputas: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _createDispute() async {
    if (_payments.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Nenhum pagamento disponível para disputa')),
      );
      return;
    }

    final paymentController = TextEditingController();
    final typeController = TextEditingController();
    final reasonController = TextEditingController();
    final descriptionController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Nova Disputa', style: GoogleFonts.poppins()),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int?>(
                decoration: InputDecoration(labelText: 'Pagamento'),
                items: _payments.map<DropdownMenuItem<int?>>((payment) {
                  final id = payment['id'];
                  return DropdownMenuItem<int?>(
                    value: id is int ? id : (id is String ? int.tryParse(id) : null),
                    child: Text('Pagamento #${payment['id']} - ${_formatCurrency((payment['amount'] ?? 0).toDouble())}'),
                  );
                }).toList(),
                onChanged: (value) {
                  if (value != null) {
                    paymentController.text = value.toString();
                  }
                },
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                decoration: InputDecoration(labelText: 'Tipo'),
                items: [
                  DropdownMenuItem(value: 'refund_request', child: Text('Solicitação de Reembolso')),
                  DropdownMenuItem(value: 'quality_issue', child: Text('Problema de Qualidade')),
                  DropdownMenuItem(value: 'service_not_delivered', child: Text('Serviço Não Entregue')),
                  DropdownMenuItem(value: 'fraud', child: Text('Fraude')),
                  DropdownMenuItem(value: 'other', child: Text('Outro')),
                ],
                onChanged: (value) {
                  if (value != null) {
                    typeController.text = value;
                  }
                },
              ),
              const SizedBox(height: 16),
              TextField(
                controller: reasonController,
                decoration: InputDecoration(labelText: 'Motivo *'),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: descriptionController,
                decoration: InputDecoration(labelText: 'Descrição'),
                maxLines: 3,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text('Criar Disputa'),
          ),
        ],
      ),
    );

    if (result == true && paymentController.text.isNotEmpty && reasonController.text.isNotEmpty) {
      try {
        await DisputeService.create(
          paymentId: int.parse(paymentController.text),
          type: typeController.text.isNotEmpty ? typeController.text : 'other',
          reason: reasonController.text,
          description: descriptionController.text.isNotEmpty ? descriptionController.text : null,
        );
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Disputa criada com sucesso')),
          );
          _loadData();
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Erro ao criar disputa: $e')),
          );
        }
      }
    }
  }

  String _formatCurrency(double amount) {
    return 'R\$ ${amount.toStringAsFixed(2).replaceAll('.', ',')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFC),
      appBar: AppBar(
        title: Text(
          'Disputas',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        backgroundColor: const Color(0xFF2B6CB0),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: Icon(Icons.add),
            onPressed: _createDispute,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error.isNotEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 64, color: Colors.grey),
                      SizedBox(height: 16),
                      Text(_error, style: GoogleFonts.poppins()),
                      SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadData,
                        child: Text('Tentar Novamente'),
                      ),
                    ],
                  ),
                )
              : _disputes.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.warning_amber, size: 64, color: Colors.grey[300]),
                          const SizedBox(height: 16),
                          Text(
                            'Nenhuma disputa encontrada',
                            style: GoogleFonts.poppins(color: Colors.grey[600]),
                          ),
                          const SizedBox(height: 24),
                          ElevatedButton(
                            onPressed: _createDispute,
                            child: Text('Criar Nova Disputa'),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _disputes.length,
                        itemBuilder: (context, index) {
                          final dispute = _disputes[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: _getStatusColor(dispute['status'] ?? '').withValues(alpha: 0.1),
                                child: Icon(
                                  Icons.warning,
                                  color: _getStatusColor(dispute['status'] ?? ''),
                                ),
                              ),
                              title: Text(
                                _getTypeLabel(dispute['type'] ?? ''),
                                style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const SizedBox(height: 4),
                                  Text(
                                    dispute['reason'] ?? '',
                                    style: GoogleFonts.poppins(fontSize: 12),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _formatDate(dispute['created_at'] ?? ''),
                                    style: GoogleFonts.poppins(fontSize: 10, color: Colors.grey[600]),
                                  ),
                                ],
                              ),
                              trailing: Chip(
                                label: Text(
                                  _getStatusLabel(dispute['status'] ?? ''),
                                  style: TextStyle(fontSize: 10),
                                ),
                                backgroundColor: _getStatusColor(dispute['status'] ?? '').withValues(alpha: 0.1),
                                labelStyle: TextStyle(
                                  color: _getStatusColor(dispute['status'] ?? ''),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
    );
  }

  String _getTypeLabel(String type) {
    switch (type) {
      case 'refund_request':
        return 'Solicitação de Reembolso';
      case 'quality_issue':
        return 'Problema de Qualidade';
      case 'service_not_delivered':
        return 'Serviço Não Entregue';
      case 'fraud':
        return 'Fraude';
      case 'other':
        return 'Outro';
      default:
        return type;
    }
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'under_review':
        return 'Em Análise';
      case 'resolved':
        return 'Resolvida';
      case 'closed':
        return 'Fechada';
      default:
        return status;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending':
        return Colors.orange;
      case 'under_review':
        return Colors.blue;
      case 'resolved':
        return Colors.green;
      case 'closed':
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _formatDate(String dateString) {
    if (dateString.isEmpty) return '';
    try {
      final date = DateTime.parse(dateString);
      return '${date.day}/${date.month}/${date.year}';
    } catch (e) {
      return dateString;
    }
  }
}


import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/tow_proposal.dart';
import '../services/tow_proposal_service.dart';
import 'package:intl/intl.dart';
import 'dart:async';

class TowProposalsScreen extends StatefulWidget {
  const TowProposalsScreen({super.key});

  @override
  State<TowProposalsScreen> createState() => _TowProposalsScreenState();
}

class _TowProposalsScreenState extends State<TowProposalsScreen> with TickerProviderStateMixin {
  List<TowProposal> _proposals = [];
  List<Map<String, dynamic>> _availableEmergencies = [];
  bool _isLoading = true;
  bool _isLoadingEmergencies = false;
  String? _error;
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
    _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      _loadData();
    });
  }

  Future<void> _loadData() async {
    await Future.wait([
      _loadProposals(),
      _loadAvailableEmergencies(),
    ]);
  }

  Future<void> _loadProposals() async {
    try {
      final proposals = await TowProposalService.getPartnerProposals();
      setState(() {
        _proposals = proposals;
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
        _error = 'Erro ao carregar propostas: $e';
      });
    }
  }

  Future<void> _loadAvailableEmergencies() async {
    try {
      setState(() => _isLoadingEmergencies = true);
      
      // TODO: Obter localização real do parceiro
      final emergencies = await TowProposalService.getAvailableEmergencies(
        latitude: -23.5505, // São Paulo (placeholder)
        longitude: -46.6333,
        radius: 15,
      );
      
      setState(() {
        _availableEmergencies = emergencies;
        _isLoadingEmergencies = false;
      });
    } catch (e) {
      setState(() {
        _isLoadingEmergencies = false;
      });
    }
  }

  Future<void> _createProposal(Map<String, dynamic> emergency) async {
    // TODO: Mostrar diálogo para criar proposta
    showDialog(
      context: context,
      builder: (context) => _CreateProposalDialog(
        emergency: emergency,
        onSubmit: (price, time, notes) => _submitProposal(emergency, price, time, notes),
      ),
    );
  }

  Future<void> _submitProposal(
    Map<String, dynamic> emergency,
    double price,
    int time,
    String notes,
  ) async {
    try {
      await TowProposalService.createProposal(
        emergencyRequestId: emergency['id'],
        proposedPrice: price,
        estimatedTimeMinutes: time,
        notes: notes.isEmpty ? null : notes,
      );

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Proposta enviada com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );

      Navigator.of(context).pop();
      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao enviar proposta: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _withdrawProposal(TowProposal proposal) async {
    try {
      await TowProposalService.withdrawProposal(proposal.id);
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Proposta retirada com sucesso'),
          backgroundColor: Colors.orange,
        ),
      );
      
      _loadProposals();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao retirar proposta: $e'),
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
          'Propostas de Guincho',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.w600,
          ),
        ),
        backgroundColor: Colors.blue[800],
        foregroundColor: Colors.white,
        elevation: 0,
        bottom: TabBar(
          controller: TabController(length: 2, vsync: this),
          onTap: (index) {
            // Tab index: $index
          },
          tabs: const [
            Tab(
              icon: Icon(Icons.list),
              text: 'Minhas Propostas',
            ),
            Tab(
              icon: Icon(Icons.search),
              text: 'Emergências',
            ),
          ],
        ),
      ),
      body: TabBarView(
        controller: TabController(length: 2, vsync: this),
        children: [
          _buildProposalsTab(),
          _buildEmergenciesTab(),
        ],
      ),
    );
  }

  Widget _buildProposalsTab() {
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
              onPressed: _loadProposals,
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

    if (_proposals.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.hourglass_empty,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              'Nenhuma proposta enviada',
              style: GoogleFonts.poppins(
                fontSize: 18,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Veja as emergências disponíveis para enviar propostas',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[500],
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () {
                // Switch to search tab
              },
              icon: const Icon(Icons.search),
              label: Text(
                'Buscar Emergências',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w500,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.blue[800],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadProposals,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _proposals.length,
        itemBuilder: (context, index) {
          final proposal = _proposals[index];
          return _ProposalCard(proposal: proposal);
        },
      ),
    );
  }

  Widget _buildEmergenciesTab() {
    if (_isLoadingEmergencies) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_availableEmergencies.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.search_off,
              size: 64,
              color: Colors.grey[400],
            ),
            const SizedBox(height: 16),
            Text(
              'Nenhuma emergência disponível',
              style: GoogleFonts.poppins(
                fontSize: 18,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Novas emergências aparecerão aqui',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[500],
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadAvailableEmergencies,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _availableEmergencies.length,
        itemBuilder: (context, index) {
          final emergency = _availableEmergencies[index];
          return _EmergencyCard(emergency: emergency);
        },
      ),
    );
  }

  Widget _ProposalCard({required TowProposal proposal}) {
    final isExpired = proposal.isExpired;
    final isActive = proposal.isActive;
    final isCompleted = proposal.isCompleted;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isExpired 
            ? Colors.red 
            : isActive 
              ? Colors.green 
              : isCompleted 
                  ? Colors.blue 
                  : Colors.grey,
          width: 2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header com status
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: isExpired 
                      ? Colors.red 
                      : isActive 
                        ? Colors.green 
                        : isCompleted 
                            ? Colors.blue 
                            : Colors.grey,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    proposal.status.displayName,
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  'ID: ${proposal.id.substring(0, 8)}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            // Informações da emergência
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Emergência: ${proposal.emergencyRequestId}',
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  if (proposal.distanceKm != null)
                    Text(
                      'Distância: ${proposal.distanceKm!.toStringAsFixed(1)} km',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                ],
              ),
            ),
            
            const SizedBox(height: 12),
            
            // Preço e tempo
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Preço Proposto',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      'R\$ ${proposal.proposedPrice.toStringAsFixed(2).replaceAll('.', ',')}',
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
                      'Tempo Estimado',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    Text(
                      '${proposal.estimatedTimeMinutes} min',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.blue[700],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            
            if (proposal.notes?.isNotEmpty == true) ...[
              const SizedBox(height: 12),
              Text(
                'Observações: ${proposal.notes}',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey[700],
                ),
              ),
            ],
            
            const SizedBox(height: 12),
            
            // Data e visualizações
            Row(
              children: [
                Icon(
                  Icons.access_time,
                  size: 16,
                  color: Colors.grey[600],
                ),
                const SizedBox(width: 4),
                Text(
                  'Enviada em ${DateFormat('dd/MM HH:mm').format(proposal.createdAt)}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
                if (proposal.viewsCount != null) ...[
                  const Spacer(),
                  Icon(
                    Icons.visibility,
                    size: 16,
                    color: Colors.grey[600],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${proposal.viewsCount} visualizações',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Botões de ação
            if (isActive)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => _withdrawProposal(proposal),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: Colors.orange),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: Text(
                    'Retirar Proposta',
                    style: GoogleFonts.poppins(
                      color: Colors.orange,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              )
            else if (isCompleted)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  proposal.status.description,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: Colors.blue[700],
                    fontWeight: FontWeight.w500,
                  ),
                ),
              )
            else if (isExpired)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  'Proposta expirou',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.poppins(
                    color: Colors.red[700],
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _EmergencyCard({required Map<String, dynamic> emergency}) {
    final distance = emergency['distance_km']?.toDouble() ?? 0.0;
    final urgency = emergency['urgency'] ?? 'medium';
    final description = emergency['description'] ?? '';
    final createdAt = DateTime.parse(emergency['created_at']);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: _getUrgencyColor(urgency),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    urgency.toUpperCase(),
                    style: GoogleFonts.poppins(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Spacer(),
                Text(
                  'ID: ${emergency['id'].toString().substring(0, 8)}',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            // Descrição
            Text(
              description,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.grey[700],
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            
            const SizedBox(height: 12),
            
            // Informações
            Row(
              children: [
                Icon(
                  Icons.location_on,
                  size: 16,
                  color: Colors.grey[600],
                ),
                const SizedBox(width: 4),
                Text(
                  '${distance.toStringAsFixed(1)} km',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                const Spacer(),
                Icon(
                  Icons.access_time,
                  size: 16,
                  color: Colors.grey[600],
                ),
                const SizedBox(width: 4),
                Text(
                  DateFormat('dd/MM HH:mm').format(createdAt),
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Botão de ação
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => _createProposal(emergency),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue[800],
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                ),
                child: Text(
                  'Enviar Proposta',
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

  Color _getUrgencyColor(String urgency) {
    switch (urgency.toLowerCase()) {
      case 'low':
        return Colors.green;
      case 'medium':
        return Colors.orange;
      case 'high':
        return Colors.red;
      case 'critical':
        return Colors.purple;
      default:
        return Colors.grey;
    }
  }
}

class _CreateProposalDialog extends StatefulWidget {
  final Map<String, dynamic> emergency;
  final Function(double, int, String) onSubmit;

  const _CreateProposalDialog({
    required this.emergency,
    required this.onSubmit,
  });

  @override
  State<_CreateProposalDialog> createState() => _CreateProposalDialogState();
}

class _CreateProposalDialogState extends State<_CreateProposalDialog> {
  final _priceController = TextEditingController();
  final _timeController = TextEditingController();
  final _notesController = TextEditingController();
  
  final bool _isLoading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    
    // Calcular valores sugeridos
    final distance = widget.emergency['distance_km']?.toDouble() ?? 5.0;
    final suggestedPrice = TowProposalService.calculateSuggestedPrice(distance);
    final suggestedTime = TowProposalService.calculateEstimatedTime(distance);
    
    _priceController.text = suggestedPrice.toStringAsFixed(2);
    _timeController.text = suggestedTime.toString();
  }

  void _submit() {
    final price = double.tryParse(_priceController.text);
    final time = int.tryParse(_timeController.text);
    
    // Validar
    final validationError = TowProposalService.validateProposal(
      proposedPrice: price ?? 0,
      estimatedTimeMinutes: time ?? 0,
    );
    
    if (validationError != null) {
      setState(() => _error = validationError);
      return;
    }
    
    widget.onSubmit(price!, time!, _notesController.text.trim());
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        'Enviar Proposta',
        style: GoogleFonts.poppins(
          fontWeight: FontWeight.w600,
        ),
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Informações da emergência
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                  'Emergência: ${widget.emergency['id'].toString().substring(0, 8)}',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                  const SizedBox(height: 4),
                  Text(
                    widget.emergency['description'] ?? '',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Campo de preço
            TextField(
              controller: _priceController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Preço (R\$)',
                prefixText: 'R\$ ',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Campo de tempo
            TextField(
              controller: _timeController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Tempo estimado (minutos)',
                suffixText: 'min',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Campo de observações
            TextField(
              controller: _notesController,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Observações (opcional)',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
            
            if (_error != null) ...[
              const SizedBox(height: 8),
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
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            'Cancelar',
            style: GoogleFonts.poppins(),
          ),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue[800],
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
                  'Enviar',
                  style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w500,
                  ),
                ),
        ),
      ],
    );
  }
}

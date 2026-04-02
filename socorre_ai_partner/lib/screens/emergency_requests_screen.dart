import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/emergency_request.dart';
import '../services/emergency_service.dart';

class EmergencyRequestsScreen extends StatefulWidget {
  const EmergencyRequestsScreen({super.key});

  @override
  State<EmergencyRequestsScreen> createState() => _EmergencyRequestsScreenState();
}

class _EmergencyRequestsScreenState extends State<EmergencyRequestsScreen> {
  List<EmergencyRequest> _emergencyRequests = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadEmergencyRequests();
  }

  Future<void> _loadEmergencyRequests() async {
    try {
      final requests = await EmergencyService.getNearbyRequests();
      setState(() {
        _emergencyRequests = requests;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao carregar emergências: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _acceptEmergency(EmergencyRequest request) async {
    try {
      final success = await EmergencyService.acceptEmergency(request.id);
      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Emergência aceita com sucesso!'),
            backgroundColor: Colors.green,
          ),
        );
        _loadEmergencyRequests();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao aceitar emergência: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        title: Text(
          'Emergências Disponíveis',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadEmergencyRequests,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _emergencyRequests.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _emergencyRequests.length,
                  itemBuilder: (context, index) {
                    final request = _emergencyRequests[index];
                    return _buildEmergencyCard(request);
                  },
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.emergency_outlined,
            size: 80,
            color: Colors.white30,
          ),
          const SizedBox(height: 20),
          Text(
            'Nenhuma emergência disponível',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.white70,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Aguarde novas solicitações de socorro',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.white54,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _loadEmergencyRequests,
            child: Text(
              'Atualizar',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmergencyCard(EmergencyRequest request) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: _getUrgencyColor(request.urgency),
          width: 2,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: _getUrgencyColor(request.urgency).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(
                  _getEmergencyIcon(request.type),
                  color: _getUrgencyColor(request.urgency),
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _getEmergencyTypeName(request.type),
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      _getUrgencyName(request.urgency),
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        color: _getUrgencyColor(request.urgency),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _getUrgencyColor(request.urgency),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '${request.distance?.toStringAsFixed(1) ?? 'N/A'} km',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          
          // Informações do Veículo
          if (request.vehicleInfo != null) ...[
            _buildInfoRow('Veículo', '${request.vehicleInfo!['brand']} ${request.vehicleInfo!['model']}'),
            _buildInfoRow('Ano', request.vehicleInfo!['year'].toString()),
            _buildInfoRow('Placa', request.vehicleInfo!['plate']),
          ],
          
          // Descrição
          if (request.description != null && request.description!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Descrição:',
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white70,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              request.description!,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.white,
              ),
            ),
          ],
          
          const SizedBox(height: 16),
          
          // Botões de Ação
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _showEmergencyDetails(request),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white30),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: Text(
                    'Ver Detalhes',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () => _acceptEmergency(request),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE53E3E),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: Text(
                    'Aceitar',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Text(
            '$label: ',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.white70,
            ),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
        ],
      ),
    );
  }

  void _showEmergencyDetails(EmergencyRequest request) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Detalhes da Emergência',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _buildDetailRow('Tipo', _getEmergencyTypeName(request.type)),
              _buildDetailRow('Urgência', _getUrgencyName(request.urgency)),
              _buildDetailRow('Distância', '${request.distance?.toStringAsFixed(1) ?? 'N/A'} km'),
              if (request.vehicleInfo != null) ...[
                _buildDetailRow('Marca', request.vehicleInfo!['brand']),
                _buildDetailRow('Modelo', request.vehicleInfo!['model']),
                _buildDetailRow('Ano', request.vehicleInfo!['year'].toString()),
                _buildDetailRow('Placa', request.vehicleInfo!['plate']),
              ],
              if (request.description != null && request.description!.isNotEmpty)
                _buildDetailRow('Descrição', request.description!),
            ],
          ),
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
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _acceptEmergency(request);
            },
            child: Text(
              'Aceitar',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              '$label:',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.white70,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Color _getUrgencyColor(EmergencyUrgency urgency) {
    switch (urgency) {
      case EmergencyUrgency.low:
        return Colors.green;
      case EmergencyUrgency.medium:
        return Colors.orange;
      case EmergencyUrgency.high:
        return Colors.red;
      case EmergencyUrgency.critical:
        return Colors.purple;
    }
  }

  String _getUrgencyName(EmergencyUrgency urgency) {
    switch (urgency) {
      case EmergencyUrgency.low:
        return 'Baixa';
      case EmergencyUrgency.medium:
        return 'Média';
      case EmergencyUrgency.high:
        return 'Alta';
      case EmergencyUrgency.critical:
        return 'Crítica';
    }
  }

  IconData _getEmergencyIcon(EmergencyType type) {
    switch (type) {
      case EmergencyType.mechanical:
        return Icons.build;
      case EmergencyType.fuel:
        return Icons.local_gas_station;
      case EmergencyType.tire:
        return Icons.tire_repair;
      case EmergencyType.battery:
        return Icons.battery_alert;
      case EmergencyType.towing:
        return Icons.local_shipping;
      case EmergencyType.other:
        return Icons.help;
    }
  }

  String _getEmergencyTypeName(EmergencyType type) {
    switch (type) {
      case EmergencyType.mechanical:
        return 'Problema Mecânico';
      case EmergencyType.fuel:
        return 'Sem Combustível';
      case EmergencyType.tire:
        return 'Pneu Furado';
      case EmergencyType.battery:
        return 'Bateria Descarga';
      case EmergencyType.towing:
        return 'Reboque';
      case EmergencyType.other:
        return 'Outro';
    }
  }
}

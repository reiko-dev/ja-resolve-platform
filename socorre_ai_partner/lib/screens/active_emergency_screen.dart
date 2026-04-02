import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/emergency_request.dart';

class ActiveEmergencyScreen extends StatefulWidget {
  const ActiveEmergencyScreen({super.key});

  @override
  State<ActiveEmergencyScreen> createState() => _ActiveEmergencyScreenState();
}

class _ActiveEmergencyScreenState extends State<ActiveEmergencyScreen> {
  EmergencyRequest? _activeEmergency;
  bool _isLoading = true;
  String _status = 'A caminho';
  double _progress = 0.3;

  @override
  void initState() {
    super.initState();
    _loadActiveEmergency();
  }

  Future<void> _loadActiveEmergency() async {
    // Simular carregamento de emergência ativa
    await Future.delayed(const Duration(seconds: 1));
    
    // Mock de emergência ativa
    setState(() {
      _activeEmergency = EmergencyRequest(
        id: '1',
        userId: 'user1',
        type: EmergencyType.mechanical,
        urgency: EmergencyUrgency.high,
        description: 'Motor não liga, barulho estranho',
        location: const {'latitude': -23.5505, 'longitude': -46.6333},
        vehicleInfo: {
          'brand': 'Toyota',
          'model': 'Corolla',
          'year': 2020,
          'plate': 'ABC-1234',
        },
        status: EmergencyStatus.accepted,
        createdAt: DateTime.now().subtract(const Duration(minutes: 15)),
        distance: 2.5,
      );
      _isLoading = false;
    });
  }

  void _updateStatus(String newStatus) {
    setState(() {
      _status = newStatus;
      switch (newStatus) {
        case 'A caminho':
          _progress = 0.3;
          break;
        case 'Chegou no local':
          _progress = 0.6;
          break;
        case 'Trabalhando':
          _progress = 0.8;
          break;
        case 'Concluído':
          _progress = 1.0;
          break;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        title: Text(
          'Emergência Ativa',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.call),
            onPressed: _callUser,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _activeEmergency == null
              ? _buildNoActiveEmergency()
              : _buildActiveEmergencyContent(),
    );
  }

  Widget _buildNoActiveEmergency() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.check_circle_outline,
            size: 80,
            color: Colors.green,
          ),
          const SizedBox(height: 20),
          Text(
            'Nenhuma emergência ativa',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Você não tem emergências em andamento',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.white70,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: () => Navigator.pushNamed(context, '/emergency-requests'),
            child: Text(
              'Ver Emergências Disponíveis',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActiveEmergencyContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status Card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF2A2A2A),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: const Color(0xFFE53E3E),
                width: 2,
              ),
            ),
            child: Column(
              children: [
                Text(
                  'Status Atual',
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _status,
                  style: GoogleFonts.poppins(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFFE53E3E),
                  ),
                ),
                const SizedBox(height: 16),
                LinearProgressIndicator(
                  value: _progress,
                  backgroundColor: Colors.white30,
                  valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
                ),
                const SizedBox(height: 8),
                Text(
                  '${(_progress * 100).toInt()}% concluído',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.white70,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          
          // Informações da Emergência
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF2A2A2A),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Informações da Emergência',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                _buildInfoRow('Tipo', _getEmergencyTypeName(_activeEmergency!.type)),
                _buildInfoRow('Urgência', _getUrgencyName(_activeEmergency!.urgency)),
                _buildInfoRow('Distância', '${_activeEmergency!.distance?.toStringAsFixed(1) ?? 'N/A'} km'),
                _buildInfoRow('Tempo', '15 min atrás'),
              ],
            ),
          ),
          const SizedBox(height: 20),
          
          // Informações do Veículo
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFF2A2A2A),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Veículo',
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 12),
                if (_activeEmergency!.vehicleInfo != null) ...[
                  _buildInfoRow('Marca', _activeEmergency!.vehicleInfo!['brand']),
                  _buildInfoRow('Modelo', _activeEmergency!.vehicleInfo!['model']),
                  _buildInfoRow('Ano', _activeEmergency!.vehicleInfo!['year'].toString()),
                  _buildInfoRow('Placa', _activeEmergency!.vehicleInfo!['plate']),
                ],
              ],
            ),
          ),
          const SizedBox(height: 20),
          
          // Descrição
          if (_activeEmergency!.description != null && _activeEmergency!.description!.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2A2A),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Descrição do Problema',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _activeEmergency!.description!,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: Colors.white70,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],
          
          // Botões de Ação
          Column(
            children: [
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _updateStatus('A caminho'),
                  icon: const Icon(Icons.directions),
                  label: Text(
                    'A caminho',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _status == 'A caminho' ? Colors.blue : Colors.grey,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _updateStatus('Chegou no local'),
                  icon: const Icon(Icons.location_on),
                  label: Text(
                    'Chegou no local',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _status == 'Chegou no local' ? Colors.orange : Colors.grey,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _updateStatus('Trabalhando'),
                  icon: const Icon(Icons.build),
                  label: Text(
                    'Trabalhando',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _status == 'Trabalhando' ? Colors.purple : Colors.grey,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _updateStatus('Concluído'),
                  icon: const Icon(Icons.check_circle),
                  label: Text(
                    'Concluído',
                    style: GoogleFonts.poppins(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _status == 'Concluído' ? Colors.green : Colors.grey,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
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
      padding: const EdgeInsets.symmetric(vertical: 4),
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

  void _callUser() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Ligar para o Cliente',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Deseja ligar para o cliente?',
          style: GoogleFonts.poppins(
            color: Colors.white70,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(
                color: Colors.white70,
              ),
            ),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              // Implementar chamada
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Ligando para o cliente...'),
                  backgroundColor: Colors.green,
                ),
              );
            },
            child: Text(
              'Ligar',
              style: GoogleFonts.poppins(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
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
}

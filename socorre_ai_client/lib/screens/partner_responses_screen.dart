import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/emergency_request.dart';
import '../models/partner.dart';

class PartnerResponsesScreen extends StatefulWidget {
  final EmergencyRequest emergencyRequest;

  const PartnerResponsesScreen({
    super.key,
    required this.emergencyRequest,
  });

  @override
  State<PartnerResponsesScreen> createState() => _PartnerResponsesScreenState();
}

class _PartnerResponsesScreenState extends State<PartnerResponsesScreen> {
  List<PartnerResponse> _responses = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadResponses();
  }

  void _loadResponses() {
    // Simular carregamento de respostas
    Future.delayed(const Duration(seconds: 1), () {
      setState(() {
        _responses = [
          PartnerResponse(
            partner: Partner(
              id: '1',
              name: 'Auto Socorro 24h',
              email: 'contato@autosocorro24h.com',
              phone: '(11) 99999-9999',
              businessName: 'Auto Socorro 24h',
              type: PartnerType.mechanic,
              location: {
                'latitude': -23.5515,
                'longitude': -46.6343,
                'address': 'R. das Flores, 123'
              },
              services: ['Mecânica', 'Bateria', 'Pneus'],
              rating: 4.8,
              totalRatings: 150,
              isAvailable: true,
              createdAt: DateTime.now(),
            ),
            response: 'Aceito',
            estimatedTime: '15 min',
            price: 'R\$ 80,00',
            message: 'Estou a caminho! Chegarei em 15 minutos.',
            respondedAt: DateTime.now().subtract(const Duration(minutes: 2)),
          ),
          PartnerResponse(
            partner: Partner(
              id: '2',
              name: 'Mecânica Central',
              email: 'contato@mecanicacentral.com',
              phone: '(11) 88888-8888',
              businessName: 'Mecânica Central',
              type: PartnerType.mechanic,
              location: {
                'latitude': -23.5495,
                'longitude': -46.6323,
                'address': 'Av. Central, 456'
              },
              services: ['Mecânica', 'Guincho'],
              rating: 4.6,
              totalRatings: 120,
              isAvailable: true,
              createdAt: DateTime.now(),
            ),
            response: 'Aceito',
            estimatedTime: '25 min',
            price: 'R\$ 120,00',
            message: 'Posso ajudar! Chegarei em 25 minutos.',
            respondedAt: DateTime.now().subtract(const Duration(minutes: 1)),
          ),
          PartnerResponse(
            partner: Partner(
              id: '3',
              name: 'Socorro Rápido',
              email: 'contato@socorrorapido.com',
              phone: '(11) 77777-7777',
              businessName: 'Socorro Rápido',
              type: PartnerType.mechanic,
              location: {
                'latitude': -23.5525,
                'longitude': -46.6313,
                'address': 'R. da Esperança, 789'
              },
              services: ['Mecânica', 'Bateria'],
              rating: 4.9,
              totalRatings: 200,
              isAvailable: false,
              createdAt: DateTime.now(),
            ),
            response: 'Recusado',
            estimatedTime: null,
            price: null,
            message: 'Desculpe, estou ocupado no momento.',
            respondedAt: DateTime.now().subtract(const Duration(minutes: 3)),
          ),
        ];
        _isLoading = false;
      });
    });
  }

  void _selectPartner(PartnerResponse response) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Confirmar Mecânico',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${response.partner.name}',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Tempo estimado: ${response.estimatedTime}',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: const Color(0xFF718096),
              ),
            ),
            Text(
              'Preço: ${response.price}',
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: const Color(0xFF718096),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(
                color: const Color(0xFF718096),
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pushNamed('/emergency-tracking', arguments: {
                'emergencyRequest': widget.emergencyRequest,
                'selectedPartner': response.partner,
              });
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFC),
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        title: Text(
          'Mecânicos Disponíveis',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: const Color(0xFF2D3748),
          ),
        ),
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back, color: Color(0xFF2D3748)),
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _responses.isEmpty
              ? Center(
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
                        'Nenhum mecânico disponível',
                        style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFF2D3748),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Tente novamente em alguns minutos',
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: const Color(0xFF718096),
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(20),
                  itemCount: _responses.length,
                  itemBuilder: (context, index) {
                    final response = _responses[index];
                    return _buildResponseCard(response);
                  },
                ),
    );
  }

  Widget _buildResponseCard(PartnerResponse response) {
    final isAccepted = response.response == 'Aceito';
    final isRejected = response.response == 'Recusado';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
        border: Border.all(
          color: isAccepted
              ? const Color(0xFF38A169)
              : isRejected
                  ? const Color(0xFFE53E3E)
                  : Colors.grey[300]!,
          width: isAccepted || isRejected ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: isAccepted
                      ? const Color(0xFF38A169).withOpacity(0.1)
                      : isRejected
                          ? const Color(0xFFE53E3E).withOpacity(0.1)
                          : Colors.grey[100],
                  borderRadius: BorderRadius.circular(25),
                ),
                child: Icon(
                  isAccepted
                      ? Icons.check_circle
                      : isRejected
                          ? Icons.cancel
                          : Icons.pending,
                  color: isAccepted
                      ? const Color(0xFF38A169)
                      : isRejected
                          ? const Color(0xFFE53E3E)
                          : Colors.grey[600],
                  size: 24,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      response.partner.name,
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: const Color(0xFF2D3748),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(
                          Icons.star,
                          color: Color(0xFFD69E2E),
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          response.partner.rating.toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            color: const Color(0xFF718096),
                          ),
                        ),
                        const SizedBox(width: 16),
                        const Icon(
                          Icons.location_on,
                          color: Color(0xFF718096),
                          size: 16,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '0.5 km',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            color: const Color(0xFF718096),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (isAccepted)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF38A169).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'DISPONÍVEL',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF38A169),
                    ),
                  ),
                ),
            ],
          ),
          
          if (isAccepted) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF38A169).withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: const Color(0xFF38A169).withOpacity(0.2),
                ),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildInfoItem(
                        Icons.access_time,
                        'Tempo',
                        response.estimatedTime!,
                        const Color(0xFF38A169),
                      ),
                      _buildInfoItem(
                        Icons.attach_money,
                        'Preço',
                        response.price!,
                        const Color(0xFF38A169),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    response.message,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: const Color(0xFF2D3748),
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: () => _selectPartner(response),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF38A169),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: Text(
                  'ESCOLHER ESTE MECÂNICO',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ),
          ] else if (isRejected) ...[
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFE53E3E).withOpacity(0.05),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: const Color(0xFFE53E3E).withOpacity(0.2),
                ),
              ),
              child: Text(
                response.message,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: const Color(0xFF2D3748),
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildInfoItem(IconData icon, String label, String value, Color color) {
    return Row(
      children: [
        Icon(icon, color: color, size: 16),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: const Color(0xFF718096),
              ),
            ),
            Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class PartnerResponse {
  final Partner partner;
  final String response;
  final String? estimatedTime;
  final String? price;
  final String message;
  final DateTime respondedAt;

  PartnerResponse({
    required this.partner,
    required this.response,
    this.estimatedTime,
    this.price,
    required this.message,
    required this.respondedAt,
  });
}
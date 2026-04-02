import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/partner_type_service.dart';

class PartnerTypeSelectionScreen extends StatelessWidget {
  const PartnerTypeSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              
              // Logo
              Center(
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE53E3E),
                    borderRadius: BorderRadius.circular(60),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFFE53E3E).withOpacity(0.3),
                        blurRadius: 20,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.build,
                    size: 60,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 40),
              
              // Título
              Text(
                'Escolha seu tipo de parceiro',
                style: GoogleFonts.poppins(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 10),
              
              Text(
                'Selecione a categoria que melhor descreve seu negócio',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  color: Colors.white70,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 50),
              
              // Card Mecânico
              _buildPartnerTypeCard(
                context: context,
                icon: Icons.build,
                title: 'Mecânico',
                subtitle: 'Prestador de serviços automotivos',
                description: 'Atenda emergências, faça reparos e ofereça serviços especializados',
                color: const Color(0xFF2B6CB0),
                onTap: () => _navigateToRegistration(context, 'mechanic'),
              ),
              const SizedBox(height: 20),
              
              // Card Lojista
              _buildPartnerTypeCard(
                context: context,
                icon: Icons.store,
                title: 'Lojista',
                subtitle: 'Venda de peças e acessórios',
                description: 'Venda produtos automotivos, peças e acessórios para veículos',
                color: const Color(0xFF38A169),
                onTap: () => _navigateToRegistration(context, 'store'),
              ),
              const SizedBox(height: 20),
              
              // Card Motoboy
              _buildPartnerTypeCard(
                context: context,
                icon: Icons.motorcycle,
                title: 'Motoboy',
                subtitle: 'Serviços de entrega',
                description: 'Faça entregas de combustível, peças e outros produtos',
                color: const Color(0xFFED8936),
                onTap: () => _navigateToRegistration(context, 'motoboy'),
              ),
              const SizedBox(height: 40),
              
              // Informações
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF2A2A2A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                ),
                child: Column(
                  children: [
                    Icon(
                      Icons.info_outline,
                      color: const Color(0xFFE53E3E),
                      size: 24,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Você pode alterar seu tipo de parceiro a qualquer momento nas configurações',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.white70,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPartnerTypeCard({
    required BuildContext context,
    required IconData icon,
    required String title,
    required String subtitle,
    required String description,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF2A2A2A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.3)),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.1),
              blurRadius: 10,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: Icon(
                    icon,
                    color: Colors.white,
                    size: 30,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios,
                  color: color,
                  size: 16,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              description,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.white70,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: color.withOpacity(0.3)),
              ),
              child: Text(
                'Continuar como $title',
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _navigateToRegistration(BuildContext context, String partnerType) async {
    // Salvar o tipo de parceiro selecionado
    await PartnerTypeService.savePartnerType(partnerType);
    
    // Navegar para telas específicas de cadastro
    switch (partnerType) {
      case 'mechanic':
        Navigator.pushNamed(context, '/mechanic-registration');
        break;
      case 'store':
        Navigator.pushNamed(context, '/store-registration');
        break;
      case 'motoboy':
        Navigator.pushNamed(context, '/motoboy-registration');
        break;
      default:
        Navigator.pushReplacementNamed(context, '/login');
    }
  }
}

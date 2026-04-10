import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/providers/partner_provider.dart';
import '../../../../models/subscription.dart';

class PartnerTypeSelectionScreen extends StatelessWidget {
  const PartnerTypeSelectionScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      appBar: AppBar(
        title: const Text('Seja um Parceiro'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              'Escolha seu tipo de serviço',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: context.textPrimary,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Selecione a categoria que melhor descreve seu negócio',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: context.textSecondary,
              ),
            ),
            const SizedBox(height: 32),
            
            // Partner types
            Expanded(
              child: ListView(
                children: [
                  _buildPartnerTypeCard(
                    context,
                    type: SubscriptionType.mechanic,
                    title: 'Mecânico',
                    description: 'Receba solicitações de serviços mecânicos',
                    icon: Icons.build,
                    color: AppTheme.primaryColor,
                    features: [
                      'Solicitações ilimitadas',
                      'Agendamentos online',
                      'Gestão de clientes',
                    ],
                    price: 'R\$ 99/mês',
                  ),
                  const SizedBox(height: 16),
                  _buildPartnerTypeCard(
                    context,
                    type: SubscriptionType.gasStation,
                    title: 'Posto de Combustível',
                    description: 'Venda combustível e produtos',
                    icon: Icons.local_gas_station,
                    color: AppTheme.infoColor,
                    features: [
                      'Loja virtual integrada',
                      'Pedidos de delivery',
                      'Gestão de estoque',
                    ],
                    price: 'R\$ 199/mês',
                  ),
                  const SizedBox(height: 16),
                  _buildPartnerTypeCard(
                    context,
                    type: SubscriptionType.autoParts,
                    title: 'Auto Peças',
                    description: 'Monte sua loja de peças online',
                    icon: Icons.store,
                    color: AppTheme.successColor,
                    features: [
                      'Catálogo de produtos',
                      'Sistema de estoque',
                      'Entrega integrada',
                    ],
                    price: 'R\$ 149/mês',
                  ),
                  const SizedBox(height: 16),
                  _buildPartnerTypeCard(
                    context,
                    type: SubscriptionType.towTruck,
                    title: 'Guincho',
                    description: 'Ofereça serviços de reboque',
                    icon: Icons.car_repair,
                    color: AppTheme.errorColor,
                    features: [
                      'Solicitações de emergência',
                      'Envie propostas aos clientes',
                      'Pagamentos seguros',
                    ],
                    price: '25% comissão',
                  ),
                  const SizedBox(height: 16),
                  _buildPartnerTypeCard(
                    context,
                    type: SubscriptionType.delivery,
                    title: 'Motoboy',
                    description: 'Faça entregas rápidas',
                    icon: Icons.delivery_dining,
                    color: AppTheme.warningColor,
                    features: [
                      'Pedidos em tempo real',
                      'Otimização de rotas',
                      'Pagamentos instantâneos',
                    ],
                    price: '15% comissão',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPartnerTypeCard(
    BuildContext context, {
    required SubscriptionType type,
    required String title,
    required String description,
    required IconData icon,
    required Color color,
    required List<String> features,
    required String price,
  }) {
    return Consumer<PartnerProvider>(
      builder: (context, partnerProvider, child) {
        return Card(
          color: context.surface,
          child: InkWell(
            onTap: () {
              partnerProvider.selectPartnerType(type);
              context.go('/register?partnerType=${type.name}');
            },
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Icon(icon, color: color, size: 24),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                color: context.textPrimary,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              description,
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: context.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: color.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Text(
                          price,
                          style: TextStyle(
                            color: color,
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 16),
                  
                  // Features
                  ...features.map((feature) => Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle, color: color, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            feature,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: context.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  )),
                  
                  const SizedBox(height: 16),
                  
                  // CTA
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        'Escolher →',
                        style: TextStyle(
                          color: color,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/providers/auth_provider.dart';
import '../../../../core/providers/partner_provider.dart';
import '../../../../models/subscription.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final partnerProvider = context.watch<PartnerProvider>();
    final partnerType = partnerProvider.selectedPartnerType;
    
    return Scaffold(
      backgroundColor: context.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              _buildHeader(context),
              
              const SizedBox(height: 24),
              
              // Stats cards
              _buildStatsCards(context, partnerType),
              
              const SizedBox(height: 24),
              
              // Quick actions
              _buildQuickActions(context, partnerType),
              
              const SizedBox(height: 24),
              
              // Recent activity
              _buildRecentActivity(context, partnerType),
              
              const SizedBox(height: 24),
              
              // Revenue chart
              _buildRevenueChart(context, partnerType),
            ],
          ),
        ),
      ),
    );
  }
  
  Widget _buildHeader(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final user = authProvider.user;
    
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: context.primary,
                child: Text(
                  user?.name.substring(0, 2).toUpperCase() ?? 'PA',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Olá, ${user?.name.split(' ').first ?? 'Parceiro'}!',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        color: context.textPrimary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Bem-vindo ao seu dashboard',
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
                  color: context.success.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  'ATIVO',
                  style: TextStyle(
                    color: context.success,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
  
  Widget _buildStatsCards(BuildContext context, SubscriptionType? partnerType) {
    switch (partnerType) {
      case SubscriptionType.mechanic:
        return _buildMechanicStats(context);
      case SubscriptionType.gasStation:
        return _buildGasStationStats(context);
      case SubscriptionType.autoParts:
        return _buildAutoPartsStats(context);
      case SubscriptionType.towTruck:
        return _buildTowTruckStats(context);
      case SubscriptionType.delivery:
        return _buildDeliveryStats(context);
      default:
        return _buildDefaultStats(context);
    }
  }
  
  Widget _buildMechanicStats(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            context,
            'Serviços Hoje',
            '8',
            Icons.build,
            context.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Agendados',
            '3',
            Icons.calendar_today,
            context.info,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Faturamento',
            'R\$ 450',
            Icons.attach_money,
            context.success,
          ),
        ),
      ],
    );
  }
  
  Widget _buildGasStationStats(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            context,
            'Vendas Hoje',
            'R\$ 2.850',
            Icons.local_gas_station,
            context.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Delivery',
            '12',
            Icons.delivery_dining,
            context.info,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Clientes',
            '89',
            Icons.people,
            context.success,
          ),
        ),
      ],
    );
  }
  
  Widget _buildAutoPartsStats(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            context,
            'Pedidos',
            '15',
            Icons.shopping_cart,
            context.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Estoque Baixo',
            '3',
            Icons.warning,
            context.warning,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Faturamento',
            'R\$ 1.250',
            Icons.attach_money,
            context.success,
          ),
        ),
      ],
    );
  }
  
  Widget _buildTowTruckStats(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            context,
            'Emergências',
            '5',
            Icons.emergency,
            context.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Propostas',
            '3',
            Icons.send,
            context.info,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Faturamento',
            'R\$ 750',
            Icons.attach_money,
            context.success,
          ),
        ),
      ],
    );
  }
  
  Widget _buildDeliveryStats(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            context,
            'Entregas',
            '12',
            Icons.delivery_dining,
            context.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Disponível',
            'Sim',
            Icons.check_circle,
            context.success,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Faturamento',
            'R\$ 180',
            Icons.attach_money,
            context.success,
          ),
        ),
      ],
    );
  }
  
  Widget _buildDefaultStats(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard(
            context,
            'Serviços',
            '0',
            Icons.build,
            context.primary,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Clientes',
            '0',
            Icons.people,
            context.info,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatCard(
            context,
            'Receita',
            'R\$ 0',
            Icons.attach_money,
            context.success,
          ),
        ),
      ],
    );
  }
  
  Widget _buildStatCard(
    BuildContext context,
    String title,
    String value,
    IconData icon,
    Color color,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: context.textPrimary,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: context.textSecondary,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
  
  Widget _buildQuickActions(BuildContext context, SubscriptionType? partnerType) {
    final actions = _getActionsForPartnerType(partnerType);
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Ações Rápidas',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: context.textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.2,
          children: actions.map((action) {
            return _buildActionCard(
              context,
              action['title'] as String,
              action['icon'] as IconData,
              action['color'] as Color,
              action['onTap'] as VoidCallback,
            );
          }).toList(),
        ),
      ],
    );
  }
  
  List<Map<String, dynamic>> _getActionsForPartnerType(SubscriptionType? partnerType) {
    switch (partnerType) {
      case SubscriptionType.mechanic:
        return [
          {
            'title': 'Nova Solicitação',
            'icon': Icons.add_circle,
            'color': AppTheme.primaryColor,
            'onTap': () {},
          },
          {
            'title': 'Agendamentos',
            'icon': Icons.calendar_today,
            'color': AppTheme.infoColor,
            'onTap': () {},
          },
          {
            'title': 'Histórico',
            'icon': Icons.history,
            'color': AppTheme.successColor,
            'onTap': () {},
          },
          {
            'title': 'Ferramentas',
            'icon': Icons.build,
            'color': AppTheme.warningColor,
            'onTap': () {},
          },
        ];
      case SubscriptionType.gasStation:
        return [
          {
            'title': 'Nova Venda',
            'icon': Icons.point_of_sale,
            'color': AppTheme.primaryColor,
            'onTap': () {},
          },
          {
            'title': 'Estoque',
            'icon': Icons.inventory,
            'color': AppTheme.infoColor,
            'onTap': () {},
          },
          {
            'title': 'Delivery',
            'icon': Icons.delivery_dining,
            'color': AppTheme.successColor,
            'onTap': () {},
          },
          {
            'title': 'Promoções',
            'icon': Icons.local_offer,
            'color': AppTheme.warningColor,
            'onTap': () {},
          },
        ];
      case SubscriptionType.autoParts:
        return [
          {
            'title': 'Novo Produto',
            'icon': Icons.add_shopping_cart,
            'color': AppTheme.primaryColor,
            'onTap': () {},
          },
          {
            'title': 'Estoque',
            'icon': Icons.inventory_2,
            'color': AppTheme.infoColor,
            'onTap': () {},
          },
          {
            'title': 'Pedidos',
            'icon': Icons.receipt_long,
            'color': AppTheme.successColor,
            'onTap': () {},
          },
          {
            'title': 'Clientes',
            'icon': Icons.people,
            'color': AppTheme.warningColor,
            'onTap': () {},
          },
        ];
      case SubscriptionType.towTruck:
        return [
          {
            'title': 'Emergências',
            'icon': Icons.emergency,
            'color': AppTheme.primaryColor,
            'onTap': () {},
          },
          {
            'title': 'Enviar Proposta',
            'icon': Icons.send,
            'color': AppTheme.infoColor,
            'onTap': () {},
          },
          {
            'title': 'Serviços',
            'icon': Icons.car_repair,
            'color': AppTheme.successColor,
            'onTap': () {},
          },
          {
            'title': 'Roteirização',
            'icon': Icons.map,
            'color': AppTheme.warningColor,
            'onTap': () {},
          },
        ];
      case SubscriptionType.delivery:
        return [
          {
            'title': 'Pedidos',
            'icon': Icons.delivery_dining,
            'color': AppTheme.primaryColor,
            'onTap': () {},
          },
          {
            'title': 'Rotas',
            'icon': Icons.route,
            'color': AppTheme.infoColor,
            'onTap': () {},
          },
          {
            'title': 'Disponibilidade',
            'icon': Icons.toggle_on,
            'color': AppTheme.successColor,
            'onTap': () {},
          },
          {
            'title': 'Histórico',
            'icon': Icons.history,
            'color': AppTheme.warningColor,
            'onTap': () {},
          },
        ];
      default:
        return [
          {
            'title': 'Configurar',
            'icon': Icons.settings,
            'color': AppTheme.primaryColor,
            'onTap': () {},
          },
          {
            'title': 'Ajuda',
            'icon': Icons.help,
            'color': AppTheme.infoColor,
            'onTap': () {},
          },
        ];
    }
  }
  
  Widget _buildActionCard(
    BuildContext context,
    String title,
    IconData icon,
    Color color,
    VoidCallback onTap,
  ) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          color: context.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(
              title,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: context.textPrimary,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildRecentActivity(BuildContext context, SubscriptionType? partnerType) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Atividade Recente',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: context.textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: context.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Column(
              children: [
                Icon(
                  Icons.receipt_long,
                  color: context.textTertiary,
                  size: 48,
                ),
                const SizedBox(height: 8),
                Text(
                  'Nenhuma atividade recente',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildRevenueChart(BuildContext context, SubscriptionType? partnerType) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Receita (Últimos 7 dias)',
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: context.textPrimary,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        Container(
          height: 200,
          decoration: BoxDecoration(
            color: context.surface,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.insert_chart,
                  color: context.textTertiary,
                  size: 48,
                ),
                const SizedBox(height: 8),
                Text(
                  'Gráfico de receita',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.textSecondary,
                  ),
                ),
                Text(
                  'R\$ 3.450,00',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    color: context.success,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

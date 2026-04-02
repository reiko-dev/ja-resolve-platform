import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';

class ServiceDetailsScreen extends StatelessWidget {
  final String serviceId;
  
  const ServiceDetailsScreen({super.key, required this.serviceId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      appBar: AppBar(
        title: const Text('Detalhes do Serviço'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Service ID: $serviceId',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: context.textSecondary,
              ),
            ),
            const SizedBox(height: 16),
            const Icon(
              Icons.build,
              size: 64,
              color: AppTheme.textTertiary,
            ),
            const SizedBox(height: 16),
            const Text(
              'Em desenvolvimento',
              style: TextStyle(
                fontSize: 14,
                color: AppTheme.textTertiary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

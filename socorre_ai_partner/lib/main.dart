import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/providers/auth_provider.dart';
import 'core/providers/partner_provider.dart';
import 'core/services/api_service.dart';
import 'services/auth_service.dart';
import 'services/partner_service.dart';

void main() {
  runApp(const SocorreAIPartnerApp());
}

class SocorreAIPartnerApp extends StatelessWidget {
  const SocorreAIPartnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // Services
        Provider<ApiService>(create: (_) => ApiService()),
        Provider<AuthService>(create: (context) => AuthService(context.read<ApiService>())),
        Provider<PartnerService>(create: (context) => PartnerService(context.read<ApiService>())),
        
        // Providers
        ChangeNotifierProvider<AuthProvider>(
          create: (context) => AuthProvider(context.read<AuthService>()),
        ),
        ChangeNotifierProvider<PartnerProvider>(
          create: (context) => PartnerProvider(context.read<PartnerService>()),
        ),
      ],
      child: MaterialApp.router(
        title: 'Socorre AI Partner',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        routerConfig: AppRouter.router,
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/auth/screens/register_screen.dart';
import '../../features/auth/screens/complete_partner_registration_screen.dart';
import '../../features/onboarding/screens/onboarding_screen.dart';
import '../../features/onboarding/screens/partner_type_selection_screen.dart';
import '../../features/dashboard/screens/dashboard_screen.dart';
import '../../features/profile/screens/profile_screen.dart';
import '../../features/services/screens/services_screen.dart';
import '../../features/services/screens/service_details_screen.dart';
import '../../features/services/screens/emergency_requests_screen.dart';
import '../../features/profile/screens/financial_screen.dart';
import '../../features/profile/screens/settings_screen.dart';

class AppRouter {
  static final GoRouter router = GoRouter(
    initialLocation: '/splash',
    debugLogDiagnostics: true,
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error, size: 64, color: AppTheme.errorColor),
            const SizedBox(height: 16),
            Text(
              'Página não encontrada',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              state.error?.toString() ?? 'Erro desconhecido',
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => context.go('/'),
              child: const Text('Voltar ao início'),
            ),
          ],
        ),
      ),
    ),
    routes: [
      // Splash Screen
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      
      // Onboarding
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      
      GoRoute(
        path: '/partner-type-selection',
        builder: (context, state) => const PartnerTypeSelectionScreen(),
      ),
      
      // Auth
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      
      GoRoute(
        path: '/register',
        builder: (context, state) {
          final partnerType = state.uri.queryParameters['partnerType'];
          return RegisterScreen(partnerType: partnerType);
        },
      ),
      
      GoRoute(
        path: '/complete-registration',
        builder: (context, state) {
          final partnerType = state.uri.queryParameters['partnerType'] ?? '';
          return CompletePartnerRegistrationScreen(partnerType: partnerType);
        },
      ),
      
      // Main App (Bottom Navigation)
      ShellRoute(
        builder: (context, state, child) => MainNavigationScreen(child: child),
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const DashboardScreen(),
          ),
          
          GoRoute(
            path: '/services',
            builder: (context, state) => const ServicesScreen(),
          ),
          
          GoRoute(
            path: '/emergency-requests',
            builder: (context, state) => const EmergencyRequestsScreen(),
          ),
          
          GoRoute(
            path: '/financial',
            builder: (context, state) => const FinancialScreen(),
          ),
          
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfileScreen(),
          ),
        ],
      ),
      
      // Service Details
      GoRoute(
        path: '/service/:id',
        builder: (context, state) {
          final serviceId = state.pathParameters['id']!;
          return ServiceDetailsScreen(serviceId: serviceId);
        },
      ),
      
      // Settings
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
    ],
  );
}

// Widget principal com navegação inferior
class MainNavigationScreen extends StatefulWidget {
  final Widget child;
  
  const MainNavigationScreen({super.key, required this.child});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;
  
  final List<NavigationItem> _navigationItems = [
    const NavigationItem(
      icon: Icons.home,
      label: 'Início',
      route: '/',
    ),
    const NavigationItem(
      icon: Icons.build,
      label: 'Serviços',
      route: '/services',
    ),
    const NavigationItem(
      icon: Icons.emergency,
      label: 'Emergências',
      route: '/emergency-requests',
    ),
    const NavigationItem(
      icon: Icons.attach_money,
      label: 'Financeiro',
      route: '/financial',
    ),
    const NavigationItem(
      icon: Icons.person,
      label: 'Perfil',
      route: '/profile',
    ),
  ];
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: context.surface,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.3),
              blurRadius: 10,
              offset: const Offset(0, -2),
            ),
          ],
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
            context.go(_navigationItems[index].route);
          },
          type: BottomNavigationBarType.fixed,
          backgroundColor: Colors.transparent,
          selectedItemColor: context.primary,
          unselectedItemColor: context.textTertiary,
          selectedLabelStyle: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
          unselectedLabelStyle: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w400,
          ),
          items: _navigationItems.map((item) {
            return BottomNavigationBarItem(
              icon: Icon(item.icon),
              label: item.label,
            );
          }).toList(),
        ),
      ),
    );
  }
}

class NavigationItem {
  final IconData icon;
  final String label;
  final String route;
  
  const NavigationItem({
    required this.icon,
    required this.label,
    required this.route,
  });
}

// Splash Screen temporário
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _navigateToNextScreen();
  }
  
  void _navigateToNextScreen() async {
    await Future.delayed(const Duration(seconds: 2));
    
    if (mounted) {
      // TODO: Verificar se usuário está logado
      // Por enquanto, vai para onboarding
      context.go('/onboarding');
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Logo oficial
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: Image.asset(
                  'assets/images/logosocorre.png',
                  width: 120,
                  height: 120,
                  fit: BoxFit.contain,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Socorre AI',
              style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                color: context.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Parceiro',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: context.textSecondary,
              ),
            ),
            const SizedBox(height: 48),
            const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(AppTheme.primaryColor),
            ),
          ],
        ),
      ),
    );
  }
}

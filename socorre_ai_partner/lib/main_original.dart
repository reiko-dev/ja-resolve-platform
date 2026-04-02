import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_core/firebase_core.dart';
import 'screens/splash_screen.dart';
import 'screens/partner_type_selection_screen.dart';
import 'screens/mechanic_registration_screen.dart';
import 'screens/store_registration_screen.dart';
import 'screens/motoboy_registration_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/emergency_requests_screen.dart';
import 'screens/active_emergency_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/reviews_screen.dart';
import 'screens/chat_list_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/payments_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/support_screen.dart';
import 'screens/help_center_screen.dart';
import 'screens/backup_screen.dart';
import 'screens/reports_screen.dart';
import 'screens/executive_dashboard_screen.dart';
import 'screens/ai_screen.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';
import 'services/websocket_service.dart';
import 'services/location_service.dart';
import 'config/app_config.dart';
import '../firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Inicializar Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  
  // Inicializar serviço de notificações
  await NotificationService.initialize();
  
  // Inicializar WebSocket
  await WebSocketService.initialize();
  
  // Inicializar serviço de localização
  await LocationService.initialize();
  
  // Mostrar configuração do ambiente
  AppConfig.printConfig();
  
  // Inicializar AuthService
  await AuthService.initialize();
  
  runApp(const SocorreAiPartnerApp());
}

class SocorreAiPartnerApp extends StatelessWidget {
  const SocorreAiPartnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Socorre AI - Parceiros',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.red,
        primaryColor: const Color(0xFFE53E3E),
        scaffoldBackgroundColor: const Color(0xFF1A1A1A),
        textTheme: GoogleFonts.poppinsTextTheme(
          Theme.of(context).textTheme.apply(
            bodyColor: Colors.white,
            displayColor: Colors.white,
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFE53E3E),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFE53E3E),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const SplashScreen(),
        '/partner-type': (context) => const PartnerTypeSelectionScreen(),
        '/mechanic-registration': (context) => const MechanicRegistrationScreen(),
        '/store-registration': (context) => const StoreRegistrationScreen(),
        '/motoboy-registration': (context) => const MotoboyRegistrationScreen(),
        '/login': (context) => const AuthScreen(),
        '/dashboard': (context) => const DashboardScreen(),
        '/emergency-requests': (context) => const EmergencyRequestsScreen(),
        '/active-emergency': (context) => const ActiveEmergencyScreen(),
        '/notifications': (context) => const NotificationsScreen(),
        '/reviews': (context) => ReviewsScreen(partnerId: 'current_partner_id'),
        '/chats': (context) => const ChatListScreen(),
        '/chat': (context) {
          final chat = ModalRoute.of(context)!.settings.arguments as Chat;
          return ChatScreen(chat: chat);
        },
        '/payments': (context) => const PaymentsScreen(),
        '/analytics': (context) => const AnalyticsScreen(),
        '/profile': (context) => const ProfileScreen(),
        '/settings': (context) => const SettingsScreen(),
        '/support': (context) => const SupportScreen(),
        '/help': (context) => const HelpCenterScreen(),
        '/backup': (context) => const BackupScreen(),
        '/reports': (context) => const ReportsScreen(),
        '/executive-dashboard': (context) => const ExecutiveDashboardScreen(),
        '/ai': (context) => const AIScreen(),
      },
    );
  }
}


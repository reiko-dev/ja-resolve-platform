import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_core/firebase_core.dart';
import 'screens/splash_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/emergency_request_screen.dart';
import 'screens/emergency_history_screen.dart';
import 'screens/available_partners_screen.dart';
import 'screens/map_screen.dart';
import 'screens/emergency_tracking_screen.dart';
import 'screens/partner_responses_screen.dart';
import 'screens/emergency_searching_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/payments_screen.dart';
import 'screens/wallet_screen.dart';
import 'screens/disputes_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/appointments_screen.dart';
import 'onboarding/client_onboarding.dart';
import 'screens/document_upload_screen.dart';
import 'models/emergency_request.dart';
import 'models/partner.dart';
import 'services/auth_service.dart';
import 'services/notification_service.dart';
import 'services/websocket_service.dart';
import 'config/app_config.dart';
import '../firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Inicializar Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  
  // Mostrar configuração do ambiente
  AppConfig.printConfig();
  
  // Inicializar AuthService
  await AuthService.initialize();
  
  // Inicializar serviço de notificações
  await NotificationService.initialize();
  
  // Inicializar WebSocket
  await WebSocketService.initialize();
  
  runApp(const SocorreAiClientApp());
}

class SocorreAiClientApp extends StatelessWidget {
  const SocorreAiClientApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Socorre AI - Cliente',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.red,
        primaryColor: const Color(0xFFE53E3E),
        scaffoldBackgroundColor: const Color(0xFFF7FAFC),
        appBarTheme: AppBarTheme(
          backgroundColor: const Color(0xFF2B6CB0),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        textTheme: GoogleFonts.poppinsTextTheme(),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFE53E3E),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
          ),
          filled: true,
          fillColor: Colors.white,
        ),
      ),
      routes: {
        '/': (context) => const SplashScreen(),
        '/login': (context) => const AuthScreen(),
        '/onboarding': (context) => const ClientOnboardingScreen(),
        '/document-upload': (context) => const DocumentUploadScreen(userType: 'client'),
        '/dashboard': (context) => const DashboardScreen(),
        '/emergency-request': (context) {
          final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
          return EmergencyRequestScreen(arguments: args);
        },
        '/emergency-history': (context) => const EmergencyHistoryScreen(),
        '/available-partners': (context) {
          final args = ModalRoute.of(context)!.settings.arguments as EmergencyRequest;
          return AvailablePartnersScreen(emergencyRequest: args);
        },
        '/map': (context) {
          final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>?;
          return MapScreen(
            initialLatitude: args?['latitude'],
            initialLongitude: args?['longitude'],
            partners: args?['partners'],
          );
        },
        '/emergency-tracking': (context) {
          final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>;
          return EmergencyTrackingScreen(
            emergencyRequest: args['emergencyRequest'] as EmergencyRequest,
            selectedPartner: args['selectedPartner'] as Partner?,
          );
        },
        '/partner-responses': (context) {
          final args = ModalRoute.of(context)!.settings.arguments as EmergencyRequest;
          return PartnerResponsesScreen(emergencyRequest: args);
        },
        '/emergency-searching': (context) {
          final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>;
          return EmergencySearchingScreen(
            emergencyRequest: args['emergencyRequest'] as EmergencyRequest,
          );
        },
        '/appointments': (context) => const AppointmentsScreen(),
        '/profile': (context) => const ProfileScreen(),
        '/notifications': (context) => const NotificationsScreen(),
        '/payments': (context) => const PaymentsScreen(),
        '/wallet': (context) => const WalletScreen(),
        '/disputes': (context) => const DisputesScreen(),
        '/chat': (context) {
          final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>;
          return ChatScreen(
            emergencyRequest: args['emergencyRequest'] as EmergencyRequest,
            partnerId: args['partnerId'] as String?,
          );
        },
      },
    );
  }
}

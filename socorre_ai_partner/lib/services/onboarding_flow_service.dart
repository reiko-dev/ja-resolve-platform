import 'api_service.dart';
import 'partner_type_service.dart';

class OnboardingFlowService {
  static const String onboardingRoute = '/onboarding';
  static const String partnerTypeSelectionRoute = '/partner-type-selection';
  static const String loginRoute = '/login';
  static const String pendingReviewRoute = '/onboarding-review';
  static const String dashboardRoute = '/';

  static String completeRegistrationRoute(String partnerType) {
    return '/complete-registration?partnerType=$partnerType';
  }

  static String partnerDocumentsRoute(String partnerType) {
    return '/partner-documents?partnerType=$partnerType';
  }

  static bool _isPublicRoute(String location) {
    const publicPrefixes = [
      '/splash',
      '/onboarding',
      '/partner-type-selection',
      '/login',
      '/register',
      '/complete-registration',
      '/partner-documents',
      '/onboarding-review',
    ];

    return publicPrefixes.any((prefix) => location == prefix || location.startsWith('$prefix?'));
  }

  static Future<void> persistPartnerType(String partnerType) async {
    await PartnerTypeService.savePartnerType(partnerType);
  }

  static Future<String> resolveInitialRoute() async {
    final isLoggedIn = await ApiService.isLoggedIn();
    if (!isLoggedIn) {
      return onboardingRoute;
    }

    final status = await ApiService.getPartnerOnboardingStatus();
    if (!status['success']) {
      return loginRoute;
    }

    final partnerType = (status['data']?['partnerType'] as String?) ?? '';
    if (partnerType.isNotEmpty) {
      await PartnerTypeService.savePartnerType(partnerType);
    }

    return _routeFromStatus(status['data'] as Map<String, dynamic>);
  }

  static Future<String?> redirectFor(String location) async {
    final isLoggedIn = await ApiService.isLoggedIn();

    if (!isLoggedIn) {
      return _isPublicRoute(location) ? null : onboardingRoute;
    }

    final status = await ApiService.getPartnerOnboardingStatus();
    if (!status['success']) {
      return loginRoute;
    }

    final partnerType = (status['data']?['partnerType'] as String?) ?? '';
    if (partnerType.isNotEmpty) {
      await PartnerTypeService.savePartnerType(partnerType);
    }

    final targetRoute = _routeFromStatus(status['data'] as Map<String, dynamic>);
    if (_isAllowedRouteForStatus(location, targetRoute)) {
      return null;
    }

    return targetRoute;
  }

  static String _routeFromStatus(Map<String, dynamic> status) {
    final partnerType = (status['partnerType'] as String?) ?? '';
    final nextStep = (status['nextStep'] as String?) ?? 'dashboard';

    switch (nextStep) {
      case 'partner_type_selection':
        return partnerTypeSelectionRoute;
      case 'complete_registration':
        if (partnerType.isEmpty) {
          return partnerTypeSelectionRoute;
        }
        return completeRegistrationRoute(partnerType);
      case 'document_upload':
        if (partnerType.isEmpty) {
          return partnerTypeSelectionRoute;
        }
        return partnerDocumentsRoute(partnerType);
      case 'pending_review':
        return pendingReviewRoute;
      case 'dashboard':
      default:
        return dashboardRoute;
    }
  }

  static bool _isAllowedRouteForStatus(String location, String targetRoute) {
    if (location == targetRoute) {
      return true;
    }

    if (targetRoute.startsWith('/complete-registration') && location.startsWith('/complete-registration')) {
      return true;
    }

    if (targetRoute.startsWith('/partner-documents') && location.startsWith('/partner-documents')) {
      return true;
    }

    if (targetRoute == pendingReviewRoute && location == pendingReviewRoute) {
      return true;
    }

    if (targetRoute == dashboardRoute && !_isPublicRoute(location)) {
      return true;
    }

    return false;
  }
}

import '../../models/subscription.dart';

class PartnerTypeUtils {
  static const String mechanic = 'mechanic';
  static const String gasStation = 'gas_station';
  static const String autoParts = 'auto_parts';
  static const String tow = 'tow';
  static const String motoboy = 'motoboy';

  static String normalize(String partnerType) {
    switch (partnerType.trim().toLowerCase()) {
      case 'mechanic':
        return mechanic;
      case 'gasstation':
      case 'gas_station':
      case 'store':
        return gasStation;
      case 'autoparts':
      case 'auto_parts':
        return autoParts;
      case 'towtruck':
      case 'tow_truck':
      case 'tow':
        return tow;
      case 'delivery':
      case 'motoboy':
        return motoboy;
      default:
        return partnerType.trim().toLowerCase();
    }
  }

  static SubscriptionType? toSubscriptionType(String partnerType) {
    switch (normalize(partnerType)) {
      case mechanic:
        return SubscriptionType.mechanic;
      case gasStation:
        return SubscriptionType.gasStation;
      case autoParts:
        return SubscriptionType.autoParts;
      case tow:
        return SubscriptionType.towTruck;
      case motoboy:
        return SubscriptionType.delivery;
      default:
        return null;
    }
  }

  static String displayName(String partnerType) {
    switch (normalize(partnerType)) {
      case mechanic:
        return 'Mecânico';
      case gasStation:
        return 'Posto de Combustível';
      case autoParts:
        return 'Autopeças';
      case tow:
        return 'Guincho';
      case motoboy:
        return 'Motoboy';
      default:
        return partnerType;
    }
  }
}

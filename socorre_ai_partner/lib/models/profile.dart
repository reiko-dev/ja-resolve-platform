class Profile {
  final String id;
  final String userId;
  final String name;
  final String email;
  final String? phone;
  final String? avatar;
  final String? bio;
  final String? address;
  final double? latitude;
  final double? longitude;
  final String? city;
  final String? state;
  final String? zipCode;
  final String? country;
  final String? timezone;
  final String? language;
  final String? currency;
  final Map<String, dynamic>? preferences;
  final Map<String, dynamic>? socialLinks;
  final Map<String, dynamic>? businessInfo;
  final bool isVerified;
  final bool isActive;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? lastLoginAt;
  final String? status;

  Profile({
    required this.id,
    required this.userId,
    required this.name,
    required this.email,
    this.phone,
    this.avatar,
    this.bio,
    this.address,
    this.latitude,
    this.longitude,
    this.city,
    this.state,
    this.zipCode,
    this.country,
    this.timezone,
    this.language,
    this.currency,
    this.preferences,
    this.socialLinks,
    this.businessInfo,
    this.isVerified = false,
    this.isActive = true,
    required this.createdAt,
    required this.updatedAt,
    this.lastLoginAt,
    this.status,
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    return Profile(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      phone: json['phone'],
      avatar: json['avatar'],
      bio: json['bio'],
      address: json['address'],
      latitude: json['latitude'] != null ? (json['latitude'] as num).toDouble() : null,
      longitude: json['longitude'] != null ? (json['longitude'] as num).toDouble() : null,
      city: json['city'],
      state: json['state'],
      zipCode: json['zip_code'],
      country: json['country'],
      timezone: json['timezone'],
      language: json['language'],
      currency: json['currency'],
      preferences: json['preferences'],
      socialLinks: json['social_links'],
      businessInfo: json['business_info'],
      isVerified: json['is_verified'] ?? false,
      isActive: json['is_active'] ?? true,
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
      lastLoginAt: json['last_login_at'] != null 
          ? DateTime.parse(json['last_login_at'])
          : null,
      status: json['status'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'name': name,
      'email': email,
      'phone': phone,
      'avatar': avatar,
      'bio': bio,
      'address': address,
      'latitude': latitude,
      'longitude': longitude,
      'city': city,
      'state': state,
      'zip_code': zipCode,
      'country': country,
      'timezone': timezone,
      'language': language,
      'currency': currency,
      'preferences': preferences,
      'social_links': socialLinks,
      'business_info': businessInfo,
      'is_verified': isVerified,
      'is_active': isActive,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'last_login_at': lastLoginAt?.toIso8601String(),
      'status': status,
    };
  }

  // Obter nome completo
  String get fullName => name;

  // Obter iniciais
  String get initials {
    final names = name.split(' ');
    if (names.length >= 2) {
      return '${names[0][0]}${names[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : 'U';
  }

  // Obter localização formatada
  String get formattedLocation {
    final parts = <String>[];
    if (city != null) parts.add(city!);
    if (state != null) parts.add(state!);
    if (country != null) parts.add(country!);
    return parts.join(', ');
  }

  // Obter endereço completo
  String get fullAddress {
    final parts = <String>[];
    if (address != null) parts.add(address!);
    if (city != null) parts.add(city!);
    if (state != null) parts.add(state!);
    if (zipCode != null) parts.add(zipCode!);
    if (country != null) parts.add(country!);
    return parts.join(', ');
  }

  // Verificar se tem localização
  bool get hasLocation => latitude != null && longitude != null;

  // Verificar se está online
  bool get isOnline {
    if (lastLoginAt == null) return false;
    final now = DateTime.now();
    final difference = now.difference(lastLoginAt!);
    return difference.inMinutes <= 5;
  }

  // Obter tempo desde último login
  String get lastLoginAgo {
    if (lastLoginAt == null) return 'Nunca';
    
    final now = DateTime.now();
    final difference = now.difference(lastLoginAt!);
    
    if (difference.inDays > 0) {
      return '${difference.inDays} dia${difference.inDays > 1 ? 's' : ''} atrás';
    } else if (difference.inHours > 0) {
      return '${difference.inHours} hora${difference.inHours > 1 ? 's' : ''} atrás';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes} minuto${difference.inMinutes > 1 ? 's' : ''} atrás';
    } else {
      return 'Agora mesmo';
    }
  }

  // Getters para informações de negócio
  String? get document => businessInfo?['document'];
  String? get birthDate => businessInfo?['birthDate'];
  String? get businessName => businessInfo?['businessName'];
  String? get businessType => businessInfo?['businessType'];
  String? get businessDescription => businessInfo?['businessDescription'];
  String? get businessPhone => businessInfo?['businessPhone'];
  String? get businessEmail => businessInfo?['businessEmail'];
  
  String get fullBusinessAddress {
    final parts = <String>[];
    if (businessInfo?['address'] != null) parts.add(businessInfo!['address']);
    if (city != null) parts.add(city!);
    if (state != null) parts.add(state!);
    if (businessInfo?['zipCode'] != null) parts.add(businessInfo!['zipCode']);
    if (country != null) parts.add(country!);
    return parts.join(', ');
  }
}

class Settings {
  final String id;
  final String userId;
  final bool notificationsEnabled;
  final bool emailNotifications;
  final bool pushNotifications;
  final bool smsNotifications;
  final bool locationTracking;
  final bool autoAcceptOrders;
  final bool showOnlineStatus;
  final bool allowDirectMessages;
  final String? theme;
  final String? language;
  final String? currency;
  final String? timezone;
  final Map<String, dynamic>? notificationSettings;
  final Map<String, dynamic>? privacySettings;
  final Map<String, dynamic>? businessSettings;
  final DateTime createdAt;
  final DateTime updatedAt;

  Settings({
    required this.id,
    required this.userId,
    this.notificationsEnabled = true,
    this.emailNotifications = true,
    this.pushNotifications = true,
    this.smsNotifications = false,
    this.locationTracking = true,
    this.autoAcceptOrders = false,
    this.showOnlineStatus = true,
    this.allowDirectMessages = true,
    this.theme,
    this.language,
    this.currency,
    this.timezone,
    this.notificationSettings,
    this.privacySettings,
    this.businessSettings,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Settings.fromJson(Map<String, dynamic> json) {
    return Settings(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      notificationsEnabled: json['notifications_enabled'] ?? true,
      emailNotifications: json['email_notifications'] ?? true,
      pushNotifications: json['push_notifications'] ?? true,
      smsNotifications: json['sms_notifications'] ?? false,
      locationTracking: json['location_tracking'] ?? true,
      autoAcceptOrders: json['auto_accept_orders'] ?? false,
      showOnlineStatus: json['show_online_status'] ?? true,
      allowDirectMessages: json['allow_direct_messages'] ?? true,
      theme: json['theme'],
      language: json['language'],
      currency: json['currency'],
      timezone: json['timezone'],
      notificationSettings: json['notification_settings'],
      privacySettings: json['privacy_settings'],
      businessSettings: json['business_settings'],
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'notifications_enabled': notificationsEnabled,
      'email_notifications': emailNotifications,
      'push_notifications': pushNotifications,
      'sms_notifications': smsNotifications,
      'location_tracking': locationTracking,
      'auto_accept_orders': autoAcceptOrders,
      'show_online_status': showOnlineStatus,
      'allow_direct_messages': allowDirectMessages,
      'theme': theme,
      'language': language,
      'currency': currency,
      'timezone': timezone,
      'notification_settings': notificationSettings,
      'privacy_settings': privacySettings,
      'business_settings': businessSettings,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  // Obter configurações de notificação
  Map<String, bool> get notificationSettingsMap {
    return {
      'email': emailNotifications,
      'push': pushNotifications,
      'sms': smsNotifications,
    };
  }

  // Obter configurações de privacidade
  Map<String, bool> get privacySettingsMap {
    return {
      'location_tracking': locationTracking,
      'show_online_status': showOnlineStatus,
      'allow_direct_messages': allowDirectMessages,
    };
  }

  // Obter configurações de negócio
  Map<String, bool> get businessSettingsMap {
    return {
      'auto_accept_orders': autoAcceptOrders,
    };
  }
}

class BusinessInfo {
  final String? businessName;
  final String? businessType;
  final String? businessDescription;
  final String? businessPhone;
  final String? businessEmail;
  final String? businessWebsite;
  final String? businessAddress;
  final String? businessCity;
  final String? businessState;
  final String? businessZipCode;
  final String? businessCountry;
  final String? businessTaxId;
  final String? businessLicense;
  final Map<String, dynamic>? businessHours;
  final Map<String, dynamic>? businessServices;
  final List<String>? businessCategories;
  final List<String>? businessTags;
  final String? businessLogo;
  final List<String>? businessImages;
  final Map<String, dynamic>? businessSocialMedia;
  final Map<String, dynamic>? businessPaymentMethods;
  final Map<String, dynamic>? businessDeliverySettings;

  BusinessInfo({
    this.businessName,
    this.businessType,
    this.businessDescription,
    this.businessPhone,
    this.businessEmail,
    this.businessWebsite,
    this.businessAddress,
    this.businessCity,
    this.businessState,
    this.businessZipCode,
    this.businessCountry,
    this.businessTaxId,
    this.businessLicense,
    this.businessHours,
    this.businessServices,
    this.businessCategories,
    this.businessTags,
    this.businessLogo,
    this.businessImages,
    this.businessSocialMedia,
    this.businessPaymentMethods,
    this.businessDeliverySettings,
  });

  factory BusinessInfo.fromJson(Map<String, dynamic> json) {
    return BusinessInfo(
      businessName: json['business_name'],
      businessType: json['business_type'],
      businessDescription: json['business_description'],
      businessPhone: json['business_phone'],
      businessEmail: json['business_email'],
      businessWebsite: json['business_website'],
      businessAddress: json['business_address'],
      businessCity: json['business_city'],
      businessState: json['business_state'],
      businessZipCode: json['business_zip_code'],
      businessCountry: json['business_country'],
      businessTaxId: json['business_tax_id'],
      businessLicense: json['business_license'],
      businessHours: json['business_hours'],
      businessServices: json['business_services'],
      businessCategories: json['business_categories'] != null 
          ? List<String>.from(json['business_categories'])
          : null,
      businessTags: json['business_tags'] != null 
          ? List<String>.from(json['business_tags'])
          : null,
      businessLogo: json['business_logo'],
      businessImages: json['business_images'] != null 
          ? List<String>.from(json['business_images'])
          : null,
      businessSocialMedia: json['business_social_media'],
      businessPaymentMethods: json['business_payment_methods'],
      businessDeliverySettings: json['business_delivery_settings'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'business_name': businessName,
      'business_type': businessType,
      'business_description': businessDescription,
      'business_phone': businessPhone,
      'business_email': businessEmail,
      'business_website': businessWebsite,
      'business_address': businessAddress,
      'business_city': businessCity,
      'business_state': businessState,
      'business_zip_code': businessZipCode,
      'business_country': businessCountry,
      'business_tax_id': businessTaxId,
      'business_license': businessLicense,
      'business_hours': businessHours,
      'business_services': businessServices,
      'business_categories': businessCategories,
      'business_tags': businessTags,
      'business_logo': businessLogo,
      'business_images': businessImages,
      'business_social_media': businessSocialMedia,
      'business_payment_methods': businessPaymentMethods,
      'business_delivery_settings': businessDeliverySettings,
    };
  }

  // Obter endereço completo do negócio
  String get fullBusinessAddress {
    final parts = <String>[];
    if (businessAddress != null) parts.add(businessAddress!);
    if (businessCity != null) parts.add(businessCity!);
    if (businessState != null) parts.add(businessState!);
    if (businessZipCode != null) parts.add(businessZipCode!);
    if (businessCountry != null) parts.add(businessCountry!);
    return parts.join(', ');
  }

  // Verificar se tem informações básicas
  bool get hasBasicInfo {
    return businessName != null && 
           businessType != null && 
           businessDescription != null;
  }

  // Verificar se tem informações de contato
  bool get hasContactInfo {
    return businessPhone != null || businessEmail != null;
  }

  // Verificar se tem informações de localização
  bool get hasLocationInfo {
    return businessAddress != null && businessCity != null;
  }
}

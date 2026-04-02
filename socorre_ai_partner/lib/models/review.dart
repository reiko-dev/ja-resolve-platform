class Review {
  final String id;
  final String partnerId;
  final String clientId;
  final String clientName;
  final String clientAvatar;
  final int rating;
  final String comment;
  final String serviceType;
  final String serviceId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isVerified;
  final List<String> tags;
  final Map<String, dynamic>? metadata;

  Review({
    required this.id,
    required this.partnerId,
    required this.clientId,
    required this.clientName,
    required this.clientAvatar,
    required this.rating,
    required this.comment,
    required this.serviceType,
    required this.serviceId,
    required this.createdAt,
    required this.updatedAt,
    this.isVerified = false,
    this.tags = const [],
    this.metadata,
  });

  factory Review.fromJson(Map<String, dynamic> json) {
    return Review(
      id: json['id'] ?? '',
      partnerId: json['partner_id'] ?? '',
      clientId: json['client_id'] ?? '',
      clientName: json['client_name'] ?? '',
      clientAvatar: json['client_avatar'] ?? '',
      rating: json['rating'] ?? 0,
      comment: json['comment'] ?? '',
      serviceType: json['service_type'] ?? '',
      serviceId: json['service_id'] ?? '',
      createdAt: DateTime.parse(json['created_at'] ?? DateTime.now().toIso8601String()),
      updatedAt: DateTime.parse(json['updated_at'] ?? DateTime.now().toIso8601String()),
      isVerified: json['is_verified'] ?? false,
      tags: List<String>.from(json['tags'] ?? []),
      metadata: json['metadata'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'partner_id': partnerId,
      'client_id': clientId,
      'client_name': clientName,
      'client_avatar': clientAvatar,
      'rating': rating,
      'comment': comment,
      'service_type': serviceType,
      'service_id': serviceId,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'is_verified': isVerified,
      'tags': tags,
      'metadata': metadata,
    };
  }

  // Calcular tempo decorrido
  String get timeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);

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

  // Obter texto da avaliação
  String get ratingText {
    switch (rating) {
      case 1:
        return 'Muito ruim';
      case 2:
        return 'Ruim';
      case 3:
        return 'Regular';
      case 4:
        return 'Bom';
      case 5:
        return 'Excelente';
      default:
        return 'Não avaliado';
    }
  }

  // Obter cor da avaliação
  String get ratingColor {
    switch (rating) {
      case 1:
        return '#FF0000';
      case 2:
        return '#FF6B6B';
      case 3:
        return '#FFD93D';
      case 4:
        return '#6BCF7F';
      case 5:
        return '#4ECDC4';
      default:
        return '#CCCCCC';
    }
  }

  // Verificar se é uma avaliação recente
  bool get isRecent {
    final now = DateTime.now();
    final difference = now.difference(createdAt);
    return difference.inDays <= 7;
  }

  // Verificar se é uma avaliação positiva
  bool get isPositive {
    return rating >= 4;
  }

  // Verificar se é uma avaliação negativa
  bool get isNegative {
    return rating <= 2;
  }

  // Obter emoji da avaliação
  String get ratingEmoji {
    switch (rating) {
      case 1:
        return '😡';
      case 2:
        return '😞';
      case 3:
        return '😐';
      case 4:
        return '😊';
      case 5:
        return '😍';
      default:
        return '😶';
    }
  }
}

class ReviewStats {
  final double averageRating;
  final int totalReviews;
  final Map<int, int> ratingDistribution;
  final int verifiedReviews;
  final int recentReviews;
  final double responseRate;
  final List<String> topTags;

  ReviewStats({
    required this.averageRating,
    required this.totalReviews,
    required this.ratingDistribution,
    required this.verifiedReviews,
    required this.recentReviews,
    required this.responseRate,
    required this.topTags,
  });

  factory ReviewStats.fromJson(Map<String, dynamic> json) {
    return ReviewStats(
      averageRating: (json['average_rating'] ?? 0.0).toDouble(),
      totalReviews: json['total_reviews'] ?? 0,
      ratingDistribution: Map<int, int>.from(json['rating_distribution'] ?? {}),
      verifiedReviews: json['verified_reviews'] ?? 0,
      recentReviews: json['recent_reviews'] ?? 0,
      responseRate: (json['response_rate'] ?? 0.0).toDouble(),
      topTags: List<String>.from(json['top_tags'] ?? []),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'average_rating': averageRating,
      'total_reviews': totalReviews,
      'rating_distribution': ratingDistribution,
      'verified_reviews': verifiedReviews,
      'recent_reviews': recentReviews,
      'response_rate': responseRate,
      'top_tags': topTags,
    };
  }

  // Obter porcentagem de cada avaliação
  double getRatingPercentage(int rating) {
    if (totalReviews == 0) return 0.0;
    return (ratingDistribution[rating] ?? 0) / totalReviews * 100;
  }

  // Obter texto da avaliação média
  String get averageRatingText {
    if (averageRating >= 4.5) return 'Excelente';
    if (averageRating >= 4.0) return 'Muito bom';
    if (averageRating >= 3.5) return 'Bom';
    if (averageRating >= 3.0) return 'Regular';
    if (averageRating >= 2.0) return 'Ruim';
    return 'Muito ruim';
  }

  // Obter cor da avaliação média
  String get averageRatingColor {
    if (averageRating >= 4.5) return '#4ECDC4';
    if (averageRating >= 4.0) return '#6BCF7F';
    if (averageRating >= 3.5) return '#FFD93D';
    if (averageRating >= 3.0) return '#FF6B6B';
    return '#FF0000';
  }
}

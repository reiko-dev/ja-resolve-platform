import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/review.dart';

class ReviewCard extends StatelessWidget {
  final Review review;
  final Function(Review)? onRespond;
  final Function(Review)? onReport;
  final bool showActions;

  const ReviewCard({
    super.key,
    required this.review,
    this.onRespond,
    this.onReport,
    this.showActions = true,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: const Color(0xFF2A2A2A),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header da avaliação
            Row(
              children: [
                // Avatar do cliente
                CircleAvatar(
                  radius: 20,
                  backgroundColor: const Color(0xFFE53E3E),
                  backgroundImage: review.clientAvatar.isNotEmpty
                      ? NetworkImage(review.clientAvatar)
                      : null,
                  child: review.clientAvatar.isEmpty
                      ? Text(
                          review.clientName.isNotEmpty
                              ? review.clientName[0].toUpperCase()
                              : 'C',
                          style: GoogleFonts.poppins(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                        )
                      : null,
                ),
                const SizedBox(width: 12),
                
                // Informações do cliente
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        review.clientName,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                      Text(
                        review.timeAgo,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.grey[400],
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Avaliação
                Row(
                  children: [
                    ...List.generate(5, (index) {
                      return Icon(
                        index < review.rating ? Icons.star : Icons.star_border,
                        color: index < review.rating
                            ? const Color(0xFFFFD700)
                            : Colors.grey[400],
                        size: 16,
                      );
                    }),
                    const SizedBox(width: 4),
                    Text(
                      review.rating.toString(),
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[400],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            
            const SizedBox(height: 12),
            
            // Comentário
            if (review.comment.isNotEmpty) ...[
              Text(
                review.comment,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.white70,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 12),
            ],
            
            // Tags
            if (review.tags.isNotEmpty) ...[
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: review.tags.map((tag) {
                  return Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE53E3E).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFFE53E3E).withOpacity(0.3),
                      ),
                    ),
                    child: Text(
                      tag,
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: const Color(0xFFE53E3E),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
            ],
            
            // Informações do serviço
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFF1A1A1A),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(
                    _getServiceIcon(review.serviceType),
                    size: 16,
                    color: Colors.grey[400],
                  ),
                  const SizedBox(width: 8),
                  Text(
                    _getServiceName(review.serviceType),
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                  if (review.isVerified) ...[
                    const SizedBox(width: 8),
                    Icon(
                      Icons.verified,
                      size: 14,
                      color: Colors.green[400],
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Verificado',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.green[400],
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            
            // Ações
            if (showActions) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  if (onRespond != null)
                    TextButton.icon(
                      onPressed: () => onRespond!(review),
                      icon: const Icon(Icons.reply, size: 16),
                      label: const Text('Responder'),
                      style: TextButton.styleFrom(
                        foregroundColor: const Color(0xFFE53E3E),
                        textStyle: GoogleFonts.poppins(fontSize: 12),
                      ),
                    ),
                  if (onReport != null) ...[
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: () => onReport!(review),
                      icon: const Icon(Icons.report, size: 16),
                      label: const Text('Reportar'),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.grey[400],
                        textStyle: GoogleFonts.poppins(fontSize: 12),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  IconData _getServiceIcon(String serviceType) {
    switch (serviceType.toLowerCase()) {
      case 'emergency':
        return Icons.emergency;
      case 'delivery':
        return Icons.local_shipping;
      case 'appointment':
        return Icons.schedule;
      case 'repair':
        return Icons.build;
      default:
        return Icons.help;
    }
  }

  String _getServiceName(String serviceType) {
    switch (serviceType.toLowerCase()) {
      case 'emergency':
        return 'Serviço de Emergência';
      case 'delivery':
        return 'Entrega';
      case 'appointment':
        return 'Agendamento';
      case 'repair':
        return 'Reparo';
      default:
        return 'Serviço';
    }
  }
}

class ReviewRatingWidget extends StatelessWidget {
  final int rating;
  final double size;
  final bool showNumber;

  const ReviewRatingWidget({
    super.key,
    required this.rating,
    this.size = 16,
    this.showNumber = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ...List.generate(5, (index) {
          return Icon(
            index < rating ? Icons.star : Icons.star_border,
            color: index < rating
                ? const Color(0xFFFFD700)
                : Colors.grey[400],
            size: size,
          );
        }),
        if (showNumber) ...[
          const SizedBox(width: 4),
          Text(
            rating.toString(),
            style: GoogleFonts.poppins(
              fontSize: size * 0.8,
              color: Colors.grey[400],
            ),
          ),
        ],
      ],
    );
  }
}

class ReviewSummaryCard extends StatelessWidget {
  final ReviewStats stats;

  const ReviewSummaryCard({
    super.key,
    required this.stats,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.all(16),
      color: const Color(0xFF2A2A2A),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Resumo das Avaliações',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            
            // Avaliação média
            Row(
              children: [
                Text(
                  stats.averageRating.toStringAsFixed(1),
                  style: GoogleFonts.poppins(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFFE53E3E),
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ReviewRatingWidget(
                      rating: stats.averageRating.round(),
                      size: 20,
                    ),
                    Text(
                      stats.averageRatingText,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[400],
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                Text(
                  '${stats.totalReviews} avaliações',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey[400],
                  ),
                ),
              ],
            ),
            
            const SizedBox(height: 16),
            
            // Distribuição de avaliações
            ...List.generate(5, (index) {
              final rating = 5 - index;
              final count = stats.ratingDistribution[rating] ?? 0;
              final percentage = stats.getRatingPercentage(rating);
              
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Text(
                      '$rating',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[400],
                      ),
                    ),
                    const SizedBox(width: 4),
                    const Icon(
                      Icons.star,
                      size: 12,
                      color: Color(0xFFFFD700),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: LinearProgressIndicator(
                        value: percentage / 100,
                        backgroundColor: Colors.grey[800],
                        valueColor: const AlwaysStoppedAnimation<Color>(
                          Color(0xFFE53E3E),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '$count',
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.grey[400],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

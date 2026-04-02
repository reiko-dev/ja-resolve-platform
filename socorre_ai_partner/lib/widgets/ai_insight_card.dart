import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/ai_models.dart';

class AIInsightCard extends StatelessWidget {
  final AIInsight insight;
  final VoidCallback onTap;

  const AIInsightCard({
    super.key,
    required this.insight,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      color: const Color(0xFF2A2A2A),
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Icon(
                    insight.typeIcon,
                    color: insight.typeColor,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      insight.title,
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  _buildTypeChip(),
                ],
              ),
              
              const SizedBox(height: 8),
              
              // Descrição
              Text(
                insight.description,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: Colors.grey[400],
                ),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              
              const SizedBox(height: 8),
              
              // Confiança
              Row(
                children: [
                  Icon(
                    Icons.analytics,
                    size: 16,
                    color: Colors.grey[400],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Confiança: ${insight.formattedConfidence}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[400],
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 8),
              
              // Recomendações
              if (insight.recommendations != null && insight.recommendations!.isNotEmpty) ...[
                Text(
                  'Recomendações:',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                ...insight.recommendations!.map((recommendation) => Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.check_circle,
                        color: Colors.green,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          recommendation,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: Colors.grey[400],
                          ),
                        ),
                      ),
                    ],
                  ),
                )),
                const SizedBox(height: 8),
              ],
              
              // Footer
              Row(
                children: [
                  Text(
                    insight.timeAgo,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[500],
                    ),
                  ),
                  const Spacer(),
                  if (insight.isExpired)
                    Text(
                      'Expirado',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: Colors.red,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTypeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: insight.typeColor.withOpacity(0.2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: insight.typeColor,
          width: 1,
        ),
      ),
      child: Text(
        insight.type.toUpperCase(),
        style: GoogleFonts.poppins(
          fontSize: 10,
          color: insight.typeColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

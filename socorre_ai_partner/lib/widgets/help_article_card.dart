import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/support.dart';

class HelpArticleCard extends StatelessWidget {
  final HelpArticle article;
  final VoidCallback? onTap;

  const HelpArticleCard({super.key, required this.article, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        onTap: onTap,
        leading: const Icon(Icons.article, color: Color(0xFFE53E3E)),
        title: Text(
          article.title,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          article.summary,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.poppins(fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

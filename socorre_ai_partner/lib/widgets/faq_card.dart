import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/support.dart';

class FAQCard extends StatelessWidget {
  final FAQ faq;
  final VoidCallback? onTap;

  const FAQCard({super.key, required this.faq, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        onTap: onTap,
        leading: const Icon(Icons.help_outline, color: Color(0xFFE53E3E)),
        title: Text(
          faq.question,
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          faq.answer,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: GoogleFonts.poppins(fontSize: 12),
        ),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

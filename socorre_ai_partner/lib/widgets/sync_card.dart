import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/backup.dart';

class SyncCard extends StatelessWidget {
  final SyncData sync;
  final VoidCallback onTap;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onCancel;

  const SyncCard({
    super.key,
    required this.sync,
    required this.onTap,
    required this.onPause,
    required this.onResume,
    required this.onCancel,
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
                  Expanded(
                    child: Text(
                      sync.type,
                      style: GoogleFonts.poppins(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _buildStatusChip(),
                ],
              ),
              
              const SizedBox(height: 8),
              
              // Estatísticas
              Row(
                children: [
                  _buildStatItem(
                    'Sincronizados',
                    '${sync.syncedRecords}',
                    Colors.green,
                  ),
                  const SizedBox(width: 16),
                  _buildStatItem(
                    'Falharam',
                    '${sync.failedRecords}',
                    Colors.red,
                  ),
                  const SizedBox(width: 16),
                  _buildStatItem(
                    'Taxa de Sucesso',
                    '${(sync.successRate * 100).toStringAsFixed(1)}%',
                    Colors.blue,
                  ),
                ],
              ),
              
              const SizedBox(height: 8),
              
              // Progresso
              if (sync.isActive) ...[
                LinearProgressIndicator(
                  value: sync.progress,
                  backgroundColor: Colors.grey[800],
                  valueColor: AlwaysStoppedAnimation<Color>(
                    sync.statusColor,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  sync.progressText,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Colors.grey[400],
                  ),
                ),
                const SizedBox(height: 8),
              ],
              
              // Footer
              Row(
                children: [
                  Text(
                    'Última sync: ${sync.lastSyncAgo}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.grey[500],
                    ),
                  ),
                  const Spacer(),
                  if (sync.isActive) ...[
                    IconButton(
                      icon: const Icon(Icons.pause),
                      onPressed: onPause,
                      color: Colors.orange,
                      iconSize: 20,
                    ),
                    IconButton(
                      icon: const Icon(Icons.cancel),
                      onPressed: onCancel,
                      color: Colors.red,
                      iconSize: 20,
                    ),
                  ] else if (sync.status == 'paused') ...[
                    IconButton(
                      icon: const Icon(Icons.play_arrow),
                      onPressed: onResume,
                      color: Colors.green,
                      iconSize: 20,
                    ),
                    IconButton(
                      icon: const Icon(Icons.cancel),
                      onPressed: onCancel,
                      color: Colors.red,
                      iconSize: 20,
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: sync.statusColor.withOpacity(0.2),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: sync.statusColor,
          width: 1,
        ),
      ),
      child: Text(
        sync.statusText,
        style: GoogleFonts.poppins(
          fontSize: 10,
          color: sync.statusColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildStatItem(String label, String value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: GoogleFonts.poppins(
            fontSize: 10,
            color: Colors.grey[400],
          ),
        ),
      ],
    );
  }
}

class BackupEmptyState extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final String? actionText;
  final VoidCallback? onAction;

  const BackupEmptyState({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.actionText,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            icon,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[400],
            ),
            textAlign: TextAlign.center,
          ),
          if (actionText != null && onAction != null) ...[
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.add),
              label: Text(actionText!),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFE53E3E),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/backup.dart';
import '../services/backup_service.dart';
import '../widgets/backup_card.dart';
import '../widgets/sync_card.dart' as sync;

class BackupScreen extends StatefulWidget {
  const BackupScreen({super.key});

  @override
  State<BackupScreen> createState() => _BackupScreenState();
}

class _BackupScreenState extends State<BackupScreen> {
  List<BackupData> _backups = [];
  List<SyncData> _syncData = [];
  BackupSettings? _settings;
  bool _isLoading = true;
  String _error = '';
  int _selectedTab = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      
      // Carregar backups
      final backupsResult = await BackupService.getUserBackups(token: token);
      if (backupsResult['success']) {
        setState(() {
          _backups = backupsResult['data'];
        });
      }

      // Carregar dados de sincronização
      final syncResult = await BackupService.getSyncData(token: token);
      if (syncResult['success']) {
        setState(() {
          _syncData = syncResult['data'];
        });
      }

      // Carregar configurações
      final settingsResult = await BackupService.getBackupSettings(token: token);
      if (settingsResult['success']) {
        setState(() {
          _settings = settingsResult['data'];
        });
      }

    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar dados: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _onRefresh() async {
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Backup e Sincronização',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: _openSettings,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFE53E3E)),
              ),
            )
          : _error.isNotEmpty
              ? _buildErrorWidget()
              : Column(
                  children: [
                    // Tabs
                    _buildTabs(),
                    
                    // Conteúdo
                    Expanded(
                      child: _selectedTab == 0
                          ? _buildBackupsTab()
                          : _buildSyncTab(),
                    ),
                  ],
                ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildTabButton('Backups', 0),
          ),
          Expanded(
            child: _buildTabButton('Sincronização', 1),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(String title, int index) {
    final isSelected = _selectedTab == index;
    return InkWell(
      onTap: () => setState(() => _selectedTab = index),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFE53E3E) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          title,
          style: GoogleFonts.poppins(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: isSelected ? Colors.white : Colors.grey[400],
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildBackupsTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: Column(
        children: [
          // Ações rápidas
          _buildQuickActions(),
          
          // Lista de backups
          Expanded(
            child: _backups.isEmpty
                ? _buildEmptyBackups()
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _backups.length,
                    itemBuilder: (context, index) {
                      final backup = _backups[index];
                      return BackupCard(
                        backup: backup,
                        onTap: () => _openBackup(backup),
                        onDownload: () => _downloadBackup(backup),
                        onRestore: () => _restoreBackupFromData(backup),
                        onDelete: () => _deleteBackup(backup),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildSyncTab() {
    return RefreshIndicator(
      onRefresh: _onRefresh,
      color: const Color(0xFFE53E3E),
      child: Column(
        children: [
          // Ações de sincronização
          _buildSyncActions(),
          
          // Lista de sincronizações
          Expanded(
            child: _syncData.isEmpty
                ? _buildEmptySync()
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _syncData.length,
                    itemBuilder: (context, index) {
                      final sync = _syncData[index];
                      return SyncCard(
                        sync: sync,
                        onTap: () => _openSync(sync),
                        onPause: () => _pauseSync(sync),
                        onResume: () => _resumeSync(sync),
                        onCancel: () => _cancelSync(sync),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ações Rápidas',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _createBackup,
                  icon: const Icon(Icons.backup),
                  label: const Text('Criar Backup'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE53E3E),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _restoreBackup(),
                  icon: const Icon(Icons.restore),
                  label: const Text('Restaurar'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFE53E3E),
                    side: const BorderSide(color: Color(0xFFE53E3E)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSyncActions() {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sincronização',
            style: GoogleFonts.poppins(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _startSync,
                  icon: const Icon(Icons.sync),
                  label: const Text('Sincronizar Agora'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE53E3E),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _forceSync,
                  icon: const Icon(Icons.sync_problem),
                  label: const Text('Forçar Sync'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFE53E3E),
                    side: const BorderSide(color: Color(0xFFE53E3E)),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyBackups() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.backup_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum backup encontrado',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Crie seu primeiro backup para proteger seus dados',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _createBackup,
            icon: const Icon(Icons.backup),
            label: const Text('Criar Backup'),
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
      ),
    );
  }

  Widget _buildEmptySync() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.sync_outlined,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhuma sincronização encontrada',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Inicie uma sincronização para manter seus dados atualizados',
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _startSync,
            icon: const Icon(Icons.sync),
            label: const Text('Sincronizar'),
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
      ),
    );
  }

  Widget _buildErrorWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Erro ao carregar backup',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _error,
            style: GoogleFonts.poppins(
              fontSize: 14,
              color: Colors.grey[500],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _onRefresh,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  void _createBackup() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Criar Backup',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Funcionalidade em desenvolvimento',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Fechar',
              style: GoogleFonts.poppins(
                color: const Color(0xFFE53E3E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _restoreBackup() {
    // Implementar restauração de backup
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Restauração de backup em desenvolvimento')),
    );
  }

  void _startSync() {
    // Implementar sincronização
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sincronização iniciada')),
    );
  }

  void _forceSync() {
    // Implementar sincronização forçada
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sincronização forçada iniciada')),
    );
  }

  void _openSettings() {
    // Implementar configurações
    Navigator.pushNamed(context, '/backup/settings');
  }

  void _openBackup(BackupData backup) {
    // Implementar abertura do backup
    Navigator.pushNamed(context, '/backup/details', arguments: backup);
  }

  void _downloadBackup(BackupData backup) {
    // Implementar download do backup
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Download do backup iniciado')),
    );
  }

  void _restoreBackupFromData(BackupData backup) {
    // Implementar restauração do backup
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Restauração do backup iniciada')),
    );
  }

  void _deleteBackup(BackupData backup) {
    // Implementar exclusão do backup
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Backup excluído')),
    );
  }

  void _openSync(SyncData sync) {
    // Implementar abertura da sincronização
    Navigator.pushNamed(context, '/sync/details', arguments: sync);
  }

  void _pauseSync(SyncData sync) {
    // Implementar pausa da sincronização
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sincronização pausada')),
    );
  }

  void _resumeSync(SyncData sync) {
    // Implementar retomada da sincronização
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sincronização retomada')),
    );
  }

  void _cancelSync(SyncData sync) {
    // Implementar cancelamento da sincronização
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sincronização cancelada')),
    );
  }
}

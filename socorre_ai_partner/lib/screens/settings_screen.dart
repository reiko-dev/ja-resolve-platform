import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/profile.dart';
import '../services/profile_service.dart';
import '../widgets/settings_section.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Settings? _settings;
  bool _isLoading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      final result = await ProfileService.getSettings(token: token);

      if (result['success']) {
        setState(() {
          _settings = result['data'];
        });
      } else {
        setState(() {
          _error = result['message'];
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar configurações: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _updateSettings(Map<String, dynamic> settingsData) async {
    try {
      final token = 'fake_token';
      final result = await ProfileService.updateSettings(
        token: token,
        settingsData: settingsData,
      );

      if (result['success']) {
        setState(() {
          _settings = result['data'];
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Configurações atualizadas com sucesso')),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['message'])),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao atualizar configurações: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Configurações',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            onPressed: _saveSettings,
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
              : _settings == null
                  ? _buildEmptyWidget()
                  : ListView(
                      children: [
                        // Notificações
                        SettingsSectionWidget(
                          title: 'Notificações',
                          children: [
                            _buildSwitchTile(
                              'Notificações Gerais',
                              'Receber notificações do app',
                              _settings!.notificationsEnabled,
                              (value) => _updateSettings({'notifications_enabled': value}),
                            ),
                            _buildSwitchTile(
                              'Notificações por Email',
                              'Receber notificações por email',
                              _settings!.emailNotifications,
                              (value) => _updateSettings({'email_notifications': value}),
                            ),
                            _buildSwitchTile(
                              'Notificações Push',
                              'Receber notificações push',
                              _settings!.pushNotifications,
                              (value) => _updateSettings({'push_notifications': value}),
                            ),
                            _buildSwitchTile(
                              'Notificações SMS',
                              'Receber notificações por SMS',
                              _settings!.smsNotifications,
                              (value) => _updateSettings({'sms_notifications': value}),
                            ),
                          ],
                        ),
                        
                        // Privacidade
                        SettingsSectionWidget(
                          title: 'Privacidade',
                          children: [
                            _buildSwitchTile(
                              'Rastreamento de Localização',
                              'Permitir rastreamento de localização',
                              _settings!.locationTracking,
                              (value) => _updateSettings({'location_tracking': value}),
                            ),
                            _buildSwitchTile(
                              'Status Online',
                              'Mostrar status online para outros usuários',
                              _settings!.showOnlineStatus,
                              (value) => _updateSettings({'show_online_status': value}),
                            ),
                            _buildSwitchTile(
                              'Mensagens Diretas',
                              'Permitir mensagens diretas de clientes',
                              _settings!.allowDirectMessages,
                              (value) => _updateSettings({'allow_direct_messages': value}),
                            ),
                          ],
                        ),
                        
                        // Negócio
                        SettingsSectionWidget(
                          title: 'Negócio',
                          children: [
                            _buildSwitchTile(
                              'Aceitar Pedidos Automaticamente',
                              'Aceitar pedidos automaticamente',
                              _settings!.autoAcceptOrders,
                              (value) => _updateSettings({'auto_accept_orders': value}),
                            ),
                          ],
                        ),
                        
                        // Aparência
                        SettingsSectionWidget(
                          title: 'Aparência',
                          children: [
                            _buildListTile(
                              'Tema',
                              _settings!.theme ?? 'Sistema',
                              Icons.palette,
                              _selectTheme,
                            ),
                            _buildListTile(
                              'Idioma',
                              _settings!.language ?? 'Português',
                              Icons.language,
                              _selectLanguage,
                            ),
                          ],
                        ),
                        
                        // Conta
                        SettingsSectionWidget(
                          title: 'Conta',
                          children: [
                            _buildListTile(
                              'Alterar Senha',
                              'Alterar senha da conta',
                              Icons.lock,
                              _changePassword,
                            ),
                            _buildListTile(
                              'Alterar Email',
                              'Alterar email da conta',
                              Icons.email,
                              _changeEmail,
                            ),
                            _buildListTile(
                              'Exportar Dados',
                              'Baixar todos os seus dados',
                              Icons.download,
                              _exportData,
                            ),
                            _buildListTile(
                              'Deletar Conta',
                              'Excluir conta permanentemente',
                              Icons.delete,
                              _deleteAccount,
                              isDestructive: true,
                            ),
                          ],
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
            'Erro ao carregar configurações',
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
            onPressed: _loadSettings,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyWidget() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.settings,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhuma configuração encontrada',
            style: GoogleFonts.poppins(
              fontSize: 18,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSwitchTile(String title, String subtitle, bool value, Function(bool) onChanged) {
    return SwitchListTile(
      title: Text(
        title,
        style: GoogleFonts.poppins(
          fontSize: 14,
          color: Colors.white,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: GoogleFonts.poppins(
          fontSize: 12,
          color: Colors.grey[400],
        ),
      ),
      value: value,
      onChanged: onChanged,
      activeThumbColor: const Color(0xFFE53E3E),
    );
  }

  Widget _buildListTile(String title, String subtitle, IconData icon, VoidCallback onTap, {bool isDestructive = false}) {
    return ListTile(
      leading: Icon(
        icon,
        color: isDestructive ? Colors.red : Colors.grey[400],
      ),
      title: Text(
        title,
        style: GoogleFonts.poppins(
          fontSize: 14,
          color: isDestructive ? Colors.red : Colors.white,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: GoogleFonts.poppins(
          fontSize: 12,
          color: Colors.grey[400],
        ),
      ),
      trailing: const Icon(
        Icons.arrow_forward_ios,
        color: Colors.grey,
        size: 16,
      ),
      onTap: onTap,
    );
  }

  void _saveSettings() {
    // Implementar salvamento de configurações
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Configurações salvas com sucesso')),
    );
  }

  void _selectTheme() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Selecionar Tema',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildThemeOption('Sistema', 'Seguir configuração do sistema'),
            _buildThemeOption('Claro', 'Tema claro'),
            _buildThemeOption('Escuro', 'Tema escuro'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildThemeOption(String title, String subtitle) {
    return ListTile(
      title: Text(
        title,
        style: GoogleFonts.poppins(color: Colors.white),
      ),
      subtitle: Text(
        subtitle,
        style: GoogleFonts.poppins(
          fontSize: 12,
          color: Colors.grey[400],
        ),
      ),
      onTap: () {
        Navigator.pop(context);
        _updateSettings({'theme': title.toLowerCase()});
      },
    );
  }

  void _selectLanguage() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Selecionar Idioma',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildLanguageOption('Português', 'pt'),
            _buildLanguageOption('English', 'en'),
            _buildLanguageOption('Español', 'es'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLanguageOption(String title, String code) {
    return ListTile(
      title: Text(
        title,
        style: GoogleFonts.poppins(color: Colors.white),
      ),
      onTap: () {
        Navigator.pop(context);
        _updateSettings({'language': code});
      },
    );
  }

  void _changePassword() {
    // Implementar alteração de senha
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Alteração de senha em desenvolvimento')),
    );
  }

  void _changeEmail() {
    // Implementar alteração de email
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Alteração de email em desenvolvimento')),
    );
  }

  void _exportData() {
    // Implementar exportação de dados
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Exportação de dados em desenvolvimento')),
    );
  }

  void _deleteAccount() {
    // Implementar exclusão de conta
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Deletar Conta',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Tem certeza que deseja deletar sua conta? Esta ação não pode ser desfeita.',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              // Implementar exclusão
            },
            child: Text(
              'Deletar',
              style: GoogleFonts.poppins(
                color: Colors.red,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

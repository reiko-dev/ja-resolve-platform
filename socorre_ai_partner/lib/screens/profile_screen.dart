import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/profile.dart';
import '../services/profile_service.dart';
import '../widgets/profile_header.dart';
import '../widgets/profile_section.dart' as section;

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Profile? _profile;
  Settings? _settings;
  BusinessInfo? _businessInfo;
  bool _isLoading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final token = 'fake_token';
      
      // Carregar perfil
      final profileResult = await ProfileService.getProfile(token: token);
      if (profileResult['success']) {
        setState(() {
          _profile = profileResult['data'];
        });
      }

      // Carregar configurações
      final settingsResult = await ProfileService.getSettings(token: token);
      if (settingsResult['success']) {
        setState(() {
          _settings = settingsResult['data'];
        });
      }

      // Carregar informações do negócio
      final businessResult = await ProfileService.getBusinessInfo(token: token);
      if (businessResult['success']) {
        setState(() {
          _businessInfo = businessResult['data'];
        });
      }

    } catch (e) {
      setState(() {
        _error = 'Erro ao carregar perfil: $e';
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _onRefresh() async {
    _loadProfile();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1A1A1A),
        foregroundColor: Colors.white,
        title: Text(
          'Perfil',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: _editProfile,
          ),
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
              : RefreshIndicator(
                  onRefresh: _onRefresh,
                  color: const Color(0xFFE53E3E),
                  child: CustomScrollView(
                    slivers: [
                      // Header do perfil
                      if (_profile != null)
                        SliverToBoxAdapter(
                          child: ProfileHeaderWidget(profile: _profile!),
                        ),
                      
                      // Seções do perfil
                      SliverList(
                        delegate: SliverChildListDelegate([
                          // Informações pessoais
                          if (_profile != null)
                            section.ProfileSectionWidget(
                              title: 'Informações Pessoais',
                              children: [
                                _buildInfoItem('Nome', _profile!.name),
                                _buildInfoItem('Email', _profile!.email),
                                if (_profile!.phone != null)
                                  _buildInfoItem('Telefone', _profile!.phone!),
                                if (_profile!.bio != null)
                                  _buildInfoItem('Bio', _profile!.bio!),
                                if (_profile!.formattedLocation.isNotEmpty)
                                  _buildInfoItem('Localização', _profile!.formattedLocation),
                              ],
                            ),
                          
                          // Informações do negócio
                          if (_businessInfo != null)
                            section.ProfileSectionWidget(
                              title: 'Informações do Negócio',
                              children: [
                                if (_businessInfo!.businessName != null)
                                  _buildInfoItem('Nome do Negócio', _businessInfo!.businessName!),
                                if (_businessInfo!.businessType != null)
                                  _buildInfoItem('Tipo de Negócio', _businessInfo!.businessType!),
                                if (_businessInfo!.businessDescription != null)
                                  _buildInfoItem('Descrição', _businessInfo!.businessDescription!),
                                if (_businessInfo!.businessPhone != null)
                                  _buildInfoItem('Telefone', _businessInfo!.businessPhone!),
                                if (_businessInfo!.businessEmail != null)
                                  _buildInfoItem('Email', _businessInfo!.businessEmail!),
                                if (_businessInfo!.fullBusinessAddress.isNotEmpty)
                                  _buildInfoItem('Endereço', _businessInfo!.fullBusinessAddress),
                              ],
                            ),
                          
                          // Configurações
                          if (_settings != null)
                            section.ProfileSectionWidget(
                              title: 'Configurações',
                              children: [
                                _buildSettingsItem(
                                  'Notificações',
                                  _settings!.notificationsEnabled ? 'Ativadas' : 'Desativadas',
                                  Icons.notifications,
                                  _settings!.notificationsEnabled ? Colors.green : Colors.red,
                                ),
                                _buildSettingsItem(
                                  'Rastreamento de Localização',
                                  _settings!.locationTracking ? 'Ativado' : 'Desativado',
                                  Icons.location_on,
                                  _settings!.locationTracking ? Colors.green : Colors.red,
                                ),
                                _buildSettingsItem(
                                  'Status Online',
                                  _settings!.showOnlineStatus ? 'Visível' : 'Oculto',
                                  Icons.visibility,
                                  _settings!.showOnlineStatus ? Colors.green : Colors.red,
                                ),
                                _buildSettingsItem(
                                  'Aceitar Pedidos Automaticamente',
                                  _settings!.autoAcceptOrders ? 'Ativado' : 'Desativado',
                                  Icons.auto_awesome,
                                  _settings!.autoAcceptOrders ? Colors.green : Colors.red,
                                ),
                              ],
                            ),
                          
                          // Ações
                          section.ProfileSectionWidget(
                            title: 'Ações',
                            children: [
                              _buildActionItem(
                                'Editar Perfil',
                                Icons.edit,
                                _editProfile,
                              ),
                              _buildActionItem(
                                'Configurações',
                                Icons.settings,
                                _openSettings,
                              ),
                              _buildActionItem(
                                'Informações do Negócio',
                                Icons.business,
                                _editBusinessInfo,
                              ),
                              _buildActionItem(
                                'Alterar Senha',
                                Icons.lock,
                                _changePassword,
                              ),
                              _buildActionItem(
                                'Exportar Dados',
                                Icons.download,
                                _exportData,
                              ),
                              _buildActionItem(
                                'Deletar Conta',
                                Icons.delete,
                                _deleteAccount,
                                isDestructive: true,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
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
            'Erro ao carregar perfil',
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

  Widget _buildInfoItem(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: Colors.grey[400],
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsItem(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Icon(
            icon,
            color: color,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 14,
                color: Colors.white,
              ),
            ),
          ),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionItem(String label, IconData icon, VoidCallback onTap, {bool isDestructive = false}) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              icon,
              color: isDestructive ? Colors.red : Colors.grey[400],
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 14,
                  color: isDestructive ? Colors.red : Colors.white,
                ),
              ),
            ),
            Icon(
              Icons.arrow_forward_ios,
              color: Colors.grey[400],
              size: 16,
            ),
          ],
        ),
      ),
    );
  }

  void _editProfile() {
    // Implementar edição de perfil
    Navigator.pushNamed(context, '/profile/edit');
  }

  void _openSettings() {
    // Implementar configurações
    Navigator.pushNamed(context, '/settings');
  }

  void _editBusinessInfo() {
    // Implementar edição de informações do negócio
    Navigator.pushNamed(context, '/profile/business');
  }

  void _changePassword() {
    // Implementar alteração de senha
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Alterar Senha',
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

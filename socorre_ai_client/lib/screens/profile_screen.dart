import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/emergency_request.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/emergency_service.dart';
import '../services/payment_service.dart';
import '../services/wallet_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  bool _isLoading = true;
  bool _isEditing = false;
  String _error = '';
  Map<String, dynamic>? _profileData;
  Map<String, dynamic>? _walletData;
  Map<String, dynamic>? _paymentStats;
  int _totalEmergencies = 0;
  int _completedEmergencies = 0;
  bool _notificationsEnabled = true;
  bool _shareLocation = true;
  bool _marketingEmails = false;

  @override
  void initState() {
    super.initState();
    _loadUserData();
    _loadPreferences();
  }

  String _formatAddress(Map<String, dynamic> address) {
    final parts = <String>[];

    void addIfNotEmpty(dynamic value) {
      if (value == null) return;
      final stringValue = value.toString().trim();
      if (stringValue.isNotEmpty) {
        parts.add(stringValue);
      }
    }

    if (address.containsKey('description')) {
      addIfNotEmpty(address['description']);
    }

    addIfNotEmpty(address['street']);
    addIfNotEmpty(address['number']);
    addIfNotEmpty(address['neighborhood']);
    addIfNotEmpty(address['city']);
    addIfNotEmpty(address['state']);

    if (parts.isEmpty) {
      address.entries.forEach((entry) => addIfNotEmpty(entry.value));
    }

    return parts.join(', ');
  }

  String _parseAddressText(dynamic addressRaw) {
    if (addressRaw == null) return '';

    if (addressRaw is String && addressRaw.isNotEmpty) {
      try {
        final decoded = jsonDecode(addressRaw);
        if (decoded is Map<String, dynamic>) {
          return _formatAddress(decoded);
        }
        if (decoded is List) {
          return decoded.join(', ');
        }
        return decoded.toString();
      } catch (_) {
        return addressRaw;
      }
    }

    if (addressRaw is Map<String, dynamic>) {
      return _formatAddress(addressRaw);
    }

    return addressRaw.toString();
  }

  double _parseAmount(dynamic value) {
    if (value == null) return 0;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString().replaceAll(',', '.')) ?? 0;
  }

  Future<void> _loadPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _notificationsEnabled = prefs.getBool('pref_notifications') ?? true;
      _shareLocation = prefs.getBool('pref_share_location') ?? true;
      _marketingEmails = prefs.getBool('pref_marketing_emails') ?? false;
    });
  }

  Future<void> _updatePreference(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  Future<void> _loadUserData() async {
    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      Map<String, dynamic>? profile = await ApiService.fetchProfile();
      profile ??= await ApiService.getUserData();
      profile ??= AuthService.currentUser?.toJson();

      final currentUser = AuthService.currentUser;

      final resolvedName = profile?['name'] ?? currentUser?.name ?? '';
      final resolvedEmail = profile?['email'] ?? currentUser?.email ?? '';
      final resolvedPhone = profile?['phone'] ?? currentUser?.phone ?? '';

      final addressText = _parseAddressText(profile?['address']);

      Map<String, dynamic>? walletData;
      try {
        final walletResponse = await WalletService.getWallet();
        if (walletResponse['success'] == true) {
          walletData = walletResponse['data'] as Map<String, dynamic>?;
        }
      } catch (e) {
        print('Erro ao carregar carteira: $e');
      }

      Map<String, dynamic>? paymentStats;
      try {
        paymentStats = await PaymentService.getPaymentStats();
      } catch (e) {
        print('Erro ao carregar estatísticas de pagamento: $e');
      }

      int totalEmergencies = 0;
      int completedEmergencies = 0;
      try {
        final requests = await EmergencyService.getUserRequests();
        totalEmergencies = requests.length;
        completedEmergencies = requests
            .where((req) => req.status == EmergencyStatus.completed)
            .length;
      } catch (e) {
        print('Erro ao carregar emergências: $e');
      }

      if (!mounted) return;
      setState(() {
        _profileData = profile;
        _walletData = walletData;
        _paymentStats = paymentStats;
        _totalEmergencies = totalEmergencies;
        _completedEmergencies = completedEmergencies;
        _nameController.text = resolvedName;
        _emailController.text = resolvedEmail;
        _phoneController.text = resolvedPhone;
        _addressController.text = addressText;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Erro ao carregar dados: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _saveProfile() async {
    if (!_isEditing) {
      setState(() {
        _isEditing = true;
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _error = '';
    });

    try {
      final response = await ApiService.updateProfile(
        name: _nameController.text.trim(),
        phone: _phoneController.text.trim(),
        address: _addressController.text.trim().isNotEmpty
            ? {'description': _addressController.text.trim()}
            : null,
      );

      final user = response['data']['user'] as Map<String, dynamic>;

      await AuthService.refreshUserData();

      if (!mounted) return;
      setState(() {
        _profileData = user;
        _nameController.text = user['name'] ?? _nameController.text;
        _phoneController.text = user['phone'] ?? _phoneController.text;
        _addressController.text = _parseAddressText(user['address']);
        _isEditing = false;
        _isLoading = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(response['message'] ?? 'Perfil atualizado com sucesso!')),
      );
    } catch (e) {
      setState(() {
        _error = 'Erro ao salvar: $e';
        _isLoading = false;
      });
    }
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Confirmar Logout',
          style: GoogleFonts.poppins(fontWeight: FontWeight.bold),
        ),
        content: Text(
          'Tem certeza que deseja sair?',
          style: GoogleFonts.poppins(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(
              'Cancelar',
              style: GoogleFonts.poppins(color: Colors.grey[600]),
            ),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFE53E3E),
              foregroundColor: Colors.white,
            ),
            child: Text('Sair', style: GoogleFonts.poppins()),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await AuthService.logout();
      if (mounted) {
        Navigator.pushReplacementNamed(context, '/login');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF7FAFC),
      appBar: AppBar(
        title: Text(
          'Meu Perfil',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        backgroundColor: const Color(0xFF2B6CB0),
        foregroundColor: Colors.white,
        actions: [
          if (_isEditing)
            TextButton(
              onPressed: _saveProfile,
              child: Text(
                'Salvar',
                style: GoogleFonts.poppins(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: _saveProfile,
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
              : _buildProfileContent(),
    );
  }

  Widget _buildProfileContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar e informações básicas
          _buildProfileHeader(),
          
          const SizedBox(height: 24),
          
          // Formulário de perfil
          _buildProfileForm(),
          
          const SizedBox(height: 24),
          
          // Estatísticas
          _buildStatsSection(),
          
          const SizedBox(height: 24),
          
          // Configurações
          _buildSettingsSection(),
          
          const SizedBox(height: 24),
          
          // Botão de logout
          _buildLogoutButton(),
        ],
      ),
    );
  }

  Widget _buildProfileHeader() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 40,
            backgroundColor: const Color(0xFFE53E3E),
            child: Text(
              _nameController.text.isNotEmpty 
                  ? _nameController.text[0].toUpperCase()
                  : 'U',
              style: GoogleFonts.poppins(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _nameController.text.isNotEmpty 
                      ? _nameController.text
                      : 'Usuário',
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF2D3748),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _emailController.text,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF48BB78),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    'Cliente Verificado',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileForm() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Informações Pessoais',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF2D3748),
            ),
          ),
          const SizedBox(height: 16),
          
          // Nome
          TextFormField(
            controller: _nameController,
            enabled: _isEditing,
            decoration: InputDecoration(
              labelText: 'Nome Completo',
              prefixIcon: const Icon(Icons.person),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          const SizedBox(height: 16),
          
          // Email
          TextFormField(
            controller: _emailController,
            enabled: false, // Email não pode ser alterado
            decoration: InputDecoration(
              labelText: 'Email',
              prefixIcon: const Icon(Icons.email),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
              filled: true,
              fillColor: Colors.grey[100],
            ),
          ),
          const SizedBox(height: 16),
          
          // Telefone
          TextFormField(
            controller: _phoneController,
            enabled: _isEditing,
            decoration: InputDecoration(
              labelText: 'Telefone',
              prefixIcon: const Icon(Icons.phone),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
          const SizedBox(height: 16),
          
          // Endereço
          TextFormField(
            controller: _addressController,
            enabled: _isEditing,
            maxLines: 2,
            decoration: InputDecoration(
              labelText: 'Endereço',
              prefixIcon: const Icon(Icons.location_on),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsSection() {
    final availableBalance = _parseAmount(_walletData?['available_balance']);
    final pendingBalance = _parseAmount(_walletData?['pending_balance']);
    final totalRevenue = _parseAmount(_paymentStats?['total_revenue']);
    final completedPayments = (_paymentStats?['completed_payments'] ?? 0).toString();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Minhas Estatísticas',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF2D3748),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  'Emergências',
                  _totalEmergencies.toString(),
                  Icons.local_hospital,
                  const Color(0xFFE53E3E),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatCard(
                  'Concluídas',
                  _completedEmergencies.toString(),
                  Icons.check_circle,
                  const Color(0xFF38A169),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildStatCard(
                  'Pagamentos',
                  completedPayments,
                  Icons.payment,
                  const Color(0xFF2B6CB0),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildStatCard(
                  'Saldo disponível',
                  PaymentService.formatCurrency(availableBalance),
                  Icons.account_balance_wallet,
                  const Color(0xFF805AD5),
                ),
              ),
            ],
          ),
          if (pendingBalance > 0 || totalRevenue > 0) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (totalRevenue > 0)
                  Expanded(
                    child: _buildStatCard(
                      'Total pago',
                      PaymentService.formatCurrency(totalRevenue),
                      Icons.attach_money,
                      const Color(0xFFD69E2E),
                    ),
                  ),
                if (totalRevenue > 0 && pendingBalance > 0) const SizedBox(width: 12),
                if (pendingBalance > 0)
                  Expanded(
                    child: _buildStatCard(
                      'Saldo pendente',
                      PaymentService.formatCurrency(pendingBalance),
                      Icons.hourglass_bottom,
                      const Color(0xFF718096),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 12,
              color: Colors.grey[600],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsSection() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Configurações',
            style: GoogleFonts.poppins(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF2D3748),
            ),
          ),
          const SizedBox(height: 16),
          _buildSettingItem(
            'Carteira Digital',
            'Ver saldo e transações',
            Icons.account_balance_wallet,
            () {
              Navigator.pushNamed(context, '/wallet');
            },
          ),
          _buildSettingItem(
            'Pagamentos',
            'Histórico de pagamentos',
            Icons.payment,
            () {
              Navigator.pushNamed(context, '/payments');
            },
          ),
          _buildSettingItem(
            'Disputas',
            'Gerenciar disputas',
            Icons.warning,
            () {
              Navigator.pushNamed(context, '/disputes');
            },
          ),
          _buildSettingItem(
            'Notificações',
            'Gerenciar notificações',
            Icons.notifications,
            () {
              Navigator.pushNamed(context, '/notifications');
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSettingItem(String title, String subtitle, IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF2B6CB0)),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF2D3748),
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: Colors.grey[600],
                    ),
                  ),
                ],
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

  Widget _buildLogoutButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: _logout,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFE53E3E),
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        child: Text(
          'Sair da Conta',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
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
            onPressed: _loadUserData,
            child: const Text('Tentar novamente'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    super.dispose();
  }
}

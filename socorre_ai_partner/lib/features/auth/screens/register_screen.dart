import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/providers/auth_provider.dart';
import '../../../../core/providers/partner_provider.dart';
import '../../../../models/subscription.dart';

class RegisterScreen extends StatefulWidget {
  final String? partnerType;
  
  const RegisterScreen({super.key, this.partnerType});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _obscurePassword = true;
  bool _obscureConfirmPassword = true;
  bool _acceptTerms = false;
  
  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      appBar: AppBar(
        title: const Text('Criar Conta'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            // Se veio da seleção de tipo, volta para lá
            if (widget.partnerType != null) {
              context.go('/partner-type-selection');
            } else {
              // Senão, volta para login
              context.pop();
            }
          },
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Partner type badge
              if (widget.partnerType != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  margin: const EdgeInsets.only(bottom: 24),
                  decoration: BoxDecoration(
                    color: context.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: context.primary.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.business, color: context.primary),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Tipo de Parceiro',
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: context.textSecondary,
                              ),
                            ),
                            Text(
                              _getPartnerTypeDisplayName(widget.partnerType!),
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                color: context.primary,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              
              // Title
              Text(
                'Criar sua conta',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: context.textPrimary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              
              const SizedBox(height: 8),
              
              Text(
                'Preencha os dados abaixo para começar',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: context.textSecondary,
                ),
              ),
              
              const SizedBox(height: 32),
              
              // Form
              Consumer2<AuthProvider, PartnerProvider>(
                builder: (context, authProvider, partnerProvider, child) {
                  return Form(
                    key: _formKey,
                    child: Column(
                      children: [
                        // Name field
                        TextFormField(
                          controller: _nameController,
                          decoration: const InputDecoration(
                            labelText: 'Nome Completo',
                            hintText: 'Seu nome completo',
                            prefixIcon: Icon(Icons.person),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Informe seu nome completo';
                            }
                            if (value.split(' ').length < 2) {
                              return 'Informe nome e sobrenome';
                            }
                            return null;
                          },
                        ),
                        
                        const SizedBox(height: 16),
                        
                        // Email field
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Email',
                            hintText: 'seu@email.com',
                            prefixIcon: Icon(Icons.email),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Informe seu email';
                            }
                            if (!value.contains('@')) {
                              return 'Email inválido';
                            }
                            return null;
                          },
                        ),
                        
                        const SizedBox(height: 16),
                        
                        // Phone field
                        TextFormField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(
                            labelText: 'Telefone',
                            hintText: '(11) 99999-9999',
                            prefixIcon: Icon(Icons.phone),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Informe seu telefone';
                            }
                            return null;
                          },
                        ),
                        
                        const SizedBox(height: 16),
                        
                        // Password field
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          decoration: InputDecoration(
                            labelText: 'Senha',
                            hintText: '••••••••',
                            prefixIcon: const Icon(Icons.lock),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscurePassword ? Icons.visibility : Icons.visibility_off,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscurePassword = !_obscurePassword;
                                });
                              },
                            ),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Informe sua senha';
                            }
                            if (value.length < 8) {
                              return 'Senha deve ter pelo menos 8 caracteres';
                            }
                            return null;
                          },
                        ),
                        
                        const SizedBox(height: 16),
                        
                        // Confirm password field
                        TextFormField(
                          controller: _confirmPasswordController,
                          obscureText: _obscureConfirmPassword,
                          decoration: InputDecoration(
                            labelText: 'Confirmar Senha',
                            hintText: '••••••••',
                            prefixIcon: const Icon(Icons.lock_outline),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscureConfirmPassword ? Icons.visibility : Icons.visibility_off,
                              ),
                              onPressed: () {
                                setState(() {
                                  _obscureConfirmPassword = !_obscureConfirmPassword;
                                });
                              },
                            ),
                          ),
                          validator: (value) {
                            if (value == null || value.isEmpty) {
                              return 'Confirme sua senha';
                            }
                            if (value != _passwordController.text) {
                              return 'As senhas não coincidem';
                            }
                            return null;
                          },
                        ),
                        
                        const SizedBox(height: 24),
                        
                        // Terms checkbox
                        Row(
                          children: [
                            Checkbox(
                              value: _acceptTerms,
                              onChanged: (value) {
                                setState(() {
                                  _acceptTerms = value ?? false;
                                });
                              },
                              activeColor: context.primary,
                            ),
                            Expanded(
                              child: Text.rich(
                                TextSpan(
                                  text: 'Eu concordo com os ',
                                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                    color: context.textSecondary,
                                  ),
                                  children: [
                                    WidgetSpan(
                                      child: TextButton(
                                        onPressed: () {
                                          // TODO: Show terms
                                        },
                                        style: TextButton.styleFrom(
                                          padding: EdgeInsets.zero,
                                          minimumSize: Size.zero,
                                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                        ),
                                        child: Text(
                                          'Termos de Uso',
                                          style: TextStyle(color: context.primary),
                                        ),
                                      ),
                                    ),
                                    TextSpan(
                                      text: ' e ',
                                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                        color: context.textSecondary,
                                      ),
                                    ),
                                    WidgetSpan(
                                      child: TextButton(
                                        onPressed: () {
                                          // TODO: Show privacy policy
                                        },
                                        style: TextButton.styleFrom(
                                          padding: EdgeInsets.zero,
                                          minimumSize: Size.zero,
                                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                        ),
                                        child: Text(
                                          'Política de Privacidade',
                                          style: TextStyle(color: context.primary),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        
                        const SizedBox(height: 32),
                        
                        // Error message
                        if (authProvider.error != null)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            margin: const EdgeInsets.only(bottom: 16),
                            decoration: BoxDecoration(
                              color: context.error.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: context.error.withOpacity(0.3)),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.error, color: context.error, size: 20),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    authProvider.error!,
                                    style: TextStyle(color: context.error),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        
                        // Register button
                        SizedBox(
                          width: double.infinity,
                          height: 48,
                          child: ElevatedButton(
                            onPressed: (authProvider.isLoading || !_acceptTerms) ? null : _handleRegister,
                            child: authProvider.isLoading
                                ? const CircularProgressIndicator(color: Colors.white)
                                : const Text('Criar Conta'),
                          ),
                        ),
                        
                        const SizedBox(height: 24),
                        
                        // Login link
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Já tem uma conta? ',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: context.textSecondary,
                              ),
                            ),
                            TextButton(
                              onPressed: () {
                                context.go('/login');
                              },
                              child: Text(
                                'Faça login',
                                style: TextStyle(color: context.primary),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
  
  void _handleRegister() async {
    if (_formKey.currentState!.validate()) {
      final authProvider = context.read<AuthProvider>();
      final partnerProvider = context.read<PartnerProvider>();
      
      // Set partner type if provided
      if (widget.partnerType != null) {
        final type = _getPartnerTypeEnum(widget.partnerType!);
        partnerProvider.selectPartnerType(type);
      }
      
      final userData = {
        'name': _nameController.text.trim(),
        'email': _emailController.text.trim(),
        'phone': _phoneController.text.trim(),
        'password': _passwordController.text,
      };
      
      final success = await authProvider.register(userData);
      
      if (success && mounted) {
        // Se tem tipo de parceiro, vai para completar cadastro
        if (widget.partnerType != null) {
          context.go('/complete-registration?partnerType=${widget.partnerType}');
        } else {
          // Senão, vai direto para o dashboard
          context.go('/');
        }
      }
    }
  }
  
  String _getPartnerTypeDisplayName(String partnerType) {
    switch (partnerType.toLowerCase()) {
      case 'mechanic':
        return 'Mecânico';
      case 'gasstation':
        return 'Posto de Combustível';
      case 'autoparts':
        return 'Auto Peças';
      case 'towtruck':
        return 'Guincho';
      case 'delivery':
        return 'Motoboy';
      default:
        return partnerType;
    }
  }
  
  SubscriptionType _getPartnerTypeEnum(String partnerType) {
    switch (partnerType.toLowerCase()) {
      case 'mechanic':
        return SubscriptionType.mechanic;
      case 'gasstation':
        return SubscriptionType.gasStation;
      case 'autoparts':
        return SubscriptionType.autoParts;
      case 'towtruck':
        return SubscriptionType.towTruck;
      case 'delivery':
        return SubscriptionType.delivery;
      default:
        return SubscriptionType.mechanic;
    }
  }
}

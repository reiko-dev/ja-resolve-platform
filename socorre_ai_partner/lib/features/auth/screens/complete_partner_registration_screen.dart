import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/partner_document_rules.dart';
import '../../../core/utils/partner_type_utils.dart';
import '../../../models/mechanic_specialty.dart';
import '../../../services/api_service.dart';
import '../../../services/cep_service.dart';
import '../../../services/onboarding_flow_service.dart';

class CompletePartnerRegistrationScreen extends StatefulWidget {
  final String partnerType;

  const CompletePartnerRegistrationScreen({super.key, required this.partnerType});

  @override
  State<CompletePartnerRegistrationScreen> createState() => _CompletePartnerRegistrationScreenState();
}

class _CompletePartnerRegistrationScreenState extends State<CompletePartnerRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _companyNameController = TextEditingController();
  final TextEditingController _tradeNameController = TextEditingController();
  final TextEditingController _cnpjController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _cepController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();
  final TextEditingController _numberController = TextEditingController();
  final TextEditingController _complementController = TextEditingController();
  final TextEditingController _neighborhoodController = TextEditingController();
  final TextEditingController _cityController = TextEditingController();
  final TextEditingController _stateController = TextEditingController();
  final TextEditingController _descriptionController = TextEditingController();

  bool _isSubmitting = false;
  bool _isLoadingCep = false;
  String? _errorMessage;
  String? _lastSearchedCep;
  final List<MechanicSpecialty> _selectedSpecialties = [];

  String get _normalizedPartnerType => PartnerTypeUtils.normalize(widget.partnerType);

  bool get _documentsRequired => PartnerDocumentRules.requiresDocuments(_normalizedPartnerType);

  @override
  void dispose() {
    _companyNameController.dispose();
    _tradeNameController.dispose();
    _cnpjController.dispose();
    _phoneController.dispose();
    _cepController.dispose();
    _addressController.dispose();
    _numberController.dispose();
    _complementController.dispose();
    _neighborhoodController.dispose();
    _cityController.dispose();
    _stateController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _buscarCep() async {
    final cep = _cepController.text.replaceAll(RegExp(r'[^0-9]'), '');

    if (cep.length != 8) {
      _showSnackBar('CEP inválido', isError: true);
      return;
    }

    FocusScope.of(context).unfocus();
    setState(() => _isLoadingCep = true);

    try {
      final endereco = await CepService.buscarCep(cep);

      if (!mounted) {
        return;
      }

      setState(() {
        _addressController.text = endereco['logradouro'] ?? '';
        _complementController.text = endereco['complemento'] ?? '';
        _neighborhoodController.text = endereco['bairro'] ?? '';
        _cityController.text = endereco['cidade'] ?? '';
        _stateController.text = (endereco['uf'] ?? '').toString().toUpperCase();
        _lastSearchedCep = cep;
      });

      _showSnackBar('Endereço encontrado com sucesso');
    } catch (e) {
      if (!mounted) {
        return;
      }
      _showSnackBar('Erro ao buscar CEP: ${e.toString().replaceFirst('Exception: ', '')}', isError: true);
    } finally {
      if (mounted) {
        setState(() => _isLoadingCep = false);
      }
    }
  }

  void _handleCepChanged(String value) {
    final cep = value.replaceAll(RegExp(r'[^0-9]'), '');
    if (cep.length == 8 && cep != _lastSearchedCep && !_isLoadingCep) {
      _buscarCep();
    }
  }

  void _toggleSpecialty(MechanicSpecialty specialty) {
    setState(() {
      final alreadySelected = _selectedSpecialties.any((item) => item.id == specialty.id);
      if (alreadySelected) {
        _selectedSpecialties.removeWhere((item) => item.id == specialty.id);
      } else {
        _selectedSpecialties.add(specialty);
      }
    });
  }

  Future<void> _handleCompleteRegistration() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    if (_normalizedPartnerType == PartnerTypeUtils.mechanic && _selectedSpecialties.isEmpty) {
      setState(() => _errorMessage = 'Selecione pelo menos uma especialidade');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final payload = <String, dynamic>{
      'partner_type': _normalizedPartnerType,
      'company_name': _companyNameController.text.trim(),
      'trade_name': _tradeNameController.text.trim(),
      'cnpj': _cnpjController.text.trim(),
      'phone': _phoneController.text.trim(),
      'cep': _cepController.text.trim(),
      'address': _addressController.text.trim(),
      'number': _numberController.text.trim(),
      'complement': _complementController.text.trim(),
      'neighborhood': _neighborhoodController.text.trim(),
      'city': _cityController.text.trim(),
      'state': _stateController.text.trim().toUpperCase(),
      'description': _descriptionController.text.trim(),
      if (_selectedSpecialties.isNotEmpty)
        'specialties': _selectedSpecialties.map((item) => item.id).toList(),
    };

    final response = await ApiService.completePartnerOnboarding(payload);

    if (!mounted) {
      return;
    }

    setState(() => _isSubmitting = false);

    if (!response['success']) {
      setState(() => _errorMessage = response['message']?.toString() ?? 'Erro ao completar cadastro');
      return;
    }

    await OnboardingFlowService.persistPartnerType(_normalizedPartnerType);

    if (!mounted) {
      return;
    }

    final onboarding = (response['data']?['onboarding'] as Map<String, dynamic>?) ?? {};
    final nextStep = onboarding['nextStep'] as String? ?? 'dashboard';

    _showSnackBar('Cadastro complementar salvo com sucesso');

    if (nextStep == 'document_upload' && _documentsRequired) {
      context.go(OnboardingFlowService.partnerDocumentsRoute(_normalizedPartnerType));
      return;
    }

    if (nextStep == 'pending_review') {
      context.go(OnboardingFlowService.pendingReviewRoute);
      return;
    }

    context.go('/');
  }

  void _showSnackBar(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? context.error : context.success,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: context.background,
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: Text('Completar Cadastro - ${PartnerTypeUtils.displayName(_normalizedPartnerType)}'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: SafeArea(
          child: Form(
            key: _formKey,
            child: SingleChildScrollView(
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              physics: const ClampingScrollPhysics(),
              padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + bottomInset),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Complete seu cadastro',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: context.textPrimary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Precisamos de algumas informações adicionais para configurar seu perfil de ${PartnerTypeUtils.displayName(_normalizedPartnerType)}.',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: context.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildFormContent(context),
                  if (_documentsRequired) ...[
                    const SizedBox(height: 24),
                    _buildInfoCard(
                      title: 'Documentos na próxima etapa',
                      message: 'Depois de salvar estes dados, você vai para a tela de envio dos documentos obrigatórios.',
                    ),
                  ],
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 24),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: context.error.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.error.withValues(alpha: 0.24)),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(color: context.error),
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isSubmitting ? null : _handleCompleteRegistration,
                      child: _isSubmitting
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Completar Cadastro'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFormContent(BuildContext context) {
    switch (_normalizedPartnerType) {
      case PartnerTypeUtils.mechanic:
        return _buildMechanicForm(context);
      case PartnerTypeUtils.gasStation:
        return _buildBusinessForm(
          context,
          sectionTitle: 'Informações do posto',
          companyLabel: 'Nome do posto *',
        );
      case PartnerTypeUtils.autoParts:
        return _buildBusinessForm(
          context,
          sectionTitle: 'Informações da loja',
          companyLabel: 'Nome da autopeças *',
        );
      case PartnerTypeUtils.tow:
        return _buildBusinessForm(
          context,
          sectionTitle: 'Informações do guincho',
          companyLabel: 'Nome da empresa *',
        );
      case PartnerTypeUtils.motoboy:
        return _buildBusinessForm(
          context,
          sectionTitle: 'Informações do motoboy',
          companyLabel: 'Nome completo *',
        );
      default:
        return Text(
          'Tipo de parceiro não reconhecido.',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: context.textSecondary),
        );
    }
  }

  Widget _buildMechanicForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildCompanySection(companyLabel: 'Nome da oficina *'),
        const SizedBox(height: 24),
        _buildAddressSection(),
        const SizedBox(height: 24),
        _buildSectionTitle('Especialidades e serviços'),
        const SizedBox(height: 8),
        Text(
          'Selecione suas especialidades principais. Pelo menos uma precisa ficar marcada.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: context.textSecondary,
          ),
        ),
        const SizedBox(height: 16),
        _buildSpecialtiesGrid(),
      ],
    );
  }

  Widget _buildBusinessForm(
    BuildContext context, {
    required String sectionTitle,
    required String companyLabel,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle(sectionTitle),
        const SizedBox(height: 16),
        _buildCompanySection(companyLabel: companyLabel),
        const SizedBox(height: 24),
        _buildAddressSection(),
      ],
    );
  }

  Widget _buildCompanySection({required String companyLabel}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Dados principais'),
        const SizedBox(height: 16),
        TextFormField(
          controller: _companyNameController,
          decoration: _buildInputDecoration(companyLabel),
          validator: (value) => value == null || value.trim().isEmpty ? 'Campo obrigatório' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _tradeNameController,
          decoration: _buildInputDecoration('Nome fantasia'),
        ),
        const SizedBox(height: 16),
        if (_normalizedPartnerType != PartnerTypeUtils.motoboy && _normalizedPartnerType != PartnerTypeUtils.mechanic)
          Column(
            children: [
              TextFormField(
                controller: _cnpjController,
                decoration: _buildInputDecoration('CNPJ'),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
            ],
          ),
        TextFormField(
          controller: _phoneController,
          decoration: _buildInputDecoration('Telefone *'),
          keyboardType: TextInputType.phone,
          validator: (value) => value == null || value.trim().isEmpty ? 'Telefone obrigatório' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _descriptionController,
          decoration: _buildInputDecoration('Descrição do serviço ou estabelecimento'),
          maxLines: 3,
        ),
      ],
    );
  }

  Widget _buildAddressSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Endereço'),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 2,
              child: TextFormField(
                controller: _cepController,
                decoration: _buildInputDecoration('CEP *').copyWith(
                  counterText: '',
                  suffixIcon: _isLoadingCep
                      ? const Padding(
                          padding: EdgeInsets.all(12),
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : IconButton(
                          icon: const Icon(Icons.search),
                          onPressed: _buscarCep,
                        ),
                ),
                keyboardType: TextInputType.number,
                maxLength: 8,
                onChanged: _handleCepChanged,
                validator: (value) {
                  final cep = (value ?? '').replaceAll(RegExp(r'[^0-9]'), '');
                  return cep.length == 8 ? null : 'CEP obrigatório';
                },
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: TextFormField(
                controller: _numberController,
                decoration: _buildInputDecoration('Número *'),
                keyboardType: TextInputType.text,
                validator: (value) => value == null || value.trim().isEmpty ? 'Número obrigatório' : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _addressController,
          decoration: _buildInputDecoration('Rua / endereço *'),
          validator: (value) => value == null || value.trim().isEmpty ? 'Endereço obrigatório' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _complementController,
          decoration: _buildInputDecoration('Complemento'),
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _neighborhoodController,
          decoration: _buildInputDecoration('Bairro *'),
          validator: (value) => value == null || value.trim().isEmpty ? 'Bairro obrigatório' : null,
        ),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextFormField(
                controller: _cityController,
                decoration: _buildInputDecoration('Cidade *'),
                validator: (value) => value == null || value.trim().isEmpty ? 'Cidade obrigatória' : null,
              ),
            ),
            const SizedBox(width: 16),
            SizedBox(
              width: 90,
              child: TextFormField(
                controller: _stateController,
                decoration: _buildInputDecoration('UF *').copyWith(counterText: ''),
                maxLength: 2,
                textCapitalization: TextCapitalization.characters,
                validator: (value) => value == null || value.trim().length != 2 ? 'UF obrigatória' : null,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSpecialtiesGrid() {
    final categories = MechanicSpecialty.getCategories();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: categories.map((category) {
        final specialties = MechanicSpecialty.getByCategory(category);

        return Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                category,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: context.textPrimary,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: specialties.map((specialty) {
                  final isSelected = _selectedSpecialties.any((item) => item.id == specialty.id);

                  return FilterChip(
                    label: Text(
                      specialty.name,
                      style: TextStyle(
                        color: isSelected ? Colors.white : context.primary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    selected: isSelected,
                    onSelected: (_) => _toggleSpecialty(specialty),
                    selectedColor: context.primary,
                    checkmarkColor: Colors.white,
                    backgroundColor: context.surface,
                    side: BorderSide(
                      color: isSelected ? context.primary : context.border,
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }

  Widget _buildInfoCard({required String title, required String message}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.primary.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: context.primary,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: context.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
        color: context.textPrimary,
        fontWeight: FontWeight.bold,
      ),
    );
  }

  InputDecoration _buildInputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: context.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: context.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: context.primary),
      ),
      filled: true,
      fillColor: context.surface,
    );
  }
}

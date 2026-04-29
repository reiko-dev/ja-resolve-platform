import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/providers/partner_provider.dart';
import '../../../services/cep_service.dart';
import '../../../models/mechanic_specialty.dart';

class CompletePartnerRegistrationScreen extends StatefulWidget {
  final String partnerType;
  
  const CompletePartnerRegistrationScreen({super.key, required this.partnerType});

  @override
  State<CompletePartnerRegistrationScreen> createState() => _CompletePartnerRegistrationScreenState();
}

class _CompletePartnerRegistrationScreenState extends State<CompletePartnerRegistrationScreen> {
  final ImagePicker _imagePicker = ImagePicker();
  
  // Controladores para formulário
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
  
  // Estados
  bool _isLoading = false;
  bool _isLoadingCep = false;
  final Map<String, Map<String, dynamic>> _uploadedDocuments = {};
  List<String> _requiredDocumentTypes = [];
  List<MechanicSpecialty> _selectedSpecialties = [];
  bool _documentsRequired = false;

  @override
  void initState() {
    super.initState();
    _checkDocumentsRequired();
  }

  // Buscar CEP e preencher endereço
  Future<void> _buscarCep() async {
    final cep = _cepController.text.replaceAll(RegExp(r'[^0-9]'), '');
    
    if (cep.length != 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('CEP inválido'), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _isLoadingCep = true);
    
    try {
      final endereco = await CepService.buscarCep(cep);
      
      setState(() {
        _addressController.text = endereco['logradouro'] ?? '';
        _numberController.text = ''; // Usuário deve informar
        _complementController.text = endereco['complemento'] ?? '';
        _neighborhoodController.text = endereco['bairro'] ?? '';
        _cityController.text = endereco['cidade'] ?? '';
        _stateController.text = endereco['uf'] ?? '';
        _isLoadingCep = false;
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Endereço encontrado com sucesso!'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      setState(() => _isLoadingCep = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao buscar CEP: ${e.toString()}'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  // Alternar seleção de especialidade
  void _toggleSpecialty(MechanicSpecialty specialty) {
    setState(() {
      if (_selectedSpecialties.contains(specialty)) {
        _selectedSpecialties.remove(specialty);
      } else {
        _selectedSpecialties.add(specialty);
      }
    });
  }

  void _checkDocumentsRequired() {
    final requiredDocs = _getRequiredDocuments(widget.partnerType);
    setState(() {
      _documentsRequired = requiredDocs.isNotEmpty;
      _requiredDocumentTypes = requiredDocs;
    });
  }

  List<String> _getRequiredDocuments(String partnerType) {
    switch (partnerType.toLowerCase()) {
      case 'mechanic':
        return [];
      case 'gasstation':
        return ['cnpj', 'address_proof', 'business_license'];
      case 'autoparts':
        return ['cnpj', 'address_proof', 'business_license'];
      case 'towtruck':
        return ['cpf', 'cnh', 'vehicle_document', 'address_proof'];
      case 'delivery':
        return ['cpf', 'cnh', 'vehicle_document', 'address_proof'];
      default:
        return [];
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      appBar: AppBar(
        title: Text('Completar Cadastro - ${_getPartnerTypeDisplayName(widget.partnerType)}'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/partner-type-selection'),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Text(
              'Complete seu cadastro',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: context.textPrimary,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Precisamos de algumas informações adicionais para configurar seu perfil de ${_getPartnerTypeDisplayName(widget.partnerType)}',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: context.textSecondary,
              ),
            ),
            
            const SizedBox(height: 32),
            
            // Form content based on partner type
            Expanded(
              child: _buildFormContent(context, widget.partnerType),
            ),
            
            // Complete button
            Consumer<PartnerProvider>(
              builder: (context, partnerProvider, child) {
                return Column(
                  children: [
                    if (partnerProvider.error != null)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: context.error.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: context.error.withOpacity(0.3)),
                        ),
                        child: Text(
                          partnerProvider.error!,
                          style: TextStyle(color: context.error),
                        ),
                      ),
                    
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: partnerProvider.isLoading ? null : _handleCompleteRegistration,
                        child: partnerProvider.isLoading
                            ? const CircularProgressIndicator(color: Colors.white)
                            : const Text('Completar Cadastro'),
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildFormContent(BuildContext context, String partnerType) {
    switch (partnerType.toLowerCase()) {
      case 'mechanic':
        return _buildMechanicForm(context);
      case 'gasstation':
        return _buildGasStationForm(context);
      case 'autoparts':
        return _buildAutoPartsForm(context);
      case 'towtruck':
        return _buildTowTruckForm(context);
      case 'delivery':
        return _buildDeliveryForm(context);
      default:
        return const Center(
          child: Text('Tipo de parceiro não reconhecido'),
        );
    }
  }

  Widget _buildMechanicForm(BuildContext context) {
  return Column(
    children: [
      // Informações básicas
      _buildSectionTitle('Informações da Oficina'),
      const SizedBox(height: 16),
      TextFormField(
        controller: _companyNameController,
        decoration: _buildInputDecoration('Nome da Oficina'),
        validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
      ),
      const SizedBox(height: 16),
      TextFormField(
        controller: _phoneController,
        decoration: _buildInputDecoration('Telefone'),
        keyboardType: TextInputType.phone,
        validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
      ),
      
      // Endereço com CEP automático
      const SizedBox(height: 24),
      _buildSectionTitle('Endereço'),
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            flex: 2,
            child: TextFormField(
              controller: _cepController,
              decoration: _buildInputDecoration('CEP *').copyWith(
                suffixIcon: _isLoadingCep 
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : IconButton(
                      icon: const Icon(Icons.search),
                      onPressed: _buscarCep,
                    ),
              ),
              keyboardType: TextInputType.number,
              maxLength: 8,
              validator: (value) => value?.isEmpty ?? true ? 'CEP obrigatório' : null,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: TextFormField(
              controller: _numberController,
              decoration: _buildInputDecoration('Número *'),
              keyboardType: TextInputType.number,
              validator: (value) => value?.isEmpty ?? true ? 'Número obrigatório' : null,
            ),
          ),
        ],
      ),
      const SizedBox(height: 16),
      TextFormField(
        controller: _addressController,
        decoration: _buildInputDecoration('Endereço *'),
        maxLines: 2,
        validator: (value) => value?.isEmpty ?? true ? 'Endereço obrigatório' : null,
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
        validator: (value) => value?.isEmpty ?? true ? 'Bairro obrigatório' : null,
      ),
      const SizedBox(height: 16),
      Row(
        children: [
          Expanded(
            child: TextFormField(
              controller: _cityController,
              decoration: _buildInputDecoration('Cidade *'),
              validator: (value) => value?.isEmpty ?? true ? 'Cidade obrigatória' : null,
            ),
          ),
          const SizedBox(width: 16),
          SizedBox(
            width: 80,
            child: TextFormField(
              controller: _stateController,
              decoration: _buildInputDecoration('UF *'),
              maxLength: 2,
              textCapitalization: TextCapitalization.characters,
              validator: (value) => value?.isEmpty ?? true ? 'UF obrigatória' : null,
            ),
          ),
        ],
      ),
      
      // Especialidades
      const SizedBox(height: 24),
      _buildSectionTitle('Especialidades'),
      const SizedBox(height: 8),
      Text(
        'Selecione suas especialidades (mínimo 1):',
        style: TextStyle(
          fontSize: 14,
          color: context.textSecondary,
        ),
      ),
      const SizedBox(height: 16),
      _buildSpecialtiesGrid(),
    ],
  );
  }

  Widget _buildSpecialtiesGrid() {
    final categories = MechanicSpecialty.getCategories();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: categories.map((category) {
        final specialties = MechanicSpecialty.getByCategory(category);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 8),
              child: Text(
                category,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: context.textPrimary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: specialties.map((s) {
                final selected = _selectedSpecialties.contains(s);
                return FilterChip(
                  label: Text(s.name),
                  selected: selected,
                  onSelected: (_) => _toggleSpecialty(s),
                );
              }).toList(),
            ),
          ],
        );
      }).toList(),
    );
  }

  Widget _buildGasStationForm(BuildContext context) {
    return Column(
      children: [
        _buildSectionTitle('Informações do Posto'),
        const SizedBox(height: 16),
        TextFormField(
          controller: _tradeNameController,
          decoration: _buildInputDecoration('Nome Fantasia *'),
          validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _cnpjController,
          decoration: _buildInputDecoration('CNPJ *'),
          keyboardType: TextInputType.number,
          validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _phoneController,
          decoration: _buildInputDecoration('Telefone *'),
          keyboardType: TextInputType.phone,
          validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
        ),
        const SizedBox(height: 16),
        TextFormField(
          controller: _addressController,
          decoration: _buildInputDecoration('Endereço *'),
          maxLines: 2,
          validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
        ),
        const SizedBox(height: 24),
        if (_documentsRequired) ...[
          _buildSectionTitle('Documentos obrigatórios'),
          const SizedBox(height: 16),
          TextFormField(
            controller: _companyNameController,
            decoration: _buildInputDecoration('Nome do Posto *'),
            validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _tradeNameController,
            decoration: _buildInputDecoration('Nome Fantasia'),
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _cnpjController,
            decoration: _buildInputDecoration('CNPJ *'),
            keyboardType: TextInputType.number,
            validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _phoneController,
            decoration: _buildInputDecoration('Telefone *'),
            keyboardType: TextInputType.phone,
            validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _addressController,
            decoration: _buildInputDecoration('Endereço *'),
            maxLines: 2,
            validator: (value) => value?.isEmpty ?? true ? 'Campo obrigatório' : null,
          ),
          if (_documentsRequired) ...[
            const SizedBox(height: 24),
            _buildSectionTitle('Documentos Obrigatórios'),
            const SizedBox(height: 16),
            _buildDocumentUploadSection(context),
          ],
        ],
      ],
    );
  }

  Widget _buildAutoPartsForm(BuildContext context) {
    return Column(
      children: [
        Text(
          'Formulário de Auto Peças',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: context.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Em desenvolvimento: Categorias, marcas, estoque, etc.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: context.textSecondary,
          ),
        ),
      ],
    );
  }
  
  Widget _buildTowTruckForm(BuildContext context) {
    return Column(
      children: [
        Text(
          'Formulário de Guincho',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: context.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Em desenvolvimento: Tipo de guincho, capacidade, área, etc.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: context.textSecondary,
          ),
        ),
      ],
    );
  }
  
  Widget _buildDeliveryForm(BuildContext context) {
    return Column(
      children: [
        Text(
          'Formulário de Motoboy',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: context.textPrimary,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Em desenvolvimento: Tipo de veículo, capacidade, área, etc.',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: context.textSecondary,
          ),
        ),
      ],
    );
  }
  
  void _handleCompleteRegistration() async {
    // TODO: Implementar lógica de completar cadastro
    // Por enquanto, apenas mostra mensagem e navega
    // Simular sucesso
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Cadastro de ${_getPartnerTypeDisplayName(widget.partnerType)} completado com sucesso!'),
        backgroundColor: context.success,
      ),
    );
    
    // Navegar para dashboard
    context.go('/');
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

  // Métodos auxiliares
  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          color: context.textPrimary,
          fontWeight: FontWeight.bold,
        ),
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
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: context.primary),
      ),
      filled: true,
      fillColor: context.surface,
    );
  }

  Widget _buildDocumentUploadSection(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Envie os documentos obrigatórios:',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: context.textSecondary,
          ),
        ),
        const SizedBox(height: 16),
        ..._requiredDocumentTypes.map((docType) => _buildDocumentItem(docType)),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: _isLoading ? null : () => _uploadDocuments(),
            icon: _isLoading 
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.upload_file),
            label: Text(_isLoading ? 'Enviando...' : 'Enviar Documentos'),
            style: ElevatedButton.styleFrom(
              backgroundColor: context.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDocumentItem(String docType) {
    final isUploaded = _uploadedDocuments.containsKey(docType);
    final docName = _getDocumentDisplayName(docType);
    
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isUploaded ? context.success : context.border,
        ),
      ),
      child: Row(
        children: [
          Icon(
            isUploaded ? Icons.check_circle : Icons.description,
            color: isUploaded ? context.success : context.textSecondary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  docName,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: context.textPrimary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (isUploaded)
                  Text(
                    'Documento enviado',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: context.success,
                    ),
                  ),
              ],
            ),
          ),
          if (!isUploaded)
            IconButton(
              onPressed: () => _pickDocument(docType),
              icon: const Icon(Icons.camera_alt),
              tooltip: 'Enviar documento',
            ),
        ],
      ),
    );
  }

  String _getDocumentDisplayName(String docType) {
    switch (docType) {
      case 'cpf':
        return 'CPF';
      case 'cnpj':
        return 'CNPJ';
      case 'cnh':
        return 'CNH';
      case 'vehicle_document':
        return 'Documento do Veículo';
      case 'address_proof':
        return 'Comprovante de Residência';
      case 'business_license':
        return 'Licença de Funcionamento';
      default:
        return docType;
    }
  }

  Future<void> _pickDocument(String docType) async {
    try {
      final XFile? image = await _imagePicker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
      );
      
      if (image != null) {
        setState(() {
          _uploadedDocuments[docType] = {
            'file': image,
            'name': image.name,
            'type': docType,
          };
        });
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erro ao selecionar documento: $e'),
          backgroundColor: context.error,
        ),
      );
    }
  }

  Future<void> _uploadDocuments() async {
    if (_uploadedDocuments.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Selecione pelo menos um documento'),
          backgroundColor: context.error,
        ),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      // TODO: Implementar upload real para a API
      await Future.delayed(const Duration(seconds: 2)); // Simulação
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Documentos enviados com sucesso!'),
            backgroundColor: context.success,
          ),
        );
        
        // Navegar para dashboard ou tela de espera
        context.go('/');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erro ao enviar documentos: $e'),
            backgroundColor: context.error,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}

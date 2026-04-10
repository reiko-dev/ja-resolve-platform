import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class StoreRegistrationScreen extends StatefulWidget {
  const StoreRegistrationScreen({super.key});

  @override
  State<StoreRegistrationScreen> createState() => _StoreRegistrationScreenState();
}

class _StoreRegistrationScreenState extends State<StoreRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _businessNameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _phoneController = TextEditingController();
  final _whatsappController = TextEditingController();
  final _addressController = TextEditingController();
  final _websiteController = TextEditingController();
  final _instagramController = TextEditingController();
  final _minOrderValueController = TextEditingController();
  final _deliveryTimeController = TextEditingController();
  
  final List<String> _selectedCategories = [];
  final List<String> _selectedPaymentMethods = [];
  final Map<String, bool> _workingHours = {};
  bool _hasDelivery = false;
  bool _isOnlineStore = true;
  double _deliveryRadius = 15.0;
  bool _isLoading = false;

  final List<String> _categories = [
    'Peças Automotivas',
    'Acessórios',
    'Pneus e Rodas',
    'Óleos e Fluidos',
    'Ferramentas',
    'Equipamentos',
    'Segurança',
    'Limpeza Automotiva',
    'Som e Eletrônicos',
    'Iluminação',
    'Suspensão',
    'Freios',
  ];

  final List<String> _paymentMethods = [
    'Dinheiro',
    'PIX',
    'Cartão de Débito',
    'Cartão de Crédito',
    'Transferência',
    'Boleto',
    'Parcelado',
  ];

  @override
  void initState() {
    super.initState();
    _initializeWorkingHours();
  }

  void _initializeWorkingHours() {
    final days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    for (String day in days) {
      _workingHours[day] = day != 'Domingo';
    }
  }

  @override
  void dispose() {
    _businessNameController.dispose();
    _descriptionController.dispose();
    _phoneController.dispose();
    _whatsappController.dispose();
    _addressController.dispose();
    _websiteController.dispose();
    _instagramController.dispose();
    _minOrderValueController.dispose();
    _deliveryTimeController.dispose();
    super.dispose();
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedCategories.isEmpty) {
      _showErrorDialog('Selecione pelo menos uma categoria de produtos');
      return;
    }
    if (_selectedPaymentMethods.isEmpty) {
      _showErrorDialog('Selecione pelo menos um método de pagamento');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // TODO: Implementar chamada para API
      await Future.delayed(const Duration(seconds: 2)); // Simulação
      
      if (mounted) {
        _showSuccessDialog();
      }
    } catch (e) {
      if (mounted) {
        _showErrorDialog('Erro ao cadastrar: $e');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _showErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Text(
          'Erro',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          message,
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(
              'OK',
              style: GoogleFonts.poppins(
                color: const Color(0xFF38A169),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF2A2A2A),
        title: Row(
          children: [
            Icon(Icons.check_circle, color: Colors.green),
            const SizedBox(width: 12),
            Text(
              'Sucesso!',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        content: Text(
          'Cadastro realizado com sucesso! Aguarde a aprovação da administração.',
          style: GoogleFonts.poppins(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pushReplacementNamed(context, '/login');
            },
            child: Text(
              'Continuar',
              style: GoogleFonts.poppins(
                color: const Color(0xFF38A169),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A1A1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF38A169),
        foregroundColor: Colors.white,
        title: Text(
          'Cadastro de Lojista',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Informações Básicas
              _buildSectionTitle('Informações da Loja'),
              const SizedBox(height: 16),
              
              TextFormField(
                controller: _businessNameController,
                style: GoogleFonts.poppins(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Nome da Loja/Estabelecimento',
                  labelStyle: GoogleFonts.poppins(color: Colors.white70),
                  prefixIcon: const Icon(Icons.store, color: Colors.white70),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white30),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF38A169)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite o nome da loja';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              
              TextFormField(
                controller: _descriptionController,
                maxLines: 3,
                style: GoogleFonts.poppins(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Descrição dos Produtos/Serviços',
                  labelStyle: GoogleFonts.poppins(color: Colors.white70),
                  prefixIcon: const Icon(Icons.description, color: Colors.white70),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white30),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF38A169)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite uma descrição';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              
              // Contato
              _buildSectionTitle('Contato'),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _phoneController,
                      keyboardType: TextInputType.phone,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Telefone',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.phone, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF38A169)),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Digite o telefone';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _whatsappController,
                      keyboardType: TextInputType.phone,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'WhatsApp',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.chat, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF38A169)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              
              TextFormField(
                controller: _addressController,
                maxLines: 2,
                style: GoogleFonts.poppins(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Endereço da Loja',
                  labelStyle: GoogleFonts.poppins(color: Colors.white70),
                  prefixIcon: const Icon(Icons.location_on, color: Colors.white70),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white30),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF38A169)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite o endereço';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              
              // Redes Sociais
              _buildSectionTitle('Redes Sociais (Opcional)'),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _websiteController,
                      keyboardType: TextInputType.url,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Website',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.language, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF38A169)),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _instagramController,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Instagram',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.camera_alt, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFF38A169)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // Categorias de Produtos
              _buildSectionTitle('Categorias de Produtos'),
              const SizedBox(height: 16),
              _buildCategoriesGrid(),
              const SizedBox(height: 24),
              
              // Métodos de Pagamento
              _buildSectionTitle('Métodos de Pagamento'),
              const SizedBox(height: 16),
              _buildPaymentMethodsGrid(),
              const SizedBox(height: 24),
              
              // Configurações de Entrega
              _buildDeliverySettings(),
              const SizedBox(height: 24),
              
              // Configurações da Loja
              _buildStoreSettings(),
              const SizedBox(height: 32),
              
              // Botão de Cadastro
              ElevatedButton(
                onPressed: _isLoading ? null : _submitRegistration,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF38A169),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: _isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : Text(
                        'Cadastrar como Lojista',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: GoogleFonts.poppins(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: const Color(0xFF38A169),
      ),
    );
  }

  Widget _buildCategoriesGrid() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _categories.map((category) {
        final isSelected = _selectedCategories.contains(category);
        return FilterChip(
          label: Text(
            category,
            style: GoogleFonts.poppins(
              color: isSelected ? Colors.white : const Color(0xFF38A169),
              fontSize: 12,
            ),
          ),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _selectedCategories.add(category);
              } else {
                _selectedCategories.remove(category);
              }
            });
          },
          selectedColor: const Color(0xFF38A169),
          checkmarkColor: Colors.white,
          backgroundColor: Colors.transparent,
          side: BorderSide(
            color: isSelected ? const Color(0xFF38A169) : Colors.white30,
          ),
        );
      }).toList(),
    );
  }

  Widget _buildPaymentMethodsGrid() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _paymentMethods.map((method) {
        final isSelected = _selectedPaymentMethods.contains(method);
        return FilterChip(
          label: Text(
            method,
            style: GoogleFonts.poppins(
              color: isSelected ? Colors.white : const Color(0xFF38A169),
              fontSize: 12,
            ),
          ),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _selectedPaymentMethods.add(method);
              } else {
                _selectedPaymentMethods.remove(method);
              }
            });
          },
          selectedColor: const Color(0xFF38A169),
          checkmarkColor: Colors.white,
          backgroundColor: Colors.transparent,
          side: BorderSide(
            color: isSelected ? const Color(0xFF38A169) : Colors.white30,
          ),
        );
      }).toList(),
    );
  }

  Widget _buildDeliverySettings() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Configurações de Entrega'),
        const SizedBox(height: 16),
        
        CheckboxListTile(
          title: Text(
            'Oferece Entrega',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
          subtitle: Text(
            'Marque se sua loja oferece serviço de entrega',
            style: GoogleFonts.poppins(
              color: Colors.white70,
              fontSize: 12,
            ),
          ),
          value: _hasDelivery,
          onChanged: (value) => setState(() => _hasDelivery = value ?? false),
          activeColor: const Color(0xFF38A169),
          checkColor: Colors.white,
        ),
        
        if (_hasDelivery) ...[
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _minOrderValueController,
                  keyboardType: TextInputType.number,
                  style: GoogleFonts.poppins(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Valor Mínimo (R\$)',
                    labelStyle: GoogleFonts.poppins(color: Colors.white70),
                    prefixIcon: const Icon(Icons.attach_money, color: Colors.white70),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Colors.white30),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF38A169)),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: TextFormField(
                  controller: _deliveryTimeController,
                  keyboardType: TextInputType.number,
                  style: GoogleFonts.poppins(color: Colors.white),
                  decoration: InputDecoration(
                    labelText: 'Tempo (min)',
                    labelStyle: GoogleFonts.poppins(color: Colors.white70),
                    prefixIcon: const Icon(Icons.access_time, color: Colors.white70),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Colors.white30),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF38A169)),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildDeliveryRadius(),
        ],
      ],
    );
  }

  Widget _buildDeliveryRadius() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Raio de Entrega: ${_deliveryRadius.toInt()} km',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 8),
        Slider(
          value: _deliveryRadius,
          min: 5,
          max: 50,
          divisions: 9,
          activeColor: const Color(0xFF38A169),
          inactiveColor: Colors.white30,
          onChanged: (value) {
            setState(() {
              _deliveryRadius = value;
            });
          },
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '5 km',
              style: GoogleFonts.poppins(
                color: Colors.white70,
                fontSize: 12,
              ),
            ),
            Text(
              '50 km',
              style: GoogleFonts.poppins(
                color: Colors.white70,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStoreSettings() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle('Configurações da Loja'),
        const SizedBox(height: 16),
        
        CheckboxListTile(
          title: Text(
            'Loja Online',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
          subtitle: Text(
            'Sua loja tem presença online',
            style: GoogleFonts.poppins(
              color: Colors.white70,
              fontSize: 12,
            ),
          ),
          value: _isOnlineStore,
          onChanged: (value) => setState(() => _isOnlineStore = value ?? false),
          activeColor: const Color(0xFF38A169),
          checkColor: Colors.white,
        ),
      ],
    );
  }
}

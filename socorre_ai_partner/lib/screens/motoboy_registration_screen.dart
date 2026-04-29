import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class MotoboyRegistrationScreen extends StatefulWidget {
  const MotoboyRegistrationScreen({super.key});

  @override
  State<MotoboyRegistrationScreen> createState() => _MotoboyRegistrationScreenState();
}

class _MotoboyRegistrationScreenState extends State<MotoboyRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _whatsappController = TextEditingController();
  final _addressController = TextEditingController();
  final _cnhNumberController = TextEditingController();
  final _cnhCategoryController = TextEditingController();
  final _licensePlateController = TextEditingController();
  final _deliveryFeeController = TextEditingController();
  final _experienceController = TextEditingController();
  
  final List<String> _selectedDeliveryTypes = [];
  final Map<String, bool> _workingHours = {};
  String _vehicleType = 'moto';
  String _cnhCategory = 'A';
  bool _isAvailable = true;
  double _serviceRadius = 15.0;
  bool _isLoading = false;

  final List<String> _deliveryTypes = [
    'Combustível',
    'Peças Automotivas',
    'Documentos',
    'Encomendas',
    'Medicamentos',
    'Alimentos',
    'Produtos Diversos',
    'Entrega Expressa',
  ];

  final List<String> _vehicleTypes = [
    'Moto',
    'Carro',
    'Van',
  ];

  final List<String> _cnhCategories = [
    'A',
    'B',
    'AB',
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
    _nameController.dispose();
    _phoneController.dispose();
    _whatsappController.dispose();
    _addressController.dispose();
    _cnhNumberController.dispose();
    _cnhCategoryController.dispose();
    _licensePlateController.dispose();
    _deliveryFeeController.dispose();
    _experienceController.dispose();
    super.dispose();
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedDeliveryTypes.isEmpty) {
      _showErrorDialog('Selecione pelo menos um tipo de entrega');
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
                color: const Color(0xFFED8936),
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
                color: const Color(0xFFED8936),
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
        backgroundColor: const Color(0xFFED8936),
        foregroundColor: Colors.white,
        title: Text(
          'Cadastro de Motoboy',
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
              // Informações Pessoais
              _buildSectionTitle('Informações Pessoais'),
              const SizedBox(height: 16),
              
              TextFormField(
                controller: _nameController,
                style: GoogleFonts.poppins(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Nome Completo',
                  labelStyle: GoogleFonts.poppins(color: Colors.white70),
                  prefixIcon: const Icon(Icons.person, color: Colors.white70),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white30),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFFED8936)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite seu nome completo';
                  }
                  return null;
                },
              ),
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
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
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
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
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
                  labelText: 'Endereço Residencial',
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
                    borderSide: const BorderSide(color: Color(0xFFED8936)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite seu endereço';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 24),
              
              // Documentos
              _buildSectionTitle('Documentos'),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _cnhNumberController,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Número da CNH',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.credit_card, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Digite o número da CNH';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _cnhCategory,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Categoria CNH',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.drive_eta, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
                        ),
                      ),
                      dropdownColor: const Color(0xFF2A2A2A),
                      items: _cnhCategories.map((category) {
                        return DropdownMenuItem<String>(
                          value: category,
                          child: Text(
                            category,
                            style: GoogleFonts.poppins(color: Colors.white),
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _cnhCategory = value!;
                        });
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // Veículo
              _buildSectionTitle('Informações do Veículo'),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _vehicleType,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Tipo de Veículo',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.motorcycle, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
                        ),
                      ),
                      dropdownColor: const Color(0xFF2A2A2A),
                      items: _vehicleTypes.map((type) {
                        return DropdownMenuItem<String>(
                          value: type.toLowerCase(),
                          child: Text(
                            type,
                            style: GoogleFonts.poppins(color: Colors.white),
                          ),
                        );
                      }).toList(),
                      onChanged: (value) {
                        setState(() {
                          _vehicleType = value!;
                        });
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _licensePlateController,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Placa do Veículo',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.directions_car, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Digite a placa';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // Tipos de Entrega
              _buildSectionTitle('Tipos de Entrega'),
              const SizedBox(height: 16),
              _buildDeliveryTypesGrid(),
              const SizedBox(height: 24),
              
              // Configurações
              _buildSectionTitle('Configurações'),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _deliveryFeeController,
                      keyboardType: TextInputType.number,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Taxa de Entrega (R\$)',
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
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Digite a taxa de entrega';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _experienceController,
                      keyboardType: TextInputType.number,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Anos de Experiência',
                        labelStyle: GoogleFonts.poppins(color: Colors.white70),
                        prefixIcon: const Icon(Icons.work, color: Colors.white70),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Colors.white30),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: const BorderSide(color: Color(0xFFED8936)),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Digite os anos de experiência';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              // Raio de Atendimento
              _buildServiceRadius(),
              const SizedBox(height: 24),
              
              // Status de Disponibilidade
              _buildAvailabilityStatus(),
              const SizedBox(height: 32),
              
              // Botão de Cadastro
              ElevatedButton(
                onPressed: _isLoading ? null : _submitRegistration,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFED8936),
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
                        'Cadastrar como Motoboy',
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
        color: const Color(0xFFED8936),
      ),
    );
  }

  Widget _buildDeliveryTypesGrid() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _deliveryTypes.map((type) {
        final isSelected = _selectedDeliveryTypes.contains(type);
        return FilterChip(
          label: Text(
            type,
            style: GoogleFonts.poppins(
              color: isSelected ? Colors.white : const Color(0xFFED8936),
              fontSize: 12,
            ),
          ),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _selectedDeliveryTypes.add(type);
              } else {
                _selectedDeliveryTypes.remove(type);
              }
            });
          },
          selectedColor: const Color(0xFFED8936),
          checkmarkColor: Colors.white,
          backgroundColor: Colors.transparent,
          side: BorderSide(
            color: isSelected ? const Color(0xFFED8936) : Colors.white30,
          ),
        );
      }).toList(),
    );
  }

  Widget _buildServiceRadius() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Raio de Atendimento: ${_serviceRadius.toInt()} km',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 8),
        Slider(
          value: _serviceRadius,
          min: 5,
          max: 50,
          divisions: 9,
          activeColor: const Color(0xFFED8936),
          inactiveColor: Colors.white30,
          onChanged: (value) {
            setState(() {
              _serviceRadius = value;
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

  Widget _buildAvailabilityStatus() {
    return CheckboxListTile(
      title: Text(
        'Disponível para Trabalho',
        style: GoogleFonts.poppins(
          color: Colors.white,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        'Marque se você está disponível para receber pedidos',
        style: GoogleFonts.poppins(
          color: Colors.white70,
          fontSize: 12,
        ),
      ),
      value: _isAvailable,
      onChanged: (value) => setState(() => _isAvailable = value ?? false),
      activeColor: const Color(0xFFED8936),
      checkColor: Colors.white,
    );
  }
}

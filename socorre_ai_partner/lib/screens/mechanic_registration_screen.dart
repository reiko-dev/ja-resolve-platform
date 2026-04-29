import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/partner_service.dart';
import '../services/location_service.dart';

class MechanicRegistrationScreen extends StatefulWidget {
  const MechanicRegistrationScreen({super.key});

  @override
  State<MechanicRegistrationScreen> createState() => _MechanicRegistrationScreenState();
}

class _MechanicRegistrationScreenState extends State<MechanicRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _businessNameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _phoneController = TextEditingController();
  final _whatsappController = TextEditingController();
  final _addressController = TextEditingController();
  final _hourlyRateController = TextEditingController();
  final _experienceController = TextEditingController();
  
  final List<String> _selectedSpecialties = [];
  final List<String> _selectedServices = [];
  final Map<String, bool> _workingHours = {};
  bool _isEmergencyService = false;
  bool _isHomeService = false;
  bool _isWorkshopService = true;
  double _serviceRadius = 10.0;
  bool _isLoading = false;
  
  // Localização
  double? _currentLatitude;
  double? _currentLongitude;
  String _currentAddress = '';
  bool _isGettingLocation = false;

  final List<String> _specialties = [
    'Motor',
    'Sistema Elétrico',
    'Freios',
    'Suspensão',
    'Transmissão',
    'Ar Condicionado',
    'Injeção Eletrônica',
    'Diagnóstico',
    'Pneus',
    'Bateria',
    'Sistema de Escape',
    'Direção Hidráulica',
  ];

  final List<String> _services = [
    'Reparo de Emergência',
    'Manutenção Preventiva',
    'Diagnóstico Técnico',
    'Troca de Peças',
    'Revisão Completa',
    'Serviço de Guincho',
    'Atendimento 24h',
    'Garantia Estendida',
  ];

  @override
  void initState() {
    super.initState();
    _initializeWorkingHours();
    _getCurrentLocation();
  }

  void _initializeWorkingHours() {
    final days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    for (String day in days) {
      _workingHours[day] = day != 'Domingo';
    }
  }

  Future<void> _getCurrentLocation() async {
    setState(() {
      _isGettingLocation = true;
    });

    try {
      final position = await LocationService.getCurrentPosition();
      if (position != null) {
        setState(() {
          _currentLatitude = position.latitude;
          _currentLongitude = position.longitude;
          _currentAddress = LocationService.currentAddress;
        });
      } else {
        _showErrorDialog('Não foi possível obter sua localização. Verifique as permissões.');
      }
    } catch (e) {
      _showErrorDialog('Erro ao obter localização: $e');
    } finally {
      setState(() {
        _isGettingLocation = false;
      });
    }
  }

  @override
  void dispose() {
    _businessNameController.dispose();
    _descriptionController.dispose();
    _phoneController.dispose();
    _whatsappController.dispose();
    _addressController.dispose();
    _hourlyRateController.dispose();
    _experienceController.dispose();
    super.dispose();
  }

  Future<void> _submitRegistration() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedSpecialties.isEmpty) {
      _showErrorDialog('Selecione pelo menos uma especialidade');
      return;
    }
    if (_selectedServices.isEmpty) {
      _showErrorDialog('Selecione pelo menos um serviço');
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      // Obter token de autenticação
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString('auth_token');
      
      if (token == null || token.isEmpty) {
        _showErrorDialog('Token de autenticação não encontrado. Faça login novamente.');
        return;
      }

      // Verificar se temos localização
      if (_currentLatitude == null || _currentLongitude == null) {
        _showErrorDialog('Localização não encontrada. Tente obter sua localização novamente.');
        return;
      }

      // Chamada para API
      final result = await PartnerService.createMechanic(
        token: token,
        businessName: _businessNameController.text.trim(),
        description: _descriptionController.text.trim(),
        phone: _phoneController.text.trim(),
        whatsapp: _whatsappController.text.trim().isNotEmpty ? _whatsappController.text.trim() : null,
        address: _addressController.text.trim(),
        latitude: _currentLatitude!,
        longitude: _currentLongitude!,
        specialties: _selectedSpecialties,
        services: _selectedServices,
        hourlyRate: double.parse(_hourlyRateController.text),
        experienceYears: int.parse(_experienceController.text),
        serviceRadius: _serviceRadius,
        emergencyService: _isEmergencyService,
        homeService: _isHomeService,
        workshopService: _isWorkshopService,
      );
      
      if (mounted) {
        if (result['success']) {
          _showSuccessDialog();
        } else {
          _showErrorDialog(result['message']);
        }
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
                color: const Color(0xFF2B6CB0),
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
                color: const Color(0xFF2B6CB0),
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
        backgroundColor: const Color(0xFF2B6CB0),
        foregroundColor: Colors.white,
        title: Text(
          'Cadastro de Mecânico',
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
              _buildSectionTitle('Informações Básicas'),
              const SizedBox(height: 16),
              
              TextFormField(
                controller: _businessNameController,
                style: GoogleFonts.poppins(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Nome da Oficina/Estabelecimento',
                  labelStyle: GoogleFonts.poppins(color: Colors.white70),
                  prefixIcon: const Icon(Icons.business, color: Colors.white70),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white30),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite o nome da oficina';
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
                  labelText: 'Descrição dos Serviços',
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
                    borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
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
                          borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
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
                          borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
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
                  labelText: 'Endereço Completo',
                  labelStyle: GoogleFonts.poppins(color: Colors.white70),
                  prefixIcon: const Icon(Icons.location_on, color: Colors.white70),
                  suffixIcon: IconButton(
                    icon: _isGettingLocation 
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.my_location, color: Colors.white70),
                    onPressed: _isGettingLocation ? null : _getCurrentLocation,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white30),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
                  ),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Digite o endereço';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 8),
              
              // Mostrar localização atual
              if (_currentAddress.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF2A2A2A),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFF2B6CB0)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.gps_fixed, color: Color(0xFF2B6CB0), size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Localização atual: $_currentAddress',
                          style: GoogleFonts.poppins(
                            color: Colors.white70,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 24),
              
              // Especialidades
              _buildSectionTitle('Especialidades'),
              const SizedBox(height: 16),
              _buildSpecialtiesGrid(),
              const SizedBox(height: 24),
              
              // Serviços
              _buildSectionTitle('Serviços Oferecidos'),
              const SizedBox(height: 16),
              _buildServicesGrid(),
              const SizedBox(height: 24),
              
              // Configurações
              _buildSectionTitle('Configurações'),
              const SizedBox(height: 16),
              
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _hourlyRateController,
                      keyboardType: TextInputType.number,
                      style: GoogleFonts.poppins(color: Colors.white),
                      decoration: InputDecoration(
                        labelText: 'Taxa por Hora (R\$)',
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
                          borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Digite a taxa por hora';
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
                          borderSide: const BorderSide(color: Color(0xFF2B6CB0)),
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
              
              // Tipos de Serviço
              _buildServiceTypes(),
              const SizedBox(height: 24),
              
              // Raio de Atendimento
              _buildServiceRadius(),
              const SizedBox(height: 32),
              
              // Botão de Cadastro
              ElevatedButton(
                onPressed: _isLoading ? null : _submitRegistration,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2B6CB0),
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
                        'Cadastrar como Mecânico',
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
        color: const Color(0xFF2B6CB0),
      ),
    );
  }

  Widget _buildSpecialtiesGrid() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _specialties.map((specialty) {
        final isSelected = _selectedSpecialties.contains(specialty);
        return FilterChip(
          label: Text(
            specialty,
            style: GoogleFonts.poppins(
              color: isSelected ? Colors.white : const Color(0xFF2B6CB0),
              fontSize: 12,
            ),
          ),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _selectedSpecialties.add(specialty);
              } else {
                _selectedSpecialties.remove(specialty);
              }
            });
          },
          selectedColor: const Color(0xFF2B6CB0),
          checkmarkColor: Colors.white,
          backgroundColor: Colors.transparent,
          side: BorderSide(
            color: isSelected ? const Color(0xFF2B6CB0) : Colors.white30,
          ),
        );
      }).toList(),
    );
  }

  Widget _buildServicesGrid() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _services.map((service) {
        final isSelected = _selectedServices.contains(service);
        return FilterChip(
          label: Text(
            service,
            style: GoogleFonts.poppins(
              color: isSelected ? Colors.white : const Color(0xFF2B6CB0),
              fontSize: 12,
            ),
          ),
          selected: isSelected,
          onSelected: (selected) {
            setState(() {
              if (selected) {
                _selectedServices.add(service);
              } else {
                _selectedServices.remove(service);
              }
            });
          },
          selectedColor: const Color(0xFF2B6CB0),
          checkmarkColor: Colors.white,
          backgroundColor: Colors.transparent,
          side: BorderSide(
            color: isSelected ? const Color(0xFF2B6CB0) : Colors.white30,
          ),
        );
      }).toList(),
    );
  }

  Widget _buildServiceTypes() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Tipos de Serviço',
          style: GoogleFonts.poppins(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        _buildServiceTypeOption(
          'Serviço de Emergência',
          'Atendimento 24h para emergências',
          _isEmergencyService,
          (value) => setState(() => _isEmergencyService = value ?? false),
        ),
        _buildServiceTypeOption(
          'Serviço Domiciliar',
          'Atendimento na residência do cliente',
          _isHomeService,
          (value) => setState(() => _isHomeService = value ?? false),
        ),
        _buildServiceTypeOption(
          'Serviço na Oficina',
          'Atendimento na oficina',
          _isWorkshopService,
          (value) => setState(() => _isWorkshopService = value ?? false),
        ),
      ],
    );
  }

  Widget _buildServiceTypeOption(String title, String subtitle, bool value, Function(bool?) onChanged) {
    return CheckboxListTile(
      title: Text(
        title,
        style: GoogleFonts.poppins(
          color: Colors.white,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: GoogleFonts.poppins(
          color: Colors.white70,
          fontSize: 12,
        ),
      ),
      value: value,
      onChanged: onChanged,
      activeColor: const Color(0xFF2B6CB0),
      checkColor: Colors.white,
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
          activeColor: const Color(0xFF2B6CB0),
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
}

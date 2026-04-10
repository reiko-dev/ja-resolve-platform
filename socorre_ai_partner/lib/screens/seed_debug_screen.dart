import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/seed_service.dart';

class SeedDebugScreen extends StatefulWidget {
  const SeedDebugScreen({super.key});

  @override
  State<SeedDebugScreen> createState() => _SeedDebugScreenState();
}

class _SeedDebugScreenState extends State<SeedDebugScreen> {
  bool _isLoading = false;
  final List<Map<String, dynamic>> _results = [];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Criar Contas de Teste',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
        ),
        backgroundColor: Colors.blue[800],
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Botão para criar todas as contas
            ElevatedButton.icon(
              onPressed: _isLoading ? null : _createAllAccounts,
              icon: const Icon(Icons.person_add),
              label: Text(
                'Criar Todas as Contas',
                style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green[700],
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
            const SizedBox(height: 16),

            // Botões individuais para criar cada tipo
            ...[
              ('Mecânico', 'mechanic', Colors.orange),
              ('Posto de Combustível', 'gasstation', Colors.red),
              ('Auto Peças', 'autoparts', Colors.purple),
              ('Guincho', 'towtruck', Colors.blue),
              ('Motoboy', 'motoboy', Colors.teal),
            ].map((item) {
              final name = item.$1;
              final type = item.$2;
              final color = item.$3;

              return Column(
                children: [
                  ElevatedButton(
                    onPressed: _isLoading ? null : () => _createSingleAccount(type),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: color,
                      foregroundColor: Colors.white,
                    ),
                    child: Text(
                      'Criar $name',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w500),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              );
            }),

            const SizedBox(height: 24),

            // Loading indicator
            if (_isLoading)
              Column(
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text(
                    'Criando contas...',
                    style: GoogleFonts.poppins(fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),

            // Resultados
            if (_results.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text(
                'Resultados',
                style: GoogleFonts.poppins(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 12),
              ..._results.map((result) {
                final success = result['success'] ?? false;
                final type = result['type'] ?? 'Desconhecido';
                final message = result['message'] ?? result['error'] ?? 'Sem mensagem';

                return Card(
                  color: success ? Colors.green[50] : Colors.red[50],
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              success ? Icons.check_circle : Icons.cancel,
                              color: success ? Colors.green : Colors.red,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                type.toString().toUpperCase(),
                                style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600,
                                  color: success ? Colors.green[700] : Colors.red[700],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          message,
                          style: GoogleFonts.poppins(fontSize: 12),
                        ),
                        if (result['name'] != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Nome: ${result['name']}',
                            style: GoogleFonts.poppins(fontSize: 11),
                          ),
                        ],
                        if (result['email'] != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Email: ${result['email']}',
                            style: GoogleFonts.poppins(fontSize: 11),
                          ),
                        ],
                        if (result['password'] != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Senha: ${result['password']}',
                            style: GoogleFonts.poppins(fontSize: 11),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              }),
            ],

            const SizedBox(height: 24),

            // Credenciais de teste
            if (_results.isEmpty)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Credenciais de Teste',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 12),
                      ...SeedService.getAllTestCredentials().map((cred) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              cred['name']!,
                              style: GoogleFonts.poppins(
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                            Text(
                              'Email: ${cred['email']}',
                              style: GoogleFonts.poppins(fontSize: 11),
                            ),
                            Text(
                              'Senha: ${cred['password']}',
                              style: GoogleFonts.poppins(fontSize: 11),
                            ),
                            const SizedBox(height: 12),
                          ],
                        );
                      }),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _createAllAccounts() async {
    setState(() {
      _isLoading = true;
      _results.clear();
    });

    try {
      final results = await SeedService.createAllTestAccounts();
      setState(() {
        _results.addAll(results.values.cast<Map<String, dynamic>>());
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Contas criadas com sucesso!',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Erro: $e',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _createSingleAccount(String type) async {
    setState(() {
      _isLoading = true;
    });

    try {
      final data = SeedService.seedData[type];
      if (data == null) {
        throw Exception('Tipo de profissional não encontrado');
      }

      final result = await SeedService.createTestAccount(type, data);
      setState(() {
        _results.add(result);
      });

      if (mounted) {
        final success = result['success'] ?? false;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success ? 'Conta criada com sucesso!' : 'Erro ao criar conta',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Erro: $e',
              style: GoogleFonts.poppins(),
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
}

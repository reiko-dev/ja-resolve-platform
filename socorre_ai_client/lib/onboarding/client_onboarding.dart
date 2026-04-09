import 'package:flutter/material.dart';
import '../screens/dashboard_screen.dart';
import '../services/api_service.dart';

class ClientOnboardingScreen extends StatefulWidget {
  const ClientOnboardingScreen({super.key});

  @override
  _ClientOnboardingScreenState createState() => _ClientOnboardingScreenState();
}

class _ClientOnboardingScreenState extends State<ClientOnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _isLoading = false;

  final List<OnboardingPage> _pages = [
    OnboardingPage(
      title: 'Bem-vindo ao Socorre AI',
      description: 'Sua assistência automotiva 24h\nem poucos cliques!',
      image: 'assets/images/onboarding/welcome.png',
      buttonText: 'Começar',
    ),
    OnboardingPage(
      title: 'Como Funciona',
      description: '1. Solicite emergência\n2. Parceiros próximos são notificados\n3. Escolha o melhor profissional\n4. Serviço executado rapidamente',
      image: 'assets/images/onboarding/how_it_works.png',
      buttonText: 'Entendido',
    ),
    OnboardingPage(
      title: 'Tipos de Serviços',
      description: '• Emergência mecânica\n• Guincho 24h\n• Troca de pneus\n• Carga de bateria\n• Serviços de motoboy',
      image: 'assets/images/onboarding/services.png',
      buttonText: 'Conhecer Serviços',
    ),
    OnboardingPage(
      title: 'Solicitar Emergência',
      description: 'Toque no botão SOS\nDescreva seu problema\nEnvie fotos\nAguarde a proposta',
      image: 'assets/images/onboarding/emergency.png',
      buttonText: 'Praticar',
    ),
    OnboardingPage(
      title: 'Pagamentos Seguros',
      description: '• Múltiplas formas de pagamento\n• Carteira digital integrada\n• Comissão transparente\n• Saques via PIX\n• Histórico completo',
      image: 'assets/images/onboarding/payments.png',
      buttonText: 'Explorar',
    ),
    OnboardingPage(
      title: 'Dicas de Segurança',
      description: '• Verifique o perfil do parceiro\n• Compartilhe localização\n• Avalie o serviço\n• Guarante comprovantes',
      image: 'assets/images/onboarding/safety.png',
      buttonText: 'Estou Ciente',
    ),
    OnboardingPage(
      title: 'Tudo Pronto!',
      description: 'Socorre AI agora está\npronto para usar.\n\nToque para começar\nsua jornada!',
      image: 'assets/images/onboarding/ready.png',
      buttonText: 'Começar Agora',
      isLastPage: true,
    ),
  ];

  Future<void> _completeOnboarding() async {
    setState(() => _isLoading = true);
    
    try {
      // Marcar onboarding como completo
      await ApiService.updateUserOnboardingStatus(true);
      
      // Navegar para a tela principal
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => DashboardScreen()),
      );
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erro ao concluir onboarding')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.blue[50],
      body: SafeArea(
        child: Column(
          children: [
            // Header com progresso
            Container(
              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: LinearProgressIndicator(
                      value: (_currentPage + 1) / _pages.length,
                      backgroundColor: Colors.blue[100],
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.blue),
                    ),
                  ),
                  SizedBox(width: 20),
                  Text(
                    '${_currentPage + 1}/${_pages.length}',
                    style: TextStyle(
                      color: Colors.blue[700],
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  IconButton(
                    onPressed: () => _completeOnboarding(),
                    icon: Icon(Icons.close),
                    color: Colors.blue[700],
                  ),
                ],
              ),
            ),
            
            // Conteúdo do onboarding
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (int page) {
                  setState(() => _currentPage = page);
                },
                itemCount: _pages.length,
                itemBuilder: (BuildContext context, int index) {
                  final page = _pages[index];
                  return Padding(
                    padding: EdgeInsets.all(20),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Imagem ilustrativa
                        Container(
                          width: 200,
                          height: 200,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.1),
                                blurRadius: 10,
                                offset: Offset(0, 5),
                              ),
                            ],
                          ),
                          child: Image.asset(
                            page.image,
                            fit: BoxFit.contain,
                          ),
                        ),
                        
                        SizedBox(height: 30),
                        
                        // Título
                        Text(
                          page.title,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: Colors.blue[900],
                          ),
                        ),
                        
                        SizedBox(height: 15),
                        
                        // Descrição
                        Text(
                          page.description,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey[700],
                            height: 1.5,
                          ),
                        ),
                        
                        SizedBox(height: 40),
                        
                        // Botão
                        if (!page.isLastPage)
                          SizedBox(
                            width: double.infinity,
                            height: 50,
                            child: ElevatedButton(
                              onPressed: () {
                                if (_currentPage < _pages.length - 1) {
                                  _pageController.nextPage(
                                    duration: Duration(milliseconds: 300),
                                    curve: Curves.easeInOut,
                                  );
                                }
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.blue[600],
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(25),
                                ),
                                elevation: 5,
                              ),
                              child: Text(
                                page.buttonText,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          )
                        else
                          SizedBox(
                            width: double.infinity,
                            height: 50,
                            child: ElevatedButton(
                              onPressed: _completeOnboarding,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.green[600],
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(25),
                                ),
                                elevation: 5,
                              ),
                              child: _isLoading
                                  ? SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                      ),
                                    )
                                  : Text(
                                      'Começar Agora',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                            ),
                          ),
                      ],
                    ),
                  );
                },
              ),
            ),
            
            // Indicadores de página
            Container(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (int i = 0; i < _pages.length; i++)
                    Container(
                      width: 8,
                      height: 8,
                      margin: EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: i == _currentPage ? Colors.blue[600] : Colors.grey[300],
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class OnboardingPage {
  final String title;
  final String description;
  final String image;
  final String buttonText;
  final bool isLastPage;

  OnboardingPage({
    required this.title,
    required this.description,
    required this.image,
    required this.buttonText,
    this.isLastPage = false,
  });
}

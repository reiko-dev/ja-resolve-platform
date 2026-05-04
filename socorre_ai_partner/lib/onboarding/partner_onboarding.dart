import 'package:flutter/material.dart';
import 'package:socorre_ai_partner/screens/partner_dashboard_screen.dart';
import '../core/utils/partner_type_utils.dart';
import '../services/api_service.dart';

class PartnerOnboardingScreen extends StatefulWidget {
  final String partnerType; // mechanic, motoboy, gas_station, auto_parts, tow

  const PartnerOnboardingScreen({super.key, required this.partnerType});

  @override
  _PartnerOnboardingScreenState createState() => _PartnerOnboardingScreenState();
}

class _PartnerOnboardingScreenState extends State<PartnerOnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _isLoading = false;
  final Map<String, dynamic> _partnerData = {};

  String get _normalizedPartnerType => PartnerTypeUtils.normalize(widget.partnerType);

  List<OnboardingPage> _getPagesForType() {
    switch (_normalizedPartnerType) {
      case 'mechanic':
        return [
          OnboardingPage(
            title: 'Bem-vindo, Mecânico!',
            description: 'Sua oficina agora no Socorre AI\nReceba solicitações em tempo real',
            image: 'assets/images/onboarding/mechanic_welcome.png',
            buttonText: 'Avançar',
          ),
          OnboardingPage(
            title: 'Configure Seu Perfil',
            description: '• Nome da oficina\n• Especialidades\n• Horário de funcionamento\n• Serviços oferecidos',
            image: 'assets/images/onboarding/mechanic_profile.png',
            buttonText: 'Continuar',
          ),
          OnboardingPage(
            title: 'Documentos Necessários',
            description: '• CNH válida\n• Comprovante de residência\n• Certificados técnicos\n• Fotos da oficina',
            image: 'assets/images/onboarding/mechanic_docs.png',
            buttonText: 'Próximo',
          ),
          OnboardingPage(
            title: 'Assinatura Mensal',
            description:
                '• R\$ 49,90/mês\n• Receba solicitações ilimitadas\n• Cancelamento a qualquer momento\n• Suporte 24h',
            image: 'assets/images/onboarding/subscription.png',
            buttonText: 'Assinar',
          ),
          OnboardingPage(
            title: 'Como Funciona',
            description: '1. Cliente solicita serviço\n2. Você recebe notificação\n3. Aceite ou faça proposta\n4. Execute e seja pago',
            image: 'assets/images/onboarding/how_it_works.png',
            buttonText: 'Entendido',
          ),
          OnboardingPage(
            title: 'Pagamentos e Saques',
            description: '• Pagamentos diretos na carteira\n• Saques via PIX\n• Taxa de 10% da plataforma\n• Relatórios detalhados',
            image: 'assets/images/onboarding/payments.png',
            buttonText: 'Explorar',
          ),
          OnboardingPage(
            title: 'Tudo Pronto!',
            description: 'Sua oficina está pronta\npara receber clientes do Socorre AI!\n\nComece agora mesmo',
            image: 'assets/images/onboarding/ready.png',
            buttonText: 'Abrir Painel',
            isLastPage: true,
          ),
        ];
      
      case 'motoboy':
        return [
          OnboardingPage(
            title: 'Bem-vindo, Motoboy!',
            description: 'Entregas rápidas na sua região\nConectado ao Socorre AI',
            image: 'assets/images/onboarding/motoboy_welcome.png',
            buttonText: 'Avançar',
          ),
          OnboardingPage(
            title: 'Seus Dados',
            description: '• Nome completo\n• CNH e categoria\n• Dados da moto\n• Área de atendimento',
            image: 'assets/images/onboarding/motoboy_profile.png',
            buttonText: 'Continuar',
          ),
          OnboardingPage(
            title: 'Documentos',
            description: '• CNH (A ou AB)\n• CRLV da moto\n• Comprovante de residência\n• Fotos do veículo',
            image: 'assets/images/onboarding/motoboy_docs.png',
            buttonText: 'Próximo',
          ),
          OnboardingPage(
            title: 'Marketplace',
            description: '• Receba pedidos de entrega\n• Ganhe por corrida\n• Avalie os clientes\n• Defina sua taxa',
            image: 'assets/images/onboarding/marketplace.png',
            buttonText: 'Entendido',
          ),
          OnboardingPage(
            title: 'Pagamentos',
            description: '• Pagamentos na hora\n• Carteira digital\n• Saques via PIX\n• Histórico completo',
            image: 'assets/images/onboarding/payments.png',
            buttonText: 'Ver Painel',
            isLastPage: true,
          ),
        ];
      
      case 'gas_station':
        return [
          OnboardingPage(
            title: 'Bem-vindo, Posto!',
            description: 'Seu posto no Socorre AI\nVenda mais e tenha clientes fiéis',
            image: 'assets/images/onboarding/gas_station_welcome.png',
            buttonText: 'Avançar',
          ),
          OnboardingPage(
            title: 'Dados do Posto',
            description: '• Nome fantasia\n• CNPJ\n• Bandeira\n• Serviços disponíveis',
            image: 'assets/images/onboarding/gas_station_profile.png',
            buttonText: 'Continuar',
          ),
          OnboardingPage(
            title: 'Documentos',
            description: '• Alvará de funcionamento\n• CNPJ\n• Licenças ambientais\n• Comprovante de endereço',
            image: 'assets/images/onboarding/gas_station_docs.png',
            buttonText: 'Próximo',
          ),
          OnboardingPage(
            title: 'Assinatura Premium',
            description:
                '• R\$ 199,90/mês\n• Loja no app\n• Destaque nas buscas\n• Relatórios avançados',
            image: 'assets/images/onboarding/premium.png',
            buttonText: 'Assinar',
          ),
          OnboardingPage(
            title: 'Loja Integrada',
            description: '• Catálogo de produtos\n• Preços e estoque\n• Pedidos via app\n• Entrega programada',
            image: 'assets/images/onboarding/store.png',
            buttonText: 'Configurar',
          ),
          OnboardingPage(
            title: 'Comece Agora!',
            description: 'Seu posto está pronto\npara vender mais e melhorar!\n\nVamos começar',
            image: 'assets/images/onboarding/ready.png',
            buttonText: 'Abrir Loja',
            isLastPage: true,
          ),
        ];
      
      case 'auto_parts':
        return [
          OnboardingPage(
            title: 'Bem-vindo, Auto Peças!',
            description: 'Sua loja no Socorre AI\nVenda para todo o Brasil',
            image: 'assets/images/onboarding/auto_parts_welcome.png',
            buttonText: 'Avançar',
          ),
          OnboardingPage(
            title: 'Dados da Loja',
            description: '• Nome da loja\n• CNPJ\n• Especialidades\n• Formas de entrega',
            image: 'assets/images/onboarding/auto_parts_profile.png',
            buttonText: 'Continuar',
          ),
          OnboardingPage(
            title: 'Documentos',
            description: '• CNPJ\n• Alvará comercial\n• Licenças especiais\n• Comprovante de endereço',
            image: 'assets/images/onboarding/auto_parts_docs.png',
            buttonText: 'Próximo',
          ),
          OnboardingPage(
            title: 'Catálogo de Produtos',
            description: '• Cadastre seus produtos\n• Defina preços\n• Controle de estoque\n• Fotos profissionais',
            image: 'assets/images/onboarding/catalog.png',
            buttonText: 'Cadastrar',
          ),
          OnboardingPage(
            title: 'Delivery Inteligente',
            description: '• Receba pedidos pelo app\n• Entregue rapidamente\n• Rastreie em tempo real\n• Avaliações',
            image: 'assets/images/onboarding/delivery.png',
            buttonText: 'Configurar',
          ),
          OnboardingPage(
            title: 'Vender Mais!',
            description: 'Sua loja está pronta\npara vender muito mais!\n\nComece agora',
            image: 'assets/images/onboarding/ready.png',
            buttonText: 'Abrir Loja',
            isLastPage: true,
          ),
        ];
      
      case 'tow':
        return [
          OnboardingPage(
            title: 'Bem-vindo, Guincho!',
            description: 'Seu guincho no Socorre AI\nReceba as melhores solicitações',
            image: 'assets/images/onboarding/tow_welcome.png',
            buttonText: 'Avançar',
          ),
          OnboardingPage(
            title: 'Dados do Guincho',
            description: '• Nome da empresa\n• Tipo de guincho\n• Capacidade de carga\n• Área de atendimento',
            image: 'assets/images/onboarding/tow_profile.png',
            buttonText: 'Continuar',
          ),
          OnboardingPage(
            title: 'Documentos',
            description: '• CNH (C, D, E)\n• CRLV do guincho\n• Seguro do veículo\n• Alvará de funcionamento',
            image: 'assets/images/onboarding/tow_docs.png',
            buttonText: 'Próximo',
          ),
          OnboardingPage(
            title: 'Marketplace',
            description: '• Envie propostas competitivas\n• Cliente escolhe o melhor\n• Preços transparentes\n• Pagamento garantido',
            image: 'assets/images/onboarding/proposals.png',
            buttonText: 'Entendido',
          ),
          OnboardingPage(
            title: 'Como Funciona',
            description: '1. Cliente solicita guincho\n2. Você recebe notificação\n3. Envie sua proposta\n4. Cliente aceita',
            image: 'assets/images/onboarding/how_it_works.png',
            buttonText: 'Praticar',
          ),
          OnboardingPage(
            title: 'Comece Agora!',
            description: 'Seu guincho está pronto\npara receber solicitações!\n\nVamos começar',
            image: 'assets/images/onboarding/ready.png',
            buttonText: 'Abrir Painel',
            isLastPage: true,
          ),
        ];
      
      default:
        return [];
    }
  }

  Future<void> _completeOnboarding() async {
    setState(() => _isLoading = true);
    
    try {
      // Salvar dados do parceiro
      await ApiService.completePartnerOnboarding(_partnerData);
      
      // Navegar para o dashboard
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => PartnerDashboardScreen()),
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
    final pages = _getPagesForType();
    
    return Scaffold(
      backgroundColor: _getPrimaryColor().withOpacity(0.1),
      appBar: AppBar(
        backgroundColor: _getPrimaryColor(),
        elevation: 0,
        title: Text(
          'Configurar ${_getPartnerTypeName()}',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        actions: [
          TextButton(
            onPressed: () => _completeOnboarding(),
            child: Text(
              'Pular',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Progress indicator
            Container(
              padding: EdgeInsets.all(16),
              child: LinearProgressIndicator(
                value: (_currentPage + 1) / pages.length,
                backgroundColor: Colors.white,
                valueColor: AlwaysStoppedAnimation<Color>(_getPrimaryColor()),
              ),
            ),
            
            // Conteúdo principal
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (int page) {
                  setState(() => _currentPage = page);
                },
                itemCount: pages.length,
                itemBuilder: (BuildContext context, int index) {
                  final page = pages[index];
                  return Padding(
                    padding: EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Imagem principal
                        Container(
                          width: 250,
                          height: 250,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.1),
                                blurRadius: 15,
                                offset: Offset(0, 8),
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
                            fontSize: 28,
                            fontWeight: FontWeight.bold,
                            color: _getPrimaryColor(),
                          ),
                        ),
                        
                        SizedBox(height: 20),
                        
                        // Descrição
                        Text(
                          page.description,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 16,
                            color: Colors.grey[700],
                            height: 1.6,
                          ),
                        ),
                        
                        SizedBox(height: 40),
                        
                        // Botão de ação
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: ElevatedButton(
                            onPressed: () {
                              if (_currentPage < pages.length - 1) {
                                _pageController.nextPage(
                                  duration: Duration(milliseconds: 400),
                                  curve: Curves.easeInOut,
                                );
                              } else {
                                _completeOnboarding();
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _getPrimaryColor(),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(28),
                              ),
                              elevation: 8,
                              padding: EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                            ),
                            child: _isLoading
                                ? SizedBox(
                                    width: 24,
                                    height: 24,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 3,
                                      valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                                    ),
                                  )
                                : Text(
                                    page.buttonText,
                                    style: TextStyle(
                                      fontSize: 18,
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
                  for (int i = 0; i < pages.length; i++)
                    Container(
                      width: 10,
                      height: 10,
                      margin: EdgeInsets.symmetric(horizontal: 6),
                      decoration: BoxDecoration(
                        color: i == _currentPage ? _getPrimaryColor() : Colors.grey[300],
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

  Color _getPrimaryColor() {
    switch (_normalizedPartnerType) {
      case 'mechanic':
        return Colors.red[600]!;
      case 'motoboy':
        return Colors.blue[800]!;
      case 'gas_station':
        return Colors.orange[600]!;
      case 'auto_parts':
        return Colors.green[600]!;
      case 'tow':
        return Colors.purple[600]!;
      default:
        return Colors.blue[600]!;
    }
  }

  String _getPartnerTypeName() {
    switch (_normalizedPartnerType) {
      case 'mechanic':
        return 'Mecânico';
      case 'motoboy':
        return 'Motoboy';
      case 'gas_station':
        return 'Posto de Combustível';
      case 'auto_parts':
        return 'Auto Peças';
      case 'tow':
        return 'Guincho';
      default:
        return 'Parceiro';
    }
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

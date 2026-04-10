# socorre_ai_partner

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Lab: Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Cookbook: Useful Flutter samples](https://docs.flutter.dev/cookbook)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.

## Testes

### Contas de Teste (Seed)

Para facilitar o desenvolvimento e testes, existem 5 contas pré-configuradas para cada tipo de profissional:

| Profissional | Nome | Email | Senha |
|---|---|---|---|
| 🔧 **Mecânico** | João Mecânico | joao@mecanico.com | senha123456 |
| ⛽ **Posto de Combustível** | Maria Posto | maria@posto.com | senha123456 |
| 🔩 **Auto Peças** | Carlos Peças | carlos@pecas.com | senha123456 |
| 🚗 **Guincho** | Paulo Guincho | paulo@guincho.com | senha123456 |
| 🏍️ **Motoboy** | Diego Motoboy | diego@motoboy.com | senha123456 |

### Como Criar as Contas de Teste

1. **Via Interface (Recomendado):**
   - Navegue para a tela de debug: `/seed-debug`
   - Clique em "Criar Todas as Contas" para criar todas de uma vez
   - Ou clique nos botões individuais para criar uma por uma

2. **Via Código:**
   ```dart
   // Criar todas as contas
   final results = await SeedService.createAllTestAccounts();
   
   // Criar uma conta específica
   final result = await SeedService.createTestAccount('mechanic', SeedService.seedData['mechanic']!);
   
   // Fazer login com uma conta de teste
   final loginResult = await SeedService.loginTestAccount('mechanic');
   
   // Obter credenciais de teste
   final credentials = SeedService.getTestCredentials('mechanic');
   ```

### Arquivos Relacionados

- `lib/services/seed_service.dart` - Serviço de gerenciamento de contas de teste
- `lib/screens/seed_debug_screen.dart` - Interface para criar contas de teste

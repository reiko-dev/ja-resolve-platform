import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../services/onboarding_flow_service.dart';

class OnboardingReviewScreen extends StatefulWidget {
  const OnboardingReviewScreen({super.key});

  @override
  State<OnboardingReviewScreen> createState() => _OnboardingReviewScreenState();
}

class _OnboardingReviewScreenState extends State<OnboardingReviewScreen> {
  bool _isRefreshing = false;

  Future<void> _refreshStatus() async {
    setState(() => _isRefreshing = true);

    final nextRoute = await OnboardingFlowService.resolveInitialRoute();
    if (!mounted) {
      return;
    }

    setState(() => _isRefreshing = false);
    context.go(nextRoute);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.background,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Container(
              width: double.infinity,
              constraints: const BoxConstraints(maxWidth: 520),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: context.surface,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: context.border),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(
                      color: context.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Icon(
                      Icons.pending_actions_rounded,
                      size: 40,
                      color: context.primary,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    'Cadastro em análise',
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: context.textPrimary,
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Seus documentos foram enviados com sucesso. Agora seu acesso ao dashboard fica bloqueado até a aprovação do admin.',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: context.textSecondary,
                      height: 1.4,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: context.primary.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      'Você vai receber acesso assim que sua documentação for aprovada.',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: context.textPrimary,
                        fontWeight: FontWeight.w500,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: _isRefreshing ? null : _refreshStatus,
                      icon: _isRefreshing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Icon(Icons.refresh_rounded),
                      label: Text(_isRefreshing ? 'Atualizando...' : 'Atualizar status'),
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
}

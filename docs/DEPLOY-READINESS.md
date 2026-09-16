# Deploy readiness — Socorre AI

Status: código local validado; deploy externo pendente de infraestrutura.

## Validado localmente

- Todas as 42 migrations PostgreSQL sobem e fazem rollback em uma instância PostgreSQL temporária.
- Fluxos de autenticação e guincho passam nos testes focados: 14 suites, 118 testes; a suíte PostgreSQL E2E passa com ciclo HTTP e concorrência de aceite.
- Os dois apps Flutter passam `flutter analyze` (sem erros de compilação) e seus testes smoke.
- O script de deploy passa inspeção sintática e usa `pm2 delete ... || true` para substituir a instância anterior.

## Armazenamento privado de fotos

Fotos de coleta/entrega do Serviço de Guincho são gravadas em SERVICE_PHOTO_STORAGE_DIR (padrão de produção `/var/lib/socorre-ai/private/service-photos`), fora de `uploads/`, com modo 0700 preparado pela imagem Docker, pelo entrypoint, pelo PM2 (`ecosystem.config.js` e `ecosystem.homolog.config.js`) e pelos scripts de deploy. A leitura é exclusivamente pela API autenticada; sem a variável o upload responde 503, sem gravar parcialmente.

`nginx.production.conf` serve publicamente apenas `uploads/images/` (avatares legados). `uploads/documents` (RG/CNH/CRLV/comprovante) responde 404 e continua acessível somente pela API autenticada. Runbook: `docs/GUIA-DEPLOY-HOMOLOGACAO-HOSTINGER.md` seção 14.

## Pendências externas bloqueantes

Antes de executar `scripts/deploy-production.sh`, o operador precisa fornecer:

1. VPS acessível com permissões root e portas 22/80/443.
2. Domínios reais para substituir `yourdomain.com` em `nginx.production.conf` e emitir o certificado.
3. Segredos de produção fora do repositório (`JWT_SECRET`, banco, Redis, Firebase e gateways de pagamento).
4. Banco PostgreSQL, Redis e serviços de terceiros disponíveis no ambiente de produção.
5. Procedimento de smoke test pós-deploy e janela de rollback.

O deploy não foi executado nem publicado automaticamente: sem esses recursos, fazê-lo seria uma operação incompleta e potencialmente insegura.


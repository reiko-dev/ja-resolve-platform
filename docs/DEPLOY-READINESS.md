# Deploy readiness — Socorre AI

Status: código local validado no HEAD `1b2ccc3e`; deploy externo **não executado** — pendente de infraestrutura. É o único blocker operacional real, em HUMAN_REQUIRED; produção **não** validada.

## Validado localmente (estado atual, HEAD `1b2ccc3e`)

- **43 migrations** PostgreSQL aplicadas no runtime local (`knex migrate:list`: 43 completas, 0 pending). Historicamente, o conjunto anterior de 42 migrations subiu e fez rollback em instância PostgreSQL temporária, e a migration 045 (G2) foi exercitada em `latest/down/up/rollback/reapply`.
- Suíte completa do backend: **35 suites passed, 2 suites skipped** (os dois e2e PostgreSQL opt-in) e **550 testes passed, 9 skipped, exit 0** (pós-T6).
- Contrato Mobile ↔ Backend (E2E-010/E2E-011) implementado no packet T3 (`66d0d6fa`, merge `4ee4ec2b`): `tests/endpoints` + `tests/auth` + `tests/integration` = **241/241** no harness local.
- O aviso de open handle do Jest ("Jest did not exit...") foi eliminado no T6 (`53a3f0ce`, merge `1b2ccc3e`) com `destroy()` nos pools SQLite mockados de `g2PhotoContract` e `towHttp.transport` — ambas as suítes passam a encerrar naturalmente.
- Os dois apps Flutter passam `flutter analyze` (sem erros de compilação) e seus testes smoke — observação histórica de validação, não reexecutada nesta reconciliação.
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

O deploy não foi executado nem publicado automaticamente: sem esses recursos, fazê-lo seria uma operação incompleta e potencialmente insegura. Não existe receipt, hash de release, aprovação ou smoke de produção neste documento. A validação da instância externa segue pendente até que `/health` responda no commit `1b2ccc3e` com as migrations aplicadas.


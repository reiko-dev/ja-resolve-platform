# Evidência sanitizada — Platform Issue #2 (T1)

## Estado

Código local preparado; execução em infraestrutura externa ainda necessária.

## Evidências reproduzíveis

- `git grep` no estado atual não encontra credenciais SMTP hardcoded no site; o envio usa `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS` do ambiente.
- Arquivos `.env` reais estão ignorados e não fazem parte do estado versionado atual.
- `bash -n scripts/deploy-production.sh` passa.
- `bash -n scripts/preflight-production.sh` passa.
- O preflight exige `JWT_SECRET`, banco e `CORS_ORIGIN` sem placeholders antes do deploy.
- As 42 migrations PostgreSQL já foram executadas e revertidas em banco temporário.
- REST auth/tow e Socket.IO auth/tow passaram nos testes focados; E2E PostgreSQL validou ciclo e concorrência.

## Ações externas obrigatórias

1. Revogar e rotacionar qualquer SMTP, banco, JWT, Firebase ou gateway que tenha existido em commits antigos.
2. Executar GitGuardian no repositório remoto após a rotação. O agente não possui acesso ao painel GitGuardian.
3. Preencher domínio, certificado, secrets e endpoints reais no host de produção.
4. Executar o deploy controlado e guardar logs sanitizados de migrations, PM2, Nginx, REST, Socket.IO, uploads, CORS, rate limit e rollback.

Nenhum segredo ou valor de credencial é reproduzido neste documento.

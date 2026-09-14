# Evidência sanitizada — Platform Issue #3 (T2)

## Contrato publicado

Consultar [MOBILE-AUTH-TOW-CONTRACT-V1.md](../MOBILE-AUTH-TOW-CONTRACT-V1.md).

Endpoints auth canônicos:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/verify`
- `POST /api/auth/logout`

## Evidências reproduzíveis

- Cadastro e login retornam JWT em `data.token` e usuário em `data.user`.
- `GET /auth/verify` hidrata a sessão e rejeita token ausente, inválido, expirado ou revogado.
- Logout revoga o token remoto e desconecta sockets do usuário.
- Usuário inativo não autentica.
- JWT HTTP e Socket.IO usam a mesma configuração centralizada.
- Produção falha sem `JWT_SECRET` explícito.
- Testes focados auth/tow: 14 suites, 118 testes aprovados; E2E PostgreSQL aprovado separadamente.

## Integração mobile

As correções mobile estão na branch `task/mobile-001-apps`, com persistência de sessão, verify no fluxo de inicialização, logout, limpeza em 401, onboarding de parceiro e rotas de guincho alinhadas.

## Escopo ainda não implementado

Recuperação de senha, verificação de e-mail e reenvio de código não possuem endpoint backend canônico neste contrato. Esses fluxos devem ser definidos e implementados em uma task própria antes de serem exigidos como critério de aceite; o app não deve simular sucesso localmente.

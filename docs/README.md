# Documentação — visão geral do projeto

Documentação enxuta para quem está entrando no time: **o que já existe** no repositório, sem detalhar implementação.

## Objetivo do sistema

Plataforma de **assistência automotiva**: cliente solicita socorro; parceiros (mecânicos/prestadores) atendem; administradores acompanham e gerenciam. Há fluxo de emergências, pedidos, pagamentos, carteiras, assinaturas, guincho (propostas), documentos e notificações.

## Estrutura do monorepo

| Pasta | O que é |
|--------|---------|
| `socorre_ai_backend/` | API REST (Node.js / Express), PostgreSQL (Knex), Redis, Firebase, uploads |
| `socorre_ai_client/` | App **Flutter** — usuário final (cliente) |
| `socorre_ai_partner/` | App **Flutter** — parceiro / prestador |
| `socorre_ai_admin/` | Painel **React** (TypeScript) — operação administrativa |
| `scripts/` | Scripts de deploy e build (ex.: APK) |
| `deploy_temp/` | Artefatos temporários de deploy (não é código-fonte principal) |

Instruções de instalação e comandos para subir cada parte estão no **README na raiz** do repositório.

---

## Backend (`socorre_ai_backend`)

- **Autenticação** JWT, usuários, categorias, dashboard agregado.
- **Domínio “mecânicos / oficina”**: mecânicos, serviços, agendamentos, avaliações.
- **Socorro / operação**: parceiros, solicitações de emergência, delivery orders, purchase orders.
- **Modelo comercial**: assinaturas, propostas de guincho (`tow-proposals`), produtos, configurações do sistema.
- **Documentos** de parceiros (upload/aprovação via API).
- **Pagamentos e finanças**: pagamentos, carteiras, disputas, comissões; integrações com gateways (ex.: Stripe, Mercado Pago, PagSeguro) na camada de serviços.
- **Notificações** (incl. FCM), **WebSocket** para tempo real, upload de arquivos.
- **Migrations e seeds** em `database/`. Testes (Jest) em `tests/`.

Prefixo das rotas: `/api/...` (ver `src/server.js` para a lista completa). Health: `GET /health`.

---

## App cliente (`socorre_ai_client`)

Flutter: login/cadastro, onboarding, emergências (solicitar, acompanhar, histórico), parceiros disponíveis, mapa, chat, notificações, pagamentos, carteira, disputas, assinatura, catálogo de produtos, pedidos de entrega, propostas de guincho, upload de documentos, perfil e integração com API/Firebase/WebSocket conforme serviços em `lib/services/`.

---

## App parceiro (`socorre_ai_partner`)

Flutter: autenticação, cadastro/completar perfil, onboarding por tipo de parceiro, dashboard, emergências e detalhes de serviço, assinaturas, produtos, entregas, guincho, documentos, financeiro, chat, notificações, avaliações, telas auxiliares (relatórios, analytics, suporte, etc.) — parte delas pode ser evolutiva ou backup; a estrutura principal está em `features/` e `screens/`.

---

## Admin (`socorre_ai_admin`)

React + TypeScript: login, layout comum, páginas para usuários, categorias, mecânicos, serviços, agendamentos, avaliações, emergências, pedidos (delivery / purchase), carteiras, disputas, parceiros, aprovação de documentos e dashboard. Consome a API configurada em `src/services/api.ts`.

---

## Onde aprofundar

- Contratos e fluxos: código em `controllers`/`services` (backend) e serviços Dart/React.
- Modelo de dados: `database/migrations/` no backend.
- **Credenciais e `.env`**: não versionar segredos; cada ambiente tem suas variáveis (backend, Firebase, gateways).

---

*Última atualização: documentação de onboarding do monorepo Socorre.*

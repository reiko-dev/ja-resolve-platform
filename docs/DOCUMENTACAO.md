# Documentação do sistema Socorre AI

Documento de referência do que está **implementado** no repositório: produtos, APIs, dados, interfaces e automações. Organizado por camada e por pasta.

---

## 1. Visão geral

O Socorre AI é um ecossistema de **assistência automotiva** que integra:

- **Cliente final** — solicita socorro, acompanha status, paga, usa carteira e notificações.
- **Parceiro** (mecânico, loja, motoboy, etc.) — cadastro por tipo, recebe emergências, opera serviços e fluxos comerciais.
- **Administrador** — painel web para usuários, parceiros, operações, finanças e documentação.

A solução é um **monorepo** com backend Node.js, dois apps Flutter e um dashboard React.

---

## 2. Estrutura do repositório

| Caminho | Descrição |
|---------|-----------|
| `socorre_ai_backend/` | API HTTP + WebSocket, regras de negócio, persistência PostgreSQL, integrações |
| `socorre_ai_client/` | Aplicativo Flutter — perfil **usuário/cliente** |
| `socorre_ai_partner/` | Aplicativo Flutter — perfil **parceiro** |
| `socorre_ai_admin/` | SPA React (TypeScript) — **admin** |
| `scripts/` | Shell scripts de deploy, build de APK e utilitários (Firebase, testes) |
| `deploy_temp/` | Artefatos temporários relacionados a deploy |

---

## 3. Backend (`socorre_ai_backend`)

### 3.1 Stack e runtime

- **Node.js** com **Express** (`src/server.js`).
- **PostgreSQL** via **Knex** (`knexfile.js`, `database/migrations`, `database/seeds`).
- **Redis** (dependência e uso em serviços conforme configuração).
- **Socket.IO** — servidor acoplado ao HTTP (`socketService`).
- **Firebase Admin** — notificações push.
- **JWT** (`jsonwebtoken`), **bcryptjs**, validação com **Joi** / **express-validator**.
- **Multer** — upload de arquivos.
- **Helmet**, **CORS** (origens de desenvolvimento e produção incluindo `admin.socorreja.com.br` em produção), **Morgan**.
- **express-rate-limit** presente nas dependências (comentado no `server.js` por conflito com proxy).
- **Jest** + **Supertest** — testes unitários e de integração.

Scripts npm: `start`, `dev` (nodemon), `test`, `test:watch`, `test:coverage`, `test:integration`, `test:unit`.

### 3.2 Endpoints públicos e utilitários

- `GET /health` — status do serviço, timestamp, ambiente.
- `GET /login`, `GET /dashboard` — respostas JSON orientando uso das rotas `/api/...`.

### 3.3 API REST — prefixo `/api`

Rotas registradas em `src/server.js` (montagem única; não há versão `/v1` no path).

#### Autenticação — `/api/auth`

- `POST /register`, `POST /login`
- `GET /verify`, `POST /logout` (protegidas)

#### Usuários — `/api/users`

- Perfil: `GET/PUT /profile` (autenticado)
- CRUD administrativo: listagem, `GET/POST/PUT/DELETE /:id` com papel `admin`

#### Categorias — `/api/categories`

- Público: `GET /`, `GET /:id`
- Admin: `POST /`, `PUT /:id`, `DELETE /:id`

#### Dashboard administrativo — `/api/dashboard`

- `GET /stats` — estatísticas agregadas (papel `admin`)

#### Mecânicos — `/api/mechanics`

- Consultas: proximidade, especialidade, busca, serviços e avaliações por mecânico, `GET /:id`, listagem
- CRUD autenticado; `PATCH /:id/verify` para admin

#### Serviços (catálogo de oficina) — `/api/services`

- Público: listagem, categorias, subcategorias, filtros por categoria e faixa de preço, `GET /:id`
- Mecânico/admin: criar, atualizar, remover

#### Agendamentos — `/api/appointments`

- Usuário: `GET /my-appointments`, detalhe, criar, atualizar, status, excluir
- Mecânico: `GET /mechanic-appointments`
- Por data, listagem e estatísticas (admin)

#### Avaliações — `/api/reviews`

- Por mecânico, minhas avaliações, CRUD com autenticação
- Admin: listagem geral, verificação

#### Parceiros — `/api/partners`

- Consultas: `nearby`, `specialty`, `emergency`, `motoboys`, `stores`, `GET /:id`, listagem
- Cadastros por tipo: `POST /`, `POST /mechanic`, `POST /store`, `POST /motoboy`
- Atualização, status online, localização, aprovação admin, exclusão

#### Solicitações de emergência — `/api/emergency-requests`

Implementação ativa em `src/routes/emergency-requests.js`:

- Admin: `GET /`
- Cliente (`user`): `POST /`, `GET /:id/proposals`, `POST /:id/accept-proposal`
- Parceiro: `POST /:id/accept`

No repositório existem também `emergency-requests-old.js` e `emergency-requests-new.js` com conjuntos maiores de rotas (histórico de evolução da API); **apenas** o arquivo acima é carregado pelo servidor.

#### Pedidos de entrega (modelo legado por perfil) — `/api/delivery-orders`

- Por usuário, criação, atualização de status, avaliação
- Por motoboy, listagens administrativas, estatísticas, CRUD por id

#### Pedidos de compra — `/api/purchase-orders`

- Por usuário e por loja, criação, status, avaliação, listagem admin, estatísticas, CRUD

#### Assinaturas — `/api/subscriptions`

- CRUD, pagamento, falha de pagamento, renovação
- Consultas: expirando, expiradas, ativas, auto-billing, status por parceiro, estatísticas, histórico por id

#### Propostas de guincho — `/api/tow-proposals`

- Criação, listagem por emergência, por parceiro, por id
- Ações: aceitar, rejeitar, retirar proposta, incremento de visualizações
- Listagem geral, expirando, expirar por emergência, estatísticas

#### Entregas (fluxo “novo”) — `/api/delivery-orders-new`

- `POST /`, `GET /customer`, `POST /:id/accept`, `POST /:id/complete`, `GET /stats`

#### Produtos — `/api/products`

- CRUD completo, busca por SKU, loja, categoria, combustíveis, autopeças, destaque, similar, estoque, ativo, disponibilidade, estatísticas

#### Configurações do sistema — `/api/system-settings`

- Leitura por chave, categoria, público, app, lote
- Endpoints especializados: guincho, assinatura, delivery
- Upsert, update, delete, reset, export/import, validação, `PATCH /batch`

#### Documentos de parceiros — `/api/documents`

- Upload múltiplo por parceiro, listagem, download, exclusão
- Admin: verificação, pendentes, metadados
- Status e estatísticas por parceiro

#### Upload genérico — `/api/upload`

- `POST /image`, `POST /images`

#### Notificações — `/api/notifications`

- Listagem, marcar lida, marcar todas, token FCM, contagem não lidas, rota de teste

#### Pagamentos — `/api/payments`

- Criação, detalhe, confirmar, cancelar, reembolso (com papéis)
- Listagens, por parceiro, resumo estatístico
- `POST /webhook/:gateway` — webhooks de gateway

#### Carteiras — `/api/wallets`

- Saldo e movimentações do usuário autenticado, saque, dados bancários
- Admin: carteira por id

#### Disputas — `/api/disputes`

- Abertura, listagem, resposta, resolução (admin)

#### Uploads (rotas adicionais) — `/api/uploads`

- Conjunto de rotas espelhando operações de documentos de parceiro (`partner-documents`).

### 3.4 Camada de aplicação (resumo)

**Controllers** em `src/controllers/` cobrem autenticação, usuários, categorias, dashboard, mecânicos, serviços, agendamentos, avaliações, parceiros, emergências, pedidos (delivery/purchase), assinaturas, guincho, produtos, configurações, documentos, pagamentos e configurações de sistema.

**Models** em `src/models/`: `User`, `Partner`, `PartnerDocument`, `Mechanic`, `Service`, `Appointment`, `Review`, `EmergencyRequest`, `DeliveryOrder`, `DeliveryOrderModel`, `PurchaseOrder`, `Subscription`, `SubscriptionHistory`, `TowProposal`, `Product`, `SystemSettings`, `Payment`.

**Services** em `src/services/` (entre outros): notificações (incl. variante “New”), Socket/WebSocket, pagamentos, carteira, comissões, disputas, detecção de fraude, pedidos de entrega (fluxo novo), assinaturas, propostas de guincho, documentos; **gateways** em `src/services/gateways/`: Stripe, Mercado Pago, PagSeguro.

**Middleware**: `auth` (JWT e papéis), `admin`, `permissions`, `partnerValidation`, `validation` (schemas Joi).

### 3.5 Banco de dados

**Migrations** (`database/migrations/`) — arquivos presentes (prefixo numérico):

- `001` … `007` — `users`, `categories`, `mechanics`, `services`, `appointments`, `reviews`, `chat_messages`
- `008` … `014` — `partners`, `emergency_requests`, `delivery_orders`, `purchase_orders`, `partner_services`, `real_time_tracking`, `notifications`
- `015_migrate_existing_data.js`
- `018_add_fcm_token_to_users.js`
- `019` … `023` — `payments`, `wallets`, `wallet_transactions`, `commissions`, `disputes`
- `024_subscriptions`, `025_tow_proposals`, `026_system_settings`, `028_products`
- Dois arquivos com prefixo `029`: `create_partner_documents_table`, `create_subscription_history_table`
- `033_insert_system_settings.js`

**Seeds** (`database/seeds/`): dados iniciais, mecânicos, usuários cliente e parceiro (arquivos numerados).

### 3.6 Testes automatizados

- `tests/unit/` — modelos e regras (ex.: `DeliveryOrder`, `Subscription`, `TowProposal` e variantes `.basic`)
- `tests/integration/` — dashboard, delivery orders, subscriptions, tow proposals
- `tests/setup.js`, `jest.test.js`, `api.manual.test.js`, `models.validation.test.js`

### 3.7 Deploy e produção

- `ecosystem.config.js` — configuração **PM2** (cluster, logs, memória, ambientes `development` / `production`).
- `config.production.js` — ajustes de ambiente de produção.

---

## 4. App cliente (`socorre_ai_client`)

### 4.1 Stack

- **Flutter** (Dart), **Firebase Core** (opções em `firebase_options.dart`), **Google Fonts**.
- Serviços: API HTTP, WebSocket, notificações push, autenticação persistente.
- Tema próprio (vermelho/azul institucional).

### 4.2 Inicialização (`main.dart`)

- `WidgetsFlutterBinding`, Firebase, impressão de config (`AppConfig`), `AuthService`, `NotificationService`, `WebSocketService`.

### 4.3 Navegação (`MaterialApp.routes`)

Rotas nomeadas declaradas:

| Rota | Tela / comportamento |
|------|----------------------|
| `/` | Splash |
| `/login` | Autenticação |
| `/onboarding` | Onboarding cliente |
| `/document-upload` | Upload de documentos (`userType: client`) |
| `/dashboard` | Painel principal |
| `/emergency-request` | Abertura de socorro (argumentos: tipo de emergência) |
| `/emergency-history` | Histórico |
| `/available-partners` | Parceiros para uma emergência |
| `/map` | Mapa (posição e parceiros) |
| `/emergency-tracking` | Acompanhamento em tempo real |
| `/partner-responses` | Respostas de parceiros |
| `/emergency-searching` | Busca de atendimento |
| `/appointments` | Agendamentos |
| `/profile` | Perfil |
| `/notifications` | Notificações |
| `/payments` | Pagamentos (navegação interna também referencia `/payment-methods` e `/payment-details` no código da tela) |
| `/wallet` | Carteira |
| `/disputes` | Disputas |
| `/chat` | Chat vinculado à emergência |

**Telas adicionais** no projeto (implementadas como widgets; integração à navegação conforme evolução do app): `TowProposalsScreen`, `SubscriptionScreen`, `ProductCatalogScreen`, `DeliveryOrderScreen`, além de `main_original.dart` como variante de entrada.

### 4.4 Serviços (`lib/services/`)

Incluem: `api_service`, `auth_service`, `emergency_service`, `notification_service`, `websocket_service`, `partner_service`, `payment_service`, `wallet_service`, `dispute_service`, `subscription_service`, `product_service`, `delivery_order_service`, `tow_proposal_service`, `image_upload_service`.

### 4.5 Modelos (`lib/models/`)

Entidades alinhadas à API: usuário, emergência, parceiro, agendamento, pagamentos, carteira, disputas, assinatura, produtos, pedidos de entrega, propostas de guincho, documentos, configurações de sistema, etc.

### 4.6 UI

- `widgets/app_drawer.dart` — menu lateral (início, socorro, histórico, carteira, pagamentos, disputas, perfil, notificações, ajuda, logout).
- `screens/dashboard_screen.dart` — atalhos de tipo de emergência (combustível, guincho, bateria, pneus), últimos socorros, FAB de socorro.

---

## 5. App parceiro (`socorre_ai_partner`)

### 5.1 Stack

- **Flutter**, **Provider** para injeção de `ApiService`, `AuthService`, `PartnerService` e estado (`AuthProvider`, `PartnerProvider`).
- **go_router** — roteamento declarativo.
- Tema escuro centralizado (`core/theme/app_theme.dart`).

### 5.2 Fluxo principal de rotas (`core/router/app_router.dart`)

- `/splash` — entrada
- Onboarding: `/onboarding`, `/partner-type-selection`
- Auth: `/login`, `/register` (query `partnerType`), `/complete-registration`
- **Shell** com barra inferior: `/` (dashboard), `/services`, `/emergency-requests`, `/financial`, `/profile`
- Detalhe de serviço: `/service/:id`
- `/settings`

### 5.3 Módulos em `features/`

- **auth** — login, registro, conclusão de cadastro
- **onboarding** — fluxo e seleção de tipo de parceiro
- **dashboard** — painel
- **services** — listagem, detalhe, lista de emergências
- **profile** — perfil, financeiro, configurações

### 5.4 Camada legada / ampliação (`lib/screens/` e serviços associados)

Implementação extensa de telas e serviços, entre eles: dashboard executivo, backup, analytics, relatórios, pagamentos, avaliações, chat (lista e conversa), notificações, cadastros (mecânico, motoboy, loja), gestão de assinatura, produtos, entregas, propostas de guincho, documentos, vídeo, suporte, ajuda, IA (serviços e widgets dedicados), mapas de localização, etc. Há arquivos de backup ou variantes (`main_original`, `main_simple_backup`, telas com sufixo `broken`) que fazem parte do histórico do código no repositório.

### 5.5 Outros

- `config/app_config.dart`, `core/constants/app_constants.dart`
- Integração com API espelhando módulos do backend (emergências, financeiro, documentos, WebSocket, etc.)

---

## 6. Painel administrativo (`socorre_ai_admin`)

### 6.1 Stack

- **React 18** + **TypeScript**
- **React Router** — rotas privadas com token `admin_token` no `localStorage`
- **Material UI** — layout, drawer, tema (`utils/theme.ts`)
- Cliente HTTP centralizado em `services/api.ts`
- Tipos em `types/index.ts`

### 6.2 Rotas implementadas

| Caminho | Página |
|---------|--------|
| `/login` | Login |
| `/dashboard` | Dashboard |
| `/users` | Usuários |
| `/partners` | Parceiros |
| `/document-approval` | Aprovação de documentos |
| `/emergency-requests` | Emergências |
| `/delivery-orders` | Entregas |
| `/purchase-orders` | Compras |
| `/wallets` | Carteiras |
| `/disputes` | Disputas |
| `/mechanics` | Mecânicos |
| `/services` | Serviços |
| `/appointments` | Agendamentos |
| `/reviews` | Avaliações |
| `/categories` | Categorias |
| `/settings` | Placeholder (“Configurações”) |
| `/` | Redireciona para `/dashboard` |

Menu lateral espelha essa ordem em `components/Layout.tsx`.

### 6.3 Componentes

- `Layout.tsx` — shell com AppBar, drawer responsivo, logout via API
- `PartnerForm.tsx` — formulário de parceiro
- Integração com upload (`services/uploadService.ts`), chaves em `config/apiKeys.ts` conforme projeto

---

## 7. Scripts (`scripts/`)

| Arquivo | Função típica |
|---------|-----------------|
| `deploy.sh` | Deploy geral |
| `deploy-production.sh` | Deploy produção |
| `build_apk.sh` | Build de APKs |
| `setup-firebase-production.sh` | Configuração Firebase em produção |
| `test-integration.sh` | Execução de testes de integração |

---

## 8. Configuração e ambientes

- **Backend**: variáveis via `.env` (porta, PostgreSQL, Redis, JWT, Firebase, gateways de pagamento, etc.). Documentação de chaves específicas deve seguir o que o código e o time utilizam; **não** versionar segredos.
- **Flutter**: URLs e flags em `app_config.dart` de cada app.
- **Admin**: base URL da API nos serviços de API.
- **CORS** em produção restrito ao domínio do admin configurado no `server.js`.

---

## 9. Referência cruzada rápida

| Necessidade | Onde olhar |
|-------------|------------|
| Lista oficial de rotas HTTP | `socorre_ai_backend/src/server.js` |
| Contrato de emergência ativo | `socorre_ai_backend/src/routes/emergency-requests.js` + controller |
| Esquema do banco | `socorre_ai_backend/database/migrations/` |
| Rotas do app cliente | `socorre_ai_client/lib/main.dart` |
| Rotas do app parceiro | `socorre_ai_partner/lib/core/router/app_router.dart` |
| Rotas do admin | `socorre_ai_admin/src/App.tsx` |
| Testes backend | `socorre_ai_backend/tests/` |

---

*Documento gerado a partir da estrutura e do código presentes no repositório.*

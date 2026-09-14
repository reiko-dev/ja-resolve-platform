# Backend Socorre AI

Documentação de integração do backend para a empresa responsável pelos apps.

Status deste documento:
- referência operacional atual
- focado em contratos oficiais
- não descreve trilha histórica de auditoria

Data de corte desta documentação:
- `2026-05-04`

---

## 1. Objetivo

Este documento existe para:
- apresentar a trilha oficial de integração do backend
- reduzir ambiguidade entre contrato oficial e legado
- concentrar naming, rotas e regras que os apps devem respeitar

Regra central:
- o backend é a fonte oficial de verdade do produto
- o app não define regra de negócio crítica localmente

---

## 2. Regras de integração

Toda integração do APK deve seguir estas regras:

- consumir apenas rotas oficiais
- não consumir endpoints legados removidos do runtime principal
- não decidir localmente regras de aprovação, elegibilidade, comissão, entrega ou onboarding
- tratar o backend como dono do estado final de autenticação, perfil, documentos, assinatura, entrega, emergência, pagamento e reputação

Rotas legadas removidas do runtime principal:

- `/api/documents`
- `/api/uploads`
- `/api/delivery-orders-new`
- `/api/delivery-orders-legacy`
- `/api/partner/subscription`
- `/api/emergency-requests-old`
- `/api/emergency-requests-new`

Se algum app ainda depender desses paths, a integração está desatualizada.

---

## 3. Naming oficial

### 3.1 Tipos de parceiro

- `mechanic`
- `motoboy`
- `gas_station`
- `auto_parts`
- `tow`

### 3.2 Estágios de onboarding

- `account_created`
- `documents_pending`
- `under_review`
- `approved`

### 3.3 Regras de naming

- não usar `mecanico`, `posto_combustivel`, `auto_pecas` ou variações como naming oficial novo
- compatibilidade legada interna pode existir no backend, mas o app deve trabalhar com o naming canônico

---

## 4. Formato base de resposta

Formato de sucesso esperado no backend:

```json
{
  "success": true,
  "message": "Opcional",
  "data": {}
}
```

Formato de erro esperado:

```json
{
  "success": false,
  "message": "Descrição do erro"
}
```

Observação:
- alguns endpoints antigos ainda podem ter pequenas variações de payload
- para integrações novas, trate `success`, `message` e `data` como padrão esperado

---

## 4.1 Perfis de integração

### Cliente

Responsável por consumir principalmente:

- `auth`
- catálogo
- pedido de compra
- delivery do próprio pedido
- emergência
- pagamento do próprio fluxo
- notificações
- reviews
- documentos do próprio usuário

### Parceiro

Responsável por consumir principalmente:

- `auth`
- onboarding
- documentos do parceiro
- dashboard liberada por aprovação
- catálogo da própria loja
- pedidos da própria operação
- delivery como loja ou motoboy
- emergências como `mechanic` ou `tow`
- assinatura
- carteira
- notificações

### Admin / Backoffice

Responsável por consumir principalmente:

- aprovação de parceiro e documentos
- settings administrativos
- stats operacionais
- moderação de reviews
- telemetria de integração e operação

## 4.2 Matriz rápida por perfil

Cliente:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/products`
- `POST /api/purchase-orders`
- `GET /api/delivery-orders/customer`
- `POST /api/emergency-requests`
- `POST /api/payments`
- `GET /api/notifications`
- `GET /api/users/me/documents`

Parceiro:

- `GET /api/partners/me/onboarding-status`
- `POST /api/partners/onboarding/complete`
- `POST /api/partners/documents/upload`
- `POST /api/products`
- `GET /api/purchase-orders/store/:storeId`
- `GET /api/delivery-orders/store`
- `GET /api/delivery-orders/motoboy`
- `POST /api/tow-proposals`
- `GET /api/subscriptions/partner/:partner_id/status`
- `GET /api/wallets`

Admin:

- `GET /api/partners/documents/admin/pending`
- `PUT /api/partners/documents/admin/:documentId/verify`
- `GET /api/system-settings`
- `PUT /api/system-settings/key/:key`
- `GET /api/system-settings/legacy-route-usage`
- `GET /api/reviews`
- `PATCH /api/reviews/:id/verify`

---

## 4.3 Ambiente, base URL e headers

Ambiente local de referência validado neste repositório:

- backend HTTP:
  - `http://127.0.0.1:3001`
- banco Postgres do Docker:
  - `127.0.0.1:5434`

Convenção recomendada para os apps:

- `baseURL = <ambiente>/api`
- não concatenar paths legados removidos
- centralizar token de autenticação em um único client HTTP

Headers mínimos esperados:

- `Content-Type: application/json`
- `Authorization: Bearer <jwt_token>` para rotas autenticadas

Headers comuns em upload multipart:

- `Authorization: Bearer <jwt_token>`
- `Content-Type: multipart/form-data`

Observações:

- `verify` deve ser usado para reidratar sessão
- falha `401` deve disparar fluxo de renovação de sessão local ou logout controlado
- falha `403` deve ser tratada como bloqueio de permissão, não como sessão expirada

## 4.4 Convenções de autenticação por rota

Rotas normalmente públicas:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/system-settings/public`
- `GET /api/system-settings/app-settings`

Rotas normalmente autenticadas:

- quase todos os fluxos operacionais de cliente e parceiro

Rotas administrativas:

- aprovação documental
- gestão de `system_settings`
- telemetria administrativa
- moderação de reviews

Regra prática:

- `401` indica ausência ou invalidade de token
- `403` indica token válido sem permissão suficiente

---

## 5. Autenticação e identidade

Rotas oficiais:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/verify`
- `POST /api/auth/logout`

### 5.1 Register

Campos obrigatórios:

- `name`
- `email`
- `password`
- `phone`

Campos opcionais:

- `partnerType`
- `partner_type`
- `cpf`
- `cnpj`

Regras:

- se vier `partnerType` ou `partner_type`, o backend cria a conta como parceiro
- o app não pode forçar `role=admin`
- parceiro nasce com:
  - `role = partner`
  - `onboarding_partner_type`
  - `onboarding_stage = account_created`

Exemplo parceiro:

```json
{
  "name": "Carlos Mecânico",
  "email": "carlos@email.com",
  "password": "123456",
  "phone": "13999999999",
  "partnerType": "mechanic"
}
```

### 5.2 Login

```json
{
  "email": "carlos@email.com",
  "password": "123456"
}
```

### 5.3 Verify

Use `verify` como fonte oficial da sessão autenticada.

### 5.4 Contrato de sessão e logout

- O token deve ser enviado como `Authorization: Bearer <JWT>` nas rotas protegidas.
- `GET /api/auth/verify` retorna `401` para token ausente, inválido, expirado ou revogado.
- `POST /api/auth/logout` revoga somente o token apresentado. Reutilizar esse token retorna `401`.
- A revogação é persistida em `revoked_tokens` e expira automaticamente no vencimento do JWT.
- O mesmo estado de revogação é aplicado à autenticação HTTP e Socket.IO.
- Usuários com `is_active=false` não podem fazer login, usar tokens existentes ou abrir sessões Socket.IO; o login retorna `401` genérico para evitar enumeração de contas.
- Credenciais inválidas retornam resposta genérica; detalhes internos de banco e exceções não fazem parte do contrato.
- O backend não aceita `role=admin` vindo do cadastro; o papel é resolvido no servidor.

### 5.5 Deploy e ordem de migration

- A migration `042_create_revoked_tokens_table.js` deve ser aplicada antes de encaminhar tráfego autenticado para uma nova instância.
- A migration `043_enforce_case_insensitive_user_email.js` cria unicidade por `LOWER(email)`; duplicidades históricas devem ser saneadas antes da aplicação.
- Antes de aplicar `043`, executar no PostgreSQL: `SELECT LOWER(email) AS normalized_email, COUNT(*) FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1;`. Resultado esperado: zero linhas. A migration mantém falha explícita quando houver colisões; saneamento exige decisão de negócio e backup.
- `043` usa índice único transacional, não `CONCURRENTLY`; aplicar em janela de manutenção ou após confirmar ausência de escrita concorrente em `users`.
- O `docker-entrypoint.sh` executa `knex migrate:latest --env production` automaticamente quando `NODE_ENV=production`. Os únicos valores aceitos para `RUN_MIGRATIONS` são vazio, `1`/`true` (executa) e `0`/`false` (assume migration externa); valores desconhecidos fazem o processo parar antes de iniciar o Node.
- Em deploy com PM2 ou execução manual, executar explicitamente `npx knex migrate:latest --knexfile knexfile.js --env production` antes do restart.
- O deploy deve possuir backup/rollback do banco antes de migrations e deve verificar `/health` e uma autenticação sintética sem credenciais reais.
- Rollback de código não desfaz automaticamente tokens já revogados; a tabela deve ser preservada durante rollback de aplicação.

Campos relevantes para o app:

- `role`
- `partner_id`
- `partner_type`
- `onboarding_partner_type`
- `onboarding_stage`

---

## 6. Onboarding e aprovação de parceiro

Rotas oficiais:

- `GET /api/partners/me/onboarding-status`
- `POST /api/partners/onboarding/complete`
- `GET /api/partners/documents`
- `POST /api/partners/documents/upload`
- `DELETE /api/partners/documents/:documentId`
- `POST /api/partners/documents/submit`

### 6.1 Regra de progressão

- `register parceiro`
  - cria `account_created`
- `complete onboarding`
  - move para `documents_pending`
- `submit documents`
  - move para `under_review`
- `approve parceiro`
  - move para `approved`

### 6.2 Status oficial para o app

O app deve considerar como campos mínimos oficiais:

- `partnerType`
- `onboardingStage`
- `nextStep`
- `canAccessDashboard`
- `requiredDocuments`
- `missingDocuments`
- `documents`
- `approvalStatus`
- `rejectionReason`

### 6.3 Regra de dashboard

- dashboard só pode ser liberada em `approved`

---

## 7. System Settings

Rotas públicas oficiais:

- `GET /api/system-settings/public`
- `GET /api/system-settings/app-settings`

Regra:

- o app não edita `system_settings`
- regra configurável de negócio deve ser lida do backend

Exemplos de uso operacional:

- delivery
- guincho
- assinatura
- notificações
- limites globais

---

## 8. Catálogo e loja

Rotas oficiais:

- `POST /api/products`
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/store/:store_id`
- `GET /api/products/category/:category`
- `GET /api/products/search`
- `GET /api/products/featured`
- `GET /api/products/fuels`
- `GET /api/products/auto-parts`
- `PUT /api/products/:id`
- `PATCH /api/products/:id/stock`
- `PATCH /api/products/:id/active`
- `PATCH /api/products/:id/featured`
- `DELETE /api/products/:id`
- `GET /api/products/:id/availability`
- `GET /api/products/stats`

Parceiros autorizados:

- `gas_station`
- `auto_parts`

Categorias canônicas recomendadas:

- `fuel`
- `auto_part`

---

## 9. Pedidos de compra

Rotas oficiais:

- `POST /api/purchase-orders`
- `GET /api/purchase-orders/user/:userId`
- `GET /api/purchase-orders/store/:storeId`
- `GET /api/purchase-orders/:id`
- `PUT /api/purchase-orders/:id/status`
- `POST /api/purchase-orders/:id/rate`

### 9.1 Delivery mode oficial

- `store_delivery`
- `app_motoboy`

### 9.2 Estados principais

- `pending`
- `confirmed`
- `preparing`
- `ready`
- `delivered`
- `cancelled`
- `refunded`

### 9.3 Regra importante

Quando `delivery_mode = app_motoboy`, o backend integra o pedido comercial com `delivery_orders`.

---

## 10. Delivery e motoboys

Rotas oficiais:

- `POST /api/delivery-orders`
- `GET /api/delivery-orders/customer`
- `GET /api/delivery-orders/store`
- `GET /api/delivery-orders/motoboy`
- `GET /api/delivery-orders/available`
- `POST /api/delivery-orders/:id/accept`
- `POST /api/delivery-orders/:id/start`
- `POST /api/delivery-orders/:id/pickup`
- `POST /api/delivery-orders/:id/in-transit`
- `POST /api/delivery-orders/:id/complete`
- `POST /api/delivery-orders/:id/cancel`
- `POST /api/delivery-orders/:id/location`
- `PATCH /api/delivery-orders/:id/location`
- `POST /api/delivery-orders/:id/rate`
- `GET /api/delivery-orders/motoboy/stats`
- `GET /api/delivery-orders/motoboy/history`
- `GET /api/delivery-orders/stats`
- `GET /api/delivery-orders/:id`

Estados oficiais:

- `pending`
- `accepted`
- `picked_up`
- `in_transit`
- `delivered`
- `cancelled`

---

## 11. Emergências e guincho

Rotas oficiais:

- `POST /api/emergency-requests`
- `GET /api/emergency-requests`
- `GET /api/emergency-requests/:id`
- `POST /api/emergency-requests/:id/accept`
- `GET /api/emergency-requests/:id/proposals`
- `POST /api/emergency-requests/:id/accept-proposal`
- `POST /api/emergency-requests/:id/payment`
- `GET /api/emergency-requests/:id/payment-summary`
- `POST /api/emergency-requests/:id/cancel`
- `GET /api/emergency-requests/stats`

Rotas oficiais de proposta:

- `POST /api/tow-proposals`
- `GET /api/tow-proposals/emergency/:emergency_request_id`
- `GET /api/tow-proposals/partner`
- `GET /api/tow-proposals/:id`
- `POST /api/tow-proposals/:id/accept`
- `POST /api/tow-proposals/:id/reject`
- `POST /api/tow-proposals/:id/withdraw`
- `GET /api/tow-proposals`
- `GET /api/tow-proposals/expiring-soon`
- `POST /api/tow-proposals/emergency/:emergency_request_id/expire`
- `GET /api/tow-proposals/stats`

### 11.1 Regras de domínio

- `mechanic` opera por aceite direto
- `tow` opera por proposta e seleção

### 11.2 Regras econômicas oficiais já ativas

Settings canônicos já usados:

- `tow_price_per_km`
- `tow_platform_fixed_fee`
- `tow_minimum_charge`
- `tow_cancellation_fee`

### 11.3 Pagamento de guincho

O backend já materializa:

- cobrança principal idempotente da emergência
- `tow_cancellation_fee` no cancelamento

---

## 12. Assinaturas

Rotas oficiais:

- `POST /api/subscriptions`
- `GET /api/subscriptions`
- `GET /api/subscriptions/:id`
- `PUT /api/subscriptions/:id`
- `DELETE /api/subscriptions/:id`
- `POST /api/subscriptions/:id/payment`
- `POST /api/subscriptions/:id/payment-failure`
- `POST /api/subscriptions/:id/renew`
- `GET /api/subscriptions/expiring-soon`
- `GET /api/subscriptions/expired`
- `GET /api/subscriptions/active`
- `GET /api/subscriptions/auto-billing`
- `GET /api/subscriptions/partner/:partner_id/status`
- `GET /api/subscriptions/stats`
- `GET /api/subscriptions/:id/history`

Status oficiais:

- `pending_payment`
- `active`
- `suspended`
- `cancelled`
- `expired`

---

## 13. Pagamentos, carteira e comissões

Rotas oficiais de pagamento:

- `POST /api/payments`
- `GET /api/payments/:id`
- `POST /api/payments/:id/confirm`
- `POST /api/payments/:id/cancel`
- `POST /api/payments/:id/refund`
- `GET /api/payments`
- `GET /api/payments/partner/:partnerId`
- `GET /api/payments/stats/summary`
- `POST /api/payments/webhook/:gateway`

Rotas oficiais de carteira:

- `GET /api/wallets`
- `GET /api/wallets/transactions`
- `POST /api/wallets/withdraw`
- `PUT /api/wallets/bank-details`
- `GET /api/wallets/:id`

Regras já validadas:

- `payment completed -> commission -> wallet credit`
- saque pela carteira oficial
- refund com reversão financeira correspondente

---

## 14. Notificações

Rotas oficiais:

- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/read-all`
- `PUT /api/notifications/fcm-token`
- `GET /api/notifications/unread-count`
- `POST /api/notifications/test`

Regras:

- persistência é obrigatória
- push e socket são efeitos adicionais
- falha no push não invalida a gravação da notificação

---

## 15. Avaliações

Rotas oficiais:

- `GET /api/reviews/mechanic/:mechanicId`
- `GET /api/reviews/my-reviews`
- `GET /api/reviews/:id`
- `POST /api/reviews`
- `PUT /api/reviews/:id`
- `DELETE /api/reviews/:id`
- `GET /api/reviews`
- `PATCH /api/reviews/:id/verify`

Estado atual do domínio:

- o backend já materializa reputação oficial via `reviews`
- `purchase_orders`, `delivery_orders` e `emergency_requests` já geram reviews oficiais por entidade

---

## 16. Uploads e arquivos

### 16.1 Upload genérico oficial

- `POST /api/upload/image`
- `POST /api/upload/images`

### 16.2 Documento de parceiro

- `GET /api/partners/documents`
- `POST /api/partners/documents/upload`
- `DELETE /api/partners/documents/:documentId`
- `POST /api/partners/documents/submit`

### 16.3 Documento do usuário final

- `GET /api/users/me/documents`
- `POST /api/users/me/documents`
- `DELETE /api/users/me/documents/:documentId`

---

## 17. Rotas administrativas úteis para operação

### 17.1 Telemetria residual de legado

- `GET /api/system-settings/legacy-route-usage`
- `POST /api/system-settings/legacy-route-usage/reset`

### 17.2 Snapshot atual de compatibilidade

- `GET /api/system-settings/legacy-route-config`

Estado atual esperado:

- retorno vazio `[]`

Isso indica que a camada principal de compatibilidade removida do runtime já não está mais ativa.

---

## 18. Fluxos críticos com exemplos

### 18.1 Cliente comum: register e login

Request de cadastro:

```json
{
  "name": "João Silva",
  "email": "joao@email.com",
  "password": "123456",
  "phone": "13999999999"
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Usuário registrado com sucesso",
  "data": {
    "user": {
      "id": 1,
      "name": "João Silva",
      "email": "joao@email.com",
      "phone": "13999999999",
      "role": "user",
      "partner_id": null,
      "partner_type": null,
      "onboarding_partner_type": null,
      "onboarding_stage": null
    },
    "token": "jwt_token"
  }
}
```

Request de login:

```json
{
  "email": "joao@email.com",
  "password": "123456"
}
```

### 18.2 Parceiro: register, verify e onboarding status

Request de cadastro:

```json
{
  "name": "Carlos Mecânico",
  "email": "carlos@email.com",
  "password": "123456",
  "phone": "13999999999",
  "partnerType": "mechanic"
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Usuário registrado com sucesso",
  "data": {
    "user": {
      "id": 2,
      "name": "Carlos Mecânico",
      "email": "carlos@email.com",
      "phone": "13999999999",
      "role": "partner",
      "partner_id": null,
      "partner_type": null,
      "onboarding_partner_type": "mechanic",
      "onboarding_stage": "account_created"
    },
    "token": "jwt_token"
  }
}
```

Response mínima esperada de `GET /api/auth/verify` após materialização do parceiro:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "role": "partner",
      "partner_id": 10,
      "partner_type": "mechanic",
      "onboarding_partner_type": "mechanic",
      "onboarding_stage": "documents_pending"
    }
  }
}
```

Response mínima esperada de `GET /api/partners/me/onboarding-status`:

```json
{
  "success": true,
  "data": {
    "hasPartner": true,
    "partnerId": 10,
    "partnerType": "mechanic",
    "onboardingStage": "documents_pending",
    "approvalStatus": "documents_required",
    "canAccessDashboard": false,
    "nextStep": "document_upload",
    "requiredDocuments": ["rg_cpf", "address_proof"],
    "missingDocuments": ["rg_cpf", "address_proof"],
    "documents": [],
    "rejectionReason": null
  }
}
```

### 18.3 Parceiro: upload e submissão documental

Request multipart esperado em `POST /api/partners/documents/upload`:

- `document_type = rg_cpf`
- arquivo multipart no campo de upload documental

Response esperada:

```json
{
  "success": true,
  "message": "Documento enviado com sucesso",
  "data": {
    "id": 10,
    "partner_id": 5,
    "document_type": "rg_cpf",
    "file_url": "/uploads/documents/file-123.jpg",
    "status": "pending"
  }
}
```

Response mínima esperada de `POST /api/partners/documents/submit`:

```json
{
  "success": true,
  "data": {
    "onboardingStage": "under_review",
    "documentsSubmitted": true,
    "approvalStatus": "pending",
    "nextStep": "pending_review"
  }
}
```

### 18.4 Loja: criação de produto

Request de `POST /api/products`:

```json
{
  "store_id": 20,
  "name": "Galão de Gasolina 5L",
  "description": "Galão para atendimento emergencial",
  "category": "fuel",
  "subcategory": "gasoline",
  "price": 79.9,
  "stock": 12,
  "sku": "POSTO-GLN-5L-GAS"
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Produto criado com sucesso",
  "data": {
    "id": 1,
    "store_id": 20,
    "name": "Galão de Gasolina 5L",
    "category": "fuel",
    "subcategory": "gasoline",
    "price": 79.9,
    "stock": 12,
    "is_active": true
  }
}
```

### 18.5 Cliente: criação de pedido de compra

Request de `POST /api/purchase-orders`:

```json
{
  "store_id": 20,
  "items": [
    {
      "product_id": 5,
      "name": "Galão de Gasolina 5L",
      "quantity": 1,
      "unit_price": 79.9
    }
  ],
  "subtotal": 79.9,
  "delivery_fee": 12.0,
  "total_price": 91.9,
  "delivery_mode": "app_motoboy",
  "delivery_address": "Rua Exemplo, 123",
  "payment_method": "pix",
  "notes": "Entregar no portão"
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Pedido de compra criado com sucesso",
  "data": {
    "id": 1,
    "user_id": 30,
    "store_id": 20,
    "status": "pending",
    "delivery_mode": "app_motoboy",
    "delivery_motoboy_id": null,
    "subtotal": 79.9,
    "delivery_fee": 12.0,
    "total_price": 91.9
  }
}
```

### 18.6 Delivery: criação e aceite da corrida

Request de `POST /api/delivery-orders`:

```json
{
  "order_type": "fuel",
  "store_id": 20,
  "items": [
    {
      "product_id": 5,
      "quantity": 1
    }
  ],
  "pickup_address": "Posto Exemplo, Avenida Central, 100",
  "pickup_latitude": -23.961,
  "pickup_longitude": -46.333,
  "delivery_address": "Rua do Cliente, 123",
  "delivery_latitude": -23.955,
  "delivery_longitude": -46.321,
  "customer_notes": "Entregar no portão"
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Pedido criado com sucesso",
  "data": {
    "id": 1,
    "store_id": 20,
    "customer_id": 30,
    "motoboy_id": null,
    "order_type": "fuel",
    "status": "pending",
    "delivery_fee": 12.0,
    "platform_fee": 2.4,
    "motoboy_fee": 9.6,
    "total_amount": 91.9
  }
}
```

Response mínima esperada de `POST /api/delivery-orders/:id/accept`:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "accepted",
    "motoboy_id": 45
  }
}
```

### 18.7 Cliente: criação de emergência `tow`

Request de `POST /api/emergency-requests`:

```json
{
  "type": "tow",
  "request_type": "tow",
  "address": "Avenida Central, 100",
  "latitude": -23.961,
  "longitude": -46.333,
  "vehicle_origin_address": "Avenida Central, 100",
  "vehicle_origin_latitude": -23.961,
  "vehicle_origin_longitude": -46.333,
  "vehicle_destination_address": "Oficina Exemplo, Rua B, 200",
  "vehicle_destination_latitude": -23.955,
  "vehicle_destination_longitude": -46.321,
  "vehicle_type": "car",
  "vehicle_notes": "Veículo sem partida"
}
```

Response mínima esperada:

```json
{
  "success": true,
  "data": {
    "id": 8,
    "request_type": "tow",
    "status": "pending",
    "proposal_status": "awaiting_proposals",
    "estimated_price": 90,
    "price_breakdown": {
      "tow_price_per_km": 6,
      "tow_platform_fixed_fee": 25,
      "tow_minimum_charge": 90
    }
  }
}
```

### 18.8 Parceiro `tow`: envio de proposta

Request de `POST /api/tow-proposals`:

```json
{
  "emergency_request_id": 8,
  "proposed_price": 120,
  "estimated_time_minutes": 35,
  "message": "Posso atender agora"
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Proposta enviada com sucesso",
  "data": {
    "id": 5,
    "emergency_request_id": 8,
    "partner_id": 39,
    "proposed_price": 120,
    "estimated_time_minutes": 35,
    "status": "pending"
  }
}
```

### 18.9 Pagamento e carteira

Request de `POST /api/payments`:

```json
{
  "amount": 99.0,
  "method": "pix",
  "gateway": "mercadopago",
  "paymentType": "subscription",
  "description": "Mensalidade do parceiro",
  "partnerId": 10,
  "subscriptionId": 5
}
```

Response esperada:

```json
{
  "success": true,
  "message": "Pagamento criado com sucesso",
  "data": {
    "id": 1,
    "status": "pending",
    "gatewayResponse": {
      "transactionId": "txn_123",
      "paymentId": "pay_123",
      "status": "pending"
    }
  }
}
```

Request de `POST /api/wallets/withdraw`:

```json
{
  "amount": 50.0
}
```

Response mínima esperada:

```json
{
  "success": true,
  "message": "Saque solicitado com sucesso",
  "data": {
    "status": "pending",
    "amount": 50
  }
}
```

---

## 19. Checklist de integração para a empresa do app

### 19.1 Checklist geral

Antes de considerar uma integração pronta:

- usar apenas rotas oficiais deste documento
- não usar endpoints removidos do runtime principal
- adotar naming canônico:
  - `mechanic`
  - `motoboy`
  - `gas_station`
  - `auto_parts`
  - `tow`
- respeitar `onboardingStage` e `nextStep` como decisão do backend
- tratar `verify` como fonte oficial da sessão
- tratar `system-settings` como fonte oficial de configuração dinâmica
- não reimplementar localmente cálculo de entrega, assinatura, guincho, comissão ou aprovação

### 19.2 Homologação por perfil

Cliente:

- consegue cadastrar, logar e retomar sessão
- consegue listar catálogo e consultar produto
- consegue criar pedido com `delivery_mode` explícito
- consegue acompanhar o próprio delivery
- consegue abrir emergência e pagar quando o fluxo exigir
- consegue consultar notificações
- consegue enviar e remover seus próprios documentos

Parceiro:

- consegue cadastrar conta com `partnerType`
- consegue concluir onboarding e enviar documentos
- respeita bloqueio de dashboard antes de `approved`
- consegue operar catálogo apenas na própria loja
- consegue operar pedido da própria loja
- consegue operar delivery como loja ou motoboy conforme o tipo
- consegue consultar assinatura e carteira
- consegue enviar proposta de guincho quando `type = tow`

Admin:

- consegue aprovar e reprovar documentos de parceiro
- consegue consultar e editar `system_settings`
- consegue consultar stats operacionais
- consegue moderar reviews

### 19.3 Homologação por módulo

Auth e identidade:

- `register`
- `login`
- `verify`
- `logout`
- distinção correta entre `user` e `partner`

Onboarding:

- `account_created`
- `documents_pending`
- `under_review`
- `approved`
- `nextStep` coerente

Catálogo:

- criação de produto com naming canônico
- listagem por loja e categoria
- disponibilidade do produto

Pedidos:

- criação com `delivery_mode`
- transição de status pela loja
- integração com delivery quando `app_motoboy`

Delivery:

- criação
- aceite
- pickup
- in transit
- complete
- location update

Emergência e tow:

- criação da ocorrência
- cálculo inicial do backend
- proposta
- aceite de proposta
- cobrança principal
- taxa de cancelamento quando aplicável

Assinaturas:

- criação
- status por parceiro
- bloqueio por inadimplência

Pagamentos e carteira:

- criação de pagamento
- confirmação
- refund
- comissão
- crédito em carteira
- saque

Notificações:

- persistência
- leitura
- unread count
- marcação como lida

Uploads:

- upload genérico de imagem
- upload documental do parceiro
- upload documental do usuário final

Avaliações:

- criação de review oficial
- leitura da reputação do parceiro
- moderação admin quando aplicável

---

## 20. Erros comuns de integração

### 20.1 Auth

- `400`
  - payload inválido
  - email já cadastrado
- `401`
  - email ou senha inválidos
  - token ausente
  - token inválido
- `403`
  - tentativa de operar rota sem papel suficiente

### 20.2 Onboarding e documentos

- `400`
  - documento obrigatório ausente
  - tipo de arquivo inválido
  - arquivo acima do limite
  - submissão sem conjunto documental completo
- `403`
  - parceiro tentando operar documento que não pertence a ele

### 20.3 Catálogo e pedidos

- `400`
  - `delivery_mode` ausente ou inválido
  - estoque insuficiente
  - status inválido para a transição
- `403`
  - parceiro tentando operar loja de outro dono

### 20.4 Delivery

- `400`
  - corrida fora do estado esperado para aceite, pickup ou conclusão
- `403`
  - ator errado tentando operar corrida

### 20.5 Emergência e tow

- `400`
  - proposta abaixo do piso mínimo
  - aceite de proposta em estado incompatível
- `403`
  - parceiro sem papel adequado para a operação

### 20.6 Pagamentos e carteira

- `400`
  - saque abaixo do mínimo
  - pagamento incompatível com o domínio informado
- `403`
  - usuário tentando consultar, cancelar ou reembolsar pagamento sem posse real

### 20.7 Resposta recomendada no app

- usar `message` como texto primário de UX
- usar o status HTTP para decidir comportamento técnico
- não inferir regra de negócio apenas a partir do texto do erro

---

## 21. Anexo prático para Postman ou Insomnia

### 21.1 Variáveis recomendadas

```text
BASE_URL=http://127.0.0.1:3001/api
CLIENT_TOKEN=<jwt_cliente>
PARTNER_TOKEN=<jwt_partner>
ADMIN_TOKEN=<jwt_admin>
PARTNER_ID=<partner_id>
STORE_ID=<store_id>
PRODUCT_ID=<product_id>
PURCHASE_ORDER_ID=<purchase_order_id>
DELIVERY_ORDER_ID=<delivery_order_id>
EMERGENCY_REQUEST_ID=<emergency_request_id>
```

### 21.2 Login de cliente

`POST {{BASE_URL}}/auth/login`

```json
{
  "email": "joao@email.com",
  "password": "123456"
}
```

### 21.3 Verify de parceiro

`GET {{BASE_URL}}/auth/verify`

Header:

```text
Authorization: Bearer {{PARTNER_TOKEN}}
```

### 21.4 Criar produto

`POST {{BASE_URL}}/products`

Header:

```text
Authorization: Bearer {{PARTNER_TOKEN}}
```

```json
{
  "store_id": {{STORE_ID}},
  "name": "Galão de Gasolina 5L",
  "category": "fuel",
  "subcategory": "gasoline",
  "price": 79.9,
  "stock": 12
}
```

### 21.5 Criar pedido de compra

`POST {{BASE_URL}}/purchase-orders`

Header:

```text
Authorization: Bearer {{CLIENT_TOKEN}}
```

```json
{
  "store_id": {{STORE_ID}},
  "items": [
    {
      "product_id": {{PRODUCT_ID}},
      "name": "Galão de Gasolina 5L",
      "quantity": 1,
      "unit_price": 79.9
    }
  ],
  "subtotal": 79.9,
  "delivery_fee": 12.0,
  "total_price": 91.9,
  "delivery_mode": "app_motoboy",
  "delivery_address": "Rua Exemplo, 123",
  "payment_method": "pix"
}
```

### 21.6 Aceitar corrida como motoboy

`POST {{BASE_URL}}/delivery-orders/{{DELIVERY_ORDER_ID}}/accept`

Header:

```text
Authorization: Bearer {{PARTNER_TOKEN}}
```

### 21.7 Criar emergência tow

`POST {{BASE_URL}}/emergency-requests`

Header:

```text
Authorization: Bearer {{CLIENT_TOKEN}}
```

```json
{
  "type": "tow",
  "request_type": "tow",
  "address": "Avenida Central, 100",
  "latitude": -23.961,
  "longitude": -46.333,
  "vehicle_origin_address": "Avenida Central, 100",
  "vehicle_origin_latitude": -23.961,
  "vehicle_origin_longitude": -46.333,
  "vehicle_destination_address": "Oficina Exemplo, Rua B, 200",
  "vehicle_destination_latitude": -23.955,
  "vehicle_destination_longitude": -46.321
}
```

### 21.8 Enviar proposta de tow

`POST {{BASE_URL}}/tow-proposals`

Header:

```text
Authorization: Bearer {{PARTNER_TOKEN}}
```

```json
{
  "emergency_request_id": {{EMERGENCY_REQUEST_ID}},
  "proposed_price": 120,
  "estimated_time_minutes": 35,
  "message": "Posso atender agora"
}
```

### 21.9 Solicitar saque

`POST {{BASE_URL}}/wallets/withdraw`

Header:

```text
Authorization: Bearer {{PARTNER_TOKEN}}
```

```json
{
  "amount": 50
}
```

---

## 22. Referência rápida

Arquivos centrais do backend:

- `socorre_ai_backend/src/server.js`
- `socorre_ai_backend/src/routes/partners.js`
- `socorre_ai_backend/src/routes/deliveryOrders.js`
- `socorre_ai_backend/src/routes/emergency-requests.js`
- `socorre_ai_backend/src/routes/subscriptions.js`
- `socorre_ai_backend/src/routes/payments.js`
- `socorre_ai_backend/src/routes/wallets.js`
- `socorre_ai_backend/src/routes/systemSettings.js`

Documento complementar do repositório:

- `docs/DOCUMENTACAO.md`

Documento histórico de execução:

- `plan-backend`

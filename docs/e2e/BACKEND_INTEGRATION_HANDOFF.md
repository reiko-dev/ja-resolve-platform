# Backend Integration Handoff — Mobile ↔ Backend

> Fonte única de verdade do contrato de integração entre o aplicativo cliente (Flutter) e o backend.
>
> **Estado reconciliado em 2026-09-16 (HEAD `1b2ccc3e`):** as correções de E2E-010/E2E-011 foram
> implementadas no packet T3 (`66d0d6fa`, merge `4ee4ec2b`) e o contrato local passa
> (grupos A+B; `tests/endpoints` + `tests/auth` + `tests/integration` = 241/241). A revalidação em
> device físico e em produção continua **pendente**: o deploy externo não foi executado e é o único
> blocker operacional real (HUMAN_REQUIRED). As observações de device citadas abaixo são
> **históricas**, anteriores ao fix local; nada aqui declara produção validada.

## 1. Objetivo

Os contratos registrados neste documento (testes em `tests/endpoints/purchase-orders.integration.test.js`) precisam estar **100% PASS** para considerarmos a integração Mobile ↔ Backend funcional. No estado atual (`1b2ccc3e`), os grupos A+B passam no harness local; falta a revalidação contra o backend publicado, bloqueada pelo deploy externo.

## 2. O que JÁ FUNCIONA (não precisa ser alterado pelo backend)

Observação **histórica** de device físico real (Samsung SM-S938B, `socorre_client` v1.0.0+1, contra `https://api.socorreja.com.br/api`), registrada antes dos fixes locais dos packets T1–T6:

- `POST /auth/login` → 200, token em `data.token`;
- autenticação Bearer nas chamadas autenticadas;
- `GET /products` → 200 (4 produtos E2E da store 3);
- catálogo real após autenticação;
- `GET /emergency-requests/user` com Bearer;
- fluxos Emergency/Tow chegam ao backend autenticados (sem o 401 anterior);
- `POST /purchase-orders` **chega** ao backend — payload completo (`store_id`, `items[product_id|name|quantity|unit_price]`, `subtotal`, `total_price`, `delivery_mode`, `delivery_fee`, `delivery_address`, `payment_method`, `notes`), porém era rejeitado pelo problema de `payment_method` (E2E-010 — histórico; corrigido localmente no T3, ver §3.1);
- cart é **local** no Mobile — NÃO requer backend;
- logout/gate de autenticação já corrigidos no Mobile — NÃO atribuir ao backend.

## 3. Blockers originais (histórico) e status local

### 3.1 E2E-010 — Purchase Order rejeitado por `payment_method`

| Campo | Valor |
|---|---|
| **ID** | E2E-010 |
| **Prioridade** | P1 |
| **Endpoint** | `POST /api/purchase-orders` |
| **Comportamento observado no device (histórico, pré-fix)** | Mobile envia `payment_method = "credit_card"`; o valor chega ao INSERT e viola o CHECK constraint `purchase_orders_payment_method_check` (conjunto canônico: `cash / card / pix / app`); backend responde **500** com o SQL do constraint vazado |
| **Status local (pós-T3, `1b2ccc3e`)** | **Corrigido e coberto por teste no harness local:** `credit_card` é normalizado para `card` antes do INSERT; valor inválido → 400 sem INSERT; `purchase-orders.integration.test.js` (grupo B) passa. Produção/device ainda **não revalidados** (deploy externo pendente). |
| **Comportamento esperado** | `credit_card` é aceito como entrada do Mobile; backend normaliza para o valor canônico oficial (`card`); **201**; valores realmente inválidos → **400** com validação **antes do INSERT**; PO persistido corretamente |
| **Payload relevante** | `{ "store_id": 3, "items": [...], "subtotal": 459.4, "total_price": 475.3, "delivery_mode": "store_delivery", "delivery_fee": 15.9, "delivery_address": "AV. PAULISTA, 1578 - Bela Vista, Sao Paulo - SP, 01310-200", "payment_method": "credit_card", "notes": "Pedido via app Ja Resolve" }` |
| **HTTP esperado** | 201 (sucesso) / 400 (payment_method inválido) |
| **Impacto no fluxo Mobile** | Checkout travado: o usuário não consegue concluir o pedido; ARCH-034 sem conclusão |
| **Evidência/teste** | Device PHASE 4 (500 + CHECK no body); teste de contrato: `purchase-orders.integration.test.js` — grupo B (`credit_card` → 201; inválido → 400) |
| **Critério objetivo de aceite** | Payload real do Mobile → `POST /purchase-orders` → **201**, com `user_id`, `store_id`, `items`, `subtotal`, `delivery_fee`, `total_price`, `delivery_mode` corretos e `payment_method` persistido no canônico oficial; `payment_method` inválido → **400** sem tentativa de INSERT |

### 3.2 E2E-011 — Erro interno vazando para o cliente

| Campo | Valor |
|---|---|
| **ID** | E2E-011 |
| **Prioridade** | P3 |
| **Endpoint** | `POST /api/purchase-orders` (tratamento de erro) |
| **Comportamento observado no device (histórico, pré-fix)** | O device recebeu na resposta de erro o texto do constraint SQL (tabela/INSERT/CHECK) |
| **Status local (pós-T3, `1b2ccc3e`)** | **Corrigido e coberto por teste no harness local:** erros internos viram **500** genérico sem SQL, constraint ou stack; os asserts anti-leak do grupo B passam. Produção/device ainda **não revalidados** (deploy externo pendente). |
| **Comportamento esperado** | Erros internos → **HTTP 500**; a resposta NÃO pode expor SQL, nome de constraint, stack trace ou detalhes internos do PostgreSQL; mensagem genérica e segura para o cliente |
| **Payload relevante** | (resposta de erro) |
| **HTTP esperado** | 500 genérico |
| **Impacto no fluxo Mobile** | Exposição de detalhes internos na UI; dificulta diagnóstico e é risco de segurança |
| **Evidência/teste** | Device PHASE 4 (body com SQL do CHECK); teste de contrato grupo B (asserts anti-leak: sem `insert into`, sem `constraint`, sem `PostgreSQL`, sem stack) |
| **Critério objetivo de aceite** | Qualquer erro interno do endpoint → **500** com mensagem segura, sem SQL/constraint/stack |

### 3.3 E2E-008 — Emergency lifecycle: start / complete

| Campo | Valor |
|---|---|
| **ID** | E2E-008 |
| **Prioridade** | P2 |
| **Endpoint** | `POST /emergency-requests/:id/start` e `POST /emergency-requests/:id/complete` |
| **Comportamento observado em produção (histórico)** | **404** em produção para ambos |
| **Status local (G1 + T1, `1b2ccc3e`)** | Rotas de start/complete implementadas e cobertas pelas suítes de guincho no harness local (G1 `48c531d0`, merge `42b2d7ab`; suíte completa verde no pós-T6). A confirmação em produção continua **pendente do deploy externo** — não declarar resolvido em produção. |
| **Comportamento esperado** | Endpoints existem em produção; `start` realiza a transição de estado prevista; `complete` realiza a transição de estado prevista |
| **Payload relevante** | `:id` = id do emergency request autenticado |
| **HTTP esperado** | 200/201 nos estados válidos; 404/400 para recurso ou estado inválido (a definir pela implementação oficial) |
| **Impacto no fluxo Mobile** | Fluxo de socorro não avança para execução/conclusão; bloqueia a pós-serviço |
| **Evidência/teste** | Device PHASE 4 (404 em produção, histórico); contrato local implementado no G1 e coberto pelas suítes de guincho — a confirmação em produção continua pendente do deploy externo |
| **Critério objetivo de aceite** | Transições oficiais funcionando em produção (`accepted → start → in_progress → complete → completed → review`) via endpoints oficiais |

> **NÃO usar/deployar `b0999489`** (evidência histórica, fora deste escopo). O deploy externo **não** foi executado: não declarar E2E-008 resolvido em produção sem smoke no ambiente publicado.

## 4. Separação dos testes

| Grupo | Significado | Estado atual (`1b2ccc3e`) |
|---|---|---|
| **A** | Testes que já passam contra o backend atual | 401 sem token; `card` → 201; `pix` → 201 — **PASS** |
| **B** | Contrato implementado no packet T3 (E2E-010/E2E-011) | `credit_card` → 201; inválido → 400; sem vazamento de SQL; loja inexistente → 404 sem leak — **PASS no harness local**; revalidação em produção/device pendente do deploy externo |
| **C** | Fora de escopo (documentado, sem teste) | start/complete (E2E-008 — rotas locais ok, produção pendente de deploy); detalhe de produto (E2E-006); proposal no fluxo (E2E-009) |

Os fixes foram implementados no packet T3 (`66d0d6fa`, merge `4ee4ec2b`) e os grupos A+B passam integralmente no harness local (`tests/endpoints` + `tests/auth` + `tests/integration` = 241/241). A confirmação contra o backend publicado continua pendente do deploy externo (blocker `production-deploy-access`, HUMAN_REQUIRED).

## 5. Observações que NÃO são bugs de backend

- **E2E-006:** tap no produto não abre detalhe — a aplicação não possui tela/rota de detalhe. **OBSERVATION — NOT A BUG.**
- **E2E-009:** proposal existente não aparece no fluxo atual sem uma nova request. **OBSERVATION / P3** — questão de fluxo/produto/frontend.

## 6. Separação de responsabilidade

**AUDITORIA / FRONTEND:**

- execução E2E em device físico (observação histórica, pré-fix);
- testes de contrato;
- documentação e evidências;
- revalidação após deploy do backend (pendente do blocker externo).

**BACKEND DEVELOPER (packets já integrados em main, HEAD `1b2ccc3e`):**

- E2E-010: **implementado** no T3 (`66d0d6fa`, merge `4ee4ec2b`) — alias `credit_card` → `card` e validação antes do INSERT;
- E2E-011: **implementado** no T3 — erro interno vira 500 genérico, sem SQL/constraint/stack;
- E2E-008: rotas locais de start/complete implementadas no G1 (`48c531d0`, merge `42b2d7ab`); **publicação e confirmação em produção pendentes do deploy externo**;
- corrigir qualquer falha backend revelada pelos testes.

A publicação em produção **não** foi executada: o deploy externo segue HUMAN_REQUIRED.

## 7. Critérios de revalidação

Quando o deploy externo estiver disponível (blocker `production-deploy-access`):

1. executar `purchase-orders.integration.test.js` → grupos A+B **100% PASS** — **já verificado no harness local** (`1b2ccc3e`; `tests/endpoints` + `tests/auth` + `tests/integration` = 241/241);
2. reexecutar o E2E no dispositivo físico contra o backend publicado: login → catálogo → cart → checkout → `POST /purchase-orders` → **201** → PO criado → histórico do pedido → fluxo de pagamento (pendente);
3. em fase separada, validar start/complete em produção (pendente).

# Backend Integration Handoff — Mobile ↔ Backend

> Fonte única de verdade do contrato de integração entre o aplicativo cliente (Flutter) e o backend.
> Este documento e os testes deste PR **não** implementam correções: definem, de forma executável e objetiva, o comportamento esperado que o backend developer deve entregar.

## 1. Objetivo

Depois que o backend developer corrigir os blockers descritos aqui, os contratos registrados neste PR (testes em `tests/endpoints/purchase-orders.integration.test.js`) precisam estar **100% PASS** para considerarmos a integração Mobile ↔ Backend 100% funcional.

## 2. O que JÁ FUNCIONA (não precisa ser alterado pelo backend)

Validado em dispositivo físico real (Samsung SM-S938B, `socorre_client` v1.0.0+1, contra `https://api.socorreja.com.br/api`):

- `POST /auth/login` → 200, token em `data.token`;
- autenticação Bearer nas chamadas autenticadas;
- `GET /products` → 200 (4 produtos E2E da store 3);
- catálogo real após autenticação;
- `GET /emergency-requests/user` com Bearer;
- fluxos Emergency/Tow chegam ao backend autenticados (sem o 401 anterior);
- `POST /purchase-orders` **chega** ao backend — payload completo (`store_id`, `items[product_id|name|quantity|unit_price]`, `subtotal`, `total_price`, `delivery_mode`, `delivery_fee`, `delivery_address`, `payment_method`, `notes`), porém é rejeitado pelo problema de `payment_method` (E2E-010);
- cart é **local** no Mobile — NÃO requer backend;
- logout/gate de autenticação já corrigidos no Mobile — NÃO atribuir ao backend.

## 3. Blockers — o que o backend precisa corrigir

### 3.1 E2E-010 — Purchase Order rejeitado por `payment_method`

| Campo | Valor |
|---|---|
| **ID** | E2E-010 |
| **Prioridade** | P1 |
| **Endpoint** | `POST /api/purchase-orders` |
| **Comportamento atual observado** | Mobile envia `payment_method = "credit_card"`; o valor chega ao INSERT e viola o CHECK constraint `purchase_orders_payment_method_check` (conjunto canônico: `cash / card / pix / app`); backend responde **500** com o SQL do constraint vazado |
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
| **Comportamento atual observado** | O device recebeu na resposta de erro o texto do constraint SQL (tabela/INSERT/CHECK) |
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
| **Comportamento atual observado** | **404** em produção para ambos |
| **Comportamento esperado** | Endpoints existem em produção; `start` realiza a transição de estado prevista; `complete` realiza a transição de estado prevista |
| **Payload relevante** | `:id` = id do emergency request autenticado |
| **HTTP esperado** | 200/201 nos estados válidos; 404/400 para recurso ou estado inválido (a definir pela implementação oficial) |
| **Impacto no fluxo Mobile** | Fluxo de socorro não avança para execução/conclusão; bloqueia a pós-serviço |
| **Evidência/teste** | Device PHASE 4 (404 em produção); gap documentado — SEM teste especulativo, pois o contrato não está definido nas rotas atuais de `main` |
| **Critério objetivo de aceite** | Transições oficiais funcionando em produção (`accepted → start → in_progress → complete → completed → review`) via endpoints oficiais |

> **NÃO usar/deployar `b0999489`** (evidência histórica, fora deste PR). **NÃO implementar a solução neste PR.**

## 4. Separação dos testes

| Grupo | Significado | Estado atual |
|---|---|---|
| **A** | Testes que já passam contra o backend atual | 401 sem token; `card` → 201; `pix` → 201 |
| **B** | Testes que falham porque o backend precisa implementar/corrigir (blockers E2E-010/E2E-011) | `credit_card` → 201 (hoje 500); inválido → 400 (hoje 500); sem vazamento de SQL (hoje vaza); loja inexistente → 404 sem leak (hoje 500) |
| **C** | Fora de escopo (documentado, sem teste) | start/complete (E2E-008, contrato não definido); detalhe de produto (E2E-006); proposal no fluxo (E2E-009) |

Após a implementação dos fixes pelo backend developer, o grupo B deve passar integralmente → **grupos A+B = 100% PASS**.

## 5. Observações que NÃO são bugs de backend

- **E2E-006:** tap no produto não abre detalhe — a aplicação não possui tela/rota de detalhe. **OBSERVATION — NOT A BUG.**
- **E2E-009:** proposal existente não aparece no fluxo atual sem uma nova request. **OBSERVATION / P3** — questão de fluxo/produto/frontend.

## 6. Separação de responsabilidade

**AUDITORIA / FRONTEND (este PR):**

- execução E2E em device físico;
- testes de contrato;
- documentação e evidências;
- revalidação após deploy do backend.

**BACKEND DEVELOPER:**

- implementar E2E-010 (contrato `payment_method`, 201, 400);
- implementar E2E-011 (500 genérico sem vazamento);
- implementar/publicar E2E-008 (start/complete em produção);
- corrigir qualquer falha backend revelada pelos testes.

Este PR **não** implementa essas correções.

## 7. Critérios de revalidação

Quando o backend developer informar que os fixes estão em produção:

1. executar `purchase-orders.integration.test.js` → grupos A+B **100% PASS**;
2. reexecutar o E2E no dispositivo físico: login → catálogo → cart → checkout → `POST /purchase-orders` → **201** → PO criado → histórico do pedido → fluxo de pagamento;
3. em fase separada, validar start/complete em produção.

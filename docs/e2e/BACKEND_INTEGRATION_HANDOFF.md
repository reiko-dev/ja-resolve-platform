# Backend Integration Handoff

> Contrato de integração E2E (frontend Flutter × backend de produção) para o backend developer.
> Este PR **não** implementa correções: ele define, com testes executáveis, o comportamento esperado.

## 1. Objetivo

Definir o contrato necessário para o E2E completo do aplicativo cliente contra produção, registrar o que já foi validado em dispositivo físico e entregar ao backend developer os critérios objetivos de aceite dos blockers atuais.

## 2. O que já funciona

Validado em dispositivo físico real (Samsung SM-S938B, `socorre_client` v1.0.0+1, apontando para `https://api.socorreja.com.br/api`):

- cold start sem sessão
- login real
- logout
- catálogo real (4 produtos E2E da store 3)
- autenticação Bearer
- emergency request autenticada
- tow flow autenticado
- cart local
- checkout UI
- `POST /purchase-orders` sendo alcançado pelo frontend

## 3. O que está bloqueado

### E2E-010 — Purchase Order / payment_method — P1 — BACKEND

- **Endpoint:** `POST /api/purchase-orders`
- **Payload observado (device):**

```json
{
  "store_id": 3,
  "items": [
    { "product_id": 1, "name": "Filtro de oleo Tecfil", "quantity": 1, "unit_price": 39.9 },
    { "product_id": 2, "name": "Oleo 5W30 sintetico", "quantity": 4, "unit_price": 44.95 },
    { "product_id": 3, "name": "E2E Oleo Motor 5W30", "quantity": 2, "unit_price": 89.9 },
    { "product_id": 4, "name": "E2E Kit Lampadas LED", "quantity": 1, "unit_price": 59.9 }
  ],
  "subtotal": 459.4,
  "total_price": 475.3,
  "delivery_mode": "store_delivery",
  "delivery_fee": 15.9,
  "delivery_address": "AV. PAULISTA, 1578 - Bela Vista, Sao Paulo - SP, 01310-200",
  "payment_method": "credit_card",
  "notes": "Pedido via app Ja Resolve"
}
```

- **Campo problemático:** `payment_method = "credit_card"`
- **Comportamento atual:** o backend/database possui contrato canônico diferente (`cash`, `card`, `pix`, `app`) e o INSERT falha
- **HTTP observado:** 500
- **Constraint observada:** `purchase_orders_payment_method_check`
- **Comportamento esperado:**
  - payload real do frontend deve ser aceito;
  - backend deve normalizar/interpretar `credit_card` conforme o contrato oficial;
  - PO criado com **HTTP 201**;
  - valor inválido → **HTTP 400**, sem INSERT inválido;
  - `user_id`, `store_id`, `items`, `subtotal`, `delivery_fee`, `total_price`, `delivery_mode` persistidos corretamente;
  - `payment_method` persistido no formato canônico definido pelo backend.

> O contrato é testado em `tests/endpoints/purchase-orders.integration.test.js`.
> Este PR não prescreve implementação e não altera migration.

### E2E-011 — Internal error leakage — P3 — BACKEND

Erros internos do INSERT podem expor SQL/constraint ao cliente (observado no device: mensagem com o texto do CHECK constraint).

- **Comportamento esperado:**
  - erro interno → **HTTP 500** apropriado;
  - resposta não pode expor SQL, constraint, stack trace ou detalhes internos do PostgreSQL;
  - mensagem segura para o cliente.

### E2E-008 — start / complete — P2 — BACKEND

Produção atualmente retorna **404** para:

```text
POST /emergency-requests/:id/start
POST /emergency-requests/:id/complete
```

- Requisito comportamental: os endpoints oficiais precisam existir em produção e permitir a transição correta de estado (`accepted → start → in_progress → complete → completed → review`).
- **NÃO usar/deployar `b0999489`** (evidência histórica, fora do escopo).
- Gap documentado, sem teste especulativo: o contrato não está definido nas rotas atuais de `main`.

## 4. Outras observações (não são bugs de backend)

- **E2E-006:** tap no produto não abre detalhe. A aplicação não possui tela/rota de detalhe de produto. **OBSERVATION — NOT A BUG.**
- **E2E-009:** proposal existente não aparece no fluxo atual sem uma nova request. **OBSERVATION / P3** — questão de fluxo/produto/frontend; não atribuir automaticamente ao backend.

## 5. Matriz de aceite

| ID | Fluxo | Status atual | Responsável | Critério de aceite |
|---|---|---|---|---|
| E2E-001 | Cold start sem sessão | RESOLVED | Frontend | Boot sem crash, sem sessão |
| E2E-002 | Login real | RESOLVED | Frontend | Login 200 com token em `data.token` |
| E2E-003 | Logout | RESOLVED | Frontend | Logout limpa sessão |
| E2E-004 | Catálogo real | RESOLVED | Frontend/integration | `GET /products` 200 com produtos reais |
| E2E-005 | Checkout completo | BLOCKED | Backend (E2E-010) | `POST /purchase-orders` → 201, PO persistido |
| E2E-006 | Detalhe de produto | OBSERVATION | — | Sem tela de detalhe — NOT A BUG |
| E2E-007 | Emergency/Tow autenticados | RESOLVED | Frontend/integration | Chamadas com Bearer sem 401 |
| E2E-008 | start/complete | OPEN — BACKEND | Backend | Endpoints oficiais em produção, transições de estado |
| E2E-009 | Proposal no fluxo atual | OBSERVATION | Produto/Frontend | Sem nova request, proposal não aparece |
| E2E-010 | PO payment_method | OPEN — BACKEND | Backend | `credit_card` → 201; inválido → 400 |
| E2E-011 | Internal error leakage | OPEN — BACKEND | Backend | 500 genérico sem SQL/constraint/stack |

**ARCH-034: NOT VALIDATED TO COMPLETION** — o frontend alcança `POST /purchase-orders`, mas o backend de produção rejeita a requisição.

## 6. Separação de responsabilidade

**AUDITORIA / FRONTEND:**

- execução E2E em device físico;
- testes de contrato (este PR);
- documentação e evidências;
- revalidação após deploy do backend.

**BACKEND DEVELOPER:**

- implementar E2E-010 (contrato `payment_method`, 201, 400);
- implementar E2E-011 (500 genérico sem vazamento);
- implementar/publicar E2E-008 (start/complete em produção);
- corrigir qualquer falha backend revelada pelos testes.

Este PR **não** implementa essas correções.

## 7. Revalidação

Quando o backend developer informar que os fixes estão em produção, reexecutar no dispositivo físico, **somente validação**: login → catálogo → cart → checkout → `POST /purchase-orders` → confirmar **201** → PO criado → histórico do pedido → fluxo de pagamento. Em fase separada, validar start/complete.

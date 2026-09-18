# T00 — Tow Test & Contract Harness

> Escopo: **fundação de testes T00**. Nenhuma funcionalidade Tow v1 (T01+) é
> implementada aqui. Este documento descreve os comandos canônicos e o que cada
> gate prova.

Referências normativas: `docs/tow/TOW-DOCKER-TEST-STRATEGY.md` (§5 comando
canônico, §6 PostgreSQL real, §9 segurança), `docs/tow/TOW-OPENAPI-CONSISTENCY-REVIEW.md`
(obrigação de reproduzir a validação do contrato dentro do repositório/CI).

Todos os comandos abaixo são executados a partir de `socorre_ai_backend/`.

---

## 1. Comandos canônicos

| Comando | O que faz | Docker? | Rede externa? |
| --- | --- | --- | --- |
| `npm run validate:openapi` | Valida a composição OpenAPI 3.1 (`$ref`s locais, `operationId` único, path params, request/response bodies, enums, `TowSettingsPatch`) | não | não |
| `npm run test:contract` | Suíte de contrato: estrutura OpenAPI, semântica de PATCH, discovery/rehydration e smoke dos 3 consumidores | não | não |
| `npm run test:tow` | Suíte Tow focada (inclui a fundação determinística; gate PostgreSQL fica *skipped*) | não | não |
| `npm run test:pg` | Sobe PostgreSQL descartável → healthcheck → migrations do zero → gate PostgreSQL → destrói | sim | não |
| `npm run verify:tow` | Sequência completa acima (offline + PostgreSQL) e derruba o ambiente mesmo em falha | sim | não |
| `npm run verify:tow:offline` | `verify:tow` sem a etapa PostgreSQL (CI sem Docker) | não | não |

Evidência RED reproduzível (por que o harness existe):

```bash
bash scripts/tow/red-evidence.sh    # a partir da raiz do repositório
```

## 2. Gate OpenAPI 3.1

- Entrada canônica: `docs/tow/tow-api-contract.openapi.yaml`.
- Base referenciada: `docs/tow/tow-api-contract.base.openapi.yaml`.
- Composição: itens de path inline na canônica **sobrescrevem** integralmente o
  path item da base; os 11 operations sombreados da base não são contados duas vezes.
- Contadores esperados (congelados em `TOW-OPENAPI-CONSISTENCY-REVIEW.md`):
  56 paths canônicos, 51 paths na base, 56 paths compostos, 66 operations,
  10 paths sombreados, 0 `$ref` não resolvidos, 0 `operationId` ausente/duplicado.

O validador é implementado em `tests/helpers/towContract.js` (biblioteca) e
exposto em `scripts/tow/validate-openapi.js` (CLI, `--json` opcional). A suíte
`tests/contract/openapi.structure.test.js` inclui controles negativos: um `$ref`
quebrado e um `operationId` duplicado devem falhar.

## 3. Fundação determinística

`tests/helpers/tow/` fornece apenas mecanismos (sem regra de negócio):

| Helper | Papel |
| --- | --- |
| `clock.js` | `TowFakeClock` — instantes fixos, avanço controlado, `jest.useFakeTimers`. Não controla `NOW()` do PostgreSQL (documentado). |
| `factories.js` | Fixtures de linhas **existentes** no schema atual (`users`, `partners`, `emergency_requests`, `tow_proposals`, `system_settings`). Nenhuma tabela Tow v1 é fabricada. |
| `builders.js` | Payloads derivados do contrato: `build(schema)` para componentes e `buildRequestFor(operationId)` para request bodies (inclusive inline). Payload inválido lança. |
| `auth.js` | Tokens reais (assinados com o segredo de teste) para customer/partner/admin, além de tokens forjado/expirado. |
| `gateways/mapsGateway.js` | Port double de rotas/matriz de distância com resposta canônica. Nunca calcula preço/km/raio. |
| `gateways/paymentGateway.js` | Port double de pagamento com ids fixos. |
| `postgres.js` | Conexão, migrations do zero, truncate, rollback e contagem — sempre via guarda de segurança. |

## 4. Gate PostgreSQL (opt-in)

- Ambiente: `docker-compose.test.yml` (postgres:14, `tmpfs`, network isolada,
  healthcheck, credenciais descartáveis, sem volume persistente).
- Config: `.env.test.example` (placeholders; copie para `.env.test` se necessário).
- Guarda *fail closed*: `scripts/tow/pg-guard.js` recusa host não-loopback, banco
  sem sufixo `_test`, `DATABASE_URL`/`PostgreSQL` definidos ou usuário com cara de
  produção. Toda operação destrutiva passa por ela.
- O gate `tests/tow/foundation/towPostgresFoundation.e2e.test.js` prova:
  PostgreSQL 14 real, migrations a partir de schema vazio, isolamento
  (truncate + rollback) e boot do app contra PostgreSQL.
- `TOW_POSTGRES_E2E=0` veta explicitamente a etapa.

## 5. Fronteira Google Maps / Routes

Os testes padrão nunca chamam Google. O contrato Tow v1 prevê portas de
roteamento/matriz de distância; T00 fornece somente o double determinístico
(`tests/helpers/tow/gateways/mapsGateway.js`). A auditoria da implementação
legada está em `docs/tow/T00-CURRENT-STATE-AUDIT.md`.

## 6. O que T00 NÃO faz

- Não implementa nenhuma funcionalidade T01+ (feature flag, fluxo de veículo,
  aprovação de documento, pricing, matching, raio, proposta, contraproposta,
  atribuição atômica, pagamento, tracking, conclusão/cancelamento, wallet,
  settlement, payout, disputa).
- Não cria tabelas Tow v1 nem migrations novas.
- Não altera comportamento de negócio existente.
- Não substitui PostgreSQL por SQLite para provar invariantes de banco.

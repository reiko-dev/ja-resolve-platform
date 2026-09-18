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
bash scripts/tow/red-evidence.sh        # RED-1..RED-5 (a partir da raiz do repositório)
bash scripts/tow/root-lock-evidence.sh  # trava do workspace root (RED/GREEN isolados)
```

## 1.1 Obrigação do lock do workspace raiz

A raiz do repositório é um workspace npm (`workspaces: [socorre_ai_backend, socorre_ai_admin]`).
Isso significa que **toda** dependência declarada em `socorre_ai_backend/package.json` ou
`socorre_ai_admin/package.json` também é registrada em `package-lock.json` **da raiz** — não só no
`package-lock.json` do pacote. Adicionar uma dependência de workspace sem ressincronizar o lock da
raiz quebra `npm ci` para todo mundo:

```text
npm error `npm ci` can only install packages when your package.json and package-lock.json ... are in sync.
npm error Missing: ajv@8.20.0 from lock file
```

Regra para T01+: **ao alterar qualquer `package.json` de workspace, rode na raiz**

```bash
npm install --package-lock-only    # não toca em node_modules nem nos package.json
```

e confirme `npm ci --dry-run` em uma cópia isolada (`bash scripts/tow/root-lock-evidence.sh`).
Este repositório já corrigiu essa mesma classe de drift uma vez em
`15771e1e fix(release): sync workspace root lock with backend sharp dependency`; T00 a corrigiu
de novo para `ajv`, `ajv-formats` e `yaml`. Evidência: `docs/evidence/t00/root-lock-sync-red.txt`
(exit 1), `root-lock-sync-green.txt` (exit 0), `root-lock-sync-diff.txt`.

Nunca commite `node_modules`; o lock da raiz é o único artefato de dependência a versionar.

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
  O template é versionado **intencionalmente**: `.gitignore` o excluía por `**/.env.*` e ele só
  estava no Git porque foi adicionado com `-f`. T00 acrescentou a negação exata
  `!socorre_ai_backend/.env.test.example` logo após `!**/.env.example`, de modo que o template
  entra por regra, não por força. O escopo é um único caminho: `.env`, `.env.test`,
  `.env.local`, `.env.production` e `.env.bak` continuam ignorados (verificado com
  `git check-ignore --no-index -q`).
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

## 6. Mapeamento do critério RED (Issue #11)

Critério da Issue #11: *"Demonstrar pelo menos um teste de harness inicialmente falhando por uma
deficiência real encontrada e documentar a razão."*

T00 é uma task de **harness**, não de feature. A deficiência real no estado-base é
**"gate/ambiente ausente"** — não existe validador OpenAPI no repositório, não existe suíte de
contrato, não existe fundação determinística nem gate PostgreSQL — somada à
**não-determinação dos gateways legados** (sleep real, relógio de parede, RNG), que é uma
deficiência de código de produção reproduzível hoje. Cada artefato RED prova uma dessas
deficiências:

| RED | Artefato | Deficiência real que prova | Tipo |
| --- | --- | --- | --- |
| RED-1 | `red-1-contract-gate-absent.txt` | Nenhum gate de contrato/consumidor no estado-base: `jest tests/contract` → `No tests found`, exit 1. | ausência (base) |
| RED-2 | `red-2-openapi-validator-absent.txt` | Nenhum validador OpenAPI 3.1 no repositório: `scripts/tow/validate-openapi.js` → `Cannot find module`, exit 1. | ausência (base) |
| RED-3 | `red-3-deterministic-foundation-absent.txt` | Nenhuma fundação determinística nem ambiente PostgreSQL descartável: todos os caminhos esperados ausentes no estado-base. | ausência (base) |
| RED-4 | `red-4-legacy-gateway-nondeterminism.txt` | Gateways de pagamento legados usam `Date.now()`, `Math.random()` e `setTimeout()` reais → testes lentos, flaky e não reexecutáveis. | defeito de código (base e HEAD) |
| RED-5 | `red-5-tow-settings-patch-mutation.txt` | O gate **detecta** a forma pré-freeze proibida de `TowSettingsPatch` (`allOf: [TowSettings, {...}]`, `TOW-OPENAPI-CONTRACT-DECISIONS.md` §2): contrato mutado → 15 testes falham, exit 1. | mutação / controle negativo |

RED-1..RED-3 são provas de **ausência** e por isso não podem ser "uma asserção falhando": no
estado-base não existe teste para falhar. RED-4 é uma asserção sobre o código legado (grep
determinístico), não sobre o harness. RED-5 fecha a lacuna: é uma **asserção executável que
falha pela razão correta** contra uma violação deliberada de uma decisão já congelada.

Isso segue `TOW-TDD-IMPLEMENTATION-PLAN.md` §4 (RED): *"Se comportamento já existir, registrar
baseline e criar teste de compatibilidade/regressão em vez de fabricar RED artificial."* O
comportamento de `TowSettingsPatch` já está congelado antes de T00; fabricar um endpoint Tow v1
falhando seria RED artificial. A prova honesta para comportamento congelado é o
**controle negativo / mutação**: mutar o contrato para a forma proibida e mostrar o gate
reprovando. O par GREEN é a suíte de contrato intacta (`green-contract-suite.txt`, 51 passed,
exit 0).

Reprodução: `bash scripts/tow/red-evidence.sh` (RED-1..RED-5, worktrees descartáveis, sem
alterar a árvore principal).

## 7. O que T00 NÃO faz

- Não implementa nenhuma funcionalidade T01+ (feature flag, fluxo de veículo,
  aprovação de documento, pricing, matching, raio, proposta, contraproposta,
  atribuição atômica, pagamento, tracking, conclusão/cancelamento, wallet,
  settlement, payout, disputa).
- Não cria tabelas Tow v1 nem migrations novas.
- Não altera comportamento de negócio existente.
- Não substitui PostgreSQL por SQLite para provar invariantes de banco.

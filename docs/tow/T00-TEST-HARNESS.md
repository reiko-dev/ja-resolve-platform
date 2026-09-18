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

**Caveat de reprodutibilidade (Muse M3-4 / Codex thread 4047474349).** O script usa por padrão
`TOW_LOCK_PREFIX_REF=0c5de7ed`, um ancestral **deste branch**. Enquanto o branch e os refs do PR
existirem, a evidência é reproduzível; depois de um squash merge em `main`, um clone que só tenha
o histórico de `main` não resolve `0c5de7ed` e o script aborta no `cat-file`. Nesse cenário, passe
`TOW_LOCK_PREFIX_REF=<ref alcançável>` (e, se necessário, `TOW_LOCK_CURRENT_REF=<ref>`) ou versione
o blob pré-fix do lock como fixture. Nenhuma mudança de comportamento é necessária no branch atual.

Nunca commite `node_modules`; o lock da raiz é o único artefato de dependência a versionar.

## 2. Gate OpenAPI 3.1

- Entrada canônica: `docs/tow/tow-api-contract.openapi.yaml`.
- Base referenciada: `docs/tow/tow-api-contract.base.openapi.yaml`.
- Composição: itens de path inline na canônica **sobrescrevem** integralmente o
  path item da base; os 10 paths sombreados (11 operations da base) não são contados
  duas vezes. A regra é **superset + allowlist**: toda method da base sombreada precisa
  sobreviver na composição ou estar em `SHADOWED_METHOD_ALLOWLIST` (hoje vazio, congelado).
  `tests/contract/openapi.structure.test.js` verifica method a method e inclui um controle
  negativo que remove um method sombreado sem allowlist e exige `ok === false`. A lista de
  paths sombreados (`base=`, `composed=`, `dropped=`, `added=`) é impressa por
  `npm run validate:openapi` e registrada em `docs/evidence/t00/green-openapi-validation.txt`.
- Contadores esperados (congelados em `TOW-OPENAPI-CONSISTENCY-REVIEW.md`):
  56 paths canônicos, 51 paths na base, 56 paths compostos, 66 operations,
  10 paths sombreados, 0 methods sombreados descartados sem allowlist, 0 `$ref` não
  resolvidos, 0 `operationId` ausente/duplicado.

O smoke de contrato de consumidor é dirigido **apenas** pelo documento OpenAPI composto:
cada passo valida o request body contra o fixture e a resposta 2xx contra o schema tipado.
T00 estende o fluxo Parceiro com os dois DELETEs exigidos por
`TOW-CONSUMER-FLOW-SPEC.md` §6.2 — `deleteTowVehicle` e `deleteTowVehicleDocument` —
levando o fluxo de 29 para **31 operations, 10 request bodies e 31 responses**
(`docs/tow/TOW-CONSUMER-CONTRACT-SMOKE-RESULT.md` é o registro histórico da medição
anterior, 29/9/29, e não é reescrito).

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

**Limitação T00 — factories são SQLite-only (Muse M3-5 / Codex thread 4047474351).**
`factories.js` (e os helpers de auth construídos sobre ele) inserem via
`tests/helpers/testDb.js`, um singleton SQLite `:memory:`; o app Express opt-in conecta no
PostgreSQL. T00 **não exercita nenhum comportamento de negócio em PG** — o gate PostgreSQL usa
Knex cru (`tests/helpers/tow/postgres.js`) e nenhuma rota Tow v1. Consequência: fixtures criadas
pelas factories são invisíveis para o app quando ele aponta para o PostgreSQL. T01+ deve
injetar/aceitar o adapter ativo ou adicionar implementações PG-backed antes que testes de rota
PG dependam dessas factories. É insumo de design para T01, não defeito de T00.

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
- **Contrato de configuração (correção Codex C1).** O harness lê **apenas**
  `socorre_ai_backend/.env.test`, e o faz **explicitamente** via
  `scripts/tow/test-env-file.js` (`loadTestEnvFile`), carregado por
  `scripts/tow/test-env.js`, `scripts/tow/run-pg-gate.js`, `scripts/tow/verify.js`,
  `scripts/tow/pg-guard.js` e `tests/helpers/tow/postgres.js`. O arquivo é
  **opcional**: sem ele valem os defaults do guard (127.0.0.1:55432,
  `socorre_ai_tow_test`, `tow_test`). Variáveis do shell/CI **sempre vencem**
  (nunca `override: true`; valor vazio conta como ausente), `TOW_TEST_ENV_FILE`
  troca o caminho (usado pelos testes de regressão) e `socorre_ai_backend/.env`
  **nunca** é lido pelo harness: `dotenv.config()` sem caminho — que carrega
  `.env` — não participa do caminho de teste. `src/config/database.js` segue
  chamando `dotenv.config()`, mas o harness já exportou o alvo canônico (e
  `NODE_ENV=test`) para os processos filhos antes de qualquer `require`, então um
  `.env` de desenvolvedor não consegue sequestrar a conexão de teste.
- **Porta única (correção Codex C2).** `DB_PORT` é a única variável de porta:
  `docker-compose.test.yml` publica `${DB_PORT:-55432}:5432`, o guard resolve a
  mesma variável e `tests/helpers/tow/postgres.js` conecta nela. `test-env.js`
  entrega o alvo resolvido explicitamente ao `docker compose` (`targetEnv()`),
  então um `.env` perdido não pode mais fazer o container publicar 55432
  enquanto o cliente disca outra porta. A cadeia inteira (porta publicada ==
  guard == Knex == singleton do app) é verificada offline em
  `towPostgresGuard.test.js` e, com container real, em
  `towPostgresFoundation.e2e.test.js`.
- **Cobertura de portas (Muse M3-3).** A evidência *live* cobre duas portas: a default
  55432 (`docs/evidence/t00/green-postgres-gate.txt`) e a não-default 55999
  (`docs/evidence/t00/green-postgres-gate-custom-port.txt`, com
  `DB_PORT=55999 TOW_POSTGRES_E2E=1 npm run test:pg`, `docker port` registrando
  `5432/tcp -> 0.0.0.0:55999` e o mesmo gate 6/6 verde). As demais portas são cobertas
  **apenas offline**, pelas asserções de concordância config/guarda/Knex/compose em
  `towPostgresGuard.test.js` e no teste de renderização do compose; nenhuma execução live
  por porta é alegada.
- **Ciclo de vida (correção Codex C3).** `runWithEnvironment(fn, { up,
  waitForHealth, down, env })` coloca a subida **dentro** do `try` cujo `finally`
  executa `down()`: uma subida que falha no meio (porta ocupada, timeout de
  healthcheck) ainda derruba container, volume tmpfs e network. `down()` é
  idempotente e nunca lança, e a guarda roda antes de qualquer operação
  destrutiva. Provado sem Docker em `towHarnessLifecycle.test.js` (seam
  injetável) e no CLI (docker falso no `PATH`).
- O gate `tests/tow/foundation/towPostgresFoundation.e2e.test.js` prova:
  PostgreSQL 14 real, migrations a partir de schema vazio, isolamento
  (truncate + rollback), porta publicada == porta do cliente e `GET /health`
  respondendo 200 a partir do **mesmo singleton** `src/config/database`, com
  identidade conferida por `current_database()`/`current_user`. Um 404 de rota
  inexistente não é mais aceito como prova de boot (correção Codex C4).
- `TOW_POSTGRES_E2E=0` veta explicitamente a etapa. O estágio offline do
  `verify:tow` roda sempre com `TOW_POSTGRES_E2E=0`, então a presença de
  `.env.test` não obriga esse estágio a subir container.

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
- Não prova comportamento de negócio no PostgreSQL: as factories de
  `tests/helpers/tow/factories.js` inserem pelo SQLite de teste
  (`tests/helpers/testDb.js`, `:memory:`) enquanto o app opt-in conecta no PostgreSQL —
  limitação aceita em T00 (Muse M3-5 / Codex thread 4047474351); T01+ deve
  injetar/aceitar o adapter ativo ou adicionar factories PG-backed antes que testes de
  rota PG dependam delas. Pela mesma família de caveats, a reprodutibilidade do
  root-lock fora dos refs deste branch não é prometida (M3-4: o default
  `TOW_LOCK_PREFIX_REF=0c5de7ed` é ancestral deste branch, não de um histórico
  squash-only — ver §1.1).

## 8. Definição de determinismo das evidências

"Determinístico" nos artefatos de T00 tem definição explícita e verificável. Duas execuções
do mesmo gate são determinísticas quando **todas** as condições valem:

1. o **exit code** é idêntico;
2. a linha `Test Suites:` é idêntica (suítes puladas/aprovadas/total);
3. a linha `Tests:` é idêntica (testes pulados/aprovados/total);
4. o **conjunto** de resultados por suíte (`PASS`/`FAIL` + caminho) é idêntico,
   independente da ordem de impressão;
5. em `npm run verify:tow`, os 5 estágios e o veredito final (`GREEN`/`RED`) são idênticos.

Ficam **fora** da definição, por serem observáveis não-determinísticos já conhecidos:

- timestamps e tamanho em bytes das linhas de access log do morgan (payloads carregam
  ids/timestamps gerados a cada execução);
- durações por teste/suíte e as linhas `Time:` do Jest;
- a ordem em que o Jest imprime as linhas `PASS` (ordem de conclusão).

Os logs brutos são mantidos como capturados; a comparação normalizada é um artefato
separado, gerado por `bash scripts/tow/determinism-evidence.sh` em
`docs/evidence/t00/determinism-normalized-diff.txt`, que extrai apenas os observáveis
determinísticos acima e mostra diff vazio para os pares
`green-tow-focused.txt`/`green-tow-focused-run2.txt` e
`green-verify-tow-run1.txt`/`green-verify-tow-run2.txt`.

O baseline pré-T00 (`docs/evidence/t00/baseline-focused.txt`,
`docs/evidence/t00/baseline-full.txt`) é reproduzível por
`bash scripts/tow/baseline-evidence.sh`, que cria um worktree descartável no commit base
`e1e7dd2d`, roda as suítes foco e completa duas vezes cada e aplica a mesma definição.

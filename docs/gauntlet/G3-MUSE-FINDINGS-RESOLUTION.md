# G3 — Resolução dos achados Muse (adjudicação Luna)

**Escopo:** backend (`socorre_ai_backend`), worktree
`codex/g3-nearby-proposals-coordinates`, base `0ee3b010`. Nenhuma alteração em
Mobile/dashboard, nenhuma chamada a OpenCode/Muse, nenhuma migration nova,
nenhum segredo e nenhum deploy externo. Este documento registra, achado por
achado, o que foi corrigido, o que permanece como ambiguidade de produto e a
evidência real de validação (PostgreSQL 14 do stack local, opt-in).

## Resumo

| # | Achado (severidade, adjudicação Luna) | Decisão | Onde |
|---|---|---|---|
| F1 | Parceiros distintos podem estourar `max_proposals` em corrida (MEDIUM, VALID) | `FIXED` | `src/services/TowProposalService.js`, `src/models/EmergencyRequest.js` |
| F4 | INSERT da proposta + incremento de `proposals_received` não atômicos (MEDIUM, VALID) | `FIXED` | `src/services/TowProposalService.js`, `src/models/TowProposal.js`, `src/models/EmergencyRequest.js` |
| F5 | String vazia explícita em `latitude`/`longitude` do nearby caía no cadastro do parceiro (LOW, VALID) | `FIXED` | `src/services/EmergencyRequestService.js` |
| F6 | Joi do `POST /api/emergency-requests` aceitava `0,0` e par origem/destino incompleto (LOW, VALID) | `FIXED` | `src/middleware/validation.js`, `src/routes/emergency-requests.js` |
| F7 | Nearby tow podia devolver pedido legado com coordenada nula/fora dos limites/`0,0` (LOW, VALID) | `FIXED` | `src/models/EmergencyRequest.js`, `src/services/EmergencyRequestService.js` |
| F2 | Evidência PostgreSQL local não registrada e deadline comparado de formas diferentes (MEDIUM, VALID) | `FIXED` + evidência | `src/models/EmergencyRequest.js`, `docs/evidence/g3-tow-postgres.md` |
| F3 | Semântica de `proposals_received` no `withdraw` não definida (BUSINESS_RULE_AMBIGUITY) | `REGISTERED` (comportamento preservado) | `src/services/TowProposalService.js` (inalterado) + testes |
| F8 | Helper legado `canPartnerPropose` divergente do Service (OUT_OF_SCOPE) | `NOT_TOUCHED` | `src/models/EmergencyRequest.js` |

Migração 044 (`tow_proposals_one_pending_per_partner`) e o comportamento G1/G2
(start/complete/idempotência, fotos, pricing, autorização de cancelamento,
`withdraw` → novo `POST`) permanecem intactos. Nenhuma migration nova foi
necessária.

---

## F1 — Limite de propostas não pode ser estourado por parceiros distintos

**Antes:** `createProposal` validava `canReceiveProposals` fora de qualquer
transação e só então inseria. Dois parceiros distintos podiam ler
`proposals_received = max_proposals - 1` ao mesmo tempo e ambos inserirem,
deixando o pedido com mais propostas que o limite configurado.

**Depois:** `TowProposalService.createProposal` abre uma transação Knex e:

1. bloqueia a linha do pedido com `EmergencyRequest.lockForProposalReservation(id, trx)`
   — `SELECT ... FOR UPDATE` **somente em PostgreSQL** (SQLite não suporta
   `FOR UPDATE`; no harness SQLite a escrita já serializa pelo pool de 1 conexão);
2. revalida `EmergencyRequest.isAcceptingProposals(row)` já sob o lock: tipo tow,
   `status = pending`, `proposal_status = awaiting_proposals`, deadline futuro e
   `proposals_received < max_proposals`;
3. recheca `hasPartnerProposed(id, partnerId, trx)` dentro da mesma transação
   (fecha também a janela do 409 concorrente);
4. insere a proposta e incrementa o contador (F4) antes do `commit`.

Quem perde a corrida recebe `400 { code: 'emergency_not_accepting_proposals' }`
(contrato atual; não foi introduzido `409` novo para limite).

`isAcceptingProposals` preserva **exatamente** a comparação do código anterior
(`request.proposals_received >= request.max_proposals`), agora aplicada sob lock
em vez de somente no pré-check. Nenhuma reinterpretação de `0`/`NULL` foi
introduzida: pedidos criados pela API gravam `max_proposals` a partir de
`guincho_max_proposals_per_request` (default 5 quando a setting não existe).

**Prova de vacuidade (a correção é o que impede a violação):** o mesmo cenário
`max_proposals = 1` com dois parceiros distintos concorrentes, executado 10 vezes
contra o PostgreSQL 14 do stack:

| Cenário | Resultado |
|---|---|
| Com `FOR UPDATE` (código atual) | 10/10 rodadas com exatamente 1 proposta, contador 1 e respostas `[201, 400]` |
| Sem o lock (patch em memória removendo `FOR UPDATE`) | 8/10 rodadas com **2 propostas** e contador 2 (limite estourado, `[201, 201]`) |

Cobertura: `tests/tow/g3TowProposals.test.js` ("parceiros distintos concorrentes
na última vaga") e `tests/tow/g3TowPostgres.e2e.test.js` ("limite de propostas no
PostgreSQL", com `max_proposals = 1` exato e asserção
`proposals_received == max_proposals`).

## F4 — INSERT da proposta e incremento atômicos

**Antes:** `TowProposal.create()` usava a conexão global e
`EmergencyRequest.incrementProposalCount()` também; uma falha no incremento
deixava a proposta órfã com o contador intacto (ou vice-versa).

**Depois:** `TowProposalService.createProposal` passa o `trx` para
`TowProposal.create(data, trx)` e `EmergencyRequest.incrementProposalCount(id, trx)`;
qualquer erro faz `rollback` (com guarda `if (!trx.isCompleted())`) e sobe
`ServiceError`. A notificação permanece **pós-commit e best-effort** (try/catch),
como antes — sem outbox, por decisão de escopo.

Cobertura: teste com `jest.spyOn(EmergencyRequest, 'incrementProposalCount')`
rejeitando: resposta `500`, zero linhas em `tow_proposals`, contador em `0` e
nenhuma notificação enviada. No PostgreSQL, o teste de duplicata concorrente
segue provando que a proposta rejeitada não incrementa o contador (1 linha,
contador 1) e ambos os e2e passam com o caminho transacional novo.

## F5 — String vazia explícita no nearby é entrada inválida, não ausência

**Antes:** `latitude=&longitude=` era tratado como "não informado" e caía no
fallback `partners.latitude/longitude` — um cliente que tentasse coordenada
explícita e enviasse vazio recebia silenciosamente outra localização.

**Depois:** `parseCoordinate` distingue os três casos:

| Entrada | Resultado |
|---|---|
| ausente (`undefined`/`null`) | `provided: false` → fallback do cadastro continua valendo |
| `''` ou só espaços | `provided: true, invalid: true` → `400 invalid_coordinates` |
| fora dos limites / não numérico / `0,0` | `400 invalid_coordinates` |

Um par incompleto (`latitude=`, sem `longitude`) também é `400
invalid_coordinates` (mismatch de par), nunca fallback.

Cobertura: `tests/tow/g3NearbyCoordinates.test.js` (par vazio, latitude vazia +
longitude ausente, espaços, com parceiro de cadastro válido para provar que não
há fallback) e `tests/tow/g3TowPostgres.e2e.test.js` (mesmos casos em PG real).

## F6 — Joi do POST de emergência rejeita `0,0` e par opcional incompleto

**Antes:** `emergencyRequestSchemas.create` validava apenas faixas; `0,0` passava
no payload principal e pares origem/destino podiam vir pela metade. Pior: falhas
de coordenada retornavam `invalid_payload`, sem código estável para o app.

**Depois:** o schema `create` ganhou, sem alterar campos existentes:

- `.and('vehicle_origin_latitude', 'vehicle_origin_longitude')` e
  `.and('vehicle_destination_latitude', 'vehicle_destination_longitude')`;
- `.custom()` rejeitando `(0,0)` no par principal e em cada par opcional
  (via `helpers.error('any.invalid')`);
- `validate(schema, { codeResolver })`: o middleware agora aceita um resolvedor
  que injeta `body.code`. `emergencyRequestSchemaErrorCode(error)` mapeia
  violações de coordenada (`object.and` usando `present` + `missing`, `any.invalid`
  de raiz e paths de coordenada) para `invalid_coordinates`; qualquer outra falha
  continua `invalid_payload`.

O `POST /api/emergency-requests` usa o resolvedor; nenhuma outra rota mudou e
G1/G2 continuam com `invalid_payload` para os payloads que já eram inválidos.

Cobertura: pares incompletos (origem e destino), `0,0` no par opcional,
coordenada principal ausente → `invalid_coordinates`; `description` curta →
`invalid_payload`; todos verificando que nenhuma linha foi inserida. Os mesmos
casos rodam no e2e PostgreSQL.

## F7 — Nearby tow ignora coordenadas legadas inválidas

**Antes:** o `SELECT` de distância aplicava `acos(...)` direto nas colunas do
pedido. No PostgreSQL, `acos(x)` com `|x| > 1` aborta a query inteira
(`ERROR: input is out of range`), então **uma** linha legada com latitude fora
dos limites derrubava o nearby com `500`. Linhas com `0,0` apareciam como
oportunidade a ~0 km do parceiro.

**Depois:** a expressão de distância é protegida por `CASE` (retorna `NULL`
quando latitude/longitude são nulas, fora de ±90/±180 ou `0,0`) e o ramo `tow`
de `findNearby` ainda filtra com `whereNotNull`, `whereBetween` e
`whereNot(lat = 0 AND lon = 0)`. O ramo `mechanic` mantém a listagem legada
(apenas a expressão de distância ficou segura); os dados históricos **não** foram
corrigidos por migration (fora de escopo).

Cobertura: `tests/tow/g3NearbyCoordinates.test.js` (linhas nula, `91.5` e `0,0`
não aparecem; a válida aparece) e `tests/tow/g3TowPostgres.e2e.test.js` (mesmo
cenário em PG real — é o teste que falharia com `acos` estourando antes da
guarda; `latitude`/`longitude` nulas não existem no schema atual, que é
`NOT NULL`, e o próprio e2e registra isso).

## F2 — Deadline unificado e evidência PostgreSQL local

**Antes:** a comparação de deadline misturava `knex.fn.now()` (string SQL) com
valores epoch em milissegundos do harness SQLite, e `acceptProposal`/`expireProposals`
usavam referências diferentes. Não havia registro da execução real em PostgreSQL.

**Depois:** `EmergencyRequest.proposalDeadlineReference(instance)` devolve `new Date()`
em PostgreSQL e `Date.now()` em SQLite; `hasFutureProposalDeadline(raw)` compara
sempre na mesma unidade. `canReceiveProposals`, `findNearby`, `acceptProposal` e
`expireProposals` usam a mesma referência, sem alterar o formato armazenado.

A evidência local (comando, banco descartável, versão do PostgreSQL e resultado)
está em `docs/evidence/g3-tow-postgres.md`. Os e2e PostgreSQL continuam
**opt-in** (`TOW_POSTGRES_E2E=1`): o repositório não possui pipeline de CI, então
nada aqui é declarado como gate obrigatório de CI.

## F3 — BUSINESS_RULE_AMBIGUITY: `proposals_received` no `withdraw`

- **Ambiguidade:** `proposals_received` é usado como contador de propostas
  recebidas e como controle de `max_proposals`. Quando o parceiro retira
  (`pending` → `withdrawn`), não está definido se a vaga deve voltar a ficar
  disponível (decremento) ou se o contador é histórico.
- **Decisão:** preservar o comportamento atual — **não decrementar**. O contador
  é histórico e o limite conta propostas enviadas, não propostas pendentes.
  Consequências registradas: (a) retirar e reenviar consome outra vaga;
  (b) se `max_proposals` for atingido, retirar não reabre a oportunidade para
  outro parceiro; (c) `exclude_proposed=true` já remove proposta `withdrawn`,
  então a lista do próprio parceiro continua coerente.
- **Cobertura:** `tests/tow/g3TowProposals.test.js` — "withdraw não devolve a
  vaga..." (contador permanece, novo POST só entra se houver vaga) e "vaga
  consumida por proposta retirada não é reaberta para outro parceiro" (400
  `emergency_not_accepting_proposals` para o segundo parceiro).
- **Owner:** product-contract. Mudar para decremento é mudança de regra de
  negócio explícita (e de documentação/contrato), não efeito colateral deste fix.

## F8 — OUT_OF_SCOPE: helper legado `canPartnerPropose`

`EmergencyRequest.canPartnerPropose` continua como está: não é o caminho HTTP
ativo (o Service é), não foi alterado por este trabalho e não foi "consertado"
para não arriscar regressão fora do escopo adjudicado. Permanece registrado em
`STATE.yaml` como dívida técnica.

---

## Riscos residuais aceitos

- **Ordem validação × revalidação (F1):** a revalidação sob lock acontece depois
  da validação de preço mínimo. Uma proposta simultânea que seja ao mesmo tempo
  duplicada e abaixo do mínimo pode receber `400 proposal_price_below_minimum`
  em vez de `409 proposal_duplicate`. É uma corrida rara entre erros; o caminho
  sequencial continua retornando `409` primeiro.
- **SQLite não prova concorrência real:** o pool de 1 conexão do harness
  serializa as escritas; os testes SQLite documentam o comportamento, mas a
  prova de corrida é o e2e PostgreSQL (F1/F2).
- **Evidência PostgreSQL é manual/opt-in:** não há CI no repositório; os
  resultados valem para a execução registrada em
  `docs/evidence/g3-tow-postgres.md` (PostgreSQL 14.24 do stack local,
  banco descartável `socorre_g3_e2e`).
- **Dados legados não corrigidos (F7):** pedidos antigos com coordenada inválida
  continuam no banco; apenas deixam de aparecer como oportunidade tow e não
  derrubam mais a listagem.
- **Semântica de `max_proposals`:** a comparação numérica (`>=`) foi preservada
  do código anterior, inclusive nos casos de borda (`proposals_received = 0` com
  `max_proposals` `NULL` ou `0` bloqueia, porque `0 >= null` e `0 >= 0` são
  verdadeiros em JS; valor `undefined`/coluna não selecionada libera). Nenhuma
  reinterpretação foi introduzida; a API de criação sempre grava um valor
  positivo vindo de `guincho_max_proposals_per_request`.

## Validação executada

| Comando | Resultado |
|---|---|
| `npx jest tests/tow --runInBand` | ver `docs/evidence/g3-tow-postgres.md` (suíte tow completa, incl. G1/G2) |
| `NODE_ENV=test DB_* TOW_POSTGRES_E2E=1 npx jest tests/tow/g3TowPostgres.e2e.test.js --runInBand` | 7/7 PASS em PostgreSQL 14.24 real |
| `NODE_ENV=test DB_* TOW_POSTGRES_E2E=1 npx jest tests/tow/towPostgres.e2e.test.js --runInBand` | 2/2 PASS (start/complete e aceite concorrente, G1) |
| Prova de vacuidade do lock (10 rodadas com/sem `FOR UPDATE`) | com lock 10/10 `[201,400]`, 1 proposta; sem lock 8/10 com 2 propostas |
| `node --check` (arquivos alterados) + `git diff --check` | ver `docs/evidence/g3-tow-postgres.md` |
| `knex migrate:latest` no banco descartável | `Already up to date` (43 migrations já aplicadas, 0 pending; nenhuma migration nova) |
| `docker compose -f docker-compose-simple.yml config` | exit 0 (stack local preservado) |
| Parse YAML de `docs/gauntlet/STATE.yaml` e `docs/gauntlet/TASKSPEC.yaml` (`js-yaml`) | PASS — o `TASKSPEC.yaml` tinha `rule:` indentado dentro da lista `ambiguities` (YAML inválido pré-existente); movido para `ambiguity_rule` sem alterar o conteúdo |

## Não tocado

- Mobile, dashboard/admin, OpenCode/Muse, `proposals_received` no `withdraw`
  (semântica), helper legado `canPartnerPropose`, migrations (nenhuma nova),
  dados históricos, segredos e deploy externo.

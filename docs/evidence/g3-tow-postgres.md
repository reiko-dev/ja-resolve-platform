# Evidência G3: propostas tow e coordenadas no PostgreSQL

Ambiente: stack Docker local (`socorre_ai_postgres`, `postgres:14` — PostgreSQL
14.24), banco de teste **descartável** `socorre_g3_e2e` no host `localhost:5434`,
sem credenciais de produção. Os e2e PostgreSQL são opt-in
(`TOW_POSTGRES_E2E=1`) porque o repositório não possui pipeline de CI; nada aqui
é declarado como gate obrigatório de CI.

## Comandos executados

Em `socorre_ai_backend`:

```sh
export NODE_ENV=test DB_HOST=localhost DB_PORT=5434 DB_USER=postgres \
  DB_PASSWORD=postgres DB_NAME_TEST=socorre_g3_e2e TOW_POSTGRES_E2E=1

npx jest tests/tow/g3TowPostgres.e2e.test.js --runInBand
npx jest tests/tow/towPostgres.e2e.test.js --runInBand
npx jest tests/tow --runInBand          # com TOW_POSTGRES_E2E=1 roda tudo, incl. e2e

./node_modules/.bin/knex migrate:latest --env test
./node_modules/.bin/knex migrate:list --env test
```

O banco descartável foi criado antes da execução e pode ser removido depois:

```sh
docker exec socorre_ai_postgres psql -U postgres -c "CREATE DATABASE socorre_g3_e2e;"
docker exec socorre_ai_postgres psql -U postgres -c "DROP DATABASE socorre_g3_e2e;"
```

## Resultados reais

| Execução | Resultado |
|---|---|
| `g3TowPostgres.e2e.test.js` | **7/7 PASS** — nearby tow real (deadline futuro, raio, `exclude_proposed`, fallback do cadastro); duplicata concorrente com índice parcial da 044 (1 linha, contador 1, `[201, 409]`); guardas de coordenada (`0,0`, raio inválido, admin sem par, parceiro sem cadastro); **limite `max_proposals = 1` com parceiros distintos concorrentes (`[201, 400]`, 1 proposta, contador 1)**; string vazia explícita → `400 invalid_coordinates` sem fallback; linhas legadas (`91.5` e `0,0`) não quebram nem aparecem; schema do POST (`invalid_coordinates` vs `invalid_payload`) |
| `towPostgres.e2e.test.js` (G1) | **2/2 PASS** — start/complete persistidos no PostgreSQL e aceite concorrente com exatamente um vencedor (regressão coberta pela unificação de deadline) |
| `npx jest tests/tow --runInBand` com `TOW_POSTGRES_E2E=1` | **9 suítes passed, 190/190 testes passed** (inclui os dois e2e PostgreSQL). O processo termina com o aviso pré-existente de open handle do Jest ("Jest did not exit one second after the test run has completed") e o runner é encerrado por SIGTERM depois de imprimir o resultado; a suíte já havia concluído. |
| `npx jest tests/tow --runInBand` (SQLite in-memory, sem opt-in) | 2 suítes skipped (e2e opt-in), **7 passed**; **181 passed**, 9 skipped, 190 total, mesmo aviso de open handle. |
| `knex migrate:latest --env test` | `Already up to date` (43 migrations aplicadas, 0 pending — nenhuma migration nova neste fix) |
| `knex migrate:list --env test` | 43 completas, `No Pending Migration files Found` |
| `docker compose -f docker-compose-simple.yml config` | exit 0 |
| `node --check` (6 fontes + 4 testes alterados) e `git diff --check` | PASS |
| Scan de segredos nas linhas adicionadas (`git diff -U0`) | nenhum `password`/`secret`/`api_key`/`bearer` literal adicionado |

## Prova de vacuidade do lock (F1)

Para verificar que o teste de concorrência **não é vacuoso** — isto é, que o
`SELECT ... FOR UPDATE` é o que impede o estouro do limite — o mesmo cenário
(`max_proposals = 1`, dois parceiros distintos, `POST /api/tow-proposals`
simultâneos, preço válido) foi executado 10 vezes contra o PostgreSQL real, com
e sem o lock, usando um script temporário que dirigia o app Express real com o
`lockForProposalReservation` substituído em memória (nunca commitado). Resultado:

| Cenário | Rodadas | Observação |
|---|---|---|
| Com `FOR UPDATE` (código deste fix) | 10/10 com 1 proposta, contador 1, respostas `[201, 400]` | limite nunca estourado |
| Sem o lock (patch em memória) | **8/10 com 2 propostas e contador 2** (`[201, 201]`); 2/10 com 1 proposta | limite estourado com `max_proposals = 1` |

Isso confirma que o teste e2e "limite de propostas no PostgreSQL" detecta a
regressão e que a transação com lock é a barreira efetiva. O script temporário
foi removido do worktree; a evidência fica registrada aqui.

## Limites desta evidência

- Não representa deploy, staging, VPS ou produção.
- O SQLite do harness Jest (pool de 1 conexão) serializa escritas: os cenários
  concorrentes só têm valor probatório no PostgreSQL.
- A execução foi manual e opt-in; não há CI no repositório para repeti-la
  automaticamente.

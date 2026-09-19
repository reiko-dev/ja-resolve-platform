# T01 — Baseline de Banco de Dados (runbook operacional)

> Escopo: como **criar, resetar, migrar, semear e verificar** o banco do backend a partir do
> baseline limpo do T01. Decisão arquitetural: `docs/tow/T01-DATABASE-BASELINE-DECISION.md`.
> Schema resultante: `docs/tow/database-schema.md`.
> Harness de PostgreSQL descartável: `docs/tow/T00-TEST-HARNESS.md` e
> `docs/tow/TOW-DOCKER-TEST-STRATEGY.md`.

Todos os comandos são executados a partir de `socorre_ai_backend/`.

---

## ⚠️ AVISO DESTRUTIVO — leia antes de usar `db:reset`

`npm run db:reset` **apaga permanentemente** todas as tabelas do banco alvo (`DROP SCHEMA public
CASCADE` + `CREATE SCHEMA public`). Não há backup automático, não há "desfazer", não há flag de
bypass. Ele é permitido **apenas** em bancos de desenvolvimento/teste descartáveis deste
repositório.

- Nunca aponte este comando para produção, VPS, homologação ou qualquer banco com dados reais.
- O comando recusa (`UNSAFE_RESET_TARGET`) alvos que não sejam explicitamente dev/test.
- Se você não tem certeza do alvo, rode antes `npm run db:guard -- --purpose <dev|test>`: ele
  imprime o alvo efetivo (sem senha) e diz se ele é autorizado.
- Dados de produção **não** são migrados por este baseline: o upgrade de um banco antigo é um
  reset autorizado (ver §6).

---

## 1. Pré-condições

| Pré-condição | Detalhe |
| --- | --- |
| Node.js ≥ 18 (validado em v22) | `node --version` |
| Dependências instaladas | `npm install` em `socorre_ai_backend/` |
| PostgreSQL acessível | Para `--purpose test`: o container descartável do T00 (`npm run test:pg:up`). Para `--purpose dev`: um PostgreSQL local de desenvolvimento |
| Opt-in do harness (somente `test`) | `TOW_POSTGRES_E2E=1` — sem ele o alvo de teste **não** é montado e o guarda recusa |
| Credenciais do admin (somente `db:seed`) | `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente (ver §4) |
| Consentimento (somente `db:reset`) | `DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET` |

Variáveis do alvo (nenhuma tem fallback silencioso; o guarda exige todas explícitas):

| Variável | Propósito `test` (defaults do harness) | Propósito `dev` |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` (loopback obrigatório) | do `.env` do backend |
| `DB_PORT` | `55432` | do `.env` |
| `DB_NAME_TEST` | `socorre_ai_tow_test` | — |
| `DB_NAME` / `DB_DATABASE` | — | nome do banco de dev |
| `DB_USER` | `tow_test` | do `.env` |
| `DB_PASSWORD` | `tow_test_password` | do `.env` |
| `DB_SSL` | `false` | do `.env` |

O propósito `test` **nunca** lê o `.env` do backend: ele usa exclusivamente o alvo do harness
T00, para que um teste jamais toque o banco de desenvolvimento.

---

## 2. Comandos canônicos

| Comando | O que faz | Destrutivo? |
| --- | --- | --- |
| `npm run db:guard -- --purpose test` | pré-voo: imprime o alvo e valida todas as regras de segurança | não |
| `npm run db:migrate -- --purpose test` | aplica `001_baseline_schema.js` + `002_baseline_settings.js`; recusa banco com tabelas não gerenciadas (sem escape hatch — ver §6) | não |
| `npm run db:seed -- --purpose test` | cria o administrador padrão (idempotente) | não |
| `npm run db:assert -- --purpose test` | verifica o baseline: 27 tabelas de domínio, exatamente 1 admin, nenhum dado funcional, 25 settings | não |
| `npm run db:reset -- --purpose test` | **apaga** todas as tabelas (`--dry-run` lista sem apagar) | **SIM** |
| `npm run db:snapshot -- --purpose test --out arquivo.json` | grava o snapshot estrutural do schema | não |
| `npm run test:db-baseline` | gate completo em container novo e descartável (ver §7) | sim, no container |

Flags comuns: `--purpose dev|test` (default `test`), `--json` (saída de máquina),
`--report <arquivo>` (`db:assert`/baseline completo), `--dry-run` (só `db:reset`).
Não existe flag de bypass: `--allow-existing` foi **removido** do `db:migrate`
(a política do T01 é `banco pré-T01 → reset autorizado → baseline limpo`).

---

## 3. Ordem correta (instalação nova / reset)

```bash
cd socorre_ai_backend

# 0. (teste) subir o PostgreSQL descartável do T00
npm run test:pg:up

# 1. conferir o alvo antes de qualquer coisa
TOW_POSTGRES_E2E=1 npm run db:guard -- --purpose test

# 2. (somente se o banco já existir e você quiser começar do zero)
TOW_POSTGRES_E2E=1 DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET \
  npm run db:reset -- --purpose test

# 3. estrutura
TOW_POSTGRES_E2E=1 npm run db:migrate -- --purpose test

# 4. administrador padrão (credenciais vêm do ambiente)
TOW_POSTGRES_E2E=1 ADMIN_EMAIL=admin@example.test ADMIN_PASSWORD='<senha-forte>' \
  npm run db:seed -- --purpose test

# 5. verificação
TOW_POSTGRES_E2E=1 npm run db:assert -- --purpose test

# 6. (teste) destruir o ambiente
npm run test:pg:down
```

A ordem é **reset → migrate → seed → assert**. `seed` antes de `migrate` falha (não existem
tabelas); `assert` antes de `seed` falha com "expected exactly 1 administrator".

Em desenvolvimento, troque `--purpose test` por `--purpose dev` e remova `TOW_POSTGRES_E2E=1`
(as variáveis de conexão vêm do `.env` do backend).

---

## 4. Variáveis do seed de administrador

| Variável | Obrigatória | Regra |
| --- | --- | --- |
| `ADMIN_EMAIL` | sim | e-mail válido; normalizado para minúsculas |
| `ADMIN_PASSWORD` | sim | mínimo **12 caracteres**; recusada se for uma senha de desenvolvimento conhecida (ex.: `admin123`) ou igual à parte local do e-mail |
| `ADMIN_NAME` | não | default `Administrador` |

- O seed **não tem senha padrão**: sem `ADMIN_EMAIL`/`ADMIN_PASSWORD` ele falha com
  `ADMIN_SEED_CONFIG` e exit code 1.
- A senha é gravada como hash `bcrypt` (custo 12) e **nunca** aparece em log.
- Idempotente: se o e-mail já existir com `role='admin'`, nada é alterado e o comando reporta
  `admin-already-exists`; se existir com outro papel, falha (`ADMIN_SEED_CONFLICT`).
- Exemplo seguro de senha descartável para testes: gere na hora, por exemplo
  `ADMIN_PASSWORD="$(openssl rand -base64 18)"`. Nunca grave a senha em arquivo versionado.

---

## 5. Verificação (`db:assert`) e recuperação

`npm run db:assert` falha (exit 1) quando:

- falta qualquer uma das 27 tabelas de domínio;
- a contagem de usuários não é exatamente 1;
- o e-mail do admin não é o esperado (`ADMIN_EMAIL`);
- existe dado funcional fora de `users`/`system_settings`;
- as 25 chaves estruturais de `system_settings` não estão presentes.

### Rollback / recuperação

| Situação | Ação |
| --- | --- |
| Migração aplicada pela metade (erro no meio) | `db:reset` autorizado + `db:migrate` novamente; o baseline é atômico por migration |
| Seed aplicado com o e-mail errado | `db:reset` + `db:migrate` + `db:seed` com o e-mail correto (o seed não renomeia contas) |
| Senha do admin perdida | Não há recuperação pelo seed (ele não atualiza senhas). Recupere pelo fluxo de reset de senha da aplicação ou refaça o baseline |
| Banco com dados que precisam ser preservados | **Não use este runbook**: exporte os dados antes (`pg_dump`) e trate como migração de dados fora do T01 |
| Container de teste corrompido | `npm run test:pg:down && npm run test:pg:up` (volume é `tmpfs`: nada sobrevive) |

O rollback do schema é o **reset**, não um `down()` de migration: os `down()` legados foram
abandonados justamente porque alguns eram destrutivos (a migration `015` apagava
`emergency_requests`, `partner_services` e `partners`).

---

## 6. Ambientes permitidos

| Ambiente | Permitido? | Como |
| --- | --- | --- |
| Container descartável do T00 (`127.0.0.1:55432`) | **sim** | `TOW_POSTGRES_E2E=1`, `--purpose test` |
| PostgreSQL local de desenvolvimento (`socorre_ai_dev`) | **sim** | `--purpose dev` (nome terminando em `_dev`) |
| Qualquer banco cujo nome termine em `_test`/`_dev` em loopback | **sim** | allowlist do guarda |
| Homologação / staging | **não** | nomes com `homolog`/`staging` são recusados |
| Produção / VPS | **não** | `NODE_ENV=production`, nomes com `prod`/`live`/`vps`/`main`/`master` e hosts remotos são recusados |
| Banco via `DATABASE_URL` | **não** | a variável é recusada pelo guarda (pode apontar para qualquer lugar) |
| Usuário `postgres`/`root`/`admin`/`superuser` | **não** | papéis privilegiados são recusados |

Upgrade de um banco legado (pré-T01): **reset autorizado** + `migrate` + `seed` + `assert`,
conforme §3. Não existe caminho incremental — os dados são descartáveis por decisão do
Issue #12 e a equivalência estrutural está provada em
`docs/evidence/t01/schema-legacy-vs-baseline.txt`.

### 6.1 Como o reset destrutivo é autorizado (correção pós-review)

O único ponto de entrada destrutivo é a API pública
`resetDatabase({ purpose, env?, confirm?, dryRun? })` (`scripts/tow/db-reset.js`).
Não existe parâmetro de conexão:

1. o alvo é **resolvido** a partir do ambiente do propósito (`--purpose dev` lê o `.env`;
   `--purpose test` usa os defaults do harness) e do `DB_RESET_CONFIRM`;
2. o alvo resolvido é **autorizado** pelo guarda (`db-reset-guard.js`) — token, nome do banco,
   loopback, usuário não privilegiado, `NODE_ENV`, `DATABASE_URL`;
3. **só então** a conexão é criada, e é criada *a partir do alvo autorizado*
   (`createConnectionForTarget`), nunca a partir de um `Knex`/config recebido de fora;
4. o `DROP SCHEMA public CASCADE` é um primitivo **privado** (não exportado), chamado apenas
   depois dos passos 1–3; a conexão é sempre fechada (`destroy`) no `finally`.

Consequências verificadas por teste (`RESET-DIRECT-1..8`, suíte
`tests/tow/baseline/dbBaselineSafety.test.js`): passar um objeto `Knex` é recusado com
`RESET_API_MISUSE`; sem token nada é apagado; alvos remotos, com nome de produção, host
wildcard, usuário privilegiado ou `DATABASE_URL` são recusados antes de qualquer conexão; o
`--dry-run` não exige token mas **continua exigindo alvo autorizado** e nunca emite `DROP`.
`db:migrate`/`db:seed`/`db:assert` e o gate usam a mesma autorização (sem token, por não
serem destrutivos).

---

## 7. Gate de banco limpo via Docker

```bash
cd socorre_ai_backend
npm run test:db-baseline
```

O gate (`scripts/tow/run-db-baseline-gate.js`) usa o mesmo `docker-compose.test.yml` do T00
(imagem `postgres:14`, volume `tmpfs`, projeto Compose isolado) e executa:

1. guarda de segurança + subida do ambiente;
2. **destrói** qualquer ambiente anterior e sobe um novo (volume novo de verdade);
3. exige banco com **0 tabelas**;
4. `migrate` do zero (2 migrations) e confere a lista de tabelas;
5. `seed` e exige **exatamente 1** administrador;
6. `assert` completo do baseline;
7. snapshot estrutural (fingerprint 1);
8. reset destrutivo **guardado** (`resetDatabase({ purpose: 'test' })`, alvo autorizado) + `migrate` + `seed` + `assert` de novo;
9. snapshot 2 — fingerprint **idêntico** ao snapshot 1;
10. `docker compose down --volumes` e verificação de que nada sobrou;
11. grava `docs/evidence/t01/db-baseline-gate.json`.

As credenciais do admin do gate são geradas em tempo de execução e não são persistidas. O gate
nunca usa volume nomeado, nunca usa o banco de desenvolvimento e nunca toca em containers de
outros projetos.

---

## 8. Troubleshooting

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `REFUSED: DB_HOST must be set explicitly` | opt-in do harness ausente | exporte `TOW_POSTGRES_E2E=1` (propósito `test`) |
| `REFUSED: TOW_POSTGRES_E2E is not "1"` | opt-in ausente | idem |
| `REFUSED: DB_RESET_CONFIRM must be exactly ...` | consentimento ausente | exporte a variável (somente se o alvo for descartável) |
| `REFUSED: database name "..." contains the forbidden hint "prod"` | alvo não autorizado | **não** insista: confirme o alvo real |
| `ADMIN_SEED_CONFIG: ADMIN_PASSWORD is required` | credencial não exportada | exporte `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| `db:migrate` recusa "unmanaged tables" | banco com tabelas fora do baseline | `db:reset` autorizado (não há `--allow-existing`; a regra é única e vale para todo caminho público de migrate) |
| `expected exactly 1 administrator, found 0` | `db:seed` não executado | rode `db:seed` |
| Gate falha em "expected a brand new database with 0 tables" | volume antigo reaproveitado | o próprio gate já destrói antes de subir; verifique containers residuais do projeto Compose |
| Fingerprint do schema diferente do baseline | migration alterada | compare com `node scripts/tow/schema-snapshot.js --compare docs/evidence/t01/schema-baseline.json <novo>.json` |

---

## 9. Evidências

| Artefato | Conteúdo |
| --- | --- |
| `docs/evidence/t01/00-pre-change-regression.txt` | regressão T00 antes das mudanças |
| `docs/evidence/t01/01-red-probe-before-fix.txt` | problemas reais do baseline legado (RED-1..RED-6) |
| `docs/evidence/t01/02-clean-database-gate-run1.txt` / `03-...run2.txt` | duas execuções completas do gate |
| `docs/evidence/t01/04-negative-controls.txt` | 6 mutações que derrubam as suítes (falsificabilidade) |
| `docs/evidence/t01/05-post-change-regression.txt` | regressão T00 depois das mudanças (sem regressão) |
| `docs/evidence/t01/schema-baseline.json` / `schema-baseline-fresh.json` | fingerprint do baseline (idêntico em duas execuções) |
| `docs/evidence/t01/schema-legacy-chain.json` / `schema-legacy-vs-baseline.txt` | equivalência com o schema legado (7 deltas intencionais) |
| `docs/evidence/t01/db-baseline-gate.json` | resultado estruturado do gate |
| `docs/evidence/t01/07-negative-control-reset-authorization.txt` | controle negativo da correção: mutações que derrubam `RESET-DIRECT-1..8` (e restauração byte-idêntica) |
| `docs/evidence/t01/08-correction-regression.txt` | regressão completa após a correção (offline + gate + e2e + T00) |
| `docs/evidence/t01/T01-CORRECTION-RESULT.md` | resultado da passagem de correção do review externo (P1) |

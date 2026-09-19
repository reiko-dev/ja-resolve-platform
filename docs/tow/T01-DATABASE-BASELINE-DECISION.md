# T01 — Decisão de Baseline de Banco de Dados

> Status: **implementado e provado** (gate de banco limpo GREEN em duas execuções)
> Issue: #12 · Task: T01 · Épico: #10 · Depende de: T00 (#11, PR #30)
> Branch: `feature/t01-clean-db-baseline`
> Evidências: `docs/evidence/t01/` · Runbook: `docs/tow/database-baseline.md` · Schema: `docs/tow/database-schema.md`

Este documento registra **o que foi decidido** sobre o baseline de banco de dados, **por quê**, e
qual foi a disposição de cada migration legada. Ele é a referência de auditoria do T01; o
documento operacional (comandos, variáveis, recuperação) é `docs/tow/database-baseline.md`.

---

## 1. Estado atual (antes do T01)

| Dimensão | Situação encontrada |
| --- | --- |
| Migrations | 43 arquivos encadeados `001`→`045`, com lacunas (`016`, `017`, `027`) e dois arquivos com o mesmo prefixo `029` |
| Seeds | 5 arquivos, dos quais 4 criam dados funcionais/demonstração e 1 (`initial_data.js`) apaga usuários e categorias antes de inserir um admin com senha fixa `admin123` |
| Dados | A migration `015_migrate_existing_data.js` copia `mechanics`→`partners` e `services`→`partner_services`, ou seja, **depende de dados históricos**; seu `down()` apaga `emergency_requests`, `partner_services` e `partners` |
| Integridade | `wallet_transactions.dispute_id` sem FK; 5 índices redundantes (duplicam constraints `UNIQUE` já existentes) |
| Configuração | `src/config/database.js` apontava para `src/database/migrations` (diretório inexistente) enquanto `knexfile.js` apontava para `database/migrations` |
| Segurança | Nenhum guarda de reset, nenhum comando de reset/migrate/seed canônico, nenhum gate de banco limpo |

Evidência capturada por comando antes de qualquer alteração:
`docs/evidence/t01/00-pre-change-regression.txt` (regressão T00 de partida) e
`docs/evidence/t01/01-red-probe-before-fix.txt` (sondagem RED).

---

## 2. Problemas demonstrados (RED)

| ID | Problema | Evidência (probe) | Consequência para T01 |
| --- | --- | --- | --- |
| RED-1 | A cadeia legada só chega ao schema final passando por 43 migrations, duas delas com o mesmo prefixo `029`, e não há garantia de ordem | `01-red-probe-before-fix.txt:3-9` | O baseline precisa ser uma sequência determinística e curta |
| RED-2 | O schema final aceita integridade inválida: `wallet_transactions.dispute_id = 987654321` foi **aceito** (0 FKs nessa coluna) | `:11-17` | O baseline deve declarar a FK que faltava |
| RED-2b | Índices redundantes: `user_documents_user_id_document_type_index` ao lado da constraint `UNIQUE` equivalente (idem `products_sku`, `system_settings_setting_key`, `wallets_user_id`, `wallets_partner_id`) | `:15` + `schema-legacy-vs-baseline.txt` | Remover redundância **documentada** sem perder integridade |
| RED-3 | Os seeds legados **não rodam do zero**: `002_mechanics_data.js` viola `mechanics_user_id_foreign` porque assume usuários criados por outro seed | `:19-21` | O seed do baseline deve rodar do zero e ser idempotente |
| RED-4 | `initial_data.js` é destrutivo e não idempotente: segunda execução cria **um segundo admin** (id=2) e a senha é `bcrypt('admin123')` | `:23-29` | Seed único, idempotente, sem credencial embutida |
| RED-5 | Não existiam guarda de reset nem comandos de baseline; nenhum script npm | `:31-34` | Criar guarda + comandos + gate |
| RED-6 | Duas configurações divergentes de diretório de migrations; a do app não existe | `:36-39` | Fonte única de verdade para os diretórios |

Os critérios de TDD RED do T01 estão, portanto, satisfeitos **antes** da reestruturação: a
sondagem mostra inconsistência (RED-2), dependência de dados anteriores (RED-1/RED-3),
seed não idempotente (RED-4), ausência de guarda de segurança (RED-5) e incapacidade de
subir do zero em ambiente descartável (RED-3/RED-6).

---

## 3. Tabelas exigidas

O baseline cria **29 tabelas**: as 27 tabelas de domínio + as 2 tabelas de controle do Knex
(`knex_migrations`, `knex_migrations_lock`, criadas pelo próprio Knex).

Domínios preservados (nenhuma tabela legada foi removida):

| Domínio | Tabelas |
| --- | --- |
| Identidade e acesso | `users`, `revoked_tokens` |
| Catálogo / serviços | `categories`, `services`, `products`, `partner_services` |
| Parceiros | `partners`, `partner_documents` |
| Atendimento | `emergency_requests`, `appointments`, `chat_messages`, `reviews`, `notifications`, `real_time_tracking` |
| Logística / compras | `delivery_orders`, `purchase_orders` |
| Financeiro | `payments`, `wallets`, `wallet_transactions`, `commissions`, `disputes`, `subscriptions`, `subscription_history` |
| Tow (preparação) | `tow_proposals` (tabela existente; **nenhuma** regra de Tow v1 é implementada aqui) |
| Documentos | `user_documents` |
| Configuração | `system_settings` |
| Legado mantido | `mechanics` |

Nenhuma tabela de Tow v1 (T02+) é criada. Nenhuma coluna de Tow v1 é adicionada. O T01 é
estrutural: ele apenas garante que o schema existente seja coerente, completo e reproduzível.

Listagem completa (colunas, FKs, uniques, checks e índices por tabela) e o diagrama de
dependências estão em `docs/tow/database-schema.md`.

---

## 4. Estratégia de migração

**Decisão: consolidar um baseline limpo em 2 migrations e arquivar a cadeia legada.**

```
database/
  migrations/
    001_baseline_schema.js      # schema completo, sem dados, sem regra de aplicação
    002_baseline_settings.js    # 25 linhas estruturais de system_settings
  migrations-legacy/            # 43 migrations originais (auditoria; não executadas)
  seeds/
    001_admin.js                # apenas o administrador padrão (lê o ambiente)
  seeds-legacy/                 # 5 seeds originais (auditoria; não executados)
```

Por quê:

1. **Não existem dados de produção a preservar.** O Issue #12 autoriza explicitamente o reset
   dos dados; o ambiente é pré-produção. Um baseline consolidado é a única forma de garantir
   "banco novo do zero" sem carregar 43 passos históricos.
2. **A cadeia legada não é reproduzível com segurança.** Ela contém uma migration de dados
   (`015`), uma migration morta no PostgreSQL (`030` — `enums=0` no snapshot) e um `down()`
   destrutivo (`015` apaga tabelas de domínio).
3. **Equivalência foi provada, não presumida.** O schema produzido pela cadeia legada e o
   schema produzido pelo baseline foram capturados pelo mesmo extrator e comparados:
   29 tabelas, 692 colunas, 6 uniques, 39 checks, 28 sequences, 0 enums — **idênticos**, com
   exatamente 7 deltas intencionais (`docs/evidence/t01/schema-legacy-vs-baseline.txt`).
4. **Custo de manutenção.** Uma migration por mudança real (T02+) é mais barata de revisar do
   que manter 43 arquivos cujo efeito líquido é o de `001_baseline_schema.js`.

### 4.1 Deltas intencionais em relação ao schema legado

| Delta | Motivo |
| --- | --- |
| **+** FK `wallet_transactions.dispute_id → disputes(id) ON DELETE SET NULL` | Corrige RED-2: a coluna referenciava `disputes` sem integridade referencial |
| **+** índice `wallet_transactions_dispute_id_index` | Suporta a FK nova (e as consultas de disputa por transação) |
| **−** `products_sku_index` | Redundante: `products_sku_unique` já indexa a coluna |
| **−** `system_settings_setting_key_index` | Redundante: `system_settings_setting_key_unique` |
| **−** `wallets_user_id_index` | Redundante: `wallets_user_id_unique` |
| **−** `wallets_partner_id_index` | Redundante: `wallets_partner_id_unique` |
| **−** `user_documents_user_id_document_type_index` | Redundante: `user_documents_user_id_document_type_unique` |

Nenhuma outra diferença foi encontrada (comparação nome-insensível por assinatura de
constraint). O fingerprint do schema baseline é
`0e4e8ed825fb1629a1474f590ae5dc1c779685ecb927acbae038276cdfea4926`.

### 4.2 Como um banco antigo faz upgrade

O upgrade de um banco legado **é um reset autorizado**, não uma migração incremental:

```bash
cd socorre_ai_backend
DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET npm run db:reset -- --purpose dev
npm run db:migrate -- --purpose dev
ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed -- --purpose dev
npm run db:assert -- --purpose dev
```

As 43 migrations originais permanecem em `database/migrations-legacy/` apenas como registro
histórico e para o teste de contrato de foto (`045`). Elas **não** são executadas por nenhum
comando do baseline.

---

## 5. Disposição das migrations legadas

Legenda: **REPLACE** = o efeito foi incorporado ao `001_baseline_schema.js`;
**ARCHIVE** = mantido apenas como histórico; **DROP** = efeito intencionalmente abandonado.

| Migration | O que faz | Depende de | Ainda necessário? | Disposição | Motivo |
| --- | --- | --- | --- | --- | --- |
| `001_create_users_table` | cria `users` | — | sim | REPLACE | incorporada ao baseline |
| `002_create_categories_table` | cria `categories` | — | sim | REPLACE | idem |
| `003_create_mechanics_table` | cria `mechanics` | `users` | sim (legado) | REPLACE | idem |
| `004_create_services_table` | cria `services` | `mechanics` | sim (legado) | REPLACE | idem |
| `005_create_appointments_table` | cria `appointments` | `users`,`services` | sim | REPLACE | idem |
| `006_create_reviews_table` | cria `reviews` | `users` | sim | REPLACE | idem |
| `007_create_chat_messages_table` | cria `chat_messages` | `users` | sim | REPLACE | idem |
| `008_create_partners_table` | cria `partners` | `users` | sim | REPLACE | idem |
| `009_create_emergency_requests_table` | cria `emergency_requests` | `users` | sim | REPLACE | idem |
| `010_create_delivery_orders_table` | cria `delivery_orders` | `users` | sim | REPLACE | idem |
| `011_create_purchase_orders_table` | cria `purchase_orders` | `users` | sim | REPLACE | idem |
| `012_create_partner_services_table` | cria `partner_services` | `partners` | sim | REPLACE | idem |
| `013_create_real_time_tracking_table` | cria `real_time_tracking` | `users` | sim | REPLACE | idem |
| `014_create_notifications_table` | cria `notifications` | `users` | sim | REPLACE | idem |
| `015_migrate_existing_data` | copia `mechanics`→`partners`, `services`→`partner_services`; `down()` apaga tabelas | **dados históricos** | **não** | **DROP** | viola "migrations não dependem de dados"; `down()` destrutivo; dados autorizados para reset |
| `018_add_fcm_token_to_users` | `users.fcm_token` + índice | `users` | sim | REPLACE | incorporada |
| `019_create_payments_table` | cria `payments` | `users` | sim | REPLACE | idem |
| `020_create_wallets_table` | cria `wallets` | `users`,`partners` | sim | REPLACE | idem |
| `021_create_wallet_transactions_table` | cria `wallet_transactions` | `wallets` | sim | REPLACE | idem (+ FK de `dispute_id` que faltava) |
| `022_create_commissions_table` | cria `commissions` | `partners` | sim | REPLACE | idem |
| `023_create_disputes_table` | cria `disputes` | `payments` | sim | REPLACE | idem |
| `024_create_subscriptions_table` | cria `subscriptions` | `users`,`partners` | sim | REPLACE | idem |
| `025_create_tow_proposals_table` | cria `tow_proposals` | `emergency_requests`,`partners` | sim | REPLACE | idem |
| `026_create_system_settings_table` | cria `system_settings` | — | sim | REPLACE | idem |
| `028_create_products_table` | cria `products` | `partners` | sim | REPLACE | idem |
| `029_create_partner_documents_table` | cria `partner_documents` | `partners` | sim | REPLACE | idem |
| `029_create_subscription_history_table` | cria `subscription_history` | `subscriptions` | sim | REPLACE | prefixo duplicado; ordem indefinida na cadeia (RED-1) |
| `030_extend_partner_type_enum` | tenta alterar enum de `partners.type` | — | **não** | **DROP** | código morto no PostgreSQL (`enums=0` no snapshot); o CHECK de `034` é a regra efetiva |
| `031_add_partner_approval_columns` | colunas de aprovação em `partners` | `partners` | sim | REPLACE | incorporada |
| `032_add_users_onboarding_partner_type` | `users.onboarding_partner_type` | `users` | sim | REPLACE | idem |
| `033_insert_system_settings` | insere settings gerais | — | sim | **REPLACE** → `002_baseline_settings.js` | configuração estrutural, idempotente por chave |
| `034_update_partners_type_check_constraint` | CHECK com 6 tipos de parceiro (inclui `tow`) | `partners` | sim | REPLACE | incorporada (regra de integridade, não de aplicação) |
| `035_add_users_onboarding_stage` | `users.onboarding_stage` | `users` | sim | REPLACE | incorporada |
| `036_extend_emergency_requests_for_tow_flow` | colunas de Tow em `emergency_requests` | `emergency_requests` | sim | REPLACE | incorporada |
| `037_extend_payments_for_financial_domains` | colunas financeiras em `payments` | `payments` | sim | REPLACE | incorporada |
| `038_extend_reviews_for_partner_reputation` | `reviews.partner_id` + FK | `reviews`,`partners` | sim | REPLACE | incorporada (FK criada ao final, após `partners` existir) |
| `039_extend_reviews_for_operational_entities` | uniques parciais de `reviews` | `reviews` | sim | REPLACE | incorporada (raw SQL: índice parcial) |
| `040_seed_tow_pricing_settings` | insere settings de preço Tow | — | sim | **REPLACE** → `002_baseline_settings.js` | configuração estrutural (25 chaves no total) |
| `041_create_user_documents_table` | cria `user_documents` | `users` | sim | REPLACE | incorporada (índice redundante removido) |
| `042_create_revoked_tokens_table` | cria `revoked_tokens` | `users` | sim | REPLACE | incorporada |
| `043_enforce_case_insensitive_user_email` | `users_email_lower_unique` | `users` | sim | REPLACE | incorporada (raw SQL: índice de expressão) |
| `044_prevent_duplicate_pending_tow_proposals` | índice único parcial de propostas pendentes | `tow_proposals` | sim | REPLACE | incorporada |
| `045_add_emergency_request_photo_contract` | contrato de fotos em `emergency_requests` | `emergency_requests` | sim | REPLACE | incorporada; arquivo mantido porque o teste `g2PhotoContract` o importa |

Seeds legados: `initial_data.js`, `002_mechanics_data.js`, `003_partner_users.js`,
`004_client_users.js`, `005_partner_users.js` → **ARCHIVE** em `database/seeds-legacy/`
(motivos em `database/seeds-legacy/README.md`); nenhum deles é executado.

---

## 6. Estratégia do seed de administrador

**Decisão: um único seed (`database/seeds/001_admin.js`) que cria no máximo uma linha e lê
todas as credenciais do ambiente.**

- `ADMIN_EMAIL` e `ADMIN_PASSWORD` são **obrigatórios**; não existe senha padrão, fallback ou
  valor embutido. `ADMIN_PASSWORD` exige ≥ 12 caracteres e é rejeitada se estiver numa lista de
  senhas de desenvolvimento conhecidas ou for igual à parte local do e-mail.
- O hash é `bcrypt` com custo 12 (mesmo custo do `authController`), nunca registrado em log.
- Idempotência: se já existir usuário com o mesmo e-mail (comparação `LOWER(email)`), o seed
  **não atualiza nada** e reporta `admin-already-exists`. Isso evita que uma reexecução
  sobrescreva uma senha já trocada pelo operador.
- Se o e-mail existir com `role != 'admin'`, o seed **falha** (`ADMIN_SEED_CONFLICT`) em vez de
  promover a conta.
- Nenhum dado funcional é criado: nada de categorias, parceiros, produtos ou usuários de
  demonstração. `system_settings` (25 linhas) é configuração estrutural vinda das migrations
  `033`/`040`, não do seed.

Provas: `tests/tow/baseline/adminSeed.test.js` (offline, SQLite) e a suíte SEED de
`tests/tow/baseline/dbBaseline.e2e.test.js` (PostgreSQL real).

---

## 7. Modelo de segurança do reset

**Decisão: um único ponto destrutivo, com autorização explícita e sem bypass.**

Regras aplicadas por `scripts/tow/db-reset-guard.js` a **todo** comando que abre conexão:

1. Consentimento humano: `DB_RESET_CONFIRM=I_UNDERSTAND_DESTRUCTIVE_RESET` (obrigatório apenas
   para o comando destrutivo; `migrate`/`seed`/`assert` não destroem nada).
2. `NODE_ENV=production` → recusa incondicional.
3. Alvo explícito: `DB_HOST`, `DB_PORT`, nome do banco e `DB_USER` não podem ser omitidos
   (não existe fallback silencioso para `localhost:5432/postgres`).
4. `DATABASE_URL`/`PostgreSQL` (que podem apontar para qualquer lugar) → recusa.
5. Host: somente loopback (`localhost`, `127.0.0.1`, `::1`); wildcards (`0.0.0.0`, `::`, `*`) e
   qualquer host remoto → recusa.
6. Nome do banco: allowlist (`socorre_ai_dev`, `socorre_ai_test`, `socorre_ai_tow_test`) ou
   sufixo `_dev`/`_test`, e recusa de nomes com `prod`, `production`, `live`, `vps`, `homolog`,
   `staging`, `main`, `master`.
7. Usuário: recusa `prod`, `root`, `postgres`, `admin`, `superuser`.
8. No propósito `test`, herda **todas** as regras do harness T00 (`TOW_POSTGRES_E2E=1`,
   `_test`, loopback, `DB_SSL=false`).

Não existe flag de bypass (`--force`, `--yes`): a única forma de autorizar é a variável de
consentimento, e ela só é aceita se todas as outras regras passarem. `npm run db:guard`
responde "eu posso resetar este alvo?" antes de qualquer comando.

**Correção pós-review externo (P1, PR #32):** as regras acima descrevem *quando* um alvo é
autorizado; a correção garante que a autorização seja *estruturalmente inseparável* da conexão
destruída. O primitivo `DROP SCHEMA public CASCADE` é privado (não exportado) e a única API
pública é `resetDatabase({ purpose, env?, confirm?, dryRun? })`, que **não aceita conexão**:
o alvo é resolvido, autorizado, e só então a conexão é criada *a partir do alvo autorizado*
(`createConnectionForTarget`). Um objeto `Knex` passado de fora é recusado com
`RESET_API_MISUSE`; `--dry-run` dispensa o token mas continua exigindo alvo autorizado e nunca
emite `DROP`; o gate e a suíte e2e usam exclusivamente essa API.

Provas: `tests/tow/baseline/dbBaselineSafety.test.js` (48 casos, incluindo `RESET-DIRECT-1..8`
e as mutações que derrubam a suíte — `docs/evidence/t01/04-negative-controls.txt` e
`docs/evidence/t01/07-negative-control-reset-authorization.txt`).

---

## 8. Estratégia de container novo (gate de banco limpo)

`npm run test:db-baseline` (`scripts/tow/run-db-baseline-gate.js`) executa, em um container
PostgreSQL real e descartável:

1. **guarda** — recusa qualquer alvo que não seja o descartável;
2. **ambiente novo de verdade** — destrói containers/volume/rede de execuções anteriores
   (`docker compose down --volumes`) e sobe de novo com volume novo;
3. **banco vazio** — exige 0 tabelas (prova de que o volume é novo);
4. **migrate do zero** — exige exatamente `001_baseline_schema.js` e `002_baseline_settings.js`;
5. **seed** — exige exatamente 1 administrador;
6. **assert** — 27 tabelas de domínio presentes, nenhum dado funcional, 25 settings;
7. **snapshot 1** — fingerprint do schema;
8. **reset destrutivo + repetição** — reset guardado (`resetDatabase({ purpose: 'test' })`,
   alvo autorizado), migrate, seed, assert novamente;
9. **snapshot 2** — fingerprint idêntico ao snapshot 1;
10. **destruição** — `down --volumes`; falha de teardown é RED;
11. **verificação final** — nenhum container/volume/rede do projeto Compose permanece.

O gate não depende de estado prévio: ele sempre começa destruindo o ambiente anterior. As
credenciais do admin usado no gate são geradas em tempo de execução e nunca são gravadas no
repositório. Evidência: `docs/evidence/t01/db-baseline-gate.json` e as duas execuções
`02-clean-database-gate-run1.txt` / `03-clean-database-gate-run2.txt`.

---

## 9. Riscos conhecidos e mitigações

| Risco | Mitigação |
| --- | --- |
| Alguém executar o reset contra um banco real | Guarda em 8 regras + ausência de bypass + `db:guard` de pré-voo + teste dedicado; `NODE_ENV=production` e nomes com `prod`/`vps` são recusados. O `DROP` é um primitivo privado e a conexão é criada **do alvo autorizado**, nunca recebida de fora (`RESET-DIRECT-1..8`) |
| Perda de dados históricos no reset | Decisão explícita do Issue #12 (dados autorizados para reset); a cadeia legada fica arquivada e o snapshot do schema antigo está versionado em `docs/evidence/t01/schema-legacy-chain.json` |
| Divergência futura entre `knexfile.js` e o app | Ambos passam a resolver os mesmos diretórios a partir da raiz do backend (`src/config/database.js` corrigido) |
| Alguém rodar as migrations legadas por engano | `database/migrations-legacy/README.md` documenta que não são executadas; o gate falha se o diretório ativo tiver qualquer arquivo além dos 2 do baseline |
| Seed reexecutado sobrescrever a senha do admin | Idempotência sem `update` (provada por teste) |
| Redundância de índices voltar | Suíte DATABASE verifica que os 5 índices redundantes **não** existem e que as constraints `UNIQUE` que os substituem existem |
| `system_settings` ser confundido com dado funcional | Documentado como configuração estrutural; a suíte SEED libera apenas `users` e `system_settings` |

---

## 10. Decisões registradas (respostas diretas)

| Pergunta | Resposta |
| --- | --- |
| Preservar a cadeia de migrations? | **Não.** Ela é arquivada para auditoria; o schema efetivo é o baseline consolidado |
| Consolidar um baseline? | **Sim.** `001_baseline_schema.js` + `002_baseline_settings.js` |
| Arquivar as migrations antigas? | **Sim.** `database/migrations-legacy/` (43) e `database/seeds-legacy/` (5), com README explicando cada motivo |
| Instalação nova (`fresh install`)? | `db:migrate` + `db:seed` — nada mais; provado do zero em container descartável |
| Upgrade de banco antigo? | Reset autorizado + migrate + seed (não há migração incremental: os dados são descartáveis por decisão do Issue #12) |
| O T01 implementa Tow v1? | **Não.** Nenhuma tabela/coluna/regra de Tow v1 (T02+); apenas o schema existente, coerente e reproduzível |
| Onde ficam as regras de negócio? | Fora do banco. O baseline declara **estrutura e integridade** (FK, unique, not-null, check) e configuração estrutural; nenhuma regra de aplicação |
| Alguma credencial no repositório? | Nenhuma. O seed exige ambiente; o gate gera credenciais descartáveis em tempo de execução |

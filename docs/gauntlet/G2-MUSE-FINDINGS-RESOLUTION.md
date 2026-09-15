# G2 — Resolução dos achados Luna/Muse

**Escopo:** backend (`socorre_ai_backend`), worktree `codex/g2-photo-schema-pricing`,
base `99215384`. Nenhuma alteração em Mobile, nenhum segredo, nenhum deploy externo.
Este documento registra, achado por achado, o que foi corrigido, a decisão de
contrato adotada quando havia ambiguidade e a evidência de validação.

## Resumo

| # | Achado (severidade) | Decisão | Onde |
|---|---|---|---|
| 1 | Defaults 6/25/90/40 hardcoded no pricing (HIGH) | `FIXED` | `src/models/EmergencyRequest.js`, `src/controllers/emergencyRequestController.js`, `src/controllers/SystemSettingsController.js` |
| 2 | Relaxamento indevido do contrato mecânico/G1 (HIGH) | `FIXED` + `BUSINESS_RULE_AMBIGUITY` | `src/middleware/validation.js`, `src/models/EmergencyRequest.js` |
| 3 | `STORAGE_KEY_PATTERN` amplo demais (MEDIUM) | `FIXED` | `src/services/servicePhotoStorage.js` |
| 4 | Órfãos de storage sem reconciliação segura (MEDIUM, risco residual) | `FIXED` | `src/services/servicePhotoStorage.js`, `scripts/reconcile-service-photos.js` |

Commits G1/ G2 anteriores permanecem intactos; nenhum arquivo de teste G1 foi
alterado (a suíte G1 continua exatamente 43/43).

---

## 1. Pricing não fabrica mais valores default

**Antes:** `getTowPricingSettings()` devolvia `6/25/90/40` quando a chave não existia
em `system_settings`, e `resolveTowMinimumPrice()` inventava um piso de `90` sem
configuração — um guincho podia ser criado e completado com preço que ninguém
configurou.

**Depois:**

- `getTowPricingSettings()` lê somente `system_settings`, aceita apenas valor
  numérico finito `>= 0`; valor inválido/ausente vira `null`; se as quatro chaves
  estiverem ausentes retorna `null` (nunca um objeto com defaults).
- `calculateTowEstimate()` lança `TowPricingNotConfiguredError`
  (`code: tow_pricing_not_configured`, HTTP 503) com `missingKeys` quando qualquer
  chave exigida pelo cálculo (`tow_price_per_km`, `tow_platform_fixed_fee`,
  `tow_minimum_charge`) está inutilizável. `cancellation_fee` é opcional e pode ser
  `null` no breakdown.
- `POST /api/emergency-requests` (tipo `tow`) traduz o erro para
  `503 { success: false, code: 'tow_pricing_not_configured', message, missing_settings }`
  e **não insere linha** nenhuma.
- `SystemSettingsController.getGuinchoSettings` (leitura administrativa) deixou de
  repetir `?? 6/25/90/40`; chave ausente agora vem `null`, para o admin enxergar a
  ausência real de configuração que bloqueia a criação.

O breakdown de uma criação bem-sucedida carrega `pricing_source: 'system_settings'`,
provando a origem configurada.

Cobertura: `tests/tow/g2PhotoContract.test.js` (describe "pricing seguro") —
settings ausentes → `null`; valores inválidos não viram 6/25/40; estimate lança erro
controlado com `missingKeys`; criação sem config não insere linha; HTTP 503 com
`missing_settings`; estimate usa somente o configurado; conclusão legada sem piso
não inventa 90.

## 2. Contrato mecânico preservado; `final_price` obrigatório só no guincho

O schema `complete` declarado antes do G2 era estrito (`final_price` obrigatório,
`solution_description` mínimo 10, `parts_used` somente objetos), mas **nunca era
aplicado** — a rota usava validação base permissiva. O G1 documentou e testou o
comportamento vigente: `pedido mechanic usa complete sem exigir final_price` envia
`{}` e espera `EmergencyRequest.complete(1, undefined, undefined, undefined, ...)`.

Decisão: **não restaurar a rigidez retroativa**. O G2 mantém o contrato documentado
pelo G1 e adiciona apenas o necessário para o guincho:

- `emergencyRequestSchemas.completeMechanic` (alias `complete`): mesmos campos
  opcionais do G1 (`solution_description`, `parts_used`), `final_price` **opcional**,
  `.unknown(true)`.
- `emergencyRequestSchemas.completeTow`: exatamente o mesmo conjunto de campos, com
  `final_price` **obrigatório**; um teste compara `describe().keys` das duas versões
  para garantir que a única diferença é a obrigatoriedade.
- `EmergencyRequest.complete()` normaliza `final_price === undefined` para `null`,
  tornando real o comportamento "sem preço" que antes só existia no mock do G1
  (evita binding `undefined` do knex → 500).
- `final_price` inválido (`null`, `-1`, `'abc'`, `Infinity`, `NaN`) continua 400.

Cobertura: testes novos para mechanic `{}` → 200 com `final_price` nulo, mechanic com
preço válido, rejeições do schema e igualdade de campos mechanic/tow.

### BUSINESS_RULE_AMBIGUITY-1 — schema mecânico declarado × comportamento G1

- **Ambiguidade:** o schema pré-G2 declarava exigir `final_price`/`solution_description`
  para qualquer conclusão, mas nenhum fluxo aplicava isso e o G1 fixou `{}` como
  válido. Escolher "restaurar" mudaria contrato já documentado sem decisão de produto.
- **Decisão:** preservar o comportamento documentado (registrado aqui e em
  `docs/gauntlet/STATE.yaml`), sem relaxar nada além dele.
- **Owner:** contract-formalization. Se o produto quiser `final_price` obrigatório
  também no mecânico, é uma mudança de contrato explícita (e de teste G1), não um
  efeito colateral do G2.

### BUSINESS_RULE_AMBIGUITY-2 — piso de preço sem configuração

- **Ambiguidade:** o fluxo de conclusão (`resolveTowMinimumPrice`) historicamente
  aceitava `null` como "sem piso" quando não havia snapshot de breakdown nem
  configuração; não há regra de produto dizendo qual piso aplicar nesse caso.
- **Decisão:** preservar o comportamento legado (`{ valid: true, minimumAcceptedPrice: null }`),
  coerente com "não inventar 90". O risco residual é aceitar uma conclusão tardia sem
  piso quando a configuração some; está reportado em `unresolved`/`risks`.
- **Owner:** product-contract.

## 3. `STORAGE_KEY_PATTERN` restrito ao contrato

Padrão agora é exatamente:

```
/^[1-9][0-9]*\/(pickup|delivery)-[0-9a-f-]{36}\.(jpg|webp)$/
```

Testes cobrem chaves válidas (`pickup`/`delivery`) e rejeitam prefixos arbitrários
(`engine-<uuid>.jpg`, `pickupx-`, `xpickup-`, `PICKUP-`, `.png`, sem extensão, UUID
com 35 caracteres, `0/`, `-1/`), tanto na resolução direta quanto na listagem de
arquivos do diretório de storage.

## 4. Reconciliação de órfãos segura

`servicePhotoStorage.reconcileOrphanServicePhotos({ references, dryRun = true })`:

- varre **apenas** dois níveis sob `SERVICE_PHOTO_STORAGE_DIR` (`<id>/<arquivo>`),
  ignorando qualquer nome que não case com o contrato;
- nunca segue symlinks; raiz que seja symlink ou não-diretório → `unsafe_storage_path`
  (500); raiz inexistente → lista vazia;
- referências vêm das quatro colunas de metadados
  (`pickup_photo_url`, `delivery_photo_url`, `pickup_photo_metadata`,
  `delivery_photo_metadata`): chave `storage_key` exata **ou** prefixo
  `<id>/<pickup|delivery>-` quando a URL existe mas o metadata é ilegível (legado);
- **dry-run é o padrão**; `--apply` remove somente após revalidar `assertWithinRoot` +
  `lstat` imediatamente antes do unlink;
- relatório com `scanned`, `referenced`, `orphaned`, `removed`, `failed`,
  `orphan_keys`; nenhum caminho absoluto entra em payload HTTP.

`EmergencyRequest.listPhotoStorageReferences()` expõe as referências usadas pelo
serviço e pelo CLI.

CLI: `node scripts/reconcile-service-photos.js [--apply]` (dry-run por padrão;
`process.exitCode = 1` se houver falha de remoção).

Cobertura: testes unitários (dry-run × apply, proteção por prefixo mesmo com metadata
corrompido, symlink/arquivo fora da raiz nunca removido, raiz symlink/inexistente) e
testes G2 com banco (prefixo arbitrário nunca listado/removido).

## Correções de consistência no mesmo espírito

- `SystemSettingsController.getGuinchoSettings`: `?? null` em vez de `?? 6/25/90/40`
  (item 1).
- `servicePhotoController` (leitura `?format=json` em base64): passou a responder
  `Cache-Control: private, no-store` + `Pragma: no-cache`, igual à resposta binária,
  para foto privada não ser cacheada por proxy/navegador.

## Validação executada

| Comando | Resultado |
|---|---|
| `npx jest tests/tow/towLifecycleController.test.js tests/tow/towHttp.transport.test.js --runInBand --forceExit` | 43/43 PASS (contrato G1 intacto) |
| `npx jest tests/tow/g2PhotoContract.test.js tests/unit/servicePhotoStorage.test.js --runInBand --forceExit` | **78/78 PASS** (50 G2 + 28 unit) |
| `npx jest tests/tow --runInBand --forceExit` | 97 passed, 2 skipped |
| `node --check` (7 arquivos alterados/novos) + `git diff --check` + `bash -n` | PASS |
| `knex migrate:list` (PostgreSQL do stack, porta 5434) | 43 migrations, 0 pending |
| Smoke de runtime com o app real + PostgreSQL real | 503 sem pricing (0 linhas inseridas) → 201 com pricing de `system_settings` → upload 201 → leitura 200 `private, no-store` sem vazar `storage_key`/raiz → órfão válido detectado no dry-run (removed 0, arquivo mantido) e removido no apply (removed 1, arquivo referenciado intacto, leitura 200) |
| CLI `scripts/reconcile-service-photos.js` (dry-run e `--apply`) | Relatório correto; arquivo fora do contrato (`engine-<uuid>.jpg`) preservado |

### Falhas pré-existentes fora do escopo G2

`npx jest tests/unit` completo acusa 5 suítes legadas quebradas
(`DeliveryOrder`, `DeliveryOrder.basic`, `Subscription`, `Subscription.basic`,
`TowProposal`). Elas não têm relação com G2: sem banco, falham com `AggregateError`
de conexão; com o PostgreSQL do stack acessível, falham porque consultam colunas que
não existem no schema real (ex.: `tow_proposals.estimated_value`) — são suítes
desatualizadas que constroem um SQLite em memória que nunca é injetado nos models.
`tests/unit/servicePhotoStorage.test.js`, que é o arquivo de unidade do G2, passa
28/28.

## Riscos residuais / não resolvido

- `BUSINESS_RULE_AMBIGUITY-1` e `-2` acima seguem sem decisão formal de produto;
  foram preservados os comportamentos documentados, não silenciados.
- Revisão adversarial Muse continua sem review YAML válido (ver `STATE.yaml`), então
  a correção fica em `PENDING_REVIEW`.
- A imagem Docker em execução (`socorre_ai_backend`, 3 h) precede estas correções; o
  smoke de runtime foi executado com o código do worktree via Express + PostgreSQL do
  stack. Rebuild da imagem é ação de deploy e não foi feita.

## Não tocado

- `docs/MOBILE-AUTH-TOW-CONTRACT-V1.md` (somente leitura), qualquer arquivo de
  Mobile, suítes G1, migrations (nenhuma nova), segredos e deploy externo.

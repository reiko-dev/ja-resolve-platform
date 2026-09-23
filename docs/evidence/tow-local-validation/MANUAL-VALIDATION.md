# TOW LOCAL VALIDATION — MANUAL RUNBOOK (HUMAN OPERATOR)

Status: `LOCAL_TOW_VALIDATION_READY_FOR_HUMAN_TEST`
Contract: `1.0.0-draft.13` (Tow round — real routes, mandatory payment at creation, background tracking)
Date: 2026-09-23
Repo: `socorre-system` (backend). Mobile apps consumed from `socorre-v2` (debug builds run locally).

> **This is NOT a release.** No executables (APK/AAB/IPA) were produced in this phase. No PSP, no real
> money, no production infrastructure. Human validation happens on locally run Flutter debug apps against
> a disposable local Postgres and a local backend started in validation mode.

> **Tow round (draft.13) changes the script below:**
> - the Cliente chooses the payment method BEFORE creating the request (`CASH` is the only method; the
>   request cannot be created without it — the backend answers `422 validation_error`);
> - visual/device validation MUST run with a real road route:
>   `TOW_ROUTE_PROVIDER=google` + `GOOGLE_ROUTES_API_KEY=<server-side key>` in `.env.validation`;
>   the `validation-fixture` provider is for deterministic automated tests only;
> - the Cliente now receives the socket event `tow_tracking_updated` (fast path) and reconciles through
>   `GET /tow/requests/{id}/tracking` (authority); polling remains a fallback.

---

## 0. Handoff block (read this, then run)

| Item | Value |
| --- | --- |
| Backend URL (Mac / simulator / same host) | `http://127.0.0.1:3000` |
| Backend URL (physical devices, LAN) | `http://192.168.100.244:3000` |
| Backend URL (Android emulator) | `http://10.0.2.2:3000` |
| Health check | `curl http://127.0.0.1:3000/health` |
| Reset + migrate + seed scenario | `npm run tow:validation:reset` |
| Start backend (validation mode) | `npm run start:validation` |
| Smoke (auto) | `npm run tow:validation:smoke` |
| Destroy validation DB | `npm run tow:validation:down` |
| Credentials | `cliente.validacao@socorre.com.br` / `parceiro.validacao@socorre.com.br` / `admin.validacao@socorre.com.br` — password `Validacao123!` |
| Payment mode confirmation | Backend startup log prints the **MOCK** payment-mode line + the validation banner log; no endpoint was added |
| Route provider (visual validation) | `TOW_ROUTE_PROVIDER=google` + `GOOGLE_ROUTES_API_KEY=<server-side key>` in `.env.validation`; startup banner prints `route provider: google`. Without the key, Google fails closed (503) — there is NO straight-line fallback |
| Checklist | this file — §6 (script) and §7 (checklist) |
| Known validation-only limits | simulated/CASH-only payment; customer vehicle typed in the Cliente app (no server-side catalog); seeded vehicle documents have no file bytes (download 404); no executables built |

---

## 1. Architecture and data flow (local only)

```text
  +------------------+          +---------------------------+          +----------------------------+
  |  Cliente App     |  HTTP    |  Local backend            |  TCP     |  Disposable Postgres       |
  |  (Flutter debug) | -------> |  127.0.0.1:3000           | -------> |  127.0.0.1:55433           |
  |                  |  Socket  |  /api/tow/*  (draft.13)   |          |  DB socorre_tow_validation_test |
  +------------------+ <------- |  TOW_PAYMENT_MODE=mock    |          +----------------------------+
                                |  route provider:          |                 ^
  +------------------+  HTTP    |    fixture OR google      |                 |
  |  Parceiro App    | -------> |  (visual: google real)    |  TCP            |
  |  (Flutter debug) |          +---------------------------+ ----------------+
  +------------------+                                                       |
                                                                            |
     payments: SIMULATED, CASH only              Postgres is disposable: reset recreates schema+seed
     TowRequest.payment_method = CASH at creation (commercial choice)
     TowPayment (execution): NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED
```

- Real pricing policy runs server-side even when the route provider is the deterministic fixture.
- Route provider: the `validation-fixture` (distances = geodesic x1.35, encoded polyline) exists ONLY for
  deterministic automated tests. Visual/device validation requires real roads: set
  `GOOGLE_ROUTES_API_KEY` in `.env.validation` and `TOW_ROUTE_PROVIDER=google`, then restart the backend.
  A Google failure is a fail-closed 503 — the backend never fabricates a straight line.
- No external payment provider is contacted at any point.

---

## 2. Setup (backend)

All commands run from `/Volumes/Reiko/projects/work/socorre-system/socorre_ai_backend`.
The env file is copied once and is gitignored.

```bash
cd /Volumes/Reiko/projects/work/socorre-system/socorre_ai_backend

# first time only
cp .env.validation.example .env.validation

# start disposable Postgres, drop schema, migrate, seed the validation scenario
npm run tow:validation:reset
```

Success looks like:

```text
VALIDATION_DB=READY
```

(Optional but recommended — automated smoke over the same scenario as the manual script:)

```bash
npm run tow:validation:smoke
```

Success looks like:

```text
SMOKE=PASS
```

> Note: the smoke resets and re-seeds the scenario at the end, so run it **before** the human test session,
> not in the middle of a session you care about.

Start the real backend on port 3000 with simulated payments:

```bash
npm run start:validation
```

Success looks like a startup log containing the payment-mode line (MOCK) **and** the validation banner log.
Leave this terminal running.

Failure signals to report: non-zero exit, `VALIDATION_DB=` any value other than `READY`, any port 3000
binding error, or a startup log without the MOCK payment-mode line.

---

## 3. Run (mobile, two devices)

Apps live in `/Volumes/Reiko/projects/work/socorre-v2`:
`apps/socorre_client_app` (Cliente) and `apps/socorre_partner_app` (Parceiro).

```bash
flutter devices
```

Pick one `<device-id>` per app (ideally two physical devices on the same LAN as the Mac). Then, **from each
app directory**, in its own terminal:

```bash
flutter run -d <device-id> \
  --dart-define=API_BASE_URL=http://192.168.100.244:3000/api \
  --dart-define=APP_ENV=validation \
  --dart-define=GOOGLE_MAPS_API_KEY=<key-local>
```

`API_BASE_URL` per target:

| Target | `API_BASE_URL` |
| --- | --- |
| Physical devices (LAN) | `http://192.168.100.244:3000/api` |
| Android emulator | `http://10.0.2.2:3000/api` |
| iOS simulator / macOS (same host) | `http://127.0.0.1:3000/api` |

Google Maps key: it is **not in git**. The operator may read the local, gitignored
`apps/socorre_client_app/.env` (key `GOOGLE_MAPS_API_KEY`) and pass it on the command line. Do not paste the
key into any tracked file. If the key is omitted, maps fall back to OSM/static — state that as observed
behavior, not a failure.

Cleartext HTTP: Android debug builds now allow cleartext (debug manifest only); iOS already permits it.
The apps must be debug builds. With `APP_ENV=validation`, the mobile shows the banner
`AMBIENTE DE VALIDAÇÃO • PAGAMENTOS SIMULADOS`.

### Single-device fallback

If only one device is available: keep the backend and Postgres alive, run the Cliente app first through
steps 1–8, quit it (`q` in its terminal), then run the Parceiro app through steps 9–13, and continue
alternating. The scenario state lives in Postgres, so it is preserved across app restarts. Use the same
credentials each time. Run the two apps one at a time; do not run both against the same device.

### iOS simulators (no physical device needed)

Two simulators can run both apps simultaneously on the Mac (GPS set to the seeded pickup):

```bash
xcrun simctl boot <CLIENTE_UDID>; xcrun simctl boot <PARCEIRO_UDID>
xcrun simctl location <UDID> set -23.561684,-46.655981   # GPS simulado no ponto de coleta
# then the same `flutter run` commands with --dart-define=API_BASE_URL=http://127.0.0.1:3000/api
```

List the available simulators with `xcrun simctl list devices available` (any iPhone with an iOS 18.x
runtime is known-good). Google Maps on the simulator uses the passed `GOOGLE_MAPS_API_KEY`; without the
key the map degrades to OSM/static, which is expected.

### Refresh behavior (important)

Tow now has ONE socket event: `tow_tracking_updated` (minimal invalidation payload `{ request_id,
received_at }`), emitted after a valid tracking write to the room `tow_request_<id>`. The Cliente joins
that room with `join_tow_request` and refetches `GET /tow/requests/{id}/tracking` on the event; the ~10 s
poll remains the recovery path. The socket is never the position authority.

Every OTHER state change (proposal, assignment, milestones, payment) has no socket event, so the apps read
the canonical state when the screen opens, when you tap **Atualizar**, and (Cliente) on the tracking poll.
After a transition made on the other device, tap **Atualizar** before judging the screen. The Parceiro also
supports pull-to-refresh.

---

## 4. Credentials (validation-only, not secrets)

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Cliente | `cliente.validacao@socorre.com.br` | `Validacao123!` |
| Parceiro | `parceiro.validacao@socorre.com.br` | `Validacao123!` |
| Admin | `admin.validacao@socorre.com.br` | `Validacao123!` |

---

## 5. Payment semantics (validation)

Two distinct authorities:

- `TowRequest.payment_method` — the COMMERCIAL choice made by the Cliente BEFORE creating the request.
  It is REQUIRED: without it the backend answers `422 validation_error` and creates nothing. Only `cash`
  is implemented (`card`/`pix` answer `422 method_not_supported_in_mvp`).
- `TowPayment` — the FINANCIAL execution, created only after assignment/price. Canonical states:
  `NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED`.

- The Cliente selects CASH in the creation form (step 5) and the request is created carrying
  `payment_method: cash`.
- The Parceiro sees `payment_method` and the backend-calculated price on the opportunity BEFORE proposing.
- The Parceiro confirms cash received **after** `COMPLETED` (step 23).
- No card, no PIX, no PSP, no real money, no settlement.

---

## 6. Manual test script (execute in this exact order)

**Cliente**

- [ ] 1. Login
- [ ] 2. Dashboard/Home
- [ ] 3. Guincho
- [ ] 4. Selecionar veículo
- [ ] 5. Escolher forma de pagamento **CASH** (o botão de solicitar deve ficar desabilitado sem método)
- [ ] 6. Permitir GPS
- [ ] 7. Escolher destino no mapa
- [ ] 8. Conferir rota (polyline de ruas reais com `TOW_ROUTE_PROVIDER=google`)
- [ ] 9. Solicitar Guincho

**Parceiro**

- [ ] 10. Login
- [ ] 11. Dashboard
- [ ] 12. Guincho
- [ ] 13. Ver oportunidade — conferir origem, destino, veículo, **pagamento CASH**, distância e preço
      calculado pelo backend (não editável)
- [ ] 14. Enviar proposta

**Cliente**

- [ ] 15. Receber proposta — na tela do Cliente, toque em **Atualizar** (ícone no topo) para ler o
      estado canônico; o app não faz polling de propostas
- [ ] 16. Conferir preço
- [ ] 17. Aceitar proposta

**Parceiro**

- [ ] 18. A caminho
- [ ] 19. Tracking (manter o app ativo; opcional: colocar em background e conferir que o Cliente continua
      recebendo posição)
- [ ] 20. Cheguei
- [ ] 21. Iniciar transporte
- [ ] 22. Finalizar
- [ ] 23. Confirmar recebimento simulado

**Cliente**

- [ ] 24. Ver o ícone do Guincho no mapa mover ao vivo (socket `tow_tracking_updated` + REST; sem refresh)
- [ ] 25. Ver COMPLETED — toque em **Atualizar** no Cliente para ler o estado final (o tracking para no
      estado terminal, mas o estado/pagamento exigem o refresh explícito)
- [ ] 26. Conferir estado financeiro final

---

## 7. Manual validation checklist

- [ ] Entrada Cliente (login válido, sem erro de rede)
- [ ] Entrada Parceiro (login válido, sem erro de rede)
- [ ] Visual das telas (sem cortes, overflow ou texto ilegível)
- [ ] Escolha veículo (seleção/entrada no app)
- [ ] Pagamento obrigatório (sem método o botão Solicitar Guincho fica desabilitado; backend rejeita 422)
- [ ] GPS (permissão concedida e posição obtida)
- [ ] Mapa (renderiza; fallback OSM/static se sem chave)
- [ ] Destino (seleção no mapa funciona)
- [ ] Route polyline (rota de RUAS REAIS com `TOW_ROUTE_PROVIDER=google`; sem linha reta)
- [ ] Preço do servidor (valor exibido bate com o backend; nada inventado no app)
- [ ] Opportunity Parceiro (origem, destino, veículo, pagamento CASH, distância e preço calculado)
- [ ] Proposta (Parceiro envia sem digitar preço; aparece para o Cliente)
- [ ] Aceite (proposta aceita vira vencedora; demais somem/recusadas)
- [ ] Payment UX (`TowRequest.payment_method=cash` no create; execução
      `NOT_SELECTED -> CASH_SELECTED -> CASH_RECEIVED`)
- [ ] Tracking (posição do Parceiro atualiza para o Cliente via socket + REST)
- [ ] Milestones (A caminho / Cheguei / Iniciar transporte / Finalizar)
- [ ] Conclusão (COMPLETED visível no Cliente; tracking encerra; confirmação de recebimento no Parceiro)
- [ ] Mensagens de erro (claras, não travam o app)
- [ ] Voltar/navegação (sem telas mortas ou loops)

---

## 8. Feedback do usuário

### 8.1 Tabela de observação

| Item | Esperado | Observado | Veredito OK/Falha | Notas |
| --- | --- | --- | --- | --- |
| 1. Login Cliente | Entra no app com as credenciais da seção 4 | | | |
| 2. Pagamento na criação | Sem método o CTA fica desabilitado; CASH selecionado e `payment_method` aceito no create | | | |
| 3. Solicitar Guincho | Pedido criado; veículo, GPS, destino e pagamento aceitos | | | |
| 4. Rota exibida | Polyline de ruas reais (google); distância coerente com o backend | | | |
| 5. Preço | Valor do servidor exibido sem edição no app | | | |
| 6. Opportunity Parceiro | Mostra pagamento CASH, distância e preço calculado | | | |
| 7. Proposta Parceiro | Proposta criada (sem preço digitado) e visível ao Cliente | | | |
| 8. Aceite | Uma proposta vencedora; estado segue | | | |
| 9. Pagamento CASH (execução) | `TowPayment` muda para CASH_SELECTED | | | |
| 10. Tracking | Posição atualiza no app do Cliente via socket e REST | | | |
| 11. Milestones | A caminho / Cheguei / Iniciar / Finalizar funcionam | | | |
| 12. Conclusão | COMPLETED no Cliente; tracking encerra; CASH_RECEIVED após confirmação | | | |
| 13. Erros | Mensagens claras; nenhum crash | | | |
| 14. Navegação | Voltar e transições sem tela morta | | | |

### 8.2 Bugs (texto livre)

Use um bloco por bug, no formato:

```text
BUG-<n>
Passos: <o que foi feito, em ordem>
Tela: <tela/app onde ocorreu>
Horário: <HH:MM>
Estado: <estado visível do pedido/pagamento, ex.: IN_TRANSIT / CASH_SELECTED>
Esperado vs. Observado: <diferença exata>
Evidência: <foto/print/caminho, se houver>
```

---

## 9. Operational notes

- Mid-test reset: `npm run tow:validation:reset` is safe **while the backend is running** — it recreates
  the schema and re-seeds the scenario. All in-flight manual state is discarded; restart the manual script
  from step 1. Use it whenever the scenario gets stuck.
- Health: `curl http://127.0.0.1:3000/health`.
- Payment-mode proof: only the backend startup log (the MOCK payment-mode line and the validation banner
  log). No endpoint was added for this. To confirm the mode later, restart `npm run start:validation` and
  read the log.
- Real Google Routes (REQUIRED for visual validation): set `GOOGLE_ROUTES_API_KEY` and
  `TOW_ROUTE_PROVIDER=google` in `.env.validation`, then restart the backend. The startup banner prints
  `route provider: google`. The `validation-fixture` (geodesic x1.35) is acceptable only for deterministic
  automated tests — it can produce a direct line between points and must NOT be used for device
  validation. A Google failure is a fail-closed 503: no straight-line fallback is ever fabricated.
- Teardown: stop the apps (`q`) and the backend (`Ctrl+C`), then `npm run tow:validation:down` to destroy
  the disposable Postgres.

### Known limitations (validate against this truth)

- Payment is simulated and CASH-only; no card, no PIX, no PSP. The commercial choice (`payment_method`)
  is required at creation; the financial execution (`TowPayment`) still starts after assignment.
- Route distances/polyline are fixture-derived unless the real `GOOGLE_ROUTES_API_KEY` is provided;
  visual validation requires the real provider.
- Tracking is latest-position only (no trail) and stops at `COMPLETED`/`CANCELLED`.
- The customer vehicle in the Cliente app is chosen/typed in the app; there is no server-side customer
  vehicle catalog.
- Seeded vehicle document rows have no real file bytes; a document download would 404.
- NO executables (APK/AAB/IPA) were built in this phase; validation is on locally run debug apps.
- The Google Maps key is not in git; if omitted, maps fall back to OSM/static.

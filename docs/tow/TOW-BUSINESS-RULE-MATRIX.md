# JaResolve — Matriz Congelada de Regras de Negócio do Módulo Guincho (Tow)

> Status: **normative / frozen for implementation**  
> Pricing authority: `TOW-PRICING-CONTRACT.md`  
> Transport authority: `tow-api-contract.openapi.yaml`

## 1. Objetivo

Esta matriz transforma a especificação Tow em regras verificáveis e testáveis. Implementação, migrations, endpoints, jobs, consumers e testes devem preservar estas invariantes.

Prioridade:

- **P0** — obrigatória para integridade/correção do domínio.
- **P1** — obrigatória para operação segura do MVP.
- **P2** — importante, mas não bloqueia o núcleo quando isolável.

Teste mínimo:

- **U** — unitário.
- **I** — integração API + PostgreSQL/adapter.
- **E2E** — fluxo backend ponta a ponta.
- **C** — concorrência real/transactional quando aplicável.

---

## 2. Módulo e feature flag

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-MODULE-001 | Identidade canônica: `module_key=tow`, `service_key=tow`, `partner_type=tow`. | P0 | U + I |
| TOW-MODULE-002 | Backend é fonte de verdade de `TowModule.enabled`. | P0 | U + I |
| TOW-MODULE-003 | Módulo disabled bloqueia novo Tow request. | P0 | U + I + E2E |
| TOW-MODULE-004 | Disabled interrompe matching/expansão de requests ainda não atribuídos. | P0 | U + I + E2E |
| TOW-MODULE-005 | Disabled bloqueia novas proposals/counteroffers/assignments não consolidados. | P0 | U + I + E2E |
| TOW-MODULE-006 | `SEARCHING`/`NEGOTIATING` encerram com `terminal_reason=SERVICE_DISABLED` quando o módulo é desligado. | P0 | I + E2E |
| TOW-MODULE-007 | Request já `ASSIGNED` antes do disable continua até terminal com payment/tracking/cancellation/dispute/settlement disponíveis. | P0 | I + E2E |
| TOW-MODULE-008 | Disable não apaga partner, TowVehicle, documentos ou settings. | P0 | I |
| TOW-MODULE-009 | Re-enable aceita novos requests, mas não ressuscita requests/proposals encerrados. | P0 | U + I + E2E |
| TOW-MODULE-010 | Toggle é admin-only, idempotente e auditável. | P0 | I + C + E2E |
| TOW-MODULE-011 | Corrida disable × assignment produz exatamente um resultado consistente: assignment consolidado ou `SERVICE_DISABLED`, nunca ambos. | P0 | C + E2E |

---

## 3. Parceiro e disponibilidade

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PARTNER-001 | Somente `partner_type=tow` opera Tow. | P0 | U + I |
| TOW-PARTNER-002 | Matching exige partner `approved`, `online` e `available`. | P0 | U + I + E2E |
| TOW-PARTNER-003 | Assignment consolidado torna partner ocupado/busy. | P0 | I + E2E |
| TOW-PARTNER-004 | Partner busy não recebe novo matching Tow. | P0 | U + I |
| TOW-PARTNER-005 | No MVP, partner executa somente um Tow simultâneo. | P0 | U + I + E2E |
| TOW-PARTNER-006 | Após terminal, partner pode voltar a available se não houver outro blocker. | P1 | I |
| TOW-PARTNER-007 | Se `platform_fee_debt_cents > tow_max_platform_fee_debt_cents`, partner não recebe novos atendimentos Tow. | P0 | U + I + E2E |
| TOW-PARTNER-008 | `tow_max_platform_fee_debt_cents=0` significa limite zero, não sentinel “disabled”. | P1 | U |
| TOW-PARTNER-009 | Status operacional e blockers são calculados pelo backend, não pelo app. | P0 | U + I |

---

## 4. TowVehicle

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-VEHICLE-001 | Partner tow pode cadastrar múltiplos TowVehicles. | P0 | I |
| TOW-VEHICLE-002 | No máximo um TowVehicle `active=true` por partner. | P0 | U + I + C |
| TOW-VEHICLE-003 | TowVehicle possui `minimum_charge_cents`, `included_km`, `price_per_additional_km_cents` válidos. | P0 | U + I |
| TOW-VEHICLE-004 | Cada TowVehicle pode ter tarifa própria. | P0 | U + I |
| TOW-VEHICLE-005 | TowVehicle declara `supported_vehicle_classes`. | P0 | U + I |
| TOW-VEHICLE-006 | TowVehicle declara `max_towed_weight_kg`. | P0 | U + I |
| TOW-VEHICLE-007 | `equipment_type` inicial: `flatbed`, `wheel_lift`, `heavy_wrecker`. | P1 | U + I |
| TOW-VEHICLE-008 | Vehicle do assignment não pode ser trocado durante atendimento ativo. | P0 | U + I + E2E |
| TOW-VEHICLE-009 | Proposal guarda snapshot da tarifa/vehicle usados. | P0 | U + I |
| TOW-VEHICLE-010 | Alterar tarifa depois não altera proposal/agreement existente. | P0 | U + I + E2E |

---

## 5. Documentação do TowVehicle

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DOC-001 | Todo TowVehicle precisa de ao menos um documento comprobatório. | P0 | U + I |
| TOW-DOC-002 | Upload aceita JPEG, PNG ou PDF conforme validação de MIME/tamanho. | P1 | U + I |
| TOW-DOC-003 | Estados canônicos: `pending`, `approved`, `rejected`, `expired`. | P0 | U + I |
| TOW-DOC-004 | TowVehicle só pode operar/ser ativado como operacional com documento aprovado e válido. | P0 | U + I + E2E |
| TOW-DOC-005 | Aprovação do partner não substitui aprovação do TowVehicle. | P0 | U + I |
| TOW-DOC-006 | Rejeição persiste `rejection_reason`. | P1 | I |
| TOW-DOC-007 | Aprovação persiste `verified_by` e `verified_at`. | P1 | I |
| TOW-DOC-008 | `expires_at` vencido torna documento `expired` para elegibilidade até nova aprovação válida. | P0 | U + I + E2E |
| TOW-DOC-009 | `pending`, `rejected` ou `expired` não satisfazem elegibilidade operacional. | P0 | U + I |

---

## 6. Compatibilidade/capacidade

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-COMPAT-001 | Classes: `motorcycle`, `light_vehicle`, `medium_truck`, `heavy_truck`. | P0 | U |
| TOW-COMPAT-002 | Classe solicitada deve estar em `supported_vehicle_classes` do TowVehicle ativo. | P0 | U + I + E2E |
| TOW-COMPAT-003 | `medium_truck` e `heavy_truck` exigem peso/PBT. | P0 | U + I |
| TOW-COMPAT-004 | Peso solicitado não pode exceder `max_towed_weight_kg`. | P0 | U + I + E2E |
| TOW-COMPAT-005 | Incompatibilidade exclui partner antes de proposal. | P0 | U + I |

---

## 7. Criação do request

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-REQUEST-001 | Request contém pickup. | P0 | U + I |
| TOW-REQUEST-002 | Request contém destination. | P0 | U + I |
| TOW-REQUEST-003 | Request contém vehicle class/make/model. | P0 | U + I |
| TOW-REQUEST-004 | `problem_description` é obrigatório; observations é opcional. | P1 | U + I |
| TOW-REQUEST-005 | Customer com dívida impeditiva não cria novo atendimento. | P0 | U + I + E2E |
| TOW-REQUEST-006 | Fotos do veículo do customer são opcionais no MVP. | P2 | I |
| TOW-REQUEST-007 | Novo request entra em `SEARCHING`. | P0 | I |
| TOW-REQUEST-008 | Novo request é rejeitado com `service_module_disabled` quando Tow está disabled. | P0 | I + E2E |

---

## 8. Google Routes e distância

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-ROUTE-001 | Pricing usa rota viária, nunca linha reta/Haversine. | P0 | U + I |
| TOW-ROUTE-002 | Total = `provider_to_pickup + pickup_to_destination`. | P0 | U + I |
| TOW-ROUTE-003 | Provider location usada no quote é a corrente no momento da proposal. | P0 | I |
| TOW-ROUTE-004 | Price usa route snapshot estimado no momento da proposal. | P0 | U + I |
| TOW-ROUTE-005 | Após acordo, preço não é recalculado pela distância efetivamente percorrida. | P0 | U + I + E2E |
| TOW-ROUTE-006 | Distância autoritativa trafega em metros inteiros. | P0 | U + I |

---

## 9. Precificação congelada

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PRICE-001 | Base usa `minimum_charge_cents`. | P0 | U |
| TOW-PRICE-002 | `included_km` define distância incluída na cobrança mínima. | P0 | U |
| TOW-PRICE-003 | Excedente é cobrado proporcionalmente por `price_per_additional_km_cents`. | P0 | U |
| TOW-PRICE-004 | `excess_meters = max(0, total_distance_meters - included_km*1000)`. | P0 | U |
| TOW-PRICE-005 | **Não** arredondar excedente para quilômetro inteiro e **não** usar `ceil(excess_km)`. | P0 | U + I |
| TOW-PRICE-006 | `variable_charge_cents = ROUND_HALF_UP(excess_meters * price_per_additional_km_cents / 1000)`. | P0 | U |
| TOW-PRICE-007 | Final = `minimum_charge_cents + variable_charge_cents`. | P0 | U + I |
| TOW-PRICE-008 | Apenas o resultado monetário é arredondado para centavos; distância não é arredondada para pricing. | P0 | U |
| TOW-PRICE-009 | Cálculo usa integer/rational/decimal-safe arithmetic; binary float não é fonte de verdade financeira. | P0 | U |
| TOW-PRICE-010 | Partner não sobrescreve preço inicial calculado pelo backend. | P0 | U + I |

---

## 10. Matching geográfico

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-MATCH-001 | Começa em `tow_initial_radius_km`. | P0 | U + I |
| TOW-MATCH-002 | Expande por `tow_radius_increment_km`. | P0 | U + I |
| TOW-MATCH-003 | Expansão ocorre no intervalo configurado. | P0 | U + I |
| TOW-MATCH-004 | `tow_max_radius_km <= 100`. | P0 | U + I |
| TOW-MATCH-005 | No max radius, busca continua até timeout global. | P0 | U + I |
| TOW-MATCH-006 | Timeout encerra `EXPIRED/NO_PROVIDER_AVAILABLE`. | P0 | U + I + E2E |
| TOW-MATCH-007 | Todos os critérios de partner/vehicle/document/compatibility/location precisam ser satisfeitos. | P0 | U + I + E2E |
| TOW-MATCH-008 | Disable encerra busca pré-assignment como `SERVICE_DISABLED`, não `NO_PROVIDER_AVAILABLE`. | P0 | U + I + E2E |

---

## 11. Proposals

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PROP-001 | Múltiplos partners podem ter proposals concorrentes para request aberto. | P0 | I + E2E |
| TOW-PROP-002 | Primeiro proposal não ganha automaticamente. | P0 | I |
| TOW-PROP-003 | Proposal usa preço calculado pelo backend. | P0 | U + I |
| TOW-PROP-004 | Proposal expira por `tow_proposal_expiry_minutes`. | P0 | U + I |
| TOW-PROP-005 | Expired não pode ser aceito. | P0 | U + I |
| TOW-PROP-006 | Withdraw permitido apenas antes de accept/counteroffer/expiry. | P0 | U + I |
| TOW-PROP-007 | Após counteroffer, partner aceita ou rejeita; withdraw é bloqueado. | P0 | U + I |
| TOW-PROP-008 | Proposal preserva snapshot de vehicle/tariff/route/distance/price. | P0 | I |
| TOW-PROP-009 | Módulo disabled impede novo proposal. | P0 | U + I + E2E |

---

## 12. Counteroffer

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-COUNTER-001 | Customer faz no máximo uma counteroffer por proposal. | P0 | U + I + E2E |
| TOW-COUNTER-002 | Partner só aceita ou rejeita. | P0 | U + I |
| TOW-COUNTER-003 | Não existe segunda rodada no MVP. | P0 | U + I |
| TOW-COUNTER-004 | Expira por `tow_counteroffer_expiry_minutes`. | P0 | U + I |
| TOW-COUNTER-005 | Expired não pode ser aceita. | P0 | U + I |
| TOW-COUNTER-006 | Módulo disabled impede nova counteroffer. | P0 | U + I + E2E |

---

## 13. Assignment e concorrência

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-ASSIGN-001 | Assignment nasce de accept proposal ou accept counteroffer. | P0 | U + I + E2E |
| TOW-ASSIGN-002 | Partner, TowVehicle, final price, destination, route e tariff snapshots ficam congelados. | P0 | I |
| TOW-ASSIGN-003 | Demais negotiations fecham atomicamente. | P0 | I + E2E |
| TOW-ASSIGN-004 | Accept é transacional e idempotente. | P0 | I + C + E2E |
| TOW-ASSIGN-005 | Dois accepts concorrentes resultam em exatamente um assignment. | P0 | C + E2E |
| TOW-ASSIGN-006 | Disable × assignment é deterministicamente serializado: assignment ou SERVICE_DISABLED. | P0 | C + E2E |

---

## 14. Destination

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DEST-001 | Antes do assignment, destination pode ser alterado quando permitido. | P1 | U + I |
| TOW-DEST-002 | Alteração pré-assignment invalida quotes/proposals dependentes. | P0 | U + I |
| TOW-DEST-003 | Depois do assignment, destination fica locked no MVP. | P0 | U + I |
| TOW-DEST-004 | Mudança pós-assignment exige cancelamento aplicável + novo request. | P0 | U + I + E2E |

---

## 15. State machine

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-STATE-001 | Estados: `SEARCHING`, `NEGOTIATING`, `ASSIGNED`, `EN_ROUTE`, `ARRIVED`, `IN_TRANSIT`, `COMPLETION_PENDING`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `DISPUTED`. | P0 | U |
| TOW-STATE-002 | Transições inválidas são rejeitadas. | P0 | U + I |
| TOW-STATE-003 | `EN_ROUTE` = deslocamento ao pickup. | P0 | U + I |
| TOW-STATE-004 | `ARRIVED` = chegada ao pickup. | P0 | U + I |
| TOW-STATE-005 | `IN_TRANSIT` = transporte ao destination iniciou. | P0 | U + I |
| TOW-STATE-006 | Não existe `vehicle_loaded` no MVP. | P1 | U |
| TOW-STATE-007 | Apps usam `allowed_actions`/backend responses e não inferem state transitions localmente. | P0 | I |

---

## 16. Tracking e completion

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-TRACK-001 | Tracking existe de `EN_ROUTE` até `COMPLETION_PENDING`. | P0 | I + E2E |
| TOW-TRACK-002 | Ponto registra latitude/longitude/recorded_at. | P0 | I |
| TOW-TRACK-003 | Tracking permanece associado ao request para audit/dispute. | P0 | I |
| TOW-COMPLETE-001 | Partner solicita finish no destination. | P0 | I |
| TOW-COMPLETE-002 | Finish registra GPS/timestamp. | P0 | I |
| TOW-COMPLETE-003 | Finish leva a `COMPLETION_PENDING`. | P0 | I |
| TOW-COMPLETE-004 | Customer pode confirm ou dispute. | P0 | I + E2E |
| TOW-COMPLETE-005 | Sem resposta, auto-confirm após timeout configurado. | P0 | U + I + E2E |
| TOW-COMPLETE-006 | Confirm/auto-confirm leva a `COMPLETED`. | P0 | I |
| TOW-COMPLETE-007 | Contestação leva a `DISPUTED`. | P0 | I |
| TOW-COMPLETE-008 | OTP/foto de conclusão não são obrigatórios no MVP. | P1 | U |

---

## 17. Cancelamento e no-show

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CANCEL-001 | Customer cancel antes de `EN_ROUTE` é gratuito. | P0 | U + I |
| TOW-CANCEL-002 | A partir de `EN_ROUTE`, aplica `tow_cancellation_fee_cents`. | P0 | U + I + E2E |
| TOW-CANCEL-003 | Há uma única faixa de fee pós-EN_ROUTE no MVP. | P1 | U |
| TOW-CANCEL-004 | Fixed platform fee não é adicionada à cancellation fee. | P0 | U + I |
| TOW-CANCEL-FEE-001 | Cancellation fee é configurável. | P0 | U + I |
| TOW-CANCEL-FEE-002 | Split partner/platform é configurável. | P0 | U + I |
| TOW-CANCEL-FEE-003 | Percentuais somam 100. | P0 | U + I |
| TOW-PROVIDER-CANCEL-001 | Partner cancel não cobra customer. | P0 | U + I |
| TOW-PROVIDER-CANCEL-002 | Request pode retornar ao matching quando ainda válido e módulo enabled. | P0 | I + E2E |
| TOW-PROVIDER-CANCEL-003 | Evento entra em reputação/audit. | P1 | I |
| TOW-PROVIDER-CANCEL-004 | Sem multa automática ao partner no MVP. | P1 | U |
| TOW-NOSHOW-CUSTOMER-001 | Customer no-show só após `ARRIVED` + timeout. | P0 | U + I |
| TOW-NOSHOW-CUSTOMER-002 | Customer no-show usa cancellation fee pós-EN_ROUTE. | P0 | U + I + E2E |
| TOW-NOSHOW-PROVIDER-001 | Partner no-show não cobra customer. | P0 | U + I |
| TOW-NOSHOW-PROVIDER-002 | Partner no-show pode rematch quando permitido. | P0 | I |
| TOW-NOSHOW-PROVIDER-003 | Evento é auditado/reputacional. | P1 | I |

---

## 18. Pagamento CARD

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CARD-001 | Final price deve estar autorizado antes de `EN_ROUTE`. | P0 | U + I + E2E |
| TOW-CARD-002 | Falha de authorization bloqueia `EN_ROUTE`. | P0 | U + I |
| TOW-CARD-003 | Customer pode trocar método antes de início enquanto permitido sem perder assignment. | P0 | U + I |
| TOW-CARD-004 | Capture ocorre após conclusão confirmada/auto-confirmada. | P0 | I + E2E |
| TOW-CARD-005 | Payment operations são idempotentes. | P0 | I + E2E |

---

## 19. Pagamento PIX

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PIX-001 | PIX confirmado é pré-condição de `EN_ROUTE`. | P0 | U + I + E2E |
| TOW-PIX-002 | PIX não usa authorize/capture de cartão. | P0 | U |
| TOW-PIX-003 | Free cancel gera full refund. | P0 | U + I |
| TOW-PIX-004 | Cancel pós-EN_ROUTE reembolsa `final_price - cancellation_fee`. | P0 | U + I + E2E |
| TOW-PIX-005 | Fee retida é split conforme snapshot configurado. | P0 | U + I |
| TOW-PIX-006 | Webhooks duplicate/reordered são idempotentes e não regressam estado. | P0 | I + E2E |

---

## 20. Cash e dívidas

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CASH-001 | Cash pode iniciar sem pré-pagamento eletrônico após `CASH_SELECTED`. | P0 | U + I |
| TOW-CASH-002 | Partner registra `cash_received`. | P0 | I |
| TOW-CASH-003 | Cash service não cria earning eletrônico do final price. | P0 | U + I |
| TOW-CASH-004 | Conclusão cash gera PartnerPlatformFeeDebt = `tow_platform_fixed_fee_cents`. | P0 | U + I + E2E |
| TOW-CASH-005 | Debt do partner é abatida automaticamente de futuros electronic earnings. | P0 | U + I + E2E |
| TOW-CASH-006 | Debt acima do limite bloqueia novos Tow jobs. | P0 | U + I + E2E |
| TOW-CASH-CANCEL-001 | Cash cancel pós-EN_ROUTE cria CustomerFinancialDebt = cancellation fee. | P0 | U + I + E2E |
| TOW-CASH-CANCEL-002 | Customer debt é persistida como entidade financeira. | P0 | I |
| TOW-CASH-CANCEL-003 | Customer com debt impeditiva não cria novo atendimento. | P0 | U + I + E2E |
| TOW-CASH-CANCEL-004 | Customer debt é quitável por CARD ou PIX. | P0 | I + E2E |
| TOW-CASH-CANCEL-005 | Após quitação, split da fee é lançado e customer desbloqueado. | P0 | U + I + E2E |

---

## 21. Fixed fee, wallet, settlement e payout

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-FEE-001 | `tow_platform_fixed_fee_cents` é global/configurável. | P0 | U + I |
| TOW-FEE-002 | Fee sai do valor acordado; não é adicionada ao total do customer. | P0 | U + I |
| TOW-FEE-003 | Em cash, fee vira debt do partner. | P0 | U + I |
| TOW-WALLET-001 | Electronic completion gera entitlement líquido auditável. | P0 | U + I |
| TOW-WALLET-002 | Fixed fee é descontada antes de saldo disponível. | P0 | U + I |
| TOW-WALLET-003 | Partner debt offset ocorre antes de payout eligibility. | P0 | U + I + E2E |
| TOW-WALLET-004 | Estados mínimos: `pending_settlement`, `available_for_payout`, `payout_processing`, `paid`. | P0 | U + I |
| TOW-WALLET-005 | Held/disputed/unsettled funds não são `available_for_payout`. | P0 | U + I |
| TOW-PAYOUT-001 | Não existe payout bancário por atendimento. | P0 | U |
| TOW-PAYOUT-002 | Dashboard cria lote diário manual. | P0 | I + E2E |
| TOW-PAYOUT-003 | Um item agregado por partner por batch. | P0 | I |
| TOW-PAYOUT-004 | Somente eligible/available funds entram em payout. | P0 | U + I |
| TOW-PAYOUT-005 | Retry/reconciliation não duplica payout. | P0 | C + E2E |

---

## 22. Dispute, review e admin

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DISPUTE-001 | Customer pode contestar no fluxo permitido, incluindo `COMPLETION_PENDING`. | P0 | I |
| TOW-DISPUTE-002 | Contestação leva a `DISPUTED`. | P0 | I |
| TOW-DISPUTE-003 | Dispute bloqueia payout até resolução. | P0 | U + I + E2E |
| TOW-DISPUTE-004 | Evidências operacionais/financeiras/audit são preservadas. | P0 | I |
| TOW-REVIEW-001 | Review somente após `COMPLETED`. | P0 | U + I |
| TOW-REVIEW-002 | MVP: customer avalia partner; partner não avalia customer. | P1 | U |
| TOW-ADMIN-001 | Admin pode override cancel/complete quando permitido. | P0 | I + E2E |
| TOW-ADMIN-002 | Override exige reason + actor + timestamp + before/after. | P0 | U + I |
| TOW-ADMIN-003 | Toda intervenção administrativa gera AuditEvent append-only. | P0 | I |
| TOW-ADMIN-004 | Dispute resolution é comando explícito; Dashboard não muta DB/ledger diretamente. | P0 | I |

---

## 23. Settings canônicos

| ID | Setting | Regra |
|---|---|---|
| TOW-SET-001 | `tow_initial_radius_km` | Raio inicial. |
| TOW-SET-002 | `tow_radius_increment_km` | Incremento da busca. |
| TOW-SET-003 | `tow_max_radius_km` | Máximo <= 100 km. |
| TOW-SET-004 | `tow_radius_expansion_interval_minutes` | Intervalo entre expansões. |
| TOW-SET-005 | `tow_request_search_timeout_minutes` | Timeout global. |
| TOW-SET-006 | `tow_proposal_expiry_minutes` | Expiração proposal. |
| TOW-SET-007 | `tow_counteroffer_expiry_minutes` | Expiração counteroffer. |
| TOW-SET-008 | `tow_completion_confirmation_timeout_minutes` | Auto-confirm completion. |
| TOW-SET-009 | `tow_customer_no_show_timeout_minutes` | No-show timeout. |
| TOW-SET-010 | `tow_platform_fixed_fee_cents` | Fixed platform fee em centavos. |
| TOW-SET-011 | `tow_cancellation_fee_cents` | Cancellation fee em centavos. |
| TOW-SET-012 | `tow_cancellation_partner_percentage` | Split partner. |
| TOW-SET-013 | `tow_cancellation_platform_percentage` | Split JaResolve. |
| TOW-SET-014 | `tow_max_platform_fee_debt_cents` | Debt limit do partner em centavos. |

Invariantes:

```text
tow_max_radius_km <= 100
partner_percentage + platform_percentage = 100
money settings are integer cents
```

---

## 24. Banco/reset

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DB-001 | Reset destrutivo de dados atuais é autorizado nesta reestruturação. | P0 | I |
| TOW-DB-002 | Schema nasce de migrations reproduzíveis do zero. | P0 | I |
| TOW-DB-003 | Seed contém somente admin padrão necessário. | P0 | I |
| TOW-DB-004 | Credencial de admin seed não é hardcoded. | P0 | I |
| TOW-DB-005 | Não é obrigatório migrar dados legados incompatíveis. | P1 | — |

---

## 25. Consumer boundary

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CONSUMER-001 | Novo consumer usa `/api/tow` e `/api/admin/tow`, não rotas legacy. | P0 | I |
| TOW-CONSUMER-002 | OpenAPI canônico é fonte de shape de transporte. | P0 | I |
| TOW-CONSUMER-003 | Apps não calculam pricing, matching, fee, debt ou transition localmente. | P0 | U + I |
| TOW-CONSUMER-004 | `CASH_SELECTED` é status canônico de cash; `PAYMENT_METHOD_SELECTED` não é enum. | P0 | U + I |
| TOW-CONSUMER-005 | `SERVICE_DISABLED` terminal reason é distinto de `service_module_disabled` error code. | P0 | U + I |
| TOW-CONSUMER-006 | Consumers podem iniciar mock implementation após merge do contrato; integração real só fecha depois de T18. | P0 | Contract smoke |

---

## 26. Readiness backend

Só emitir:

```text
TOW BACKEND READY FOR INTEGRATION
```

quando:

1. todas as regras P0 estiverem implementadas;
2. regras P0 tiverem cobertura exigida;
3. state machine e authz estiverem fechadas;
4. concorrência de assignment/toggle estiver comprovada em PostgreSQL real;
5. CARD/PIX/CASH e dívidas estiverem E2E;
6. matching/radius/timeout estiverem E2E;
7. documentação de vehicle estiver protegendo matching;
8. wallet/ledger/settlement/payout estiverem reconciliáveis;
9. banco subir do zero com admin-only seed;
10. contrato HTTP real corresponder ao OpenAPI congelado;
11. todos os cenários obrigatórios da Issue #29/T18 estiverem verdes.

---

## 27. Cenários E2E representativos da matriz

A lista completa e autoritativa é a Issue #29/T18. Esta matriz exige pelo menos cobertura explícita para:

```text
CARD happy path
PIX happy path
CASH happy path
multiple proposals
single counteroffer
concurrent double accept
pricing proportional fractional excess
route two-leg snapshot
radius expansion + global timeout
module disable/re-enable/graceful drain
disable vs assignment race
vehicle document pending/rejected/expired
motorcycle/light/medium/heavy compatibility
customer/partner cancellation
customer/partner no-show
cash customer debt + repayment
partner platform-fee debt + offset + threshold
completion confirm + auto-confirm
dispute hold
review
admin override/audit
payout batch idempotency
consumer rehydration contracts
```

---

## 28. Governança

Qualquer mudança futura que altere uma regra desta matriz deve:

1. atualizar o documento funcional correspondente;
2. atualizar OpenAPI quando o transport for afetado;
3. escrever/ajustar teste RED antes do comportamento novo;
4. revisar Issues dependentes;
5. impedir merge se regra P0 ficar sem cobertura mínima.

Nenhum executor pode escolher silenciosamente uma regra antiga quando houver contrato congelado mais novo.
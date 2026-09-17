# JaResolve — Matriz de Regras de Negócio do Serviço Guincho (Tow)

## 1. Objetivo

Esta matriz transforma a especificação funcional do serviço de Guincho/Tow em regras verificáveis e testáveis.

Cada regra deve ser tratada como contrato de domínio. Implementação, migrations, endpoints, services, jobs e testes devem preservar as invariantes descritas aqui.

Legenda de prioridade:

- **P0** — obrigatório para considerar o domínio funcionalmente correto.
- **P1** — obrigatório para operação segura do MVP.
- **P2** — importante, mas pode ser entregue após o núcleo caso não comprometa integridade.

Legenda de teste mínimo:

- **U** — unitário.
- **I** — integração API + banco.
- **E2E** — fluxo de backend ponta a ponta.

---

## 2. Parceiro e disponibilidade

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PARTNER-001 | Somente parceiro com `partner_type = tow` pode operar serviço de Guincho. | P0 | U + I |
| TOW-PARTNER-002 | Parceiro precisa estar `approved`, `online` e `available` para entrar no matching. | P0 | U + I + E2E |
| TOW-PARTNER-003 | Ao ter uma proposta aceita definitivamente, parceiro passa para `busy`. | P0 | I + E2E |
| TOW-PARTNER-004 | Parceiro `busy` não pode receber novos matchings de Guincho. | P0 | U + I |
| TOW-PARTNER-005 | No MVP, um parceiro pode executar somente um atendimento de Guincho simultaneamente. | P0 | U + I + E2E |
| TOW-PARTNER-006 | Após `completed` ou `cancelled`, parceiro pode voltar para `available`, desde que não exista outro bloqueio operacional. | P1 | I |
| TOW-PARTNER-007 | Parceiro com dívida de taxa da plataforma acima de `tow_max_platform_fee_debt` não pode aceitar novos chamados. | P0 | U + I + E2E |

---

## 3. Veículos do guincheiro

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-VEHICLE-001 | Parceiro `tow` pode cadastrar múltiplos veículos de guincho. | P0 | I |
| TOW-VEHICLE-002 | Apenas um veículo de guincho pode estar `active = true` por parceiro. | P0 | U + I |
| TOW-VEHICLE-003 | Veículo ativo deve possuir `minimum_charge`, `included_km` e `price_per_additional_km` válidos. | P0 | U + I |
| TOW-VEHICLE-004 | Cada veículo pode ter configuração tarifária própria. | P0 | U + I |
| TOW-VEHICLE-005 | Veículo deve declarar `supported_vehicle_classes`. | P0 | U + I |
| TOW-VEHICLE-006 | Veículo deve declarar `max_towed_weight_kg`. | P0 | U + I |
| TOW-VEHICLE-007 | Veículo deve possuir `equipment_type`. Valores iniciais: `flatbed`, `wheel_lift`, `heavy_wrecker`. | P1 | U + I |
| TOW-VEHICLE-008 | Quando um atendimento estiver atribuído ao parceiro, o veículo ativo não pode ser trocado. | P0 | U + I + E2E |
| TOW-VEHICLE-009 | Proposta guarda snapshot da tarifa do veículo usado no momento da emissão. | P0 | U + I |
| TOW-VEHICLE-010 | Alterações posteriores de tarifa não modificam propostas existentes. | P0 | U + I |

---

## 4. Documentação e aprovação do veículo

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DOC-001 | Todo veículo de guincho deve possuir ao menos um documento comprobatório. | P0 | U + I |
| TOW-DOC-002 | Documento pode ser imagem JPEG/PNG ou PDF. | P1 | U + I |
| TOW-DOC-003 | Documento possui status `pending`, `approved` ou `rejected`. | P0 | U + I |
| TOW-DOC-004 | Veículo somente pode ser ativado para operação após possuir documento aprovado. | P0 | U + I + E2E |
| TOW-DOC-005 | Aprovação do parceiro não substitui aprovação do veículo. | P0 | U + I |
| TOW-DOC-006 | Documento rejeitado deve armazenar `rejection_reason`. | P1 | I |
| TOW-DOC-007 | Aprovação deve armazenar `verified_by` e `verified_at`. | P1 | I |
| TOW-DOC-008 | Documento com `expires_at` vencido torna o veículo inelegível para matching até nova aprovação válida. | P0 | U + I + E2E |
| TOW-DOC-009 | Veículo com documento `pending` ou `rejected` não pode operar. | P0 | U + I |

---

## 5. Compatibilidade do veículo transportado

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-COMPAT-001 | Classes canônicas iniciais: `motorcycle`, `light_vehicle`, `medium_truck`, `heavy_truck`. | P0 | U |
| TOW-COMPAT-002 | Matching exige que a classe do veículo solicitado esteja em `supported_vehicle_classes` do guincho ativo. | P0 | U + I + E2E |
| TOW-COMPAT-003 | Para `medium_truck` e `heavy_truck`, peso/PBT deve ser informado. | P0 | U + I |
| TOW-COMPAT-004 | Veículo solicitado não pode exceder `max_towed_weight_kg` do guincho ativo. | P0 | U + I + E2E |
| TOW-COMPAT-005 | Matching incompatível deve excluir o parceiro antes da fase de proposta. | P0 | U + I |

---

## 6. Criação da solicitação

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-REQUEST-001 | Solicitação deve conter `pickup_location`. | P0 | U + I |
| TOW-REQUEST-002 | Solicitação deve conter `destination_location`. | P0 | U + I |
| TOW-REQUEST-003 | Solicitação deve conter `vehicle_class`, `vehicle_make` e `vehicle_model`. | P0 | U + I |
| TOW-REQUEST-004 | Solicitação deve conter `problem_description`; `observations` pode ser vazio. | P1 | U + I |
| TOW-REQUEST-005 | Cliente com dívida financeira impeditiva não pode criar novo atendimento. | P0 | U + I + E2E |
| TOW-REQUEST-006 | Fotos do veículo do cliente são opcionais no MVP. | P2 | I |
| TOW-REQUEST-007 | Solicitação criada entra em `SEARCHING`. | P0 | I |

---

## 7. Distância e Google Maps / Routes

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-ROUTE-001 | Distância tarifável usa rota viária, não distância em linha reta. | P0 | U + I |
| TOW-ROUTE-002 | Distância total é `provider_to_pickup + pickup_to_destination`. | P0 | U + I |
| TOW-ROUTE-003 | A localização do parceiro usada no cálculo é a localização corrente no momento da proposta. | P0 | I |
| TOW-ROUTE-004 | Preço é calculado com a rota estimada no momento da proposta. | P0 | U + I |
| TOW-ROUTE-005 | Após acordo, o preço fica congelado e não é recalculado pela quilometragem efetivamente percorrida. | P0 | U + I + E2E |

---

## 8. Precificação

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PRICE-001 | Preço base usa `minimum_charge` do veículo de guincho ativo. | P0 | U |
| TOW-PRICE-002 | `included_km` representa quilometragem já coberta pelo valor mínimo. | P0 | U |
| TOW-PRICE-003 | Excedente é cobrado por `price_per_additional_km`. | P0 | U |
| TOW-PRICE-004 | Fórmula: `max(0, ceil(total_distance_km - included_km))`. | P0 | U |
| TOW-PRICE-005 | Quilômetro adicional fracionado é arredondado para cima. | P0 | U |
| TOW-PRICE-006 | Fórmula final: `minimum_charge + extra_km * price_per_additional_km`. | P0 | U + I |
| TOW-PRICE-007 | Guincheiro não pode sobrescrever manualmente o preço inicial calculado pelo backend. | P0 | U + I |

---

## 9. Matching geográfico

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-MATCH-001 | Matching começa em `tow_initial_radius_km`. | P0 | U + I |
| TOW-MATCH-002 | Se necessário, raio aumenta em `tow_radius_increment_km`. | P0 | U + I |
| TOW-MATCH-003 | Expansão ocorre a cada `tow_radius_expansion_interval_minutes`. | P0 | U + I |
| TOW-MATCH-004 | `tow_max_radius_km` é configurável, com limite máximo de 100 km. | P0 | U + I |
| TOW-MATCH-005 | Ao atingir raio máximo, busca permanece nesse raio até timeout global. | P0 | U + I |
| TOW-MATCH-006 | Ao vencer `tow_request_search_timeout_minutes`, solicitação expira como `no_provider_available`. | P0 | U + I + E2E |
| TOW-MATCH-007 | Parceiro incompatível, offline, indisponível, não aprovado ou com veículo não aprovado deve ser excluído. | P0 | U + I + E2E |

---

## 10. Propostas

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PROP-001 | Vários guincheiros podem enviar propostas para a mesma solicitação aberta. | P0 | I + E2E |
| TOW-PROP-002 | Primeiro guincheiro a propor não recebe automaticamente o serviço. | P0 | I |
| TOW-PROP-003 | Proposta usa preço calculado automaticamente pelo backend. | P0 | U + I |
| TOW-PROP-004 | Proposta expira após `tow_proposal_expiry_minutes`. | P0 | U + I |
| TOW-PROP-005 | Proposta expirada não pode ser aceita. | P0 | U + I |
| TOW-PROP-006 | Proposta ativa pode ser retirada pelo parceiro enquanto não houver aceite nem contraproposta. | P0 | U + I |
| TOW-PROP-007 | Após contraproposta, parceiro não pode retirar; deve aceitar ou rejeitar. | P0 | U + I |
| TOW-PROP-008 | Proposta deve preservar snapshot de tarifa, rota, distância e preço calculado. | P0 | I |

---

## 11. Contraproposta

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-COUNTER-001 | Cliente pode enviar no máximo uma contraproposta por proposta. | P0 | U + I + E2E |
| TOW-COUNTER-002 | Parceiro pode apenas aceitar ou rejeitar a contraproposta. | P0 | U + I |
| TOW-COUNTER-003 | Não existe segunda rodada de negociação no MVP. | P0 | U + I |
| TOW-COUNTER-004 | Contraproposta expira após `tow_counteroffer_expiry_minutes`. | P0 | U + I |
| TOW-COUNTER-005 | Contraproposta expirada não pode ser aceita. | P0 | U + I |

---

## 12. Atribuição e concorrência

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-ASSIGN-001 | Serviço é atribuído quando cliente aceita proposta ou parceiro aceita contraproposta. | P0 | U + I + E2E |
| TOW-ASSIGN-002 | `assigned_partner_id`, `assigned_tow_vehicle_id` e `final_price` ficam congelados após acordo. | P0 | I |
| TOW-ASSIGN-003 | Todas as propostas concorrentes são encerradas quando uma negociação é concluída. | P0 | I + E2E |
| TOW-ASSIGN-004 | Aceite deve ser transacional e idempotente. | P0 | I + E2E |
| TOW-ASSIGN-005 | Duas propostas não podem ser aceitas simultaneamente para a mesma solicitação. | P0 | I + E2E |

---

## 13. Alteração de destino

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DEST-001 | Antes do acordo, cliente pode alterar destino. | P1 | U + I |
| TOW-DEST-002 | Alterar destino antes do acordo invalida preços e propostas anteriores. | P0 | U + I |
| TOW-DEST-003 | Depois do acordo, destino fica bloqueado. | P0 | U + I |
| TOW-DEST-004 | Mudança de destino após acordo exige cancelar o atendimento e abrir nova solicitação. | P0 | U + I + E2E |

---

## 14. State machine

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-STATE-001 | Estados principais: `SEARCHING`, `NEGOTIATING`, `ASSIGNED`, `EN_ROUTE`, `ARRIVED`, `IN_TRANSIT`, `COMPLETION_PENDING`, `COMPLETED`. | P0 | U |
| TOW-STATE-002 | Estados laterais: `CANCELLED`, `EXPIRED`, `DISPUTED`. | P0 | U |
| TOW-STATE-003 | Transições inválidas devem ser rejeitadas pelo backend. | P0 | U + I |
| TOW-STATE-004 | `EN_ROUTE` significa início do deslocamento até o cliente. | P0 | U + I |
| TOW-STATE-005 | `ARRIVED` significa chegada ao ponto de coleta. | P0 | U + I |
| TOW-STATE-006 | `IN_TRANSIT` significa início do transporte do veículo ao destino. | P0 | U + I |
| TOW-STATE-007 | Não existe estado separado `vehicle_loaded` no MVP. | P1 | U |

---

## 15. Tracking

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-TRACK-001 | Tracking deve existir de `EN_ROUTE` até `COMPLETION_PENDING`. | P0 | I + E2E |
| TOW-TRACK-002 | Cada atualização registra `latitude`, `longitude` e `timestamp`. | P0 | I |
| TOW-TRACK-003 | Tracking deve ficar associado à solicitação para auditoria e disputa. | P0 | I |

---

## 16. Conclusão

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-COMPLETE-001 | Parceiro solicita conclusão no destino. | P0 | I |
| TOW-COMPLETE-002 | Conclusão registra GPS, timestamp, destino final e audit event. | P0 | I |
| TOW-COMPLETE-003 | Após solicitação de conclusão, estado passa para `COMPLETION_PENDING`. | P0 | I |
| TOW-COMPLETE-004 | Cliente pode confirmar conclusão ou contestar. | P0 | I + E2E |
| TOW-COMPLETE-005 | Sem resposta do cliente, ocorre auto-confirmação após `tow_completion_confirmation_timeout_minutes`. | P0 | U + I + E2E |
| TOW-COMPLETE-006 | Confirmação leva a `COMPLETED`. | P0 | I |
| TOW-COMPLETE-007 | Contestação leva a `DISPUTED`. | P0 | I |

---

## 17. Cancelamento do cliente

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CANCEL-001 | Antes de `EN_ROUTE`, cancelamento do cliente é gratuito. | P0 | U + I |
| TOW-CANCEL-002 | A partir de `EN_ROUTE`, aplica-se `tow_cancellation_fee`. | P0 | U + I + E2E |
| TOW-CANCEL-003 | No MVP, existe uma única faixa de taxa de cancelamento após início do deslocamento. | P1 | U |
| TOW-CANCEL-004 | `tow_platform_fixed_fee` não é adicionalmente cobrado sobre cancelamento; taxa normal e taxa de cancelamento são conceitos distintos. | P0 | U + I |

---

## 18. Divisão da taxa de cancelamento

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CANCEL-FEE-001 | `tow_cancellation_fee` é configurável globalmente no Dashboard. | P0 | U + I |
| TOW-CANCEL-FEE-002 | A taxa é dividida entre parceiro e JaResolve por porcentagens configuráveis. | P0 | U + I |
| TOW-CANCEL-FEE-003 | `tow_cancellation_partner_percentage + tow_cancellation_platform_percentage = 100%`. | P0 | U + I |
| TOW-CANCEL-FEE-004 | Distribuição financeira deve respeitar exatamente a configuração vigente no momento do cancelamento. | P0 | U + I |

---

## 19. Cancelamento do parceiro

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PROVIDER-CANCEL-001 | Se parceiro cancelar, cliente não paga taxa. | P0 | U + I |
| TOW-PROVIDER-CANCEL-002 | Solicitação pode retornar ao matching se ainda estiver dentro das regras de validade. | P0 | I + E2E |
| TOW-PROVIDER-CANCEL-003 | Cancelamento do parceiro gera evento de reputação/analytics/auditoria. | P1 | I |
| TOW-PROVIDER-CANCEL-004 | No MVP não há multa financeira automática ao parceiro. | P1 | U |

---

## 20. No-show do cliente

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-NOSHOW-CUSTOMER-001 | Após `ARRIVED`, inicia timeout `tow_customer_no_show_timeout_minutes`. | P0 | U + I |
| TOW-NOSHOW-CUSTOMER-002 | Após timeout sem disponibilidade do cliente/veículo, registra-se `customer_no_show`. | P0 | I |
| TOW-NOSHOW-CUSTOMER-003 | `customer_no_show` aplica `tow_cancellation_fee`. | P0 | U + I + E2E |

---

## 21. No-show do parceiro

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-NOSHOW-PROVIDER-001 | No-show do parceiro não gera cobrança ao cliente. | P0 | U + I |
| TOW-NOSHOW-PROVIDER-002 | Solicitação pode retornar ao matching. | P0 | I |
| TOW-NOSHOW-PROVIDER-003 | Evento é registrado permanentemente na reputação operacional do parceiro. | P1 | I |
| TOW-NOSHOW-PROVIDER-004 | No MVP não há multa financeira automática. | P1 | U |

---

## 22. Pagamento por cartão

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CARD-001 | Após acordo, `final_price` deve ser autorizado no cartão antes de `EN_ROUTE`. | P0 | U + I + E2E |
| TOW-CARD-002 | Falha na autorização bloqueia `EN_ROUTE`. | P0 | U + I |
| TOW-CARD-003 | Cliente pode trocar forma de pagamento sem perder o acordo, enquanto serviço ainda não iniciou. | P0 | U + I |
| TOW-CARD-004 | Captura ocorre somente após conclusão confirmada ou auto-confirmada. | P0 | I + E2E |
| TOW-CARD-005 | Serviço disputado não deve liberar payout ao parceiro. | P0 | I |

---

## 23. Pagamento por PIX

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PIX-001 | PIX deve estar confirmado antes de `EN_ROUTE`. | P0 | U + I + E2E |
| TOW-PIX-002 | PIX não usa estado de autorização/captura de cartão. | P0 | U |
| TOW-PIX-003 | Cancelamento gratuito gera reembolso integral. | P0 | U + I |
| TOW-PIX-004 | Cancelamento após `EN_ROUTE` reembolsa `final_price - tow_cancellation_fee`. | P0 | U + I + E2E |
| TOW-PIX-005 | Parcela retida da taxa de cancelamento é distribuída conforme percentuais configurados. | P0 | U + I |

---

## 24. Pagamento em dinheiro

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CASH-001 | Serviço com `payment_method = cash` pode iniciar sem pré-pagamento eletrônico. | P0 | U + I |
| TOW-CASH-002 | Na conclusão, parceiro registra `cash_received`. | P0 | I |
| TOW-CASH-003 | Cliente confirma o recebimento/conclusão; ausência de resposta usa timeout de auto-confirmação. | P0 | I + E2E |
| TOW-CASH-004 | Em serviço pago em dinheiro, parceiro recebe fisicamente o valor integral do cliente. | P0 | U |
| TOW-CASH-005 | JaResolve gera dívida do parceiro igual a `tow_platform_fixed_fee`. | P0 | U + I + E2E |
| TOW-CASH-006 | Dívida do parceiro deve ser descontada automaticamente de futuros recebimentos eletrônicos. | P0 | U + I + E2E |
| TOW-CASH-007 | Ao ultrapassar `tow_max_platform_fee_debt`, parceiro fica bloqueado para novos atendimentos. | P0 | U + I + E2E |

---

## 25. Cancelamento de serviço em dinheiro após EN_ROUTE

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-CASH-CANCEL-001 | Cancelamento cash após `EN_ROUTE` cria dívida financeira do cliente igual a `tow_cancellation_fee`. | P0 | U + I + E2E |
| TOW-CASH-CANCEL-002 | Dívida do cliente deve ser entidade financeira persistida, não apenas flag. | P0 | I |
| TOW-CASH-CANCEL-003 | Cliente com dívida pendente fica bloqueado para novos atendimentos. | P0 | U + I + E2E |
| TOW-CASH-CANCEL-004 | Dívida deve ser quitada via PIX ou cartão. | P0 | I + E2E |
| TOW-CASH-CANCEL-005 | Após quitação, taxa é dividida entre parceiro e JaResolve segundo percentuais configurados. | P0 | U + I |
| TOW-CASH-CANCEL-006 | Após quitação total, bloqueio do cliente é removido. | P0 | I + E2E |

---

## 26. Taxa fixa da plataforma

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-FEE-001 | `tow_platform_fixed_fee` é valor global configurável pelo JaResolve. | P0 | U + I |
| TOW-FEE-002 | A taxa é descontada do valor recebido pelo parceiro, não adicionada ao total pago pelo cliente. | P0 | U + I |
| TOW-FEE-003 | Exemplo: `final_price = 180`, `fixed_fee = 10` → cliente paga 180; parceiro recebe 170; JaResolve fica com 10. | P0 | U |
| TOW-FEE-004 | Para cash, a mesma taxa gera dívida do parceiro em vez de desconto imediato. | P0 | U + I |

---

## 27. Carteira e saldo do parceiro

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-WALLET-001 | Pagamento eletrônico concluído gera valor líquido devido ao parceiro. | P0 | U + I |
| TOW-WALLET-002 | Antes de creditar saldo disponível, sistema desconta `tow_platform_fixed_fee`. | P0 | U + I |
| TOW-WALLET-003 | Dívidas de taxa de serviços cash são abatidas automaticamente de recebimentos eletrônicos futuros. | P0 | U + I + E2E |
| TOW-WALLET-004 | Estados financeiros mínimos: `pending_settlement`, `available_for_payout`, `payout_processing`, `paid`. | P0 | U + I |
| TOW-WALLET-005 | Valores disputados ou não liquidados não ficam disponíveis para payout. | P0 | U + I |

---

## 28. Repasse ao parceiro

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-PAYOUT-001 | Não existe payout bancário por atendimento individual. | P0 | U |
| TOW-PAYOUT-002 | Dashboard agrupa saldo elegível em lote diário. | P0 | I + E2E |
| TOW-PAYOUT-003 | Cada parceiro recebe um payout consolidado por lote. | P0 | I |
| TOW-PAYOUT-004 | Somente `available_for_payout` entra em lote. | P0 | U + I |
| TOW-PAYOUT-005 | `pending_settlement`, `disputed` e `blocked` não entram em payout. | P0 | U + I |
| TOW-PAYOUT-006 | No MVP, execução do lote diário é manual pelo Dashboard. | P1 | I + E2E |

---

## 29. Disputas

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DISPUTE-001 | Cliente pode contestar conclusão durante `COMPLETION_PENDING`. | P0 | I |
| TOW-DISPUTE-002 | Contestação leva solicitação para `DISPUTED`. | P0 | I |
| TOW-DISPUTE-003 | Valor destinado ao parceiro fica bloqueado para payout até resolução. | P0 | U + I + E2E |
| TOW-DISPUTE-004 | Evidências devem preservar propostas, contraproposta, GPS, rota, timestamps, preço, pagamento, tracking e transições de estado. | P0 | I |

---

## 30. Avaliações

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-REVIEW-001 | Cliente só pode avaliar após `COMPLETED`. | P0 | U + I |
| TOW-REVIEW-002 | No MVP, apenas cliente avalia o guincheiro. | P1 | U |

---

## 31. Admin override e auditoria

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-ADMIN-001 | Admin pode cancelar excepcionalmente atendimento travado. | P0 | I + E2E |
| TOW-ADMIN-002 | Admin pode concluir excepcionalmente atendimento travado. | P0 | I + E2E |
| TOW-ADMIN-003 | Override administrativo exige `reason`, `admin_user_id` e `timestamp`. | P0 | U + I |
| TOW-ADMIN-004 | Toda intervenção administrativa gera audit event imutável. | P0 | I |

---

## 32. Configurações do Dashboard

| ID | Setting | Regra |
|---|---|---|
| TOW-SET-001 | `tow_initial_radius_km` | Raio inicial de busca. |
| TOW-SET-002 | `tow_radius_increment_km` | Incremento por expansão. |
| TOW-SET-003 | `tow_max_radius_km` | Raio máximo, nunca acima de 100 km. |
| TOW-SET-004 | `tow_radius_expansion_interval_minutes` | Intervalo entre expansões. |
| TOW-SET-005 | `tow_request_search_timeout_minutes` | Timeout global da busca. |
| TOW-SET-006 | `tow_proposal_expiry_minutes` | Validade de proposta. |
| TOW-SET-007 | `tow_counteroffer_expiry_minutes` | Validade de contraproposta. |
| TOW-SET-008 | `tow_completion_confirmation_timeout_minutes` | Auto-confirmação da conclusão. |
| TOW-SET-009 | `tow_customer_no_show_timeout_minutes` | Timeout para no-show do cliente. |
| TOW-SET-010 | `tow_platform_fixed_fee` | Taxa fixa da plataforma. |
| TOW-SET-011 | `tow_cancellation_fee` | Taxa de cancelamento após deslocamento. |
| TOW-SET-012 | `tow_cancellation_partner_percentage` | Percentual da taxa destinado ao parceiro. |
| TOW-SET-013 | `tow_cancellation_platform_percentage` | Percentual da taxa destinado ao JaResolve. |
| TOW-SET-014 | `tow_max_platform_fee_debt` | Limite de dívida do parceiro por taxas cash. |

Invariantes:

```text
tow_max_radius_km <= 100

tow_cancellation_partner_percentage
+
tow_cancellation_platform_percentage
=
100%
```

---

## 33. Reset e baseline do banco

| ID | Regra | Prioridade | Teste mínimo |
|---|---|---:|---|
| TOW-DB-001 | Nesta reestruturação é permitido resetar os dados existentes do banco. | P0 | I |
| TOW-DB-002 | Novo schema deve nascer de migrations reproduzíveis e coerentes. | P0 | I |
| TOW-DB-003 | Seed mínimo deve conter somente usuário administrador padrão necessário à operação inicial. | P0 | I |
| TOW-DB-004 | Credenciais do admin seed não podem ficar hardcoded no repositório. | P0 | I |
| TOW-DB-005 | Não é obrigatório migrar dados legados inconsistentes para a nova baseline. | P1 | — |

---

## 34. Critério de prontidão para integração

O domínio só pode ser declarado:

```text
TOW BACKEND READY FOR INTEGRATION
```

quando, no mínimo:

1. Todas as regras P0 estiverem implementadas.
2. Todas as regras P0 possuírem seus testes mínimos correspondentes.
3. State machine estiver fechada e protegida contra transições inválidas.
4. Concorrência de propostas/aceite estiver protegida transacionalmente.
5. Cartão, PIX e dinheiro estiverem cobertos por testes E2E independentes.
6. Fluxos de cancelamento, no-show, disputa e conclusão estiverem validados.
7. Matching geográfico e expansão de raio estiverem testados.
8. Veículos sem documentação aprovada não conseguirem participar do matching.
9. Carteira, dívida do parceiro, dívida do cliente e payout diário estiverem reconciliáveis.
10. Reset de banco + migrations + seed do admin forem reproduzíveis em ambiente limpo.

---

## 35. Cenários E2E mínimos obrigatórios

| ID | Cenário | Resultado esperado |
|---|---|---|
| TOW-E2E-001 | Guincho com cartão e aceite direto | Autorização → serviço → conclusão → captura → carteira líquida. |
| TOW-E2E-002 | Guincho com cartão e contraproposta | Uma contraproposta aceita, preço congelado e demais propostas encerradas. |
| TOW-E2E-003 | Guincho com PIX | PIX confirmado antes de `EN_ROUTE`; conclusão gera valor elegível. |
| TOW-E2E-004 | Guincho em dinheiro | Conclusão gera dívida de `tow_platform_fixed_fee` para parceiro. |
| TOW-E2E-005 | Cancelamento cash após `EN_ROUTE` | Gera dívida do cliente; bloqueia novos atendimentos até pagamento. |
| TOW-E2E-006 | Múltiplas propostas concorrentes | Apenas uma pode ser aceita. |
| TOW-E2E-007 | Expansão de raio | Matching expande conforme settings até limite. |
| TOW-E2E-008 | Timeout sem fornecedor | Solicitação expira como `no_provider_available`. |
| TOW-E2E-009 | Cancelamento cliente antes de `EN_ROUTE` | Sem taxa. |
| TOW-E2E-010 | Cancelamento cliente após `EN_ROUTE` | Cobra/divide `tow_cancellation_fee`. |
| TOW-E2E-011 | Cancelamento do parceiro | Cliente sem taxa; solicitação retorna ao matching quando elegível. |
| TOW-E2E-012 | No-show do cliente | Aplica taxa de cancelamento. |
| TOW-E2E-013 | No-show do parceiro | Cliente sem taxa; evento registrado. |
| TOW-E2E-014 | Conclusão sem resposta do cliente | Auto-confirma após timeout. |
| TOW-E2E-015 | Cliente contesta conclusão | Estado `DISPUTED` e payout bloqueado. |
| TOW-E2E-016 | Dívida cash do parceiro | Recebimento eletrônico futuro compensa dívida automaticamente. |
| TOW-E2E-017 | Parceiro excede limite de dívida | Novo atendimento bloqueado. |
| TOW-E2E-018 | Veículo sem documento aprovado | Não entra no matching. |
| TOW-E2E-019 | Documento do guincho expirado | Veículo automaticamente inelegível. |
| TOW-E2E-020 | Moto compatível | Matching encontra guincho apto. |
| TOW-E2E-021 | Veículo leve compatível | Matching encontra guincho apto. |
| TOW-E2E-022 | Caminhão médio incompatível por peso | Parceiro excluído do matching. |
| TOW-E2E-023 | Caminhão pesado compatível | Matching usa veículo com capacidade suficiente. |
| TOW-E2E-024 | Payout diário | Apenas saldo `available_for_payout` é consolidado no lote. |
| TOW-E2E-025 | Admin override | Ação exige motivo e gera audit event imutável. |

---

## 36. Regra de governança

Toda alteração futura que modifique qualquer regra desta matriz deve:

1. atualizar este documento;
2. atualizar a especificação funcional do domínio;
3. atualizar ou adicionar testes correspondentes;
4. impedir merge caso uma regra P0 fique sem cobertura mínima.

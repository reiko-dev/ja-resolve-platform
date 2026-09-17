# JaResolve — Especificação Definitiva do Domínio Guincho (Tow)

## 1. Objetivo

O serviço de **Guincho** conecta clientes que precisam transportar um veículo a parceiros do tipo `tow` elegíveis por localização, disponibilidade, documentação, capacidade operacional e compatibilidade do equipamento.

O backend é a fonte de verdade do domínio. Mobile Cliente, Mobile Parceiro e Dashboard devem consumir contratos estabilizados pelo backend e não reimplementar regras críticas localmente.

Fluxo macro:

```text
Solicitação
   ↓
Matching geográfico
   ↓
Múltiplas propostas
   ↓
Aceite OU 1 contraproposta
   ↓
Acordo
   ↓
Preparação do pagamento
   ↓
Deslocamento
   ↓
Chegada
   ↓
Transporte
   ↓
Confirmação da conclusão
   ↓
Liquidação financeira
   ↓
Avaliação / possível disputa
```

---

## 2. Elegibilidade do parceiro

O serviço somente pode ser realizado por:

```text
partner_type = tow
```

Para receber chamados, o parceiro precisa estar:

```text
approved
online
available
```

Ao receber um serviço:

```text
available → busy
```

Ao concluir ou cancelar:

```text
busy → available
```

No MVP, cada parceiro executa **um atendimento de guincho por vez**.

---

## 3. Veículos do guincheiro

Um parceiro `tow` pode cadastrar múltiplos veículos de guincho, mas somente **um pode estar ativo simultaneamente**.

Cada veículo possui sua própria configuração tarifária:

```text
minimum_charge
included_km
price_per_additional_km
```

Também deve possuir, no mínimo:

```text
plate
make
model
year
supported_vehicle_classes
max_towed_weight_kg
equipment_type
active
status
```

Mudanças futuras na tarifa não alteram propostas já emitidas. Cada proposta mantém um **snapshot imutável da tarifa utilizada**.

Enquanto existir um atendimento atribuído ao parceiro, o veículo ativo fica bloqueado e não pode ser trocado até `completed` ou `cancelled`.

---

## 4. Documentação obrigatória do veículo de guincho

Cada veículo cadastrado deve possuir **ao menos um documento comprobatório**, em imagem ou PDF, para validação administrativa da licença/autorização necessária para operar como guincho.

Formatos aceitos no MVP:

```text
image/jpeg
image/png
application/pdf
```

Entidade conceitual:

```text
TowVehicleDocument

id
tow_vehicle_id
document_type
file_url
mime_type
status
rejection_reason
expires_at
verified_by
verified_at
created_at
```

Status:

```text
pending
approved
rejected
```

Fluxo:

```text
veículo cadastrado
      ↓
documento enviado
      ↓
PENDING VERIFICATION
      ↓
admin valida
   ├── APPROVED → pode ser ativado
   └── REJECTED → não pode operar
```

Mesmo com o parceiro aprovado, o veículo individual também precisa estar aprovado.

O matching exige:

```text
partner.approved
+
partner.online
+
partner.available
+
tow_vehicle.active
+
tow_vehicle.approved
+
compatibilidade do veículo
```

Se um documento possuir validade e `expires_at` vencer, o veículo deve ser automaticamente impedido de operar até que um novo documento válido seja aprovado.

---

## 5. Classes de veículos transportados

O JaResolve adota uma classificação simplificada para o produto, sem perder a capacidade técnica necessária para matching seguro:

```text
motorcycle
light_vehicle
medium_truck
heavy_truck
```

Referência operacional:

```text
motorcycle
    → motocicletas

light_vehicle
    → carros, SUVs, picapes, vans e utilitários leves

medium_truck
    → caminhões médios

heavy_truck
    → caminhões pesados
```

O matching não depende somente da categoria. Deve validar também:

```text
classe suportada
+
peso/PBT informado
<=
capacidade do guincho ativo
```

Para `medium_truck` e `heavy_truck`, peso/PBT é obrigatório.

---

## 6. Tipo de equipamento do guincho

Campo inicial:

```text
equipment_type
```

Valores canônicos iniciais:

```text
flatbed
wheel_lift
heavy_wrecker
```

A modelagem deve permitir evolução futura sem quebra de contrato.

---

## 7. Dados obrigatórios do chamado

O cliente informa:

```text
pickup_location
destination_location
vehicle_class
vehicle_make
vehicle_model
problem_description
observations
```

Para caminhões médios e pesados:

```text
vehicle_weight / PBT
```

Fotos do veículo do cliente são opcionais no MVP e não bloqueiam a abertura do chamado.

---

## 8. Google Maps / Routes

Google Maps é a **camada padrão de visualização geográfica do JaResolve**.

A rota tarifável é:

```text
posição atual do guincheiro
        ↓
local do veículo
        ↓
destino
```

Portanto:

```text
total_distance =
provider_to_pickup
+
pickup_to_destination
```

O cálculo utiliza distância viária estimada por rota, nunca distância em linha reta.

O preço é baseado na rota estimada no momento da proposta. Depois que há acordo, o preço fica congelado.

---

## 9. Precificação por veículo de guincho

Cada veículo ativo possui:

```text
minimum_charge
included_km
price_per_additional_km
```

Fórmula:

```text
extra_km = max(0, ceil(total_distance_km - included_km))

calculated_price =
minimum_charge
+
extra_km * price_per_additional_km
```

Exemplo:

```text
minimum_charge = R$ 150
included_km = 10
price_per_additional_km = R$ 8
route_distance = 14 km

calculated_price = 150 + (4 * 8) = R$ 182
```

Distâncias fracionadas adicionais são arredondadas para cima por quilômetro iniciado.

---

## 10. Proposta inicial

O guincheiro **não escolhe manualmente o preço** da proposta.

O backend calcula o valor automaticamente a partir da rota e do snapshot da tarifa do veículo ativo.

O parceiro decide apenas:

```text
ENVIAR PROPOSTA
ou
NÃO PARTICIPAR
```

---

## 11. Descoberta de parceiros

O matching considera:

```text
approved
+
online
+
available
+
active approved tow vehicle
+
vehicle compatibility
+
geographic radius
```

A busca começa em um raio configurável e expande progressivamente até o limite máximo, também configurável.

Configurações:

```text
tow_initial_radius_km
tow_radius_increment_km
tow_max_radius_km
tow_radius_expansion_interval_minutes
tow_request_search_timeout_minutes
```

Regra:

```text
tow_max_radius_km <= 100
```

Ao atingir o raio máximo, a busca permanece ativa naquele raio até vencer `tow_request_search_timeout_minutes`.

No timeout global:

```text
request_status = expired
reason = no_provider_available
```

---

## 12. Múltiplas propostas

Vários guincheiros podem responder ao mesmo chamado enquanto ele estiver aberto.

```text
Cliente abre chamado
        ↓
JaResolve encontra N guincheiros próximos
        ↓
Vários podem enviar proposta
        ↓
Cliente vê as propostas recebidas
        ↓
Escolhe uma
OU
faz 1 contraproposta para uma delas
        ↓
Acordo fechado
        ↓
Demais propostas encerradas
```

O primeiro parceiro a responder não recebe automaticamente o serviço.

---

## 13. Expiração de propostas e contrapropostas

Configurações de Dashboard:

```text
tow_proposal_expiry_minutes
tow_counteroffer_expiry_minutes
```

Ambas são configuráveis.

Uma proposta expirada não pode ser aceita.

---

## 14. Retirada de proposta

Enquanto a proposta estiver ativa e não houver contraproposta nem aceite, o parceiro pode retirar (`withdraw`) sua proposta.

Depois que o cliente envia uma contraproposta, o parceiro deve apenas:

```text
accept
ou
reject
```

---

## 15. Contraproposta

O cliente pode fazer **exatamente uma contraproposta por negociação**.

Exemplo:

```text
Parceiro → R$ 180
Cliente → R$ 160
Parceiro → ACEITAR ou RECUSAR
```

Não existe nova rodada de negociação no MVP.

---

## 16. Atribuição do serviço

O acordo pode ocorrer por:

```text
proposal → customer_accept
```

ou:

```text
proposal
→ customer_counteroffer
→ provider_accept
```

Quando há acordo:

```text
assigned_partner_id
assigned_tow_vehicle_id
final_price
```

ficam congelados.

Todas as demais propostas são encerradas atomicamente.

O aceite deve ser transacional para impedir dupla atribuição.

---

## 17. Alteração de destino

Antes do acordo, o destino pode ser alterado. A alteração invalida preços e propostas anteriores e exige recálculo completo.

Depois do acordo:

```text
destination = locked
```

Mudança de destino exige:

```text
cancelar atendimento
+
abrir novo chamado
```

Não haverá recálculo de rota negociada no meio do atendimento no MVP.

---

## 18. State machine do atendimento

Estados principais:

```text
SEARCHING
    ↓
NEGOTIATING
    ↓
ASSIGNED
    ↓
EN_ROUTE
    ↓
ARRIVED
    ↓
IN_TRANSIT
    ↓
COMPLETION_PENDING
    ↓
COMPLETED
```

Estados laterais:

```text
CANCELLED
EXPIRED
DISPUTED
```

Não existe estado separado `vehicle_loaded` no MVP.

---

## 19. Regras de início do atendimento

`EN_ROUTE` significa que o parceiro iniciou o deslocamento até o cliente.

`ARRIVED` significa chegada ao ponto de coleta.

`IN_TRANSIT` significa que o veículo foi coletado e o transporte ao destino começou.

---

## 20. Tracking

Tracking ativo de:

```text
EN_ROUTE
→ ARRIVED
→ IN_TRANSIT
→ COMPLETION_PENDING
```

Cada ponto registra, no mínimo:

```text
latitude
longitude
timestamp
```

---

## 21. Conclusão do atendimento

Ao chegar ao destino, o parceiro solicita conclusão.

Backend registra:

```text
GPS
timestamp
final destination
audit event
```

Estado passa para:

```text
COMPLETION_PENDING
```

Cliente pode:

```text
CONFIRMAR
ou
CONTESTAR
```

Se não responder, ocorre auto-confirmação depois de:

```text
tow_completion_confirmation_timeout_minutes
```

Confirmado:

```text
COMPLETED
```

Contestado:

```text
DISPUTED
```

---

## 22. Cancelamento pelo cliente

Antes de `EN_ROUTE`:

```text
cancelamento gratuito
```

A partir de `EN_ROUTE`:

```text
tow_cancellation_fee
```

No MVP existe uma única faixa de taxa após o início do deslocamento.

---

## 23. Taxa de cancelamento

Configurações globais:

```text
tow_cancellation_fee
tow_cancellation_partner_percentage
tow_cancellation_platform_percentage
```

Invariante:

```text
tow_cancellation_partner_percentage
+
tow_cancellation_platform_percentage
=
100%
```

Exemplo:

```text
Taxa: R$ 50
Parceiro: 70%
JaResolve: 30%

Parceiro = R$ 35
JaResolve = R$ 15
```

`tow_platform_fixed_fee` e `tow_cancellation_fee` são conceitos distintos.

---

## 24. Cancelamento pelo parceiro

Se o parceiro cancelar:

```text
cliente não paga taxa
```

O chamado pode retornar ao matching se ainda for válido.

O cancelamento é registrado para reputação operacional, analytics e auditoria.

No MVP não existe multa financeira automática ao parceiro.

---

## 25. No-show do cliente

Após `ARRIVED`, inicia-se timeout configurável:

```text
tow_customer_no_show_timeout_minutes
```

Vencido o timeout:

```text
customer_no_show
```

Financeiramente, é tratado como cancelamento após deslocamento e aplica `tow_cancellation_fee`.

---

## 26. No-show do parceiro

Cliente não paga taxa.

O chamado pode retornar ao matching.

O evento é registrado permanentemente na reputação operacional do parceiro.

No MVP não existe multa financeira automática ao parceiro.

---

## 27. Métodos de pagamento

O MVP deve suportar:

```text
CARD
PIX
CASH
```

Cada método possui fluxo próprio e não deve ser forçado a compartilhar exatamente o mesmo estado financeiro.

---

## 28. Cartão

Fluxo:

```text
Acordo fechado
     ↓
Autorizar final_price
     ↓
AUTHORIZED
     ↓
Permite EN_ROUTE
     ↓
Serviço concluído
     ↓
Cliente confirma / auto-confirma
     ↓
CAPTURE
```

Se a autorização falhar, `EN_ROUTE` fica bloqueado.

O cliente pode trocar o método de pagamento sem perder o acordo com o guincheiro.

---

## 29. PIX

PIX não utiliza o modelo de autorização/captura do cartão.

Fluxo:

```text
Acordo
   ↓
Gerar PIX
   ↓
Pagamento confirmado
   ↓
Permite EN_ROUTE
   ↓
Serviço
   ↓
COMPLETED
   ↓
valor elegível financeiramente
```

Cancelamento gratuito:

```text
refund integral
```

Cancelamento após `EN_ROUTE`:

```text
refund = final_price - tow_cancellation_fee
```

A taxa retida é dividida entre parceiro e JaResolve conforme as porcentagens configuradas.

---

## 30. Dinheiro

Fluxo:

```text
Acordo
   ↓
payment_method = cash
   ↓
Parceiro pode executar
   ↓
COMPLETION_PENDING
   ↓
partner marks cash_received
   ↓
client confirms / auto-confirms
   ↓
COMPLETED
```

Como o parceiro recebe diretamente o dinheiro, o JaResolve cria uma dívida referente à taxa fixa da plataforma:

```text
platform_fee_debt += tow_platform_fixed_fee
```

---

## 31. Dívida do parceiro por serviços em dinheiro

Exemplo:

```text
Serviço cash = R$ 180
tow_platform_fixed_fee = R$ 10

Parceiro recebe fisicamente: R$ 180
Dívida com JaResolve: R$ 10
```

Essa dívida é descontada automaticamente de recebimentos eletrônicos futuros.

Configuração:

```text
tow_max_platform_fee_debt
```

Ao ultrapassar o limite, o parceiro fica impedido de aceitar novos atendimentos até regularizar a dívida.

---

## 32. Cancelamento de serviço em dinheiro após EN_ROUTE

Se o método escolhido for dinheiro e o cliente cancelar depois de `EN_ROUTE`, não existe valor previamente autorizado ou pago para reter.

Regra:

```text
Cliente escolheu dinheiro
Parceiro entrou em EN_ROUTE
Cliente cancela
        ↓
criar customer financial debt
        ↓
debt amount = tow_cancellation_fee
        ↓
cliente bloqueado para novos atendimentos
        ↓
quitação obrigatória via PIX ou cartão
        ↓
pagamento confirmado
        ↓
divisão da taxa entre parceiro e JaResolve
```

Entidade conceitual:

```text
CustomerFinancialDebt

customer_id
emergency_request_id
type = tow_cancellation_fee
amount
status
payment_id
created_at
paid_at
```

Status:

```text
pending
paid
cancelled
```

Enquanto existir débito impeditivo, novas solicitações de atendimento devem ser bloqueadas com erro de domínio equivalente a:

```text
outstanding_financial_debt
```

---

## 33. Taxa da plataforma

Configuração existente e mantida:

```text
tow_platform_fixed_fee
```

Exemplo:

```text
final_price = R$ 180
tow_platform_fixed_fee = R$ 10

cliente paga = R$ 180
receita JaResolve = R$ 10
receita parceiro = R$ 170
```

O cliente não paga a taxa por fora.

---

## 34. Carteira do parceiro

Para pagamentos eletrônicos concluídos:

```text
captured/paid
   ↓
tow_platform_fixed_fee
   ↓
cash fee debt offset
   ↓
partner wallet
```

Estados financeiros recomendados:

```text
pending_settlement
available_for_payout
payout_processing
paid
```

Valores disputados ou ainda não liquidados não podem entrar em payout.

---

## 35. Repasse ao parceiro

Não existe payout bancário por atendimento.

O Dashboard terá um **lote diário de repasses**.

```text
Financeiro
   ↓
Repasses
   ↓
Saldo elegível por parceiro
   ↓
Processar lote
```

Cada parceiro recebe um único payout consolidado com seu saldo elegível.

Somente entra no lote:

```text
available_for_payout
```

Nunca:

```text
pending_settlement
disputed
blocked
```

No MVP o processamento será manual pelo Dashboard. A mesma estrutura poderá ser automatizada futuramente.

---

## 36. Disputas

Se o cliente contestar a conclusão:

```text
DISPUTED
```

O valor destinado ao parceiro fica bloqueado para payout até resolução.

Devem ser preservados como evidência:

```text
propostas
contraproposta
GPS
rota
timestamps
preço
pagamento
tracking
mudanças de estado
```

---

## 37. Avaliação

Somente após `COMPLETED` o cliente pode avaliar o guincheiro.

No MVP:

```text
cliente → avalia guincheiro
```

Não haverá avaliação do cliente pelo parceiro.

---

## 38. Admin override

Administrador pode excepcionalmente:

```text
cancelar atendimento
concluir atendimento
```

Obrigatoriamente com:

```text
reason
admin_user_id
timestamp
```

Toda intervenção administrativa deve gerar evento de auditoria imutável.

---

## 39. Configurações globais no Dashboard

### Matching

```text
tow_initial_radius_km
tow_radius_increment_km
tow_max_radius_km
tow_radius_expansion_interval_minutes
tow_request_search_timeout_minutes
```

### Negotiation

```text
tow_proposal_expiry_minutes
tow_counteroffer_expiry_minutes
```

### Completion

```text
tow_completion_confirmation_timeout_minutes
tow_customer_no_show_timeout_minutes
```

### Finance

```text
tow_platform_fixed_fee
tow_cancellation_fee
tow_cancellation_partner_percentage
tow_cancellation_platform_percentage
tow_max_platform_fee_debt
```

O backend deve utilizar `system_settings` como fonte de verdade para essas configurações.

---

## 40. Entidades principais

Entidades conceituais esperadas:

```text
Partner
TowVehicle
TowVehiclePricing
TowVehicleDocument
EmergencyRequest
TowProposal
TowCounterOffer
TowTrackingPoint
Payment
Wallet
WalletTransaction
PlatformFeeDebt
CustomerFinancialDebt
PayoutBatch
PayoutBatchItem
Review
Dispute
AuditEvent
```

A decomposição física em tabelas deve preservar as invariantes deste documento, mesmo que alguns conceitos sejam consolidados.

---

## 41. API conceitual

Os nomes definitivos devem ser reconciliados com as rotas existentes antes da implementação para evitar duplicação.

Capacidades necessárias:

```text
/api/partners/tow-vehicles
/api/partners/tow-vehicles/:id
/api/partners/tow-vehicles/:id/activate
/api/partners/tow-vehicles/:id/pricing
/api/partners/tow-vehicles/:id/documents

/api/emergency-requests
/api/emergency-requests/:id
/api/emergency-requests/:id/cancel
/api/emergency-requests/:id/start
/api/emergency-requests/:id/arrive
/api/emergency-requests/:id/in-transit
/api/emergency-requests/:id/finish
/api/emergency-requests/:id/confirm-completion

/api/tow-proposals
/api/tow-proposals/:id/accept
/api/tow-proposals/:id/reject
/api/tow-proposals/:id/withdraw
/api/tow-proposals/:id/counteroffer
/api/tow-proposals/:id/counteroffer/accept
/api/tow-proposals/:id/counteroffer/reject
```

---

## 42. Estratégia de banco e migrations

Nesta rodada é permitido **resetar os dados existentes do banco** para facilitar a reestruturação do schema.

Objetivo:

```text
reset de dados atuais
        ↓
novo schema consistente
        ↓
migrations limpas
        ↓
seed mínimo
```

O seed deve conter apenas o **usuário administrador padrão** necessário para operação inicial.

Nenhuma credencial sensível deve ser hardcoded; valores de autenticação e senha devem vir de ambiente seguro.

Não é necessário preservar dados legados inconsistentes nem criar migrations complexas de transformação de dados históricos, desde que a nova baseline seja coerente e reproduzível.

---

## 43. Estratégia de testes

Antes de qualquer integração com Mobile Cliente, Mobile Parceiro ou Dashboard, o domínio deve possuir cobertura em três níveis.

### Testes unitários

Cobrir, no mínimo:

```text
pricing
included km
additional km rounding
vehicle compatibility
active tow uniqueness
vehicle document approval
proposal lifecycle
counteroffer limit
radius expansion
timeouts
state transitions
cancellation
no-show
platform fixed fee
cancellation split
cash fee debt
debt offset
customer financial debt
payment method rules
```

### Testes de integração

Cobrir:

```text
API + auth + DB
matching
proposal concurrency
counteroffer
assignment locking
tracking
state transitions
vehicle documentation
card mocked gateway
PIX mocked gateway
cash
wallet
fee debt
customer debt
payout batches
admin overrides
```

### E2E de backend

Cenários obrigatórios:

```text
Guincho + cartão
Guincho + PIX
Guincho + dinheiro
aceite direto
contraproposta
múltiplas propostas
expansão de raio
cancelamento cliente
cancelamento parceiro
customer no-show
partner no-show
disputa
payout diário
dívida de cash
bloqueio por dívida
dívida do cliente por cancelamento cash
moto
veículo leve
caminhão médio
caminhão pesado
veículo de guincho com documento aprovado
veículo de guincho com documento rejeitado/expirado
```

Somente após todos os contratos e testes obrigatórios passarem, o domínio poderá receber o estado:

```text
TOW BACKEND READY FOR INTEGRATION
```

---

## 44. Regra de congelamento do domínio

Este documento é a referência funcional para o domínio de Guincho/Tow do JaResolve nesta rodada.

Mudanças que alterem precificação, negociação, estados, pagamentos, cancelamentos, documentos, matching, carteira ou repasses devem atualizar esta especificação e a matriz de regras de negócio antes da implementação correspondente.

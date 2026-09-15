# Contrato mobile `auth+tow` v1

Contrato único para os apps Flutter de cliente e parceiro. O backend continua sendo a fonte de verdade para autenticação, autorização, preços e transições de estado.

## 1. Transporte e autenticação

- Base URL: ambiente injeta `API_BASE_URL`; não fixar host no app. Todas as rotas abaixo usam o prefixo `/api`.
- HTTP: JSON, `Content-Type: application/json`, token em `Authorization: Bearer <access_token>`.
- Login: `POST /api/auth/login` com `{ "email": "...", "password": "..." }`. Sucesso `200`, token em `data.token` e usuário em `data.user`.
- Cadastro: `POST /api/auth/register` retorna `201`; enviar `name`, `email`, `password` e `phone` E.164. Para parceiro, enviar `partner_type`/`partnerType`; `role` não promove o usuário sozinho. O onboarding posterior cria a linha `partners` necessária às operações.
- Verificação: `GET /api/auth/verify` com Bearer. Usar para hidratar a sessão; sucesso retorna o usuário atual.
- Logout: `POST /api/auth/logout` com Bearer. Remover token local mesmo se a resposta for `401`.
- Persistir o token somente no armazenamento seguro do sistema operacional. Nunca logar token, senha ou payload sensível.

O app deve tratar `401` como sessão inválida: limpar credenciais e encaminhar ao login. `403` é autorização insuficiente: manter sessão e exibir mensagem de permissão. Não repetir automaticamente mutações após `401`.

## 2. Socket.IO

Conectar ao mesmo host da API com `auth: { token: accessToken }` (ou `Authorization: Bearer ...`). A autenticação, usuário ativo e revogação são validados no handshake. Ao logout ou `401`, desconectar, limpar listeners e token; reconectar somente depois de novo login. O backend atual também possui handlers Socket.IO que escrevem atualizações, localização e mensagens; o app deve usá-los somente conforme o fluxo autorizado pelo produto e reportar mutações por HTTP quando aplicável.

## 3. Fluxo do cliente: solicitar e escolher guincho

1. `POST /api/emergency-requests` com `type` válido (`mechanical`, `fuel`, `tire`, `battery` ou `other`), `request_type: "tow"`, `description` (mín. 10), `vehicle_info` (`brand`, `model`, `year`) e localização (`location_type`, `latitude`, `longitude`, `address`). Origem/destino específicos são opcionais; não enviar `type: "tow"`. `latitude`/`longitude` são obrigatórias, finitas, dentro dos limites (±90/±180) e nunca `0,0`; pares opcionais de origem/destino, quando usados, precisam vir completos (`*_latitude` + `*_longitude`). Violação retorna `400` com `code: "invalid_coordinates"` antes de qualquer INSERT.
2. Ler `data.id`, `data.status`, `data.proposal_status` e `data.price_breakdown` da resposta. `price_breakdown` pode ser JSON serializado; não calcular preço localmente.
3. `GET /api/tow-proposals/emergency/:emergency_request_id` para listar propostas do próprio pedido.
4. `POST /api/tow-proposals/:proposal_id/accept` para selecionar uma proposta, ou `POST /api/emergency-requests/:id/accept-proposal` com `{ "proposal_id": "..." }`.
5. Após aceite, acompanhar `accepted` + `proposal_selected`; atualizar por consulta/evento até `in_progress` e `completed`.
6. `POST /api/emergency-requests/:id/cancel` em `pending` ou `accepted`, somente pelo proprietário ou administrador.

Rotas: `GET /api/emergency-requests/:id/payment-summary`, `POST /api/emergency-requests/:id/payment` e `POST /api/emergency-requests/:id/rate`. Resumo pode ser consultado antes de `completed`; criar pagamento exige pedido aceito, atribuído e com proposta selecionada (`accepted`, `in_progress` ou `completed`), nunca `pending`; avaliação só é efetiva após `completed`.

## 4. Fluxo do parceiro guincho

1. Após onboarding de parceiro tow (`POST /api/partners/onboarding/complete`), `GET /api/emergency-requests/nearby?type=tow&radius=15` (com ou sem `latitude`/`longitude`) lista oportunidades. Regras do backend:
   - `type=tow` retorna somente pedidos `status=pending`, `proposal_status=awaiting_proposals` e `proposal_selection_deadline` futuro, ordenados por distância crescente.
   - Coordenadas explícitas (`latitude` + `longitude`) valem para parceiro e admin; precisam ser um par finito, dentro dos limites e diferente de `0,0` (`400 invalid_coordinates`). Sem o par explícito, o parceiro usa `partners.latitude`/`partners.longitude` do cadastro; admin sem par explícito recebe `400 coordinates_required`.
   - Cadastro de parceiro ausente/nulo/`NaN`/`Infinity`/`0,0` retorna `400 partner_onboarding_required`: o app deve concluir o onboarding antes de listar oportunidades, nunca assumir `0,0`.
   - `radius` é um número finito `> 0` (default 15); valor inválido retorna `400 invalid_radius`.
   - `exclude_proposed=true` remove da lista apenas pedidos em que o **próprio** parceiro tem proposta `pending`; propostas `withdrawn`/`rejected`/`expired` não removem a oportunidade.
2. `POST /api/tow-proposals` com `emergency_request_id`, `proposed_price` (número finito `> 0`), `estimated_time_minutes` (inteiro `> 0`) e, opcionalmente, `message`. O backend exige parceiro do tipo tow, localização válida do parceiro e do pedido, proposta única para o pedido, prazo aberto e preço mínimo; sucesso `201`. Erros: `400 invalid_payload` (payload), `403 partner_not_tow`, `400 partner_onboarding_required`, `404 emergency_not_found`, `400 emergency_not_accepting_proposals` (fechado/expirado/não-tow), `400 emergency_invalid_coordinates`, `400 proposal_price_below_minimum` e `409 proposal_duplicate` (sequencial ou concorrente, sem duplicar contador/notificação).
3. `GET /api/tow-proposals/partner` para propostas próprias.
4. Depois da seleção, somente o parceiro atribuído pode executar:
   - `POST /api/emergency-requests/:id/start` → `accepted` para `in_progress`;
   - `POST /api/emergency-requests/:id/complete` com `{ "final_price": 120.00, "solution_description": "...", "parts_used": [] }` → `completed`.
5. Administrador pode operar transições para suporte. Outro parceiro recebe `403`.
6. Rejeição do cliente: `POST /api/tow-proposals/:id/reject`. Retirada pelo parceiro: `POST /api/tow-proposals/:id/withdraw`, somente pelo parceiro dono da proposta e somente enquanto `pending` (`200` na transição real `pending` → `withdrawn`). Repetir a retirada ou tentar retirar proposta `accepted`/`rejected`/`expired` retorna `400 proposal_not_pending`; proposta inexistente retorna `404 proposal_not_found`; outro parceiro recebe `403 forbidden`. O histórico é preservado (a linha vira `withdrawn`), então a edição formal de uma proposta é `withdraw` seguido de novo `POST /api/tow-proposals`; não existem `PATCH`/`DELETE` de proposta.

## 5. Estados canônicos

`pending + awaiting_proposals` → `accepted + proposal_selected` → `in_progress` → `completed`.

Cancelamento: `pending` ou `accepted` → `cancelled`. Aceite só ocorre dentro dos prazos do backend e apenas uma proposta vence; concorrência ou proposta expirada retorna `400`.
Expiração pode produzir `no_proposals`; pedidos sem proposta usam `proposal_status: null` apenas quando não são tow.

## 6. Roles e erros

- `user`: cria emergência, lê/aceita/rejeita propostas do próprio pedido, cancela e paga/avalia.
- `partner`: consulta oportunidades, cria/retira propostas próprias e inicia/conclui pedido atribuído.
- `admin`: operações administrativas e suporte.

O endpoint direto `POST /api/emergency-requests/:id/accept` é exclusivo do fluxo mechanic; tow usa propostas.

Respostas de erro podem usar `{ "error": "..." }` ou `{ "success": false, "message": "..." }`; erros de regra do fluxo tow também trazem `code` estável (`invalid_coordinates`, `coordinates_required`, `partner_onboarding_required`, `invalid_radius`, `invalid_payload`, `partner_not_tow`, `emergency_not_found`, `emergency_not_accepting_proposals`, `emergency_invalid_coordinates`, `proposal_price_below_minimum`, `proposal_duplicate`, `proposal_not_found`, `proposal_not_pending`, `forbidden`). O app deve exibir mensagem e usar `status` + `code` para controle de fluxo, nunca o texto. `400` = payload/transição/regra de negócio; `401` = autenticação; `403` = permissão; `404` = recurso inexistente; `409` = duplicidade; `500` = erro transitório.

## 7. Checklist de aceite mobile

- Login, verify, logout e expiração/revogação retornam à tela de login.
- Cliente cria tow, vê propostas, aceita uma e acompanha os quatro estados.
- Parceiro tow envia proposta e, após seleção, inicia e conclui somente pedido atribuído.
- Preço exibido vem de `price_breakdown`; `final_price` é obrigatório para concluir tow.
- HTTP e Socket.IO usam o mesmo token; revogação encerra a sessão Socket após nova tentativa/conexão e o app deve desconectar imediatamente ao sair.
- Nenhum segredo, regra de preço ou transição é duplicado no app.

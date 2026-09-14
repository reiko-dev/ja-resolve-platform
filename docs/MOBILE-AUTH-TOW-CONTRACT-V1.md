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

1. `POST /api/emergency-requests` com `type` válido (`mechanical`, `fuel`, `tire`, `battery` ou `other`), `request_type: "tow"`, `description` (mín. 10), `vehicle_info` (`brand`, `model`, `year`) e localização (`location_type`, `latitude`, `longitude`, `address`). Origem/destino específicos são opcionais; não enviar `type: "tow"`.
2. Ler `data.id`, `data.status`, `data.proposal_status` e `data.price_breakdown` da resposta. `price_breakdown` pode ser JSON serializado; não calcular preço localmente.
3. `GET /api/tow-proposals/emergency/:emergency_request_id` para listar propostas do próprio pedido.
4. `POST /api/tow-proposals/:proposal_id/accept` para selecionar uma proposta, ou `POST /api/emergency-requests/:id/accept-proposal` com `{ "proposal_id": "..." }`.
5. Após aceite, acompanhar `accepted` + `proposal_selected`; atualizar por consulta/evento até `in_progress` e `completed`.
6. `POST /api/emergency-requests/:id/cancel` em `pending` ou `accepted`, somente pelo proprietário ou administrador.

Rotas: `GET /api/emergency-requests/:id/payment-summary`, `POST /api/emergency-requests/:id/payment` e `POST /api/emergency-requests/:id/rate`. Resumo pode ser consultado antes de `completed`; criar pagamento exige pedido aceito, atribuído e com proposta selecionada (`accepted`, `in_progress` ou `completed`), nunca `pending`; avaliação só é efetiva após `completed`.

## 4. Fluxo do parceiro guincho

1. Após onboarding de parceiro tow (`POST /api/partners/onboarding/complete`), `GET /api/emergency-requests/nearby?latitude=...&longitude=...&radius=15&type=tow` lista oportunidades. O backend aplica raio e retorna pedidos `pending`; o app deve confirmar `proposal_status` antes de propor.
2. `POST /api/tow-proposals` com `emergency_request_id`, `proposed_price`, `estimated_time_minutes` e, opcionalmente, `message`. O backend exige parceiro do tipo tow, proposta única, prazo aberto e preço mínimo; sucesso `201`.
3. `GET /api/tow-proposals/partner` para propostas próprias.
4. Depois da seleção, somente o parceiro atribuído pode executar:
   - `POST /api/emergency-requests/:id/start` → `accepted` para `in_progress`;
   - `POST /api/emergency-requests/:id/complete` com `{ "final_price": 120.00, "solution_description": "...", "parts_used": [] }` → `completed`.
5. Administrador pode operar transições para suporte. Outro parceiro recebe `403`.
6. Rejeição do cliente: `POST /api/tow-proposals/:id/reject`. Retirada pelo parceiro: `POST /api/tow-proposals/:id/withdraw`.

## 5. Estados canônicos

`pending + awaiting_proposals` → `accepted + proposal_selected` → `in_progress` → `completed`.

Cancelamento: `pending` ou `accepted` → `cancelled`. Aceite só ocorre dentro dos prazos do backend e apenas uma proposta vence; concorrência ou proposta expirada retorna `400`.
Expiração pode produzir `no_proposals`; pedidos sem proposta usam `proposal_status: null` apenas quando não são tow.

## 6. Roles e erros

- `user`: cria emergência, lê/aceita/rejeita propostas do próprio pedido, cancela e paga/avalia.
- `partner`: consulta oportunidades, cria/retira propostas próprias e inicia/conclui pedido atribuído.
- `admin`: operações administrativas e suporte.

O endpoint direto `POST /api/emergency-requests/:id/accept` é exclusivo do fluxo mechanic; tow usa propostas.

Respostas de erro podem usar `{ "error": "..." }` ou `{ "success": false, "message": "..." }`; o app deve exibir mensagem sem depender do texto para controle de fluxo. Controle de fluxo usa status HTTP e campos de estado. `400` = payload/transição/regra de negócio; `401` = autenticação; `403` = permissão; `404` = recurso inexistente; `500` = erro transitório.

## 7. Checklist de aceite mobile

- Login, verify, logout e expiração/revogação retornam à tela de login.
- Cliente cria tow, vê propostas, aceita uma e acompanha os quatro estados.
- Parceiro tow envia proposta e, após seleção, inicia e conclui somente pedido atribuído.
- Preço exibido vem de `price_breakdown`; `final_price` é obrigatório para concluir tow.
- HTTP e Socket.IO usam o mesmo token; revogação encerra a sessão Socket após nova tentativa/conexão e o app deve desconectar imediatamente ao sair.
- Nenhum segredo, regra de preço ou transição é duplicado no app.

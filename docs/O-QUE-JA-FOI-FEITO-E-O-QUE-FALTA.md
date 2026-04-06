# O que já foi feito e o que ainda falta

Este texto é para **quem precisa enxergar o produto e o andamento**, sem entrar em detalhes técnicos (linguagens, pastas ou código). Complementa a documentação técnica quando alguém quiser aprofundar na implementação.

---

## 1. O que o sistema pretende ser

Um ecossistema de **assistência para motoristas** (socorro na rua, guincho, combustível, bateria, pneus, etc.), no qual:

- o **cliente** pede ajuda pelo celular e acompanha o atendimento;
- o **parceiro** (oficina, guincheiro, motoboy, loja) recebe pedidos e gerencia o trabalho;
- a **equipe interna** acompanha tudo num painel na web (cadastros, emergências, pagamentos, documentos, etc.).

---

## 2. O que já foi feito (entregue em software)

### 2.1 “Motor” central do sistema (servidor e dados)

- **Contas e acesso**: cadastro, login e perfis diferentes (cliente, parceiro, administrador).
- **Cadastro e gestão de parceiros** com tipos distintos (ex.: mecânico, loja, motoboy), localização e disponibilidade para emergências.
- **Fluxo de emergência / socorro**: criar pedido, parceiro poder aceitar, cliente poder ver e escolher propostas (incluindo lógica de **guincho com propostas de valor**).
- **Pedidos de entrega e de compra** (combustível, peças, etc.) com status e histórico, integrados ao modelo de negócio da plataforma.
- **Assinaturas** de parceiros (planos, renovação, histórico).
- **Catálogo de produtos** (incluindo tipos como combustível e autopeças).
- **Pagamentos**, **carteiras** e **disputas** (abertura, resposta, decisão do admin).
- **Documentos de parceiros** (envio, análise e aprovação pelo administrador).
- **Notificações** no celular (push) e **tempo real** para acompanhar eventos importantes.
- **Configurações gerais** do sistema (valores e regras que o app pode consultar — guincho, assinatura, entrega, etc.).
- **Banco de dados estruturado** com histórico de evolução (migrações) e dados iniciais para testes.
- **Painel administrativo na web** com telas para: dashboard resumido, usuários, parceiros, documentos, emergências, entregas, compras, carteiras, disputas, mecânicos, serviços de oficina, agendamentos, avaliações e categorias.
- **Aplicativo do cliente (Flutter)** com: entrada e login, onboarding, solicitação de socorro por tipo (combustível, guincho, bateria, pneus), mapa, busca de parceiros, acompanhamento da emergência, histórico, chat ligado ao pedido, notificações, pagamentos, carteira, disputas, perfil, agendamentos e upload de documentos quando necessário.
- **Aplicativo do parceiro (Flutter)** com: fluxo de boas-vindas, escolha do tipo de parceiro, cadastro e login, área principal com navegação (início, serviços, emergências, financeiro, perfil), detalhe de serviço e configurações — além de **muitas telas e funções extras já codificadas** (relatórios, analytics, chat, suporte, gestão de produtos, entregas, guincho, documentos, avaliações, etc.), em parte herdadas de versões anteriores do app, que podem ou não estar todas ligadas ao fluxo principal atual.
- **Scripts** para apoiar deploy, build de aplicativo Android e configuração de ambiente (Firebase, testes).

Em resumo: **a base do negócio está implementada** — da conta do usuário até pagamento, documentos e operação no admin.

---

## 3. O que ainda falta ou está incompleto

Aqui entram itens que **já aparecem como intenção no código ou no produto**, mas **não estão fechados** para o usuário final ou para operação plena. Alguns são pequenos; outros exigem decisão de produto ou mais testes.

### 3.1 Painel administrativo (web)

- **Página de “Configurações”** do admin existe só como texto de “em desenvolvimento” — não há tela útil ali ainda.
- Vale **validar com uso real** se todas as listas e ações (editar, aprovar, filtrar) cobrem 100% do dia a dia da operação; o que faltar vira demanda explícita.

### 3.2 Aplicativo do cliente

- Existem **telas prontas** para assinatura (do lado cliente, se aplicável), **catálogo de produtos**, **pedido de entrega** e **lista de propostas de guincho** que **não estão todas ligadas ao menu principal** como as outras — ou seja: o código existe, mas o fluxo “do botão até a tela” pode estar incompleto para o usuário comum.
- Na área de **pagamentos**, o app menciona caminhos como “formas de pagamento” e “detalhe do pagamento”, mas **essas rotas não estão declaradas** no mapa principal do app — pode gerar tela em branco ou erro se alguém navegar por ali. **Falta amarrar** essa navegação ou remover o atalho até estar pronto.

### 3.3 Aplicativo do parceiro

- Há **dois “mundos” no código**: um fluxo **novo e organizado** (onboarding, login, abas principais) e **muitas telas antigas ou alternativas** (backup, versões experimentais). **Falta uma limpeza e uma definição clara** do que é oficial para o lançamento: o que entra no app que vai para a loja e o que fica de fora ou é removido.
- Algumas funcionalidades “bonitas no demo” (IA, relatórios avançados, vídeo, etc.) precisam de **validação**: estão conectadas ao servidor de verdade, com dados reais e regras de negócio aprovadas?

### 3.4 Servidor (API) e segurança operacional

- **Limite de requisições** (proteção contra abuso) está **desligado** no código por um motivo técnico antigo (proxy). **Falta** religar ou substituir por outra proteção quando o ambiente de produção estiver estável.
- O arquivo de rotas **principal de emergências** hoje expõe um **conjunto enxuto** de ações; existem **versões antigas e novas** de rotas no projeto que **não estão ativas ao mesmo tempo**. **Falta** alinhar com o time: qual é o contrato oficial da API para o app, e apagar ou unificar o que for legado para não confundir manutenção.

### 3.5 Qualidade, testes e go-live

- Existem **testes automatizados** no servidor, mas **não cobrem tudo**. **Falta** definir meta de cobertura e checklist de testes manuais antes de cada release.
- **Deploy em produção** (servidores, domínios, certificados, variáveis secretas) depende do ambiente de vocês — o repositório tem **exemplos e scripts**, mas **não substitui** o runbook de infraestrutura da empresa.
- **Loja Google Play / Apple App Store**: políticas, ícones, descrições, revisão da Apple — **não são código**; entram como trabalho à parte quando decidirem publicar.

### 3.6 Produto e negócio (não é programação, mas “falta” para o sucesso)

- **Suporte ao cliente** (telefone, WhatsApp, SLA) e **processo de disputa** no mundo real.
- **Contratos** com parceiros e **regras de comissão** validadas juridicamente e financeiramente.
- **Conteúdo** de ajuda dentro do app (textos, vídeos) alinhado à marca.

---

## 4. Como usar este documento

- **“O que já foi feito”** descreve a **capacidade atual do software** em linguagem de produto.
- **“O que falta”** mistura **lacunas objetivas** (telas placeholder, rotas quebradas, API a consolidar) com **itens que dependem de decisão** (o que entra no app parceiro final, política de segurança, publicação nas lojas).

Para quem quiser o **mapa técnico** (arquivos, rotas, tabelas), use o arquivo **`DOCUMENTACAO.md`** na mesma pasta.

---

*Texto focado em alinhamento entre negócio, parceiros e equipe — atualizado conforme o repositório em abril de 2026.*

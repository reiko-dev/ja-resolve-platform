# Já Resolve — Escopo de Serviços, Pagamentos e Cronograma de Entregas

**Versão:** 1.0.0  
**Data:** 26/09/2026  
**Status:** Aguardando validação da cliente  
**GitHub Project:** https://github.com/users/reiko-dev/projects/1/views/1?system_template=feature_release

Este documento tem como objetivo registrar os principais pontos alinhados sobre os serviços que serão disponibilizados na plataforma **Já Resolve**, seus respectivos fluxos gerais, modelo de monetização, pagamentos, repasses, cronograma de entregas e dependências externas.

O documento não tem como objetivo detalhar a arquitetura técnica ou todas as regras internas do sistema, mas formalizar o escopo funcional acordado para esta etapa do projeto.

---

## 1. Serviço de Guincho

Uma primeira versão funcional do serviço de Guincho já foi disponibilizada para avaliação.

Por definição da contratante, a equipe não realizará neste momento a etapa final de ajustes desse módulo, priorizando inicialmente os serviços de Postos de Gasolina, Autopeças e Mecânica.

Após a conclusão dessas etapas, o desenvolvimento retornará ao Guincho para realização dos ajustes finais e consolidação do serviço.

### Fluxo geral

O cliente poderá:

- informar sua localização atual;
- informar o destino desejado;
- solicitar um serviço de guincho;
- receber propostas dos parceiros disponíveis;
- negociar o valor do serviço;
- aceitar uma proposta;
- acompanhar a realização do atendimento.

Após a contratação, o guincheiro responsável realizará a retirada do veículo e sua entrega no destino acordado.

O módulo de Guincho também será integrado ao módulo financeiro da plataforma durante a etapa de consolidação dos pagamentos.

### Entrega prevista

A retomada, os ajustes finais e a consolidação do serviço de Guincho estão previstos para **26/10/2026**.

---

## 2. Serviço de Postos de Gasolina

O **Já Resolve** disponibilizará uma área dedicada aos postos de gasolina parceiros.

Os estabelecimentos poderão ser cadastrados através do Dashboard, contendo informações como nome, CNPJ, localização, imagens, horários, produtos, preços, promoções, disponibilidade e demais informações necessárias.

### Produtos

Os postos poderão disponibilizar produtos comercializados no estabelecimento, incluindo produtos de conveniência e demais itens permitidos.

O cliente poderá realizar a compra pelo aplicativo e, conforme disponibilidade do estabelecimento, optar entre:

- retirada no local;
- entrega no endereço informado.

As entregas de produtos poderão utilizar o módulo de motoboys do **Já Resolve**.

### Combustíveis

A plataforma poderá permitir a solicitação de combustível através do aplicativo.

Por se tratar de atividade sujeita a regulamentação específica, a funcionalidade de delivery de combustível somente deverá ser habilitada para estabelecimentos que comprovem possuir as autorizações e documentações exigidas para essa modalidade.

O **Já Resolve** poderá solicitar, armazenar e validar a documentação necessária.

Caso algum documento obrigatório esteja vencido, irregular ou deixe de atender às exigências aplicáveis, a funcionalidade de delivery de combustível poderá ser suspensa até a regularização.

O simples cadastro de um posto na plataforma não significa autorização automática para realização de delivery de combustível.

### Monetização

O **Já Resolve** poderá cobrar uma comissão sobre as vendas realizadas pelos postos.

O percentual será configurável administrativamente pelo Dashboard e poderá variar de acordo com cada estabelecimento parceiro.

### Entrega prevista

A primeira versão funcional do serviço de Postos de Gasolina está prevista para **05/10/2026**, para avaliação e validação da contratante.

---

## 3. Serviço de Autopeças

O **Já Resolve** contará com lojas de Autopeças cadastradas na plataforma.

O cliente poderá acessar uma loja, visualizar os produtos comercializados, consultar preços e disponibilidade e realizar a compra diretamente pelo aplicativo.

O fluxo não incluirá, nesta primeira etapa, consultoria ou identificação automática de qual peça é compatível com determinado veículo.

### Catálogo de produtos

A plataforma contará com um catálogo geral de produtos.

Sempre que possível, os produtos poderão ser identificados através de código de barras.

Quando um código já existir na plataforma, a loja poderá reutilizar o cadastro existente, evitando duplicidade.

Quando o produto ainda não existir, um novo cadastro poderá ser criado.

Dados gerais dos produtos poderão passar por revisão e padronização administrativa.

Cada estabelecimento manterá apenas os produtos que efetivamente comercializa.

Preço, estoque, promoções e disponibilidade permanecerão específicos de cada loja.

Dessa forma, mesmo que o catálogo geral possua milhares de produtos, o cliente verá em cada estabelecimento somente os itens comercializados por aquela loja.

### Retirada e entrega

O cliente poderá optar entre:

- retirada do pedido diretamente na loja;
- entrega através dos motoboys da plataforma.

### Monetização

O **Já Resolve** poderá cobrar uma comissão sobre as vendas realizadas pelas Autopeças.

O percentual será configurável pelo Dashboard e poderá ser definido individualmente para cada estabelecimento.

### Entrega prevista

A primeira versão funcional do serviço de Autopeças está prevista para **12/10/2026**.

---

## 4. Serviço de Mecânica

O serviço de Mecânica permitirá que o cliente solicite atendimento para problemas relacionados ao veículo.

### Solicitação de serviço

O cliente poderá informar:

- o veículo relacionado à solicitação;
- sua localização;
- fotos e vídeos;
- uma categoria ou tipo de problema;
- uma descrição adicional quando necessário.

A solicitação ficará disponível para as mecânicas participantes.

As mecânicas poderão avaliar as informações apresentadas, tirar dúvidas com o cliente e apresentar orçamento.

Cliente e mecânica poderão negociar as condições e o valor do serviço antes da contratação.

Após o aceite, o serviço será vinculado à mecânica selecionada.

Quando aplicável, a plataforma também poderá apresentar ao cliente a disponibilidade do serviço de Guincho para transporte do veículo até a oficina.

### Cadastro de serviços

As mecânicas poderão possuir um catálogo de serviços cadastrados na plataforma, administrado conforme as permissões definidas no sistema.

### Monetização das mecânicas

O **Já Resolve** não cobrará comissão sobre cada serviço mecânico realizado.

A monetização desse módulo ocorrerá através de uma **mensalidade paga pela mecânica para permanecer listada e participar da plataforma**.

A assinatura será contratada através de ambiente Web e processada pela Stripe.

### Tolerância de pagamento

A mensalidade contará com um período de tolerância configurável administrativamente.

Inicialmente, o período padrão será de **5 dias**.

Caso a mensalidade não seja regularizada após esse período, a mecânica poderá ter sua listagem suspensa para novos clientes.

Solicitações e negociações já iniciadas anteriormente continuarão disponíveis, evitando a interrupção de atendimentos em andamento.

### Entrega prevista

A primeira versão funcional do serviço de Mecânica está prevista para **19/10/2026**.

---

## 5. Motoboys e Entregas

O **Já Resolve** contará com um cadastro próprio de motoboys parceiros.

Inicialmente, eles serão utilizados principalmente nas entregas originadas pelos serviços de:

- Postos de Gasolina;
- Autopeças.

Quando uma compra exigir entrega, a plataforma gerará automaticamente uma solicitação de entrega contendo as informações necessárias para realização do serviço.

Essa solicitação poderá ser disponibilizada aos motoboys elegíveis e disponíveis, que poderão visualizar a oportunidade e decidir se desejam aceitá-la.

Após o aceite, a entrega ficará vinculada ao motoboy correspondente.

### Valor da entrega

O valor do serviço de entrega será calculado automaticamente pela plataforma, considerando os critérios definidos para o serviço.

### Comissão do Já Resolve

A plataforma poderá cobrar uma comissão sobre o valor da entrega.

Essa comissão será configurável pelo Dashboard e poderá inclusive ser definida como **0%**.

Isso permitirá, por exemplo, campanhas ou períodos promocionais em que o motoboy receba integralmente o valor da entrega.

---

## 6. Pagamentos

A plataforma deverá suportar, conforme disponibilidade e configuração, os seguintes meios de pagamento:

- cartão de crédito/débito;
- Pix;
- dinheiro.

A **Stripe será utilizada como plataforma de pagamentos eletrônicos do Já Resolve**, incluindo a estrutura necessária para processamento, controle e gestão dos pagamentos da plataforma.

A disponibilização de determinados recursos estará sujeita às condições e habilitações disponíveis na conta da empresa.

### Integração financeira

As primeiras entregas de cada serviço poderão utilizar fluxos provisórios ou simplificados de pagamento para permitir a validação das jornadas.

A integração financeira completa será realizada na etapa final de consolidação.

---

## 7. Repasses aos parceiros

O prazo de repasse aos parceiros não será necessariamente igual à data de realização do serviço.

Cada forma de pagamento possui condições diferentes de confirmação, processamento e disponibilidade financeira.

Como regra geral, um valor será considerado elegível para repasse após:

1. conclusão e confirmação do serviço;
2. disponibilidade financeira do respectivo pagamento para a plataforma.

A plataforma não assumirá, como regra padrão, a obrigação de antecipar com recursos próprios valores ainda não liquidados pelo processador financeiro.

### Pagamentos eletrônicos

Em pagamentos por cartão ou Pix, a confirmação da transação não significa necessariamente que o valor já esteja disponível para repasse.

O prazo dependerá das condições de liquidação e disponibilidade financeira estabelecidas pela Stripe.

### Pagamento em dinheiro

Nos pagamentos em dinheiro, o cliente realizará o pagamento diretamente ao parceiro.

Quando houver comissão do **Já Resolve** sobre aquele serviço, a parcela pertencente à plataforma será registrada como um valor devido pelo parceiro.

**Exemplo:**

Em uma operação de R$ 200,00 com comissão de R$ 20,00, o parceiro poderá receber diretamente os R$ 200,00 do cliente, mas ficará com um saldo de R$ 20,00 devido ao **Já Resolve**.

Esses valores poderão ser acumulados.

Posteriormente, poderão ser compensados com valores eletrônicos que o parceiro tenha a receber ou quitados de acordo com as regras financeiras definidas pela administração.

A plataforma poderá futuramente estabelecer limites de saldo devedor ou outras regras para evitar acúmulo excessivo.

---

## 8. Comissões

Os valores e percentuais de comissão não ficarão necessariamente fixados no sistema.

Sempre que aplicável, poderão ser configurados administrativamente através do Dashboard.

Isso permitirá que o **Já Resolve** estabeleça condições diferentes por:

- parceiro;
- estabelecimento;
- tipo de serviço;
- entrega;
- campanha ou condição comercial.

---

## 9. Cronograma previsto

| Data | Entrega prevista |
|---|---|
| **05/10/2026** | Serviço de Postos de Gasolina |
| **12/10/2026** | Serviço de Autopeças |
| **19/10/2026** | Serviço de Mecânica |
| **26/10/2026** | Retomada, ajustes e consolidação do Serviço de Guincho |
| **02/11/2026** | Consolidação dos serviços com pagamentos integrados |

As datas de 05/10, 12/10, 19/10 e 26/10 representam **entregas funcionais destinadas à avaliação e validação da contratante**.

Essas entregas poderão receber refinamentos e ajustes decorrentes da revisão realizada pela cliente.

Novas funcionalidades ou alterações que representem ampliação relevante do escopo originalmente descrito poderão exigir nova avaliação de prazo.

---

## 10. Dependências externas e possíveis prorrogações

Os prazos apresentados consideram que contas, credenciais, informações, documentos e acessos necessários serão disponibilizados em tempo hábil.

Caso determinada etapa dependa de uma conta, autorização ou configuração ainda não disponibilizada, o prazo da etapa afetada poderá ser prorrogado pelo período necessário para regularização da dependência.

Entre as principais dependências do projeto estão:

- conta do **Apple Developer / App Store Connect**;
- conta do **Google Play Console**;
- conta da **Stripe**;
- projeto e acesso administrativo ao **Firebase**;
- projeto no **Google Cloud Platform**, com faturamento e APIs necessárias habilitados;
- acesso ao **domínio e DNS do Já Resolve**;
- acesso à **infraestrutura/VPS de produção**;
- dados oficiais da empresa, incluindo CNPJ, razão social, endereço, telefone, e-mail de suporte e responsável legal;
- documentos, autorizações e informações exigidas dos estabelecimentos parceiros para atividades regulamentadas.

O atraso em uma dessas dependências não implicará necessariamente atraso de todo o projeto, mas poderá prorrogar especificamente as funcionalidades que dependam dela.

---

## 11. Titularidade das contas

Sempre que possível, as contas e serviços utilizados pelo **Já Resolve** deverão permanecer registrados em nome da própria empresa.

A equipe de desenvolvimento deverá receber acesso através de usuários, permissões administrativas ou mecanismos equivalentes, evitando o compartilhamento direto de senhas.

Dessa forma, contas, credenciais, dados e serviços permanecem sob controle da empresa inclusive após a conclusão do desenvolvimento.

---

## 12. Considerações finais

O objetivo deste cronograma é realizar entregas progressivas, permitindo que cada serviço seja validado antes da consolidação completa da plataforma.

Durante o desenvolvimento, decisões operacionais de menor impacto poderão continuar sendo refinadas sem alterar o escopo principal descrito neste documento.

A etapa prevista para **02/11/2026** será dedicada à consolidação dos serviços com a estrutura financeira integrada, incluindo pagamentos, registros de comissão, saldos, repasses e demais regras necessárias ao funcionamento da operação.

---

## Histórico de versões

| Versão | Data | Status | Alterações |
|---|---|---|---|
| **1.0.0** | 26/09/2026 | Aguardando validação da cliente | Formalização inicial do escopo de serviços, pagamentos, repasses, cronograma e dependências; nomenclatura oficial **Já Resolve**. |

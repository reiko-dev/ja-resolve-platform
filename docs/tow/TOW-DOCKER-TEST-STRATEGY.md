# Tow Service — Docker Test & CI Strategy

> Projeto: **JaResolve**  
> Domínio: **Guincho / Tow**  
> Escopo atual: **desenvolvimento, testes e CI**  
> Produção na VPS: **não migrar para Docker nesta fase**

---

## 1. Decisão arquitetural

Docker passa a fazer parte da infraestrutura oficial de **desenvolvimento, testes de integração, testes de banco, concorrência, E2E e CI** do backend JaResolve.

Nesta fase, Docker **não altera o runtime atual da VPS de produção**. A infraestrutura de produção existente pode continuar usando Node.js/PM2/Nginx/PostgreSQL até que o MVP esteja funcionalmente pronto e o domínio Tow tenha passado pelo gate `TOW BACKEND READY FOR INTEGRATION` e pelos gates posteriores de produção.

A eventual adoção de Docker na VPS deverá ser tratada como uma mudança de infraestrutura/deploy separada, com plano de rollout, rollback, persistência, backup, observabilidade e validação próprios.

---

## 2. Objetivos

Docker é adotado agora para garantir:

- ambiente reproduzível entre máquinas de desenvolvimento, workhorses e CI;
- PostgreSQL real e isolado para testes;
- migrations executadas contra banco realmente vazio;
- reset destrutivo seguro apenas em ambiente descartável/autorizado;
- testes de concorrência contra PostgreSQL real;
- E2E sem dependência do estado da máquina host;
- execução determinística por IA/workhorse através de comandos únicos;
- redução de drift entre ambientes de desenvolvimento/teste.

Docker não substitui Clean Architecture: é detalhe de runtime/infrastructure e não pode vazar para Domain/Application.

---

## 3. Escopo inicial

### Obrigatório

- Dockerfile do backend quando necessário para executar a aplicação/test runner de forma reprodutível;
- Docker Compose dedicado a test/CI;
- PostgreSQL de teste containerizado;
- healthcheck do PostgreSQL;
- volumes descartáveis para suíte de teste;
- `.env.test.example` sem segredos reais;
- scripts/comandos únicos para subir, validar e destruir o ambiente;
- network isolada do compose de teste;
- cleanup automático mesmo após falha da suíte;
- nenhuma dependência de PostgreSQL instalado diretamente no host para os gates Tow.

### Pode permanecer fora de container

- unit tests puros, desde que continuem reproduzíveis;
- Google Routes, através de fake/contract adapter nos testes padrão;
- gateways de CARD/PIX, através de fakes/sandboxes/adapters;
- clocks e schedulers, através de abstrações controláveis.

---

## 4. Arquivos esperados

A implementação pode ajustar nomes ao padrão real do repositório, mas deve fornecer semanticamente:

```text
Dockerfile                 # quando necessário para runtime/test reproduzível
docker-compose.test.yml    # ambiente descartável de testes
.env.test.example          # configuração sem segredos
scripts/test/...           # helpers de bootstrap/cleanup se necessário
```

Um compose de desenvolvimento separado (`docker-compose.dev.yml`) pode ser criado se houver benefício real, mas não é requisito para considerar T00 aceita. O requisito fundamental é o ambiente **test/CI**.

---

## 5. Comando canônico

Ao final de T00 deve existir um comando canônico equivalente a:

```bash
npm run verify:tow
```

ou o comando compatível com o package manager existente.

O desenvolvedor/workhorse não deve precisar executar manualmente uma sequência de comandos Docker para validar o Tow.

O comando deve orquestrar semanticamente:

```text
subir PostgreSQL descartável
        ↓
aguardar healthcheck
        ↓
preparar banco de teste
        ↓
executar migrations
        ↓
executar testes/gates Tow solicitados
        ↓
coletar exit code/evidência
        ↓
destruir containers/volumes descartáveis
```

Para suítes que necessitem manter o ambiente ativo durante desenvolvimento, podem existir comandos auxiliares, mas o gate de CI deve continuar auto-contido.

---

## 6. PostgreSQL real como regra

Não utilizar mock/in-memory DB para provar invariants que dependem do PostgreSQL.

Obrigatoriamente executar contra PostgreSQL real containerizado testes relacionados a:

- migrations;
- foreign keys;
- unique/partial unique constraints;
- check constraints;
- transactions;
- row locks;
- compare-and-set/conditional updates;
- isolation/concorrência;
- índices e queries geográficas quando aplicável;
- wallet/ledger atomicity;
- payout batch locking/idempotency.

Em especial, T09 deve provar o invariant de single assignment winner contra duas conexões/transações reais no PostgreSQL.

---

## 7. Clean Database Gate — T01

T01 deve validar em um container/volume realmente novo:

```text
fresh PostgreSQL container/volume
        ↓
migrate from zero
        ↓
seed
        ↓
assert: somente admin padrão
        ↓
schema/constraint tests
        ↓
destruir container/volume
        ↓
repetir para provar determinismo
```

A suíte não pode depender de migration state anterior nem de dados históricos.

---

## 8. Clean-room Gate — T18

O readiness final deve executar pelo menos uma validação completa a partir de infraestrutura descartável recém-criada:

1. nenhum volume/banco anterior disponível;
2. subir PostgreSQL via Docker;
3. executar migrations do zero;
4. executar seed mínimo;
5. preparar fixtures somente pelos mecanismos oficiais de teste;
6. executar suíte Tow completa relevante;
7. executar os E2E obrigatórios;
8. destruir o ambiente;
9. repetir os gates críticos quando necessário para detectar flakiness.

O relatório T18 deve registrar os comandos e resultados desse clean-room run.

---

## 9. Segurança

- nenhum secret real em Dockerfile, compose ou arquivos versionados;
- usar environment variables/secrets do ambiente de CI;
- `.env.test.example` contém apenas placeholders/defaults não sensíveis;
- bancos de teste devem usar credenciais próprias e descartáveis;
- reset scripts devem possuir safety guards e nunca apontar para produção por default;
- `DATABASE_URL` de teste deve ser explicitamente distinta de produção;
- test runner deve falhar fechado se houver risco de executar reset contra ambiente não autorizado.

---

## 10. CI

A suíte Tow no CI deve utilizar a mesma estratégia reproduzível de PostgreSQL containerizado definida para desenvolvimento/workhorse.

O CI deve conseguir executar sem:

- PostgreSQL pré-instalado/configurado manualmente;
- estado persistente de execução anterior;
- acesso a serviços externos reais para testes padrão;
- intervenção humana.

Falha no bootstrap, migrations, healthcheck ou cleanup é falha do gate, não warning ignorável.

---

## 11. Produção / VPS

### Agora

Não alterar a VPS apenas para satisfazer o plano Tow.

O runtime atual de produção pode continuar fora de Docker durante desenvolvimento e estabilização do MVP.

### Quando o MVP estiver pronto para produção

A dockerização da VPS deve ser avaliada e executada como iniciativa própria, contemplando no mínimo:

- Docker Engine/Compose suportados e atualizados;
- topologia de containers;
- Nginx/reverse proxy;
- estratégia para PostgreSQL (containerizado ou serviço externo/host);
- volumes persistentes;
- backups e restore testado;
- secrets;
- healthchecks/readiness;
- restart policies;
- logs/metrics;
- deploy sem perda de dados;
- rollback;
- resource limits;
- firewall/network exposure;
- plano de migração do runtime PM2 atual.

Essa mudança não deve ser misturada aos PRs funcionais T00–T18.

---

## 12. Critério de sucesso

Docker é considerado corretamente incorporado ao desenvolvimento Tow quando:

- um clone limpo consegue executar o ambiente de teste seguindo documentação versionada;
- PostgreSQL de testes não depende da instalação do host;
- T01 prova migration/seed do zero em volume descartável;
- T09 prova concorrência em PostgreSQL real;
- T18 executa clean-room validation;
- os mesmos comandos são utilizáveis por desenvolvedor, workhorse e CI;
- nenhuma dependência de Docker foi introduzida em Domain/Application;
- a VPS de produção permanece inalterada até existir uma iniciativa explícita de production containerization para o MVP.

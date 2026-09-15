# Guia de deploy de homologação na VPS Hostinger

Este guia descreve, em ordem, como preparar a VPS Hostinger e publicar uma nova release do Socorre AI. O procedimento usa o usuário Linux deploy, PostgreSQL, Redis, PM2, Nginx e os scripts versionados em scripts/homolog/.

Não use dados reais nem o argumento --seed em uma VPS que já tenha dados. Esse argumento recria dados de demonstração e pode apagar registros existentes.

## 1. Pré-requisitos locais

Tenha Git, OpenSSH (ssh, scp e ssh-keygen), acesso ao repositório reiko-dev/socorre-ja-platform e a chave privada autorizada na VPS e no GitHub.

Nunca copie a chave privada para o repositório, para a VPS ou para mensagens. Confirme sua existência sem imprimir conteúdo:

~~~
ls -l ~/.ssh/socorre_ai_vps ~/.ssh/socorre_ai_vps.pub
chmod 600 ~/.ssh/socorre_ai_vps
chmod 644 ~/.ssh/socorre_ai_vps.pub
~~~

Configure um alias em ~/.ssh/config:

~~~sshconfig
Host socorre-vps
    HostName SEU_IP_OU_HOSTNAME
    User deploy
    IdentityFile ~/.ssh/socorre_ai_vps
    IdentitiesOnly yes
    AddKeysToAgent yes
~~~

Substitua SEU_IP_OU_HOSTNAME pelo endereço da VPS.

## 2. Testar SSH e sudo

~~~
ssh -o BatchMode=yes -o ConnectTimeout=10 socorre-vps \
  'printf "host=%s user=%s\n" "$(hostname)" "$(id -un)"'
ssh socorre-vps 'sudo -n true && echo sudo-ok'
~~~

O usuário retornado deve ser deploy e o segundo comando deve imprimir sudo-ok. Se houver Permission denied ou exigência de senha, corrija a chave, o usuário ou a política de sudo antes de prosseguir.

## 3. Primeira configuração da VPS

Esta etapa é executada apenas na primeira preparação. Ela instala dependências, cria diretórios, configura PostgreSQL, Redis, PHP-FPM, Nginx, PM2 e os arquivos de ambiente.

Se esta for uma VPS nova, clone primeiro o repositório em um diretório vazio:

~~~
ssh socorre-vps \
  'git clone git@github.com:reiko-dev/socorre-ja-platform.git /var/www/socorre-ai/repository'
~~~

Na raiz do repositório local, publique os arquivos de bootstrap:

~~~
scp scripts/homolog/bootstrap-vps.sh \
  scripts/homolog/nginx-homolog.conf.template \
  socorre-vps:/tmp/
~~~

Na VPS, execute como deploy:

~~~
ssh socorre-vps '
  mkdir -p /var/www/socorre-ai/repository/scripts/homolog
  cp /tmp/bootstrap-vps.sh /var/www/socorre-ai/repository/scripts/homolog/bootstrap-vps.sh
  cp /tmp/nginx-homolog.conf.template /var/www/socorre-ai/repository/scripts/homolog/nginx-homolog.conf.template
  chmod +x /var/www/socorre-ai/repository/scripts/homolog/bootstrap-vps.sh
  cd /var/www/socorre-ai/repository
  HOMOLOG_ADMIN_HOST=SEU_HOST_ADMIN \
  HOMOLOG_SITE_HOST=SEU_HOST_SITE \
  LETSENCRYPT_EMAIL=SEU_EMAIL \
  ./scripts/homolog/bootstrap-vps.sh
'
~~~

Substitua os três valores. Se o DNS ainda não apontar para a VPS, use SKIP_TLS=1 apenas para preparação temporária; a release final exige DNS e HTTPS funcionando.

O bootstrap cria e protege:

~~~
/var/www/socorre-ai/shared/backend.env
/var/www/socorre-ai/shared/homolog.env
/var/www/socorre-ai/shared/admin.env
/var/www/socorre-ai/shared/site.env
~~~

backend.env contém o segredo JWT e as credenciais do banco. Não o substitua pelo .env local nem o versione. Preencha chaves opcionais diretamente na VPS:

~~~
ssh socorre-vps 'sudo -u deploy nano /var/www/socorre-ai/shared/admin.env'
ssh socorre-vps 'sudo -u deploy nano /var/www/socorre-ai/shared/site.env'
~~~

## 4. Confirmar a configuração

Confira somente a existência dos arquivos e os nomes das variáveis:

~~~
ssh socorre-vps '
  for f in /var/www/socorre-ai/shared/backend.env \
           /var/www/socorre-ai/shared/homolog.env \
           /var/www/socorre-ai/shared/admin.env \
           /var/www/socorre-ai/shared/site.env; do
    test -f "$f" && echo "presente: $f" || echo "ausente: $f"
  done
'
ssh socorre-vps "awk -F= 'NF {print \$1}' /var/www/socorre-ai/shared/backend.env | sort"
~~~

O backend precisa ter, no mínimo, NODE_ENV, PORT, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, CORS_ORIGIN e PUBLIC_API_URL.

## 5. Preparar a release localmente

Confirme branch, commit e worktree:

~~~
git fetch origin
git switch main
git pull --ff-only origin main
git status --short --branch
git log -1 --oneline
~~~

O worktree deve estar limpo. Execute os gates mínimos:

~~~
cd socorre_ai_backend
npm ci
npm test -- --runInBand
npx knex migrate:latest --knexfile knexfile.js --env development
cd ..

bash -n scripts/homolog/bootstrap-vps.sh
bash -n scripts/homolog/deploy-homolog.sh
docker compose -f docker-compose-simple.yml config
git diff --check
~~~

Se npm ci informar que package.json e package-lock.json estão fora de sincronia, pare e corrija o lockfile em uma alteração versionada. Não trate npm install silencioso como substituto de uma release reproduzível.

## 6. Publicar uma nova release

O script oficial puxa a main diretamente do GitHub, cria backup da release anterior, faz backup do banco, compila o admin, instala dependências, aplica migrations, publica backend/site, reinicia o PM2 e executa health checks.

Execute sem --seed:

~~~
ssh socorre-vps \
  'cd /var/www/socorre-ai/repository && bash scripts/homolog/deploy-homolog.sh'
~~~

O final esperado contém backend local (3001): ok, os dois hosts com ok (https) e Release XXXXXXX publicada com sucesso.

O script possui fallback para npm install quando npm ci falha. Se esse fallback aparecer, registre a causa e corrija o lockfile antes da próxima release.

## 7. Quando usar --seed

Use somente na primeira instalação de uma base vazia ou descartável:

~~~
ssh socorre-vps \
  'cd /var/www/socorre-ai/repository && bash scripts/homolog/deploy-homolog.sh --seed'
~~~

Nunca use --seed em uma base com dados de teste que precisam ser preservados.

## 8. Validação pós-deploy

~~~
ssh socorre-vps '
  cd /var/www/socorre-ai/repository
  printf "branch="; git branch --show-current
  printf "commit="; git rev-parse HEAD
  pm2 list
  curl -fsS http://127.0.0.1:3001/health
  cd /var/www/socorre-ai/staging/backend
  npx knex migrate:list --env production
'
curl -fsS https://SEU_HOST_ADMIN/health
curl -I https://SEU_HOST_ADMIN/
curl -I https://SEU_HOST_SITE/
~~~

O processo socorre-ai-homolog-backend deve estar online; o health deve indicar PostgreSQL ok; não pode haver migration pendente; admin e site devem responder HTTPS.

Revise logs sem expor segredos:

~~~
ssh socorre-vps 'pm2 logs socorre-ai-homolog-backend --lines 100 --nostream'
ssh socorre-vps 'sudo journalctl -u nginx --since "15 minutes ago" --no-pager'
~~~

## 9. Teste funcional do Serviço de Guincho

Use apenas contas de homologação:

1. autentique um cliente;
2. crie uma solicitação de guincho com coordenadas válidas;
3. autentique um parceiro com coordenadas de onboarding válidas;
4. consulte GET /api/emergency-requests/nearby?type=tow&radius=15;
5. envie uma proposta;
6. aceite a proposta como cliente;
7. inicie o atendimento como parceiro atribuído;
8. conclua com preço e fotos válidas;
9. confirme persistência do histórico e das fotos após novo login;
10. repita start e complete e confirme ausência de cobrança, evento ou notificação duplicada.

Ao registrar falhas, guarde método, caminho, status e corpo sanitizado. Nunca registre JWT, senha, DB_PASSWORD ou conteúdo de foto.

## 10. Rollback

O deploy mantém os cinco backups mais recentes em /var/www/socorre-ai/releases/:

~~~
ssh socorre-vps 'ls -lth /var/www/socorre-ai/releases | head -20'
ssh socorre-vps 'tar -tzf /var/www/socorre-ai/releases/staging-ARQUIVO.tar.gz | head'
~~~

Há backups da release e do banco. Rollback de banco é destrutivo: exige confirmação explícita, backup atual adicional e janela de manutenção. Não execute drop database automaticamente.

Para rollback de código, identifique o commit anterior, publique-o em uma branch/release controlada e execute o deploy normal. Não use git reset --hard no computador do desenvolvedor.

## 11. Troubleshooting

### SSH retorna Permission denied

~~~
ssh -vvv socorre-vps
chmod 600 ~/.ssh/socorre_ai_vps
~~~

Confira o alias, usuário deploy e autorização da chave pública na VPS.

### sudo: a password is required

O bootstrap exige sudo sem senha para deploy. Um administrador deve corrigir a política antes de repetir.

### npm ci falha por lockfile

Corrija localmente a sincronização entre package.json e package-lock.json, revise o diff e rode npm ci novamente. Não force a publicação.

### PM2 fica errored

~~~
ssh socorre-vps 'pm2 status; pm2 logs socorre-ai-homolog-backend --lines 100 --nostream'
~~~

Confira backend.env, banco, Redis, migrations e versão do Node. A aplicação exige Node compatível com a versão de sharp instalada.

### /health retorna 502

~~~
ssh socorre-vps 'pm2 status; curl -v http://127.0.0.1:3001/health'
ssh socorre-vps 'sudo nginx -t; sudo systemctl status nginx --no-pager'
~~~

Primeiro corrija o processo local na porta 3001; depois verifique Nginx, DNS, certificado e firewall 22/80/443.

### Fotos ou uploads falham

Confira UPLOAD_DIR, os diretórios de upload e as permissões do usuário deploy. Não exponha backend.env durante o diagnóstico.

## 12. Checklist final

- [ ] Branch e commit corretos confirmados.
- [ ] Worktree local limpo.
- [ ] Testes, npm ci e validações estáticas passaram.
- [ ] SSH validado com usuário deploy.
- [ ] Arquivos de ambiente presentes e protegidos.
- [ ] Deploy executado sem --seed em base existente.
- [ ] Backup de banco criado antes das migrations.
- [ ] Admin compilado e migrations sem pendências.
- [ ] PM2 online e commit remoto correto.
- [ ] /health local e externo respondendo 200.
- [ ] Admin e site respondendo HTTPS.
- [ ] Fluxo completo de guincho testado.
- [ ] Logs revisados.
- [ ] Nenhum segredo publicado.

## 13. Arquivos de referência

- scripts/homolog/bootstrap-vps.sh: primeira configuração;
- scripts/homolog/deploy-homolog.sh: publicação de cada release;
- scripts/homolog/ecosystem.homolog.config.js: processo PM2;
- scripts/homolog/nginx-homolog.conf.template: proxy do admin, API e site;
- scripts/preflight-production.sh: validação de variáveis de produção;
- docs/DEPLOY-READINESS.md: limites de infraestrutura;
- docs/MOBILE-AUTH-TOW-CONTRACT-V1.md: contrato Mobile/backend.

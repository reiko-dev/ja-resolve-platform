# Backend Socorre AI — Node 20 (Express + Knex + Socket.IO)
#
# EasyPanel: contexto de build = pasta deste Dockerfile (socorre_ai_backend no monorepo).
#
# Variáveis de ambiente (exemplos — alinhar ao seu .env):
#   PORT              — porta HTTP (ex.: 3000; mapeie no painel)
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL=true se o Postgres exigir SSL
#   JWT_SECRET        — obrigatório em produção
#   REDIS_URL         — se o app usar Redis
#   NODE_ENV=production
#   RUN_MIGRATIONS=1  — opcional: na primeira deploy roda `knex migrate:latest` antes do node
# Firebase / gateways: conforme já usam hoje (ex. JSON de credenciais ou variáveis do firebase-admin)
#
# Volume recomendado: montar /app/uploads para não perder arquivos enviados (Multer).

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY knexfile.js ./
COPY database ./database
COPY src ./src

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Uploads em disco (monte um volume em /app/uploads em produção se quiser persistir)
RUN mkdir -p uploads/documents && chown -R node:node /app

USER node

EXPOSE 3000

# EasyPanel costuma injetar PORT; o server.js já usa process.env.PORT
HEALTHCHECK --interval=30s --timeout=8s --start-period=45s --retries=3 \
  CMD node -e "const p=process.env.PORT||'3000';require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1));"

ENTRYPOINT ["docker-entrypoint.sh"]

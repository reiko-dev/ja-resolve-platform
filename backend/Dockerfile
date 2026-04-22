# EasyPanel / monorepo: use a RAIZ do repositório como contexto de build.
# Dockerfile path: backend/Dockerfile
# Build context: . (raiz do clone), NÃO a pasta backend sozinha.
#
# Ex.: docker build -f backend/Dockerfile .

FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY socorre_ai_backend/package.json socorre_ai_backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY socorre_ai_backend/knexfile.js ./
COPY socorre_ai_backend/database ./database
COPY socorre_ai_backend/src ./src

COPY socorre_ai_backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p uploads/documents && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=45s --retries=3 \
  CMD node -e "const p=process.env.PORT||'3000';require('http').get('http://127.0.0.1:'+p+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1));"

ENTRYPOINT ["docker-entrypoint.sh"]

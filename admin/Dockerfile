# Contexto de build do EasyPanel: raiz do repositório
# Dockerfile path: admin/Dockerfile

# Estágio de Build
FROM node:18-alpine AS build

WORKDIR /app

# Variável de build para injetar a URL da API no build do React
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

# Copia arquivos de dependências a partir do contexto da raiz do monorepo
COPY socorre_ai_admin/package*.json ./
RUN npm ci

# Copia o código fonte do painel admin
COPY socorre_ai_admin/ ./

# Compila o projeto React
RUN npm run build

# Estágio de Produção (Nginx para servir arquivos estáticos de forma otimizada)
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html

# Configuração simples do Nginx para suportar React Router
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

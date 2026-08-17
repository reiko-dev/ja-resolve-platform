# Estágio 1: Instalação de dependências do Composer
FROM composer:latest AS composer-stage
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# Estágio 2: Imagem final com PHP e Apache
FROM php:8.2-apache

# Habilitar o mod_rewrite do Apache (caso precise de rotas amigáveis)
RUN a2enmod rewrite

# Copiar os arquivos do projeto para o diretório padrão do Apache
COPY . /var/www/html/
COPY --from=composer-stage /app/vendor /var/www/html/vendor

# Ajustar as permissões para o usuário do Apache (www-data)
RUN chown -R www-data:www-data /var/www/html

# Definir porta padrão
EXPOSE 80

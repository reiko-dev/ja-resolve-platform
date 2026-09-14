# Evidência AUTH-001: migrations PostgreSQL

Ambiente: PostgreSQL local isolado, banco de teste descartável, sem credenciais de produção.

Comandos executados em `socorre_ai_backend`:

```sh
DB_HOST=/tmp DB_PORT=55432 DB_NAME_TEST=socorre_ai_test DB_USER="$USER" DB_PASSWORD='' NODE_ENV=test npx knex migrate:latest --env test
DB_HOST=/tmp DB_PORT=55432 DB_NAME_TEST=socorre_ai_test DB_USER="$USER" DB_PASSWORD='' NODE_ENV=test npx knex migrate:down --env test
DB_HOST=/tmp DB_PORT=55432 DB_NAME_TEST=socorre_ai_test DB_USER="$USER" DB_PASSWORD='' NODE_ENV=test npx knex migrate:down --env test
DB_HOST=/tmp DB_PORT=55432 DB_NAME_TEST=socorre_ai_test DB_USER="$USER" DB_PASSWORD='' NODE_ENV=test npx knex migrate:latest --env test
```

Resultado:

- primeira aplicação: 41 migrations concluídas;
- rollback: `043` e `042` revertidas;
- reaplicação: 2 migrations concluídas;
- índice `users_email_lower_unique` presente em `users`;
- tabela `revoked_tokens` presente com FK `user_id`, `expires_at`, `created_at` e `updated_at`.

Esta evidência valida upgrade e rollback em PostgreSQL isolado. Não representa deploy em staging, VPS ou produção.

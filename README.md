# 🚗 Socorre AI - Sistema de Assistência Automotiva

Sistema completo de assistência automotiva com aplicativos móveis para clientes e parceiros, backend API e dashboard administrativo.

## 📁 Estrutura do Projeto

```
projeto_socorre_ai/
├── 📱 socorre_ai_client/          # App Flutter para Clientes
├── 🔧 socorre_ai_partner/         # App Flutter para Parceiros
├── 🖥️ socorre_ai_admin/           # Dashboard React Admin
├── ⚙️ socorre_ai_backend/         # API Node.js/Express
├── 📜 scripts/                    # Scripts de Deploy e Build
├── 📚 docs/                       # Documentação
└── 📦 deploy_temp/                # Arquivos temporários de deploy
```

## 🚀 Tecnologias Utilizadas

### 📱 **Apps Móveis (Flutter)**
- **Cliente:** App para usuários finais solicitarem assistência
- **Parceiro:** App para mecânicos e prestadores de serviços

### ⚙️ **Backend (Node.js)**
- **API REST:** Express.js com JWT
- **Banco de Dados:** PostgreSQL com Knex.js
- **Cache:** Redis
- **Notificações:** Firebase
- **Upload:** Multer para imagens

### 🖥️ **Admin Dashboard (React)**
- **Interface:** React + TypeScript
- **Gerenciamento:** Usuários, parceiros, emergências

## 🔧 Configuração e Execução

### 1. **Backend**
```bash
cd socorre_ai_backend
npm install
npm run dev
```

### 2. **App Cliente**
```bash
cd socorre_ai_client
flutter pub get
flutter run
```

### 3. **App Parceiro**
```bash
cd socorre_ai_partner
flutter pub get
flutter run
```

### 4. **Admin Dashboard**
```bash
cd socorre_ai_admin
npm install
npm start
```

## 📋 Funcionalidades

### 👥 **Para Clientes:**
- ✅ Login/Cadastro
- ✅ Solicitar emergência
- ✅ Upload de fotos
- ✅ Acompanhamento em tempo real
- ✅ Histórico de solicitações
- ✅ Avaliação de serviços

### 🔧 **Para Parceiros:**
- ✅ Login/Cadastro
- ✅ Receber notificações de emergência
- ✅ Aceitar/rejeitar solicitações
- ✅ Atualizar status do serviço
- ✅ Histórico de atendimentos

### 🖥️ **Para Administradores:**
- ✅ Gerenciar usuários e parceiros
- ✅ Monitorar emergências
- ✅ Relatórios e estatísticas
- ✅ Configurações do sistema

## 🌐 URLs de Desenvolvimento

- **Backend API:** `http://localhost:3001`
- **Admin Dashboard:** `http://localhost:3000`
- **Health Check:** `http://localhost:3001/health`

## 📱 Usuários de Teste

### Cliente:
- **Email:** `teste@teste.com`
- **Senha:** `123456`

## 🚀 Deploy

Use os scripts na pasta `scripts/`:
- `deploy.sh` - Deploy completo
- `build_apk.sh` - Build dos APKs

## 📚 Documentação

- Visão de **produto e andamento** (o que já existe e o que falta): [`docs/O-QUE-JA-FOI-FEITO-E-O-QUE-FALTA.md`](docs/O-QUE-JA-FOI-FEITO-E-O-QUE-FALTA.md)
- Referência **técnica** do que está implementado: [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md)

## 👥 Equipe

Desenvolvido pela equipe Socorre AI.

---

**Status:** 🟢 Em desenvolvimento ativo
**Versão:** 1.0.0
**Licença:** MIT
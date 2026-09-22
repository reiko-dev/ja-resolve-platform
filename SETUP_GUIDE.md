# Socorre AI - Complete Setup Guide

This guide provides everything you need to run all Socorre AI applications locally or remotely.

## 📋 System Requirements

### Minimum Hardware
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 10GB free space
- **CPU**: Multi-core processor

### Operating Systems Supported
- **macOS**: 12.0+ (Monterey)
- **Windows**: 10/11
- **Linux**: Ubuntu 20.04+, CentOS 8+

## 🛠️ Required Software Installation

### 1. Node.js & npm (Required)
```bash
# macOS (Homebrew)
brew install node

# Windows
# Download from https://nodejs.org/

# Linux (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should be v18+
npm --version   # Should be 8+
```

### 2. Flutter SDK (Required for Mobile Apps)
```bash
# macOS (Homebrew)
brew install flutter

# Manual installation (all platforms)
# Download from https://flutter.dev/docs/get-started/install

# Verify installation
flutter --version
flutter doctor
```

### 3. Database Options (Choose One)

#### Option A: Docker (Recommended)
```bash
# Install Docker Desktop from https://docker.com

# Start database services
cd socorre_ai_backend
docker-compose up -d postgres redis
```

#### Option B: Native Installation
```bash
# PostgreSQL
# macOS
brew install postgresql
brew services start postgresql

# Redis
brew install redis
brew services start redis
```

#### Option C: Cloud Services (Free Tiers)
- **PostgreSQL**: ElephantSQL (free tier)
- **Redis**: Redis Cloud (free tier)

## 🚀 Local Development Setup

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd socorre-system
```

### Step 2: Backend Setup
```bash
cd socorre_ai_backend

# Install dependencies
npm install

# Copy environment configuration
cp env.example .env

# Edit .env file with your settings
# See configuration section below

# Start backend server
npm run dev
```

### Step 3: Admin Panel Setup
```bash
cd socorre_ai_admin

# Install dependencies
npm install

# Start development server
npm start
```

### Step 4: Mobile Apps Setup
```bash
# Client App
cd socorre_ai_client
flutter pub get

# Partner App  
cd socorre_ai_partner
flutter pub get

# Run on device/emulator
flutter run
```

## ⚙️ Configuration Files

### Backend Environment (.env)
Create `socorre_ai_backend/.env`:
```env
NODE_ENV=development
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=socorre_ai_db
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Optional Services (can be commented out for development)
# GOOGLE_MAPS_API_KEY=your_key_here
# STRIPE_SECRET_KEY=sk_test_your_key
```

### Mobile App Configuration
Update API base URLs in:
- `socorre_ai_client/lib/config/app_config.dart`
- `socorre_ai_partner/lib/config/app_config.dart`

Set to: `http://localhost:3001` for local development

## 🐳 Docker Setup (Simplified)

Use the simplified Docker configuration that automatically installs dependencies:

```bash
# Start all services
docker-compose -f docker-compose-simple.yml up -d

# View logs
docker-compose -f docker-compose-simple.yml logs -f

# Stop services
docker-compose -f docker-compose-simple.yml down
```

### Quick Start Script
For the easiest setup:
```bash
./quick-start.sh
```

### Compose Environment Variables

`docker-compose.yml` and `docker-compose-simple.yml` no longer hardcode the
database password or the JWT secret. They interpolate these variables with
development-safe defaults (`${VAR:-default}`):

| Variable | Default (development only) | Required in production |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `postgres` | yes |
| `DB_PASSWORD` | `postgres` | yes |
| `JWT_SECRET` | `dev_jwt_secret_2025_change_in_production` | yes |

Copy the tracked template and edit it, or export the variables in the shell:

```bash
cp .env.example .env    # docker compose reads .env automatically
```

`JWT_SECRET` must be set explicitly in production: the backend refuses to start
with `NODE_ENV=production` when it is missing. `DB_PASSWORD` is likewise
required in production unless `DATABASE_URL` (or `PostgreSQL`) embeds the
credentials.

### Cleanup Script
To stop and clean up:
```bash
./cleanup.sh           # Stop services only
./cleanup.sh --full    # Stop services and remove volumes (data loss)
./cleanup.sh --clean   # Stop services and remove node_modules
```

## ☁️ Remote/Free Hosting Options

### Backend Hosting (Free Options)
- **Railway**: Free tier with PostgreSQL
- **Render**: Free tier with PostgreSQL
- **Heroku**: Free tier (limited)
- **Vercel**: For frontend, backend with limitations

### Database Hosting
- **ElephantSQL**: Free PostgreSQL (20MB)
- **Supabase**: Free tier with generous limits
- **PlanetScale**: Free MySQL hosting

### Mobile App Distribution
- **Firebase App Distribution**: Free for testing
- **Microsoft App Center**: Free for testing
- **TestFlight**: Free for iOS testing

## 🔧 Development Tools

### Recommended IDEs
- **Visual Studio Code** (with extensions)
- **Android Studio** (for Flutter)
- **IntelliJ IDEA**

### VS Code Extensions
```bash
# Flutter/Dart
flutter
Dart

# Node.js
ESLint
Prettier
Thunder Client (API testing)

# Docker
Docker
```

### Browser Tools
- **Postman** or **Thunder Client** for API testing
- **Chrome DevTools** for React app debugging
- **Flutter DevTools** for mobile app debugging

## 🧪 Testing Setup

### Backend Testing
```bash
cd socorre_ai_backend
npm test
npm run test:coverage
```

### Frontend Testing
```bash
cd socorre_ai_admin
npm test
```

### Mobile App Testing
```bash
cd socorre_ai_client
flutter test
```

## 🔐 Security Configuration

### Environment Variables Management
- Use `.env` files for development
- Use platform secrets for production
- Never commit secrets to repository

### SSL/TLS Setup (Production)
- **Let's Encrypt** for free SSL certificates
- **Cloudflare** for free CDN and SSL
- **Nginx** reverse proxy configuration

## 📱 Mobile App Build

### Android Setup
```bash
# Install Android Studio
# Configure Android SDK
flutter config --android-sdk /path/to/android/sdk

# Build APK
cd socorre_ai_client
flutter build apk --release
```

### iOS Setup
```bash
# Requires macOS and Xcode
flutter build ios --release
```

## 🌐 Network Configuration

### Ports Used
- **Backend API**: 3001
- **Admin Panel**: 3000
- **PostgreSQL**: 5432
- **Redis**: 6379

### CORS Configuration
Update `socorre_ai_backend/src/server.js`:
```javascript
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));
```

## 🚨 Troubleshooting

### Common Issues

**Database Connection Errors**
```bash
# Check if PostgreSQL is running
psql -h localhost -U postgres -d socorre_ai_db

# Reset database
npm run db:reset
```

**Flutter Dependencies**
```bash
# Clean and reinstall
flutter clean
flutter pub get
```

**Node.js Dependencies**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Performance Optimization
- Use `--release` flag for production builds
- Enable compression in backend
- Use CDN for static assets

## 📊 Monitoring & Logging

### Development Monitoring
```bash
# Backend logs
cd socorre_ai_backend && npm run dev

# React app logs
cd socorre_ai_admin && npm start

# Flutter logs
flutter run --verbose
```

### Production Monitoring
- **Application Insights** for backend
- **Sentry** for error tracking
- **Google Analytics** for mobile apps

## 🎯 Quick Start Commands

### All-in-One Setup (Development)
```bash
# 1. Start database services
docker-compose up -d postgres redis

# 2. Setup backend
cd socorre_ai_backend && npm install && npm run dev

# 3. Setup admin panel (new terminal)
cd socorre_ai_admin && npm install && npm start

# 4. Run mobile apps (new terminals)
cd socorre_ai_client && flutter run
cd socorre_ai_partner && flutter run
```

## 📞 Support Resources

- **Documentation**: Check `/docs/` directory
- **API Reference**: Backend routes in `src/routes/`
- **Mobile App Documentation**: Flutter code in `lib/` directories
- **Issue Tracking**: GitHub issues

---

*This guide covers all aspects of setting up Socorre AI for development and production. For specific issues, check the troubleshooting section or consult the detailed documentation.*